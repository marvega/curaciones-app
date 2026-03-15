import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Curacion } from './curacion.entity';
import { CuracionEdit } from './curacion-edit.entity';
import { CreateCuracionDto } from './create-curacion.dto';
import { UpdateCuracionDto } from './update-curacion.dto';
import { AppointmentsService } from '../appointments/appointments.service';

@Injectable()
export class CuracionesService {
  constructor(
    @InjectRepository(Curacion)
    private readonly curacionRepo: Repository<Curacion>,
    @InjectRepository(CuracionEdit)
    private readonly editRepo: Repository<CuracionEdit>,
    private readonly appointmentsService: AppointmentsService,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateCuracionDto): Promise<Curacion> {
    const curacion = this.curacionRepo.create({
      patientId: dto.patientId,
      type: dto.type,
      date: dto.date,
      quantity: dto.quantity,
      observations: dto.observations,
    });
    const saved = await this.curacionRepo.save(curacion);

    if (dto.appointmentDate && dto.appointmentTime) {
      await this.appointmentsService.createLinked(
        saved.patientId,
        saved.id,
        dto.appointmentDate,
        dto.appointmentTime,
      );
    }

    return this.findOneWithAppointment(saved.id);
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
      relations: ['appointment', 'edits', 'edits.editedBy'],
      order: { date: 'DESC' },
    });
  }

  async getAgenda(from: string, to: string): Promise<any[]> {
    return this.appointmentsService.getAgenda(from, to);
  }

  async getAvailability(date: string): Promise<any[]> {
    return this.appointmentsService.getAvailability(date);
  }

  async update(
    id: number,
    dto: UpdateCuracionDto,
    editedById: number,
  ): Promise<Curacion> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const curacion = await queryRunner.manager.findOne(Curacion, {
        where: { id },
        relations: ['appointment'],
      });
      if (!curacion) throw new NotFoundException(`Curación con id ${id} no encontrada`);

      if (dto.type !== undefined) curacion.type = dto.type;
      if (dto.quantity !== undefined) curacion.quantity = dto.quantity;
      await queryRunner.manager.save(curacion);

      // Handle appointment changes (within transaction)
      if (dto.appointmentDate && dto.appointmentTime) {
        if (curacion.appointment) {
          await this.appointmentsService.updateLinked(
            curacion.appointment.id,
            dto.appointmentDate,
            dto.appointmentTime,
            queryRunner.manager,
          );
        } else {
          await this.appointmentsService.createLinked(
            curacion.patientId,
            curacion.id,
            dto.appointmentDate,
            dto.appointmentTime,
            queryRunner.manager,
          );
        }
      } else if (
        dto.appointmentDate === null &&
        dto.appointmentTime === null &&
        curacion.appointment
      ) {
        await this.appointmentsService.removeWithManager(
          curacion.appointment.id,
          queryRunner.manager,
        );
      }

      const edit = queryRunner.manager.create(CuracionEdit, {
        curacionId: id,
        editedById,
        reason: dto.reason,
      });
      await queryRunner.manager.save(edit);

      await queryRunner.commitTransaction();
      return this.findOneWithAppointment(id);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async getEdits(curacionId: number): Promise<CuracionEdit[]> {
    return this.editRepo.find({
      where: { curacionId },
      relations: ['editedBy'],
      order: { createdAt: 'DESC' },
    });
  }
}
