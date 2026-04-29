import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, LessThanOrEqual, MoreThanOrEqual, And } from 'typeorm';
import { Lot } from './lot.entity';
import { LotMovement, LotMovementType } from '../movements/lot-movement.entity';
import { ReceptionDto } from './reception.dto';
import { getCurrentOrgId } from '../../common/org-context';

// TODO(phase-13.3): Lot has no organizationId — scoping derives from
// establishment.organizationId. Reads use a QueryBuilder join. Write paths
// (createReception, createAdjustment) should validate that the supplied
// establishmentId belongs to the active org; for now they rely on the
// caller (controller + JWT scoping) to pass valid IDs.
@Injectable()
export class LotsService {
  constructor(
    @InjectRepository(Lot) private readonly lotRepo: Repository<Lot>,
    @InjectRepository(LotMovement) private readonly movRepo: Repository<LotMovement>,
    private readonly dataSource: DataSource,
  ) {}

  async createReception(dto: ReceptionDto, performedById: number): Promise<Lot> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const lot = qr.manager.create(Lot, {
        productId: dto.productId,
        establishmentId: dto.establishmentId,
        lotCode: dto.lotCode ?? null,
        expiresAt: dto.expiresAt ?? null,
        receivedAt: dto.receivedAt,
      });
      const savedLot = await qr.manager.save(lot);
      const movement = qr.manager.create(LotMovement, {
        lotId: savedLot.id,
        type: LotMovementType.RECEPTION,
        delta: dto.quantity,
        notes: dto.notes ?? null,
        performedById,
      });
      await qr.manager.save(movement);
      await qr.commitTransaction();
      return savedLot;
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  private requireOrgId(): string {
    const orgId = getCurrentOrgId();
    if (!orgId) throw new Error('No org context');
    return orgId;
  }

  async findById(id: number): Promise<Lot> {
    const orgId = this.requireOrgId();
    const lot = await this.lotRepo
      .createQueryBuilder('lot')
      .innerJoin('lot.establishment', 'est')
      .leftJoinAndSelect('lot.product', 'product')
      .leftJoinAndSelect('lot.movements', 'movements')
      .where('lot.id = :id', { id })
      .andWhere('est.organizationId = :orgId', { orgId })
      .getOne();
    if (!lot) throw new NotFoundException(`Lot ${id} not found`);
    return lot;
  }

  async getCurrentStock(lotId: number, atDate?: Date): Promise<number> {
    const where: any = { lotId };
    if (atDate) where.createdAt = LessThanOrEqual(atDate);
    const raw = await this.movRepo.find({ where, order: { createdAt: 'ASC' } });
    // Defense-in-depth: re-filter by atDate in case the repo layer ignored it
    const movs = atDate
      ? raw.filter((m) => m.createdAt && new Date(m.createdAt).getTime() <= atDate.getTime())
      : raw;

    let lastCountIdx = -1;
    for (let i = movs.length - 1; i >= 0; i--) {
      if (movs[i].type === LotMovementType.COUNT) { lastCountIdx = i; break; }
    }

    if (lastCountIdx === -1) {
      return movs.reduce((sum, m) => sum + (m.delta ?? 0), 0);
    }
    let stock = movs[lastCountIdx].absoluteValue ?? 0;
    for (let i = lastCountIdx + 1; i < movs.length; i++) {
      stock += movs[i].delta ?? 0;
    }
    return stock;
  }

  async list(opts: { productId?: number; establishmentId?: number; expiringInDays?: number; active?: boolean }): Promise<Array<Lot & { currentStock: number }>> {
    const orgId = this.requireOrgId();
    const qb = this.lotRepo
      .createQueryBuilder('lot')
      .innerJoin('lot.establishment', 'est')
      .leftJoinAndSelect('lot.product', 'product')
      .where('est.organizationId = :orgId', { orgId });
    if (opts.productId) qb.andWhere('lot.productId = :productId', { productId: opts.productId });
    if (opts.establishmentId) qb.andWhere('lot.establishmentId = :establishmentId', { establishmentId: opts.establishmentId });
    if (opts.expiringInDays != null) {
      const today = new Date().toISOString().slice(0, 10);
      const end = new Date();
      end.setDate(end.getDate() + opts.expiringInDays);
      const endStr = end.toISOString().slice(0, 10);
      qb.andWhere('lot.expiresAt >= :today AND lot.expiresAt <= :endStr', { today, endStr });
    }
    qb.orderBy('lot.expiresAt', 'ASC').addOrderBy('lot.id', 'ASC');
    const lots = await qb.getMany();
    const enriched: Array<Lot & { currentStock: number }> = [];
    for (const lot of lots) {
      const stock = await this.getCurrentStock(lot.id);
      if (opts.active && stock <= 0) continue;
      enriched.push(Object.assign(lot, { currentStock: stock }));
    }
    return enriched;
  }

  async getExpiring(establishmentId: number | undefined, days: number): Promise<Array<Lot & { currentStock: number; daysToExpiry: number }>> {
    const orgId = this.requireOrgId();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(today); end.setDate(end.getDate() + days);
    const todayStr = today.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const qb = this.lotRepo
      .createQueryBuilder('lot')
      .innerJoin('lot.establishment', 'est')
      .leftJoinAndSelect('lot.product', 'product')
      .where('est.organizationId = :orgId', { orgId })
      .andWhere('lot.expiresAt >= :todayStr AND lot.expiresAt <= :endStr', { todayStr, endStr });
    if (establishmentId) qb.andWhere('lot.establishmentId = :establishmentId', { establishmentId });
    qb.orderBy('lot.expiresAt', 'ASC');
    const lots = await qb.getMany();
    const out: Array<Lot & { currentStock: number; daysToExpiry: number }> = [];
    for (const lot of lots) {
      const stock = await this.getCurrentStock(lot.id);
      if (stock <= 0) continue;
      const exp = new Date(lot.expiresAt!);
      const dtd = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      out.push(Object.assign(lot, { currentStock: stock, daysToExpiry: dtd }));
    }
    return out;
  }

  async createAdjustment(lotId: number, dto: { delta: number; notes?: string }, performedById: number) {
    await this.findById(lotId);
    return this.movRepo.save(
      this.movRepo.create({
        lotId,
        type: LotMovementType.ADJUSTMENT,
        delta: dto.delta,
        notes: dto.notes ?? null,
        performedById,
      }),
    );
  }

  async getStockSnapshot(establishmentId: number | undefined, atDate?: Date): Promise<Array<{ lotId: number; productId: number; stock: number }>> {
    const orgId = this.requireOrgId();
    const qb = this.lotRepo
      .createQueryBuilder('lot')
      .innerJoin('lot.establishment', 'est')
      .where('est.organizationId = :orgId', { orgId });
    if (establishmentId) qb.andWhere('lot.establishmentId = :establishmentId', { establishmentId });
    const lots = await qb.getMany();
    const out: Array<{ lotId: number; productId: number; stock: number }> = [];
    for (const lot of lots) {
      const stock = await this.getCurrentStock(lot.id, atDate);
      out.push({ lotId: lot.id, productId: lot.productId, stock });
    }
    return out;
  }
}
