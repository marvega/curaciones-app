import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockCount } from './stock-count.entity';
import { LotMovement } from '../movements/lot-movement.entity';
import { StockCountsService } from './stock-counts.service';
import { StockCountsController } from './stock-counts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StockCount, LotMovement])],
  providers: [StockCountsService],
  controllers: [StockCountsController],
  exports: [StockCountsService],
})
export class StockCountsModule {}
