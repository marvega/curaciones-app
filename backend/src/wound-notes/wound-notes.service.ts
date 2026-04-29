import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WoundNote } from './wound-note.entity';
import { CreateWoundNoteDto } from './create-wound-note.dto';
import { KMS_SERVICE } from '../kms/kms.service';
import type { KmsService } from '../kms/kms.service';
import { getCurrentOrgId } from '../common/org-context';

@Injectable()
export class WoundNotesService {
  constructor(
    @InjectRepository(WoundNote)
    private readonly repo: Repository<WoundNote>,
    @Inject(KMS_SERVICE) private readonly kms: KmsService,
  ) {}

  private requireOrgId(): string {
    const orgId = getCurrentOrgId();
    if (!orgId) {
      throw new Error('No organization context — cannot perform encrypted wound-note operation');
    }
    return orgId;
  }

  async create(
    dto: CreateWoundNoteDto,
    recordedById: number,
  ): Promise<WoundNote | null> {
    const orgId = this.requireOrgId();

    const { notes: notesPlain, ...rest } = dto;

    // Phase 1: insert without notes to capture the generated id.
    const draft = this.repo.create({
      ...rest,
      organizationId: orgId,
      recordedById,
      notes: null,
      woundArea:
        dto.woundWidth != null && dto.woundLength != null
          ? +(dto.woundWidth * dto.woundLength).toFixed(2)
          : null,
    } as Partial<WoundNote>);
    const saved = await this.repo.save(draft);

    // Phase 2: encrypt notes against the real id.
    if (notesPlain) {
      const encrypted = await this.kms.encrypt(
        notesPlain,
        `WoundNote.notes:${saved.id}`,
        orgId,
      );
      await this.repo.update(saved.id, { notes: encrypted } as any);
    }

    return this.repo.findOne({
      where: { id: saved.id },
      relations: ['recordedBy'],
    });
  }

  async findByCuracion(curacionId: number): Promise<WoundNote | null> {
    return this.repo.findOne({
      where: { curacionId },
      relations: ['recordedBy'],
    });
  }

  async findByPatient(patientId: number): Promise<WoundNote[]> {
    return this.repo
      .createQueryBuilder('wn')
      .innerJoinAndSelect('wn.curacion', 'c')
      .innerJoinAndSelect('wn.recordedBy', 'u')
      .where('c.patientId = :patientId', { patientId })
      .orderBy('c.date', 'DESC')
      .getMany();
  }

  async getEvolutionData(
    patientId: number,
  ): Promise<
    { date: string; woundArea: number | null; woundColor: string | null; healingStage: string | null }[]
  > {
    const notes = await this.repo
      .createQueryBuilder('wn')
      .innerJoin('wn.curacion', 'c')
      .addSelect('c.date', 'date')
      .where('c.patientId = :patientId', { patientId })
      .orderBy('c.date', 'ASC')
      .getRawAndEntities();

    return notes.raw.map((r, i) => ({
      date: r.c_date,
      woundArea: notes.entities[i].woundArea,
      woundColor: notes.entities[i].woundColor,
      healingStage: notes.entities[i].healingStage,
    }));
  }
}
