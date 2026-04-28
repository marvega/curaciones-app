import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, LessThanOrEqual, MoreThanOrEqual, And } from 'typeorm';
import { Lot } from './lot.entity';
import { LotMovement, LotMovementType } from '../movements/lot-movement.entity';
import { ReceptionDto } from './reception.dto';

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

  async findById(id: number): Promise<Lot> {
    const lot = await this.lotRepo.findOne({ where: { id }, relations: ['product', 'movements'] });
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
    const where: any = {};
    if (opts.productId) where.productId = opts.productId;
    if (opts.establishmentId) where.establishmentId = opts.establishmentId;
    if (opts.expiringInDays != null) {
      const today = new Date().toISOString().slice(0, 10);
      const end = new Date();
      end.setDate(end.getDate() + opts.expiringInDays);
      const endStr = end.toISOString().slice(0, 10);
      where.expiresAt = And(MoreThanOrEqual(today), LessThanOrEqual(endStr));
    }
    const lots = await this.lotRepo.find({ where, relations: ['product'], order: { expiresAt: 'ASC', id: 'ASC' } });
    const enriched: Array<Lot & { currentStock: number }> = [];
    for (const lot of lots) {
      const stock = await this.getCurrentStock(lot.id);
      if (opts.active && stock <= 0) continue;
      enriched.push(Object.assign(lot, { currentStock: stock }));
    }
    return enriched;
  }

  async getExpiring(establishmentId: number | undefined, days: number): Promise<Array<Lot & { currentStock: number; daysToExpiry: number }>> {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(today); end.setDate(end.getDate() + days);
    const todayStr = today.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const where: any = { expiresAt: And(MoreThanOrEqual(todayStr), LessThanOrEqual(endStr)) };
    if (establishmentId) where.establishmentId = establishmentId;
    const lots = await this.lotRepo.find({ where, relations: ['product'], order: { expiresAt: 'ASC' } });
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
    const where: any = {};
    if (establishmentId) where.establishmentId = establishmentId;
    const lots = await this.lotRepo.find({ where });
    const out: Array<{ lotId: number; productId: number; stock: number }> = [];
    for (const lot of lots) {
      const stock = await this.getCurrentStock(lot.id, atDate);
      out.push({ lotId: lot.id, productId: lot.productId, stock });
    }
    return out;
  }
}
