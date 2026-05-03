import { Injectable } from '@nestjs/common';
import { FinalizeLiveWeekDto } from '../../dto/finalize-live-week.dto';
import { GenerateLiveTicksDto } from '../../dto/generate-live-ticks.dto';
import { GenerateRangePriceDto } from '../../dto/generate-range-price.dto';
import { GenerateWeekPriceDto } from '../../dto/generate-week-price.dto';
import { ListLivePriceTicksQueryDto } from '../../dto/list-live-price-ticks-query.dto';
import { ListProductPricesQueryDto } from '../../dto/list-product-prices-query.dto';
import { ManualProductPricesDto } from '../../dto/manual-product-prices.dto';
import { ProductListingService } from './product-listing.service';
import { PriceGenerationService } from './price-generation.service';

@Injectable()
export class InvestmentMarketService {
  constructor(
    private readonly listingService: ProductListingService,
    private readonly generationService: PriceGenerationService,
  ) {}

  listProducts(termId: string) {
    return this.listingService.listProducts(termId);
  }

  getProductDetail(termId: string, productId: string) {
    return this.listingService.getProductDetail(termId, productId);
  }

  listProductPrices(
    termId: string,
    productId: string,
    query: ListProductPricesQueryDto,
  ) {
    return this.listingService.listProductPrices(termId, productId, query);
  }

  listLivePriceTicks(
    termId: string,
    productId: string,
    query: ListLivePriceTicksQueryDto,
  ) {
    return this.listingService.listLivePriceTicks(termId, productId, query);
  }

  generateLiveTicks(termId: string, dto: GenerateLiveTicksDto) {
    return this.generationService.generateLiveTicks(termId, dto);
  }

  applyImmediateEventShock(termId: string, termEventId: string) {
    return this.generationService.applyImmediateEventShock(termId, termEventId);
  }

  finalizeLiveWeek(termId: string, dto: FinalizeLiveWeekDto) {
    return this.generationService.finalizeLiveWeek(termId, dto);
  }

  generateWeekPrices(termId: string, dto: GenerateWeekPriceDto) {
    return this.generationService.generateWeekPrices(termId, dto);
  }

  generateRangePrices(termId: string, dto: GenerateRangePriceDto) {
    return this.generationService.generateRangePrices(termId, dto);
  }

  manualUpsertPrices(termId: string, dto: ManualProductPricesDto) {
    return this.generationService.manualUpsertPrices(termId, dto);
  }
}
