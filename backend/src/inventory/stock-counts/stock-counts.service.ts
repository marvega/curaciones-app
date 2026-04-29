import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockCount, StockCountStatus } from './stock-count.entity';
import { LotMovement, LotMovementType } from '../movements/lot-movement.entity';
import { getCurrentOrgId } from '../../common/org-context';

// TODO(phase-13.3): StockCount has no organizationId — scoping derives from
// establishment.organizationId. Reads use a QueryBuilder join. The
// upsertEntry write path joins via findById which is now scoped, but
// still trusts the lotId; phase 13.3 should re-validate the lot belongs
// to an establishment in the same org.
@Injectable()
export class StockCountsService {
  constructor(
    @InjectRepository(StockCount) private readonly scRepo: Repository<StockCount>,
    @InjectRepository(LotMovement) private readonly movRepo: Repository<LotMovement>,
  ) {}

  private requireOrgId(): string {
    const orgId = getCurrentOrgId();
    if (!orgId) throw new Error('No org context');
    return orgId;
  }

  async openOrCreate(establishmentId: number, countDate: string, performedById: number): Promise<StockCount> {
    const orgId = this.requireOrgId();
    const existing = await this.scRepo
      .createQueryBuilder('sc')
      .innerJoin('sc.establishment', 'est')
      .where('sc.establishmentId = :establishmentId', { establishmentId })
      .andWhere('sc.countDate = :countDate', { countDate })
      .andWhere('est.organizationId = :orgId', { orgId })
      .getOne();
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
    const orgId = this.requireOrgId();
    const qb = this.scRepo
      .createQueryBuilder('sc')
      .innerJoin('sc.establishment', 'est')
      .where('est.organizationId = :orgId', { orgId });
    if (opts.establishmentId) qb.andWhere('sc.establishmentId = :establishmentId', { establishmentId: opts.establishmentId });
    if (opts.status) qb.andWhere('sc.status = :status', { status: opts.status });
    qb.orderBy('sc.countDate', 'DESC');
    return qb.getMany();
  }

  async findById(id: number): Promise<StockCount> {
    const orgId = this.requireOrgId();
    const sc = await this.scRepo
      .createQueryBuilder('sc')
      .innerJoin('sc.establishment', 'est')
      .where('sc.id = :id', { id })
      .andWhere('est.organizationId = :orgId', { orgId })
      .getOne();
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
