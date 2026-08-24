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
import { encodeCursor, decodeCursor } from '../common/cursor-pagination';

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

  /**
   * Cursor-paginated listing of a patient's curaciones for stable iteration
   * (used by the MCP server and any client that wants to walk a patient's
   * history without offset drift). Orders by (createdAt DESC, id DESC) so the
   * cursor tuple is unique — `date` alone is a date-only column with frequent
   * ties.
   *
   * Note: `findByPatient` returns relations (appointment, edits, edits.editedBy)
   * but for the cursor walk we keep the row shape lean — relations balloon the
   * payload and the cursor branch's purpose is bulk export. Observations stay
   * encrypted on the wire (matching `findByPatient` behaviour, which also does
   * not decrypt; see kms/encrypted-column.transformer.ts).
   *
   * Contract: returns `{ items, nextCursor }`. `nextCursor` is `undefined`
   * when there are no more rows.
   */
  async findByPatientCursor(args: {
    patientId: number;
    limit: number;
    cursor?: string;
  }): Promise<{ items: Curacion[]; nextCursor?: string }> {
    const orgId = this.requireOrgId();
    const cappedLimit = Math.max(1, Math.min(args.limit, 100));
    const decoded = decodeCursor(args.cursor);

    const qb = this.curacionRepo
      .createQueryBuilder('c')
      .where('c."organizationId" = :orgId', { orgId })
      .andWhere('c."patientId" = :patientId', { patientId: args.patientId })
      // Property path, not pre-quoted SQL — see the note in
      // `PatientsService.findByCursor`. No joins here today; written in the
      // resolvable form so adding one cannot turn this into a 500.
      .orderBy('c.createdAt', 'DESC')
      .addOrderBy('c.id', 'DESC')
      .take(cappedLimit + 1);

    if (decoded) {
      qb.andWhere(
        '(c."createdAt", c.id) < (:cursorCreatedAt, :cursorId)',
        { cursorCreatedAt: decoded.createdAt, cursorId: decoded.id },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > cappedLimit;
    const items = hasMore ? rows.slice(0, cappedLimit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({ id: last.id, createdAt: last.createdAt })
        : undefined;

    return { items, nextCursor };
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
