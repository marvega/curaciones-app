import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonthlyCycle } from './cycle.entity';
import { CyclesService } from './cycles.service';
import { CyclesController } from './cycles.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MonthlyCycle])],
  controllers: [CyclesController],
  providers: [CyclesService],
  exports: [CyclesService],
})
export class CyclesModule {}
