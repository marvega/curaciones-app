import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockCount, StockCountStatus } from './stock-count.entity';
import { LotMovement, LotMovementType } from '../movements/lot-movement.entity';

@Injectable()
export class StockCountsService {
  constructor(
    @InjectRepository(StockCount) private readonly scRepo: Repository<StockCount>,
    @InjectRepository(LotMovement) private readonly movRepo: Repository<LotMovement>,
  ) {}

  async openOrCreate(establishmentId: number, countDate: string, performedById: number): Promise<StockCount> {
    const existing = await this.scRepo.findOne({ where: { establishmentId, countDate } });
    if (existing) {
      if (existing.status === StockCountStatus.CLOSED) {
        throw new BadRequestException(`Count for ${countDate} is already closed`);
      }
      return existing;
    }
    return this.scRepo.save(
      this.scRepo.create({ establishmentId, countDate, status: StockCountStatus.DRAFT, performedById }),
    );
  }

  async list(opts: { establishmentId?: number; status?: StockCountStatus }) {
    const where: any = {};
    if (opts.establishmentId) where.establishmentId = opts.establishmentId;
    if (opts.status) where.status = opts.status;
    return this.scRepo.find({ where, order: { countDate: 'DESC' } });
  }

  async findById(id: number): Promise<StockCount> {
    const sc = await this.scRepo.findOne({ where: { id } });
    if (!sc) throw new NotFoundException(`StockCount ${id} not found`);
    return sc;
  }

  async upsertEntry(
    stockCountId: number,
    lotId: number,
    dto: { absoluteValue: number; notes?: string },
    performedById: number,
  ): Promise<LotMovement> {
    const sc = await this.findById(stockCountId);
    if (sc.status === StockCountStatus.CLOSED) {
      throw new BadRequestException('Stock count is closed');
    }
    const existing = await this.movRepo.findOne({ where: { stockCountId, lotId, type: LotMovementType.COUNT } });
    if (existing) {
      existing.absoluteValue = dto.absoluteValue;
      existing.notes = dto.notes ?? existing.notes;
      return this.movRepo.save(existing);
    }
    return this.movRepo.save(
      this.movRepo.create({
        lotId,
        type: LotMovementType.COUNT,
        absoluteValue: dto.absoluteValue,
        delta: null,
        stockCountId,
        notes: dto.notes ?? null,
        performedById,
      }),
    );
  }

  async close(id: number): Promise<StockCount> {
    const sc = await this.findById(id);
    if (sc.status === StockCountStatus.CLOSED) return sc;
    sc.status = StockCountStatus.CLOSED;
    sc.closedAt = new Date();
    return this.scRepo.save(sc);
  }
}
