import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TermStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { differenceInCalendarDays, addDays, isAfter, isEqual } from 'date-fns';
import { CreateTermDto } from '../dto/term/create-term.dto';
import { SchoolService } from './school.service';

type ServiceResponse<T> =
  | { success: true; data: T }
  | { success: false; message: string };

@Injectable()
export class TermService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schoolService: SchoolService,
  ) {}

  /** inclusive day diff */
  private daysInclusive(start: Date, end: Date) {
    return differenceInCalendarDays(end, start) + 1;
  }

  /**
   * totalWeeks = ceil(inclusiveDays / 7)
   * e.g. 1-7 days => 1 week, 8-14 => 2 weeks
   */
  private calculateTotalWeeks(start: Date, end: Date) {
    if (isAfter(start, end)) {
      throw new BadRequestException('startDate must be before endDate');
    }
    const days = this.daysInclusive(start, end);
    return Math.ceil(days / 7);
  }

  private normalizeDate(d: Date) {
    // กันเวลาแปลกๆ ให้เริ่มต้นที่ 00:00:00 (optional แต่ช่วยลด bug)
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  /**
   * Create term + auto generate TermWeek
   */
  async create(createTermDto: CreateTermDto): Promise<ServiceResponse<any>> {
    try {
      const startDate = this.normalizeDate(new Date(createTermDto.startDate));
      const endDate = this.normalizeDate(new Date(createTermDto.endDate));

      // validate school
      const school = await this.prisma.school.findUnique({
        where: { id: createTermDto.schoolId },
        select: { id: true },
      });
      if (!school) {
        throw new NotFoundException(
          `School with ID ${createTermDto.schoolId} not found`,
        );
      }

      const totalWeeks = this.calculateTotalWeeks(startDate, endDate);

      // transaction: create term + weeks
      const term = await this.prisma.$transaction(async (tx) => {
        const created = await tx.term.create({
          data: {
            schoolId: createTermDto.schoolId,
            name: createTermDto.name,
            startDate,
            endDate,
            totalWeeks,
            status: TermStatus.DRAFT,
          },
        });

        await this.generateTermWeeksTx(
          tx,
          created.id,
          startDate,
          endDate,
          totalWeeks,
        );

        return created;
      });

      return { success: true, data: term };
    } catch (error) {
      if (error instanceof HttpException) throw error;

      throw new InternalServerErrorException({
        success: false,
        message: 'Internal Server Error',
        originalError: error?.message,
      });
    }
  }

  /**
   * Generate weeks inside transaction (so create/update can call it safely)
   */
  private async generateTermWeeksTx(
    tx: Prisma.TransactionClient,
    termId: string,
    startDate: Date,
    endDate: Date,
    totalWeeks: number,
  ) {
    // ลบของเดิมก่อน (กรณี regenerate)
    await tx.termWeek.deleteMany({ where: { termId } });

    const weeks: Prisma.TermWeekCreateManyInput[] = [];

    for (let weekNo = 1; weekNo <= totalWeeks; weekNo++) {
      const weekStart = addDays(startDate, (weekNo - 1) * 7);
      let weekEnd = addDays(weekStart, 6);

      // clamp weekEnd ให้ไม่เกิน endDate
      if (isAfter(weekEnd, endDate)) weekEnd = endDate;

      // ถ้า weekStart เลย endDate แล้ว ไม่ต้องสร้างต่อ (กัน edge case)
      if (isAfter(weekStart, endDate)) break;

      weeks.push({
        termId,
        weekNo,
        startDate: weekStart,
        endDate: weekEnd,
      });

      // ถ้า weekEnd == endDate ก็ครบแล้ว
      if (isEqual(weekEnd, endDate)) break;
    }

    await tx.termWeek.createMany({ data: weeks });
  }

  /**
   * Get terms (optionally filter by school)
   */
  async findAll(params?: { schoolId?: string; status?: TermStatus }) {
    try {
      const terms = await this.prisma.term.findMany({
        where: {
          ...(params?.schoolId ? { schoolId: params.schoolId } : {}),
          ...(params?.status ? { status: params.status } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
      return { success: true, data: terms };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException({
        success: false,
        message: 'Database connection failed or Internal Server Error',
        originalError: error.message,
      });
    }
  }

  /**
   * Term detail (include weeks + rules if you want)
   */
  async findOne(termId: string) {
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      include: {
        termWeeks: { orderBy: { weekNo: 'asc' } },
        termStageRules: true,
        // classrooms: true, // ถ้าต้องการ
        // banks: true,      // ถ้าต้องการ
      },
    });

    if (!term) throw new NotFoundException(`Term with ID ${termId} not found`);

    return { success: true, data: term };
  }

  /**
   * Update term (recommend: only allow when DRAFT)
   * If date range changed -> recalc totalWeeks + regenerate weeks
   */
  async update(termId: string, dto: Partial<CreateTermDto>) {
    const existing = await this.prisma.term.findUnique({
      where: { id: termId },
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        schoolId: true,
      },
    });
    if (!existing)
      throw new NotFoundException(`Term with ID ${termId} not found`);

    if (existing.status !== TermStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT term can be updated');
    }

    const nextStart = dto.startDate
      ? this.normalizeDate(new Date(dto.startDate))
      : existing.startDate;
    const nextEnd = dto.endDate
      ? this.normalizeDate(new Date(dto.endDate))
      : existing.endDate;

    const dateChanged =
      nextStart.getTime() !== existing.startDate.getTime() ||
      nextEnd.getTime() !== existing.endDate.getTime();

    const totalWeeks = dateChanged
      ? this.calculateTotalWeeks(nextStart, nextEnd)
      : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      const term = await tx.term.update({
        where: { id: termId },
        data: {
          ...(dto.name ? { name: dto.name } : {}),
          ...(dto.schoolId ? { schoolId: dto.schoolId } : {}),
          ...(dateChanged
            ? {
                startDate: nextStart,
                endDate: nextEnd,
                totalWeeks: totalWeeks!,
              }
            : {}),
        },
      });

      if (dateChanged) {
        await this.generateTermWeeksTx(
          tx,
          termId,
          nextStart,
          nextEnd,
          totalWeeks!,
        );
      }

      return term;
    });

    return { success: true, data: updated };
  }

  /**
   * Publish term: DRAFT -> ONGOING
   * validate weeks exists; optionally validate stage rules coverage
   */
  async publish(termId: string) {
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      include: { termWeeks: true, termStageRules: true },
    });
    if (!term) throw new NotFoundException(`Term with ID ${termId} not found`);

    if (term.status !== TermStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT term can be published');
    }

    if (term.termWeeks.length === 0) {
      throw new BadRequestException('TermWeeks not generated');
    }

    // (optional) validate stage rules cover all weeks
    // คุณค่อยเปิดใช้เมื่อพร้อม
    // this.validateStageRulesCoverage(term.totalWeeks, term.termStageRules);

    const updated = await this.prisma.term.update({
      where: { id: termId },
      data: { status: TermStatus.ONGOING },
    });

    return { success: true, data: updated };
  }

  async complete(termId: string) {
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      select: { status: true },
    });
    if (!term) throw new NotFoundException(`Term with ID ${termId} not found`);

    if (term.status !== TermStatus.ONGOING) {
      throw new BadRequestException('Only ONGOING term can be completed');
    }

    const updated = await this.prisma.term.update({
      where: { id: termId },
      data: { status: TermStatus.COMPLETED },
    });

    return { success: true, data: updated };
  }

  async remove(termId: string) {
    // ลบ term จะ cascade ไป weeks/classrooms/banks ฯลฯ ตาม schema
    // แนะนำให้ "soft delete" หรือ allow เฉพาะ DRAFT
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      select: { status: true },
    });
    if (!term) throw new NotFoundException(`Term with ID ${termId} not found`);

    if (term.status !== TermStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT term can be deleted');
    }

    await this.prisma.term.delete({ where: { id: termId } });
    return { success: true, data: { id: termId } };
  }

  async regenerateWeeksWithOverrides(
    termId: string,
    opts: {
      defaultWeekLengthDays?: number;
      overrides?: Record<string, number>;
    },
  ) {
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      select: { id: true, status: true, startDate: true, endDate: true },
    });
    if (!term) throw new NotFoundException(`Term with ID ${termId} not found`);

    if (term.status !== TermStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT term can regenerate weeks');
    }

    const defaultLen = opts.defaultWeekLengthDays ?? 7;
    if (!Number.isInteger(defaultLen) || defaultLen < 1) {
      throw new BadRequestException(
        'defaultWeekLengthDays must be an integer >= 1',
      );
    }

    const overrides = opts.overrides ?? {};

    // validate overrides values
    for (const [k, v] of Object.entries(overrides)) {
      const weekNo = Number(k);
      if (!Number.isInteger(weekNo) || weekNo < 1) {
        throw new BadRequestException(`Invalid overrides key weekNo: ${k}`);
      }
      if (!Number.isInteger(v) || v < 1) {
        throw new BadRequestException(
          `Invalid overrides lengthDays for weekNo=${k}`,
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // ลบ weeks เก่า
      await tx.termWeek.deleteMany({ where: { termId } });

      const weeks: Prisma.TermWeekCreateManyInput[] = [];

      let weekNo = 1;
      let cursor = term.startDate;

      while (!isAfter(cursor, term.endDate)) {
        const overrideLen = overrides[String(weekNo)];
        const len = overrideLen ?? defaultLen;

        const weekStart = cursor;
        let weekEnd = addDays(weekStart, len - 1);
        if (isAfter(weekEnd, term.endDate)) weekEnd = term.endDate;

        weeks.push({
          termId,
          weekNo,
          startDate: weekStart,
          endDate: weekEnd,
        });

        if (isEqual(weekEnd, term.endDate)) break;

        cursor = addDays(weekEnd, 1); // week ถัดไปเริ่มวันถัดไป
        weekNo++;
      }

      // สร้างใหม่ทั้งหมด
      await tx.termWeek.createMany({ data: weeks });

      // totalWeeks = จำนวนสัปดาห์ที่สร้างจริง
      const totalWeeks = weeks.length;

      const t = await tx.term.update({
        where: { id: termId },
        data: { totalWeeks },
      });

      return t;
    });

    return { success: true, data: updated };
  }

  // optional helper (ถ้าจะเช็ก coverage)
  // private validateStageRulesCoverage(totalWeeks: number, rules: { startWeek: number; endWeek: number }[]) {
  //   // check overlap + cover 1..totalWeeks
  // }
  async getCurrentWeekNo(termId: string, date?: Date) {
    const target = this.normalizeDate(date ?? new Date());

    // ถ้าอยากเช็กว่า term มีอยู่จริงก่อนก็ได้
    const term = await this.prisma.term.findUnique({
      where: { id: termId },
      select: { id: true },
    });
    if (!term) throw new NotFoundException(`Term with ID ${termId} not found`);

    const week = await this.prisma.termWeek.findFirst({
      where: {
        termId,
        startDate: { lte: target },
        endDate: { gte: target },
      },
      select: { weekNo: true, startDate: true, endDate: true },
    });

    if (!week) {
      // date อยู่นอกช่วง term weeks หรือ weeks ยังไม่ถูก generate
      throw new NotFoundException({
        success: false,
        message: `No termWeek matched for date=${target.toISOString().slice(0, 10)}`,
      });
    }

    return {
      success: true,
      data: {
        termId,
        date: target,
        weekNo: week.weekNo,
        weekStart: week.startDate,
        weekEnd: week.endDate,
      },
    };
  }
}
