import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { Curacion } from './curacion.entity';
import { CreateCuracionDto } from './create-curacion.dto';
import { AppointmentsService } from '../appointments/appointments.service';

@Injectable()
export class CuracionesService {
  constructor(
    @InjectRepository(Curacion)
    private readonly curacionRepo: Repository<Curacion>,
    private readonly appointmentsService: AppointmentsService,
  ) {}

  async create(dto: CreateCuracionDto): Promise<Curacion> {
    const appointmentDate = dto.appointmentDate || dto.nextAppointmentDate;
    const appointmentTime = dto.appointmentTime || dto.nextAppointmentTime;

    // Dual-write: keep old fields populated for Phase 1
    const entityData: DeepPartial<Curacion> = {
      patientId: dto.patientId,
      type: dto.type,
      date: dto.date,
      quantity: dto.quantity,
      observations: dto.observations,
      nextAppointmentDate: appointmentDate ?? undefined,
      nextAppointmentTime: appointmentTime ?? undefined,
    };
    const curacion = this.curacionRepo.create(entityData);
    const saved = await this.curacionRepo.save(curacion);

    // Also create linked Appointment if date+time provided
    if (appointmentDate && appointmentTime) {
      await this.appointmentsService.createLinked(
        (saved as Curacion).patientId,
        (saved as Curacion).id,
        appointmentDate,
        appointmentTime,
      );
    }

    return this.findOneWithAppointment((saved as Curacion).id);
  }

  async findOneWithAppointment(id: number): Promise<Curacion> {
    return this.curacionRepo.findOne({
      where: { id },
      relations: ['appointment'],
    }) as Promise<Curacion>;
  }

  async findByPatient(patientId: number): Promise<Curacion[]> {
    return this.curacionRepo.find({
      where: { patientId },
      relations: ['appointment'],
      order: { date: 'DESC' },
    });
  }

  async getAgenda(from: string, to: string): Promise<any[]> {
    return this.appointmentsService.getAgenda(from, to);
  }

  async getAvailability(date: string): Promise<any[]> {
    return this.appointmentsService.getAvailability(date);
  }
}
