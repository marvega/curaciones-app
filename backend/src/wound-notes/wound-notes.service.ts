import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WoundNote } from './wound-note.entity';
import { CreateWoundNoteDto } from './create-wound-note.dto';
import { KMS_SERVICE } from '../kms/kms.service';
import type { KmsService } from '../kms/kms.service';
import { getCurrentOrgId } from '../common/org-context';
import { findOneScoped } from '../common/org-scoped.repository';
import { encodeCursor, decodeCursor } from '../common/cursor-pagination';

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

    return findOneScoped(this.repo, {
      where: { id: saved.id },
      relations: ['recordedBy'],
    });
  }

  async findByCuracion(curacionId: number): Promise<WoundNote | null> {
    const note = await findOneScoped(this.repo, {
      where: { curacionId },
      relations: ['recordedBy'],
    });
    if (note) await this.decryptNotes(note);
    return note;
  }

  async findByPatient(patientId: number): Promise<WoundNote[]> {
    const orgId = this.requireOrgId();
    const notes = await this.repo
      .createQueryBuilder('wn')
      .innerJoinAndSelect('wn.curacion', 'c')
      .innerJoinAndSelect('wn.recordedBy', 'u')
      .where('c.patientId = :patientId', { patientId })
      .andWhere('wn.organizationId = :orgId', { orgId })
      .orderBy('c.date', 'DESC')
      .getMany();
    await Promise.all(notes.map((n) => this.decryptNotes(n)));
    return notes;
  }

  /**
   * Cursor-paginated listing of a patient's wound-notes for stable iteration
   * (used by the MCP server). Orders by (wn.createdAt DESC, wn.id DESC) — note
   * the existing `findByPatient` orders by `c.date DESC`, but `c.date` is a
   * date-only column with frequent ties; the wound-note's own `createdAt` is
   * a unique-enough timestamp that combined with the id forms a strict total
   * order, which the cursor protocol requires.
   *
   * Decryption of `notes` mirrors `findByPatient`.
   *
   * Contract: returns `{ items, nextCursor }`. `nextCursor` is `undefined`
   * when there are no more rows.
   */
  async findByPatientCursor(args: {
    patientId: number;
    limit: number;
    cursor?: string;
  }): Promise<{ items: WoundNote[]; nextCursor?: string }> {
    const orgId = this.requireOrgId();
    const cappedLimit = Math.max(1, Math.min(args.limit, 100));
    const decoded = decodeCursor(args.cursor);

    const qb = this.repo
      .createQueryBuilder('wn')
      .innerJoinAndSelect('wn.curacion', 'c')
      .innerJoinAndSelect('wn.recordedBy', 'u')
      .where('c.patientId = :patientId', { patientId: args.patientId })
      .andWhere('wn.organizationId = :orgId', { orgId })
      // Property paths, never pre-quoted SQL. `take` plus a joined-and-selected
      // relation makes TypeORM paginate entities rather than rows: it wraps the
      // query in a `DISTINCT`-id subquery and rewrites the ORDER BY into it via
      // `createOrderByCombinedWithSelectExpression`, which splits each key on
      // `.` and resolves the remainder through entity metadata. `'wn."createdAt"'`
      // resolves to a property literally named `"createdAt"`, matches no column,
      // and the request dies with `Cannot read properties of undefined (reading
      // 'databaseName')` before any SQL is emitted. `where()` fragments are
      // passed through as SQL and may stay quoted; orderBy keys may not.
      .orderBy('wn.createdAt', 'DESC')
      .addOrderBy('wn.id', 'DESC')
      .take(cappedLimit + 1);

    if (decoded) {
      qb.andWhere(
        '(wn."createdAt", wn.id) < (:cursorCreatedAt, :cursorId)',
        { cursorCreatedAt: decoded.createdAt, cursorId: decoded.id },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > cappedLimit;
    const items = hasMore ? rows.slice(0, cappedLimit) : rows;
    await Promise.all(items.map((n) => this.decryptNotes(n)));
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({ id: last.id, createdAt: last.createdAt })
        : undefined;

    return { items, nextCursor };
  }

  // The encrypted-column transformer is a passthrough; raw EncryptedField
  // objects would otherwise leak to the SPA and crash React (#31).
  private async decryptNotes(note: WoundNote): Promise<void> {
    if (note.notes && typeof note.notes === 'object') {
      const orgId = this.requireOrgId();
      const plain = await this.kms.decrypt(
        note.notes,
        `WoundNote.notes:${note.id}`,
        orgId,
      );
      (note as any).notes = plain;
    }
  }

  async getEvolutionData(
    patientId: number,
  ): Promise<
    { date: string; woundArea: number | null; woundColor: string | null; healingStage: string | null }[]
  > {
    const orgId = this.requireOrgId();
    const notes = await this.repo
      .createQueryBuilder('wn')
      .innerJoin('wn.curacion', 'c')
      .addSelect('c.date', 'date')
      .where('c.patientId = :patientId', { patientId })
      .andWhere('wn.organizationId = :orgId', { orgId })
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
