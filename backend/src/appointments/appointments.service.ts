import {
  Inject,
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, EntityManager } from 'typeorm';
import { Appointment } from './appointment.entity';
import { CreateAppointmentDto } from './create-appointment.dto';
import { getSlotsForDate } from '../common/schedule.util';
import { findScoped, findOneScoped } from '../common/org-scoped.repository';
import { getCurrentOrgId } from '../common/org-context';
import { KMS_SERVICE } from '../kms/kms.service';
import type { KmsService } from '../kms/kms.service';
import { decryptPatientPii } from '../patients/patient-projection.util';

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
    @Inject(KMS_SERVICE) private readonly kms: KmsService,
  ) {}

  async create(dto: CreateAppointmentDto): Promise<Appointment> {
    const validSlots = getSlotsForDate(dto.date);
    if (!validSlots.includes(dto.time)) {
      throw new BadRequestException(
        `Horario ${dto.time} no es válido para la fecha ${dto.date}. Horarios disponibles: ${validSlots.join(', ')}`,
      );
    }

    const today = new Date().toISOString().split('T')[0];
    if (dto.date < today) {
      throw new BadRequestException('La fecha debe ser futura');
    }

    const existing = await findOneScoped(this.appointmentRepo, {
      where: { date: dto.date, time: dto.time },
    });
    if (existing) {
      throw new BadRequestException(
        `El horario ${dto.time} del ${dto.date} ya está ocupado`,
      );
    }

    const appointment = this.appointmentRepo.create(dto);
    return this.appointmentRepo.save(appointment);
  }

  async createLinked(
    patientId: number,
    curacionId: number,
    date: string,
    time: string,
    manager?: EntityManager,
  ): Promise<Appointment> {
    const orgId = getCurrentOrgId();
    if (!orgId) throw new Error('No org context');
    const repo = manager
      ? manager.getRepository(Appointment)
      : this.appointmentRepo;

    const validSlots = getSlotsForDate(date);
    if (!validSlots.includes(time)) {
      throw new BadRequestException(
        `Horario ${time} no es válido para la fecha ${date}`,
      );
    }

    const existing = await repo.findOne({ where: { date, time, organizationId: orgId } });
    if (existing) {
      throw new BadRequestException(
        `El horario ${time} del ${date} ya está ocupado`,
      );
    }

    const appointment = repo.create({ patientId, curacionId, date, time });
    return repo.save(appointment);
  }

  async remove(id: number): Promise<void> {
    const appointment = await findOneScoped(this.appointmentRepo, { where: { id } });
    if (!appointment) {
      throw new NotFoundException(`Cita con id ${id} no encontrada`);
    }
    await this.appointmentRepo.remove(appointment);
  }

  async removeWithManager(id: number, manager: EntityManager): Promise<void> {
    const orgId = getCurrentOrgId();
    if (!orgId) throw new Error('No org context');
    const repo = manager.getRepository(Appointment);
    const appointment = await repo.findOne({ where: { id, organizationId: orgId } });
    if (!appointment) {
      throw new NotFoundException(`Cita con id ${id} no encontrada`);
    }
    await repo.remove(appointment);
  }

  async findByPatient(patientId: number): Promise<Appointment[]> {
    return findScoped(this.appointmentRepo, {
      where: { patientId },
      relations: ['curacion'],
      order: { date: 'ASC', time: 'ASC' },
    });
  }

  async findFutureByPatient(patientId: number): Promise<Appointment[]> {
    const today = new Date().toISOString().split('T')[0];
    return findScoped(this.appointmentRepo, {
      where: { patientId, date: MoreThan(today) },
      order: { date: 'ASC', time: 'ASC' },
    });
  }

  async deleteFutureByPatient(
    patientId: number,
    manager?: EntityManager,
  ): Promise<number> {
    const orgId = getCurrentOrgId();
    if (!orgId) throw new Error('No org context');
    const today = new Date().toISOString().split('T')[0];
    const repo = manager
      ? manager.getRepository(Appointment)
      : this.appointmentRepo;
    const result = await repo
      .createQueryBuilder()
      .delete()
      .where('"patientId" = :patientId AND date > :today AND "organizationId" = :orgId', {
        patientId,
        today,
        orgId,
      })
      .execute();
    return result.affected || 0;
  }

  async getAvailability(date: string): Promise<any[]> {
    const orgId = getCurrentOrgId();
    if (!orgId) throw new Error('No org context');
    const slots = getSlotsForDate(date);
    const appointments = await findScoped(this.appointmentRepo, {
      where: { date },
      relations: ['patient'],
    });

    const decryptedRutByPatientId = new Map<number, string>(
      await Promise.all(
        appointments.map(
          async (a) =>
            [a.patient.id, (await decryptPatientPii(a.patient, this.kms, orgId)).rut] as [
              number,
              string,
            ],
        ),
      ),
    );

    return slots.map((time) => {
      const apt = appointments.find((a) => a.time === time);
      return {
        time,
        available: !apt,
        patient: apt
          ? {
              id: apt.patient.id,
              firstName: apt.patient.firstName,
              lastName: apt.patient.lastName,
              rut: decryptedRutByPatientId.get(apt.patient.id),
            }
          : null,
      };
    });
  }

  async getAgenda(from: string, to: string): Promise<any[]> {
    const orgId = getCurrentOrgId();
    if (!orgId) throw new Error('No org context');
    const appointments = await this.appointmentRepo
      .createQueryBuilder('apt')
      .leftJoinAndSelect('apt.patient', 'patient')
      .leftJoinAndSelect('apt.curacion', 'curacion')
      .where('apt.date >= :from AND apt.date <= :to', { from, to })
      .andWhere('apt.organizationId = :orgId', { orgId })
      .orderBy('apt.date', 'ASC')
      .addOrderBy('apt.time', 'ASC')
      .getMany();

    const decryptedByPatientId = new Map(
      await Promise.all(
        Array.from(new Set(appointments.map((a) => a.patient.id))).map(async (pid) => {
          const apt = appointments.find((a) => a.patient.id === pid)!;
          const { rut } = await decryptPatientPii(apt.patient, this.kms, orgId);
          return [pid, rut] as [number, string];
        }),
      ),
    );

    return appointments.map((apt) => ({
      id: apt.id,
      date: apt.date,
      time: apt.time,
      source: apt.curacionId ? 'curacion' : 'standalone',
      patient: {
        id: apt.patient.id,
        firstName: apt.patient.firstName,
        lastName: apt.patient.lastName,
        rut: decryptedByPatientId.get(apt.patient.id),
      },
      curacion: apt.curacion
        ? { id: apt.curacion.id, type: apt.curacion.type }
        : undefined,
    }));
  }

  async findByCuracionId(curacionId: number): Promise<Appointment | null> {
    return findOneScoped(this.appointmentRepo, { where: { curacionId } });
  }

  async updateLinked(
    appointmentId: number,
    date: string,
    time: string,
    manager?: EntityManager,
  ): Promise<Appointment> {
    const orgId = getCurrentOrgId();
    if (!orgId) throw new Error('No org context');
    const repo = manager
      ? manager.getRepository(Appointment)
      : this.appointmentRepo;

    const appointment = await repo.findOne({ where: { id: appointmentId, organizationId: orgId } });
    if (!appointment) {
      throw new NotFoundException(`Cita con id ${appointmentId} no encontrada`);
    }

    const validSlots = getSlotsForDate(date);
    if (!validSlots.includes(time)) {
      throw new BadRequestException(
        `Horario ${time} no es válido para la fecha ${date}`,
      );
    }

    const existing = await repo.findOne({ where: { date, time, organizationId: orgId } });
    if (existing && existing.id !== appointmentId) {
      throw new BadRequestException(
        `El horario ${time} del ${date} ya está ocupado`,
      );
    }

    appointment.date = date;
    appointment.time = time;
    return repo.save(appointment);
  }
}
