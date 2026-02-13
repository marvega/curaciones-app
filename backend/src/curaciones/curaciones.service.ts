import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Curacion } from './curacion.entity';
import { CreateCuracionDto } from './create-curacion.dto';

@Injectable()
export class CuracionesService {
  constructor(
    @InjectRepository(Curacion)
    private readonly curacionRepo: Repository<Curacion>,
  ) {}

  async create(dto: CreateCuracionDto): Promise<Curacion> {
    const curacion = this.curacionRepo.create(dto);
    return this.curacionRepo.save(curacion);
  }

  async findByPatient(patientId: number): Promise<Curacion[]> {
    return this.curacionRepo.find({
      where: { patientId },
      order: { date: 'DESC' },
    });
  }

  async getAgenda(from: string, to: string): Promise<Curacion[]> {
    return this.curacionRepo.find({
      where: {
        nextAppointmentDate: Between(from, to),
      },
      relations: ['patient'],
      order: {
        nextAppointmentDate: 'ASC',
        nextAppointmentTime: 'ASC',
      },
    });
  }

  async getAvailability(date: string): Promise<any[]> {
    const appointments = await this.curacionRepo.find({
      where: { nextAppointmentDate: date },
      relations: ['patient'],
    });

    const slots = [
      '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00'
    ];

    return slots.map(time => {
      const appointment = appointments.find(a => a.nextAppointmentTime === time);
      return {
        time,
        available: !appointment,
        patient: appointment ? {
          id: appointment.patient.id,
          firstName: appointment.patient.firstName,
          lastName: appointment.patient.lastName,
          rut: appointment.patient.rut
        } : null
      };
    });
  }
}
