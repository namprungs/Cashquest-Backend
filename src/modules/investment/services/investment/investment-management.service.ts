import { Injectable, NotFoundException } from '@nestjs/common';
import { TermEventStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateEconomicEventDto } from '../../dto/create-economic-event.dto';
import { CreateMarketRegimeDto } from '../../dto/create-market-regime.dto';
import { CreateProductDto } from '../../dto/create-product.dto';
import { CreateTermEventDto } from '../../dto/create-term-event.dto';
import { UpdateEconomicEventDto } from '../../dto/update-economic-event.dto';
import { UpdateMarketRegimeDto } from '../../dto/update-market-regime.dto';
import { UpdateProductDto } from '../../dto/update-product.dto';
import { UpdateTermEventDto } from '../../dto/update-term-event.dto';
import { UpsertProductSimulationsDto } from '../../dto/upsert-product-simulations.dto';
import { UpsertTermSimulationDto } from '../../dto/upsert-term-simulation.dto';
import { InvestmentCoreService } from './investment-core.service';

@Injectable()
export class InvestmentManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: InvestmentCoreService,
  ) {}

  async createProduct(termId: string, dto: CreateProductDto) {
    await this.core.assertTermExists(termId);

    const created = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          type: dto.type,
          symbol: dto.symbol,
          name: dto.name,
          riskLevel: dto.riskLevel,
          sector: dto.sector,
          metaJson: this.core.toInputJson(dto.metaJson),
          isDividendEnabled: dto.isDividendEnabled ?? false,
          dividendYieldAnnual: dto.dividendYieldAnnual,
          dividendPayoutIntervalWeeks: dto.dividendPayoutIntervalWeeks ?? 4,
          fixedDividendPerUnit: dto.fixedDividendPerUnit,
          isActive: dto.isActive ?? true,
        },
      });

      if (dto.simulation) {
        await tx.productSimulation.create({
          data: {
            termId,
            productId: product.id,
            initialPrice: dto.simulation.initialPrice,
            mu: dto.simulation.mu,
            sigma: dto.simulation.sigma,
            dt: dto.simulation.dt,
          },
        });
      }

      return product;
    });

    return { success: true, data: created };
  }

  async updateProduct(productId: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: {
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.symbol !== undefined ? { symbol: dto.symbol } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.riskLevel ? { riskLevel: dto.riskLevel } : {}),
        ...(dto.sector !== undefined ? { sector: dto.sector } : {}),
        ...(dto.metaJson !== undefined
          ? { metaJson: this.core.toInputJson(dto.metaJson) }
          : {}),
        ...(dto.isDividendEnabled !== undefined
          ? { isDividendEnabled: dto.isDividendEnabled }
          : {}),
        ...(dto.dividendYieldAnnual !== undefined
          ? { dividendYieldAnnual: dto.dividendYieldAnnual }
          : {}),
        ...(dto.dividendPayoutIntervalWeeks !== undefined
          ? { dividendPayoutIntervalWeeks: dto.dividendPayoutIntervalWeeks }
          : {}),
        ...(dto.fixedDividendPerUnit !== undefined
          ? { fixedDividendPerUnit: dto.fixedDividendPerUnit }
          : {}),
      },
    });

    return { success: true, data: updated };
  }

  async setProductActive(productId: string, isActive: boolean) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: {
        isActive,
      },
    });

    return { success: true, data: updated };
  }

  async upsertProductSimulations(
    termId: string,
    dto: UpsertProductSimulationsDto,
  ) {
    await this.core.assertTermExists(termId);

    const data = await this.prisma.$transaction(async (tx) => {
      const rows: Array<
        Awaited<ReturnType<typeof tx.productSimulation.upsert>>
      > = [];

      for (const item of dto.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { id: true },
        });

        if (!product) {
          throw new NotFoundException(`Product ${item.productId} not found`);
        }

        const simulation = await tx.productSimulation.upsert({
          where: {
            termId_productId: {
              termId,
              productId: item.productId,
            },
          },
          update: {
            initialPrice: item.initialPrice,
            mu: item.mu,
            sigma: item.sigma,
            dt: item.dt,
          },
          create: {
            termId,
            productId: item.productId,
            initialPrice: item.initialPrice,
            mu: item.mu,
            sigma: item.sigma,
            dt: item.dt,
          },
        });

        rows.push(simulation);
      }

      return rows;
    });

    return { success: true, data };
  }

  async upsertTermSimulation(termId: string, dto: UpsertTermSimulationDto) {
    await this.core.assertTermExists(termId);

    const data = await this.prisma.termSimulation.upsert({
      where: {
        termId,
      },
      update: {
        randomSeed: dto.randomSeed,
        currentWeek: dto.currentWeek,
        engineVersion: dto.engineVersion,
      },
      create: {
        termId,
        randomSeed: dto.randomSeed,
        currentWeek: dto.currentWeek,
        engineVersion: dto.engineVersion,
      },
    });

    return { success: true, data };
  }

  async createEconomicEvent(dto: CreateEconomicEventDto) {
    const data = await this.prisma.economicEvent.create({
      data: {
        title: dto.title,
        description: dto.description,
        eventType: dto.eventType,
        defaultImpact: this.core.toInputJson(dto.defaultImpact)!,
        isRepeatable: dto.isRepeatable ?? false,
      },
    });

    return { success: true, data };
  }

  async updateEconomicEvent(eventId: string, dto: UpdateEconomicEventDto) {
    const existing = await this.prisma.economicEvent.findUnique({
      where: { id: eventId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Economic event not found');
    }

    const data = await this.prisma.economicEvent.update({
      where: { id: eventId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.eventType ? { eventType: dto.eventType } : {}),
        ...(dto.defaultImpact !== undefined
          ? { defaultImpact: this.core.toInputJson(dto.defaultImpact) }
          : {}),
        ...(dto.isRepeatable !== undefined
          ? { isRepeatable: dto.isRepeatable }
          : {}),
      },
    });

    return { success: true, data };
  }

  async createTermEvent(termId: string, dto: CreateTermEventDto) {
    await this.core.assertTermExists(termId);

    const event = await this.prisma.economicEvent.findUnique({
      where: { id: dto.eventId },
      select: { id: true },
    });

    if (!event) {
      throw new NotFoundException('Economic event not found');
    }

    const data = await this.prisma.termEvent.create({
      data: {
        termId,
        eventId: dto.eventId,
        startWeek: dto.startWeek,
        endWeek: dto.endWeek,
        customImpact: this.core.toInputJson(dto.customImpact),
        status: dto.status ?? TermEventStatus.SCHEDULED,
      },
      include: { event: true },
    });

    return { success: true, data };
  }

  async updateTermEvent(
    termId: string,
    termEventId: string,
    dto: UpdateTermEventDto,
  ) {
    await this.core.assertTermExists(termId);

    const termEvent = await this.prisma.termEvent.findFirst({
      where: {
        id: termEventId,
        termId,
      },
      select: { id: true },
    });

    if (!termEvent) {
      throw new NotFoundException('Term event not found');
    }

    if (dto.eventId) {
      const event = await this.prisma.economicEvent.findUnique({
        where: { id: dto.eventId },
        select: { id: true },
      });
      if (!event) {
        throw new NotFoundException('Economic event not found');
      }
    }

    const data = await this.prisma.termEvent.update({
      where: { id: termEventId },
      data: {
        ...(dto.eventId ? { event: { connect: { id: dto.eventId } } } : {}),
        ...(dto.startWeek !== undefined ? { startWeek: dto.startWeek } : {}),
        ...(dto.endWeek !== undefined ? { endWeek: dto.endWeek } : {}),
        ...(dto.customImpact !== undefined
          ? { customImpact: this.core.toInputJson(dto.customImpact) }
          : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
      include: { event: true },
    });

    return { success: true, data };
  }

  async createRegime(termId: string, dto: CreateMarketRegimeDto) {
    await this.core.assertTermExists(termId);

    const data = await this.prisma.marketRegime.create({
      data: {
        termId,
        name: dto.name,
        muAdjustment: dto.muAdjustment,
        sigmaAdjustment: dto.sigmaAdjustment,
        startWeek: dto.startWeek,
        endWeek: dto.endWeek,
      },
    });

    return { success: true, data };
  }

  async updateRegime(
    termId: string,
    regimeId: string,
    dto: UpdateMarketRegimeDto,
  ) {
    await this.core.assertTermExists(termId);

    const existing = await this.prisma.marketRegime.findFirst({
      where: {
        id: regimeId,
        termId,
      },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Market regime not found');
    }

    const data = await this.prisma.marketRegime.update({
      where: { id: regimeId },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.muAdjustment !== undefined
          ? { muAdjustment: dto.muAdjustment }
          : {}),
        ...(dto.sigmaAdjustment !== undefined
          ? { sigmaAdjustment: dto.sigmaAdjustment }
          : {}),
        ...(dto.startWeek !== undefined ? { startWeek: dto.startWeek } : {}),
        ...(dto.endWeek !== undefined ? { endWeek: dto.endWeek } : {}),
      },
    });

    return { success: true, data };
  }
}
