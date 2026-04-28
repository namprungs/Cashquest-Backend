import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { TermEventStatus } from '@prisma/client';

@Injectable()
export class EventStatusScheduler {
  private readonly logger = new Logger(EventStatusScheduler.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 🕐 Runs every hour to update event statuses
   * Transitions: SCHEDULED -> ANNOUNCED -> ACTIVE -> EXPIRED
   * - SCHEDULED: Before start week
   * - ANNOUNCED: From start week to end week (learning + awareness period)
   * - ACTIVE: 1 week after end week (peak market price impact)
   * - EXPIRED: After active period ends
   */
  @Cron('0 * * * *') // Every hour
  async updateEventStatuses() {
    try {
      const termSimulations = await this.prisma.termSimulation.findMany({
        select: {
          termId: true,
          currentWeek: true,
        },
      });

      for (const termSim of termSimulations) {
        const currentWeek = termSim.currentWeek || 1;

        // Get term events that need status updates
        const termEvents = await this.prisma.termEvent.findMany({
          where: {
            termId: termSim.termId,
            status: {
              in: [
                TermEventStatus.SCHEDULED,
                TermEventStatus.ANNOUNCED,
                TermEventStatus.ACTIVE,
              ],
            },
          },
          select: {
            id: true,
            startWeek: true,
            endWeek: true,
            status: true,
          },
        });

        for (const event of termEvents) {
          let newStatus = event.status;

          // Determine new status based on current week
          if (currentWeek > event.endWeek + 1) {
            // After active period (1 week after endWeek), mark as expired
            newStatus = TermEventStatus.EXPIRED;
          } else if (currentWeek === event.endWeek + 1) {
            // 1 week after endWeek, mark as active (peak impact on prices)
            newStatus = TermEventStatus.ACTIVE;
          } else if (
            currentWeek >= event.startWeek &&
            currentWeek <= event.endWeek
          ) {
            // During event period, mark as announced (learning/awareness period)
            newStatus = TermEventStatus.ANNOUNCED;
          }

          // Update if status changed
          if (newStatus !== event.status) {
            await this.prisma.termEvent.update({
              where: { id: event.id },
              data: { status: newStatus },
            });

            this.logger.log(
              `Event ${event.id} status updated: ${event.status} -> ${newStatus} (week ${currentWeek}, event: ${event.startWeek}-${event.endWeek})`,
            );
          }
        }
      }

      this.logger.debug('Event status update cycle completed');
    } catch (error) {
      this.logger.error('Error updating event statuses:', error);
    }
  }
}
