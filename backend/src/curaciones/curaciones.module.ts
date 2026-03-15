import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Curacion } from './curacion.entity';
import { CuracionEdit } from './curacion-edit.entity';
import { CuracionesService } from './curaciones.service';
import { CuracionesController } from './curaciones.controller';
import { AppointmentsModule } from '../appointments/appointments.module';

@Module({
  imports: [TypeOrmModule.forFeature([Curacion, CuracionEdit]), AppointmentsModule],
  controllers: [CuracionesController],
  providers: [CuracionesService],
  exports: [CuracionesService],
})
export class CuracionesModule {}
