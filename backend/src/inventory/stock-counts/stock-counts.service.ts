import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockCount, StockCountStatus } from './stock-count.entity';
import { LotMovement, LotMovementType } from '../movements/lot-movement.entity';
import { Lot } from '../lots/lot.entity';
import { Establishment } from '../../establishments/establishment.entity';
import { getCurrentOrgId } from '../../common/org-context';

// StockCount has no organizationId — org scoping derives from
// establishment.organizationId via a JOIN. Reads use a QueryBuilder join.
// Writes pre-validate that establishmentId / lotId from the DTO belong to
// an establishment in the active org, so a user from Org A cannot create
// or upsert a count entry against Org B's data by passing a foreign id.
@Injectable()
export class StockCountsService {
  constructor(
    @InjectRepository(StockCount) private readonly scRepo: Repository<StockCount>,
    @InjectRepository(LotMovement) private readonly movRepo: Repository<LotMovement>,
    @InjectRepository(Lot) private readonly lotRepo: Repository<Lot>,
    @InjectRepository(Establishment) private readonly estRepo: Repository<Establishment>,
  ) {}

  private requireOrgId(): string {
    const orgId = getCurrentOrgId();
    if (!orgId) throw new Error('No org context');
    return orgId;
  }

  private async assertEstablishmentInOrg(establishmentId: number, orgId: string): Promise<void> {
    const est = await this.estRepo
      .createQueryBuilder('e')
      .where('e.id = :id', { id: establishmentId })
      .andWhere('e.organizationId = :orgId', { orgId })
      .getOne();
    if (!est) throw new NotFoundException('Establishment not found in this org');
  }

  private async assertLotInOrg(lotId: number, orgId: string): Promise<void> {
    const lot = await this.lotRepo
      .createQueryBuilder('l')
      .innerJoin('l.establishment', 'e')
      .where('l.id = :id', { id: lotId })
      .andWhere('e.organizationId = :orgId', { orgId })
      .getOne();
    if (!lot) throw new NotFoundException('Lot not found in this org');
  }

  async openOrCreate(establishmentId: number, countDate: string, performedById: number): Promise<StockCount> {
    const orgId = this.requireOrgId();
    await this.assertEstablishmentInOrg(establishmentId, orgId);
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
    const orgId = this.requireOrgId();
    const sc = await this.findById(stockCountId);
    if (sc.status === StockCountStatus.CLOSED) {
      throw new BadRequestException('Stock count is closed');
    }
    await this.assertLotInOrg(lotId, orgId);
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
