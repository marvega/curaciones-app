import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Curacion } from './curacion.entity';
import { CuracionEdit } from './curacion-edit.entity';
import { CreateCuracionDto } from './create-curacion.dto';
import { UpdateCuracionDto } from './update-curacion.dto';
import { AppointmentsService } from '../appointments/appointments.service';
import { KMS_SERVICE } from '../kms/kms.service';
import type { KmsService } from '../kms/kms.service';
import type { EncryptedField } from '../kms/encrypted-field';
import { getCurrentOrgId } from '../common/org-context';
import { findScoped, findOneScoped } from '../common/org-scoped.repository';

@Injectable()
export class CuracionesService {
  constructor(
    @InjectRepository(Curacion)
    private readonly curacionRepo: Repository<Curacion>,
    @InjectRepository(CuracionEdit)
    private readonly editRepo: Repository<CuracionEdit>,
    private readonly appointmentsService: AppointmentsService,
    private readonly dataSource: DataSource,
    @Inject(KMS_SERVICE) private readonly kms: KmsService,
  ) {}

  private requireOrgId(): string {
    const orgId = getCurrentOrgId();
    if (!orgId) {
      throw new Error('No organization context — cannot perform encrypted curación operation');
    }
    return orgId;
  }

  async create(dto: CreateCuracionDto): Promise<Curacion> {
    const orgId = this.requireOrgId();

    // Phase 1: insert without observations to obtain id for the row-bound AAD.
    const draft = this.curacionRepo.create({
      organizationId: orgId,
      patientId: dto.patientId,
      type: dto.type,
      date: dto.date,
      quantity: dto.quantity,
      observations: null,
      bootDelivered: dto.bootDelivered,
    } as Partial<Curacion>);
    const saved = await this.curacionRepo.save(draft);

    // Phase 2: encrypt observations against the real id.
    if (dto.observations) {
      const encrypted = await this.kms.encrypt(
        dto.observations,
        `Curacion.observations:${saved.id}`,
        orgId,
      );
      await this.curacionRepo.update(saved.id, { observations: encrypted } as any);
    }

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
    return findOneScoped(this.curacionRepo, {
      where: { id },
      relations: ['appointment'],
    }) as Promise<Curacion>;
  }

  async findByPatient(patientId: number): Promise<Curacion[]> {
    return findScoped(this.curacionRepo, {
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
    const orgId = this.requireOrgId();
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const curacion = await queryRunner.manager.findOne(Curacion, {
        where: { id, organizationId: orgId },
        relations: ['appointment'],
      });
      if (!curacion) throw new NotFoundException(`Curación con id ${id} no encontrada`);

      if (dto.type !== undefined) curacion.type = dto.type;
      if (dto.quantity !== undefined) curacion.quantity = dto.quantity;
      if (dto.bootDelivered !== undefined) curacion.bootDelivered = dto.bootDelivered;
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
    return findScoped(this.editRepo, {
      where: { curacionId },
      relations: ['editedBy'],
      order: { createdAt: 'DESC' },
    });
  }
}
