import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lot } from './lot.entity';
import { LotMovement } from '../movements/lot-movement.entity';
import { Establishment } from '../../establishments/establishment.entity';
import { Product } from '../products/product.entity';
import { LotsService } from './lots.service';
import { LotsController } from './lots.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Lot, LotMovement, Establishment, Product])],
  providers: [LotsService],
  controllers: [LotsController],
  exports: [LotsService, TypeOrmModule],
})
export class LotsModule {}
