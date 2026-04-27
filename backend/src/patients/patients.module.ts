import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Patient } from './patient.entity';
import { PatientStatusChange } from './patient-status-change.entity';
import { Curacion } from '../curaciones/curacion.entity';
import { Appointment } from '../appointments/appointment.entity';
import { PatientsService } from './patients.service';
import { PatientPdfService } from './patient-pdf.service';
import { PatientsController } from './patients.controller';
import { AppointmentsModule } from '../appointments/appointments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Patient, PatientStatusChange, Curacion, Appointment]),
    AppointmentsModule,
  ],
  controllers: [PatientsController],
  providers: [PatientsService, PatientPdfService],
  exports: [PatientsService],
})
export class PatientsModule {}
