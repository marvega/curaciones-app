import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Curacion } from '../curaciones/curacion.entity';
import { Patient } from '../patients/patient.entity';
import { CyclesModule } from '../cycles/cycles.module';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Curacion, Patient]), CyclesModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
