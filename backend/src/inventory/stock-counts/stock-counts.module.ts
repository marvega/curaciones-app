import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockCount } from './stock-count.entity';
import { LotMovement } from '../movements/lot-movement.entity';
import { Lot } from '../lots/lot.entity';
import { Establishment } from '../../establishments/establishment.entity';
import { StockCountsService } from './stock-counts.service';
import { StockCountsController } from './stock-counts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StockCount, LotMovement, Lot, Establishment])],
  providers: [StockCountsService],
  controllers: [StockCountsController],
  exports: [StockCountsService],
})
export class StockCountsModule {}
