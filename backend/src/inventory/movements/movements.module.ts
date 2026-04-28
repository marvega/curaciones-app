import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LotMovement } from './lot-movement.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LotMovement])],
  exports: [TypeOrmModule],
})
export class MovementsModule {}
