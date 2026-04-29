import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StockCountsService } from './stock-counts.service';
import { StockCount, StockCountStatus } from './stock-count.entity';
import { LotMovement, LotMovementType } from '../movements/lot-movement.entity';
import { Lot } from '../lots/lot.entity';
import { Establishment } from '../../establishments/establishment.entity';
import { runWithOrg } from '../../common/org-context';

const inOrg = (fn: () => Promise<void>) => () => runWithOrg('1', fn);

describe('StockCountsService', () => {
  let service: StockCountsService;

  // Org-scope assertion helpers use createQueryBuilder().where().andWhere().getOne()
  // and (for lots and stock-counts) .innerJoin(). Provide a chainable stub that
  // returns a configurable fake row.
  const makeChainable = (returnValue: any) => {
    const qb: any = {
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      innerJoin: jest.fn(() => qb),
      orderBy: jest.fn(() => qb),
      getOne: jest.fn(() => Promise.resolve(returnValue)),
      getMany: jest.fn(() => Promise.resolve([])),
    };
    return qb;
  };

  // scRepo gains createQueryBuilder; we set the next-getOne value per-test via a
  // ref object so each test can override what findById/openOrCreate sees.
  let nextStockCountQb: any = makeChainable(null);
  const scRepo: any = {
    create: jest.fn((e) => e),
    save: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => nextStockCountQb),
  };
  const movRepo: any = { create: jest.fn((e) => e), save: jest.fn(), findOne: jest.fn() };
  const lotRepo: any = { createQueryBuilder: jest.fn(() => makeChainable({ id: 7 })) };
  const estRepo: any = { createQueryBuilder: jest.fn(() => makeChainable({ id: 1 })) };

  // Helper used by tests: stub the next call to scRepo.createQueryBuilder to return
  // a specific row from getOne().
  const mockNextStockCount = (row: any) => {
    nextStockCountQb = makeChainable(row);
    scRepo.createQueryBuilder.mockImplementation(() => nextStockCountQb);
  };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      providers: [
        StockCountsService,
        { provide: getRepositoryToken(StockCount), useValue: scRepo },
        { provide: getRepositoryToken(LotMovement), useValue: movRepo },
        { provide: getRepositoryToken(Lot), useValue: lotRepo },
        { provide: getRepositoryToken(Establishment), useValue: estRepo },
      ],
    }).compile();
    service = m.get(StockCountsService);
    jest.clearAllMocks();
    // re-arm createQueryBuilder factories after clearAllMocks
    estRepo.createQueryBuilder.mockImplementation(() => makeChainable({ id: 1 }));
    lotRepo.createQueryBuilder.mockImplementation(() => makeChainable({ id: 7 }));
    mockNextStockCount(null);
  });

  it('openOrCreate returns existing DRAFT for the same date', inOrg(async () => {
    mockNextStockCount({ id: 5, status: StockCountStatus.DRAFT, establishmentId: 1, countDate: '2026-04-27' });
    const r = await service.openOrCreate(1, '2026-04-27', 99);
    expect(r.id).toBe(5);
    expect(scRepo.save).not.toHaveBeenCalled();
  }));

  it('openOrCreate creates new when none exists', inOrg(async () => {
    mockNextStockCount(null);
    scRepo.save.mockResolvedValue({ id: 8, status: StockCountStatus.DRAFT });
    const r = await service.openOrCreate(1, '2026-04-27', 99);
    expect(r.id).toBe(8);
    expect(scRepo.save).toHaveBeenCalled();
  }));

  it('openOrCreate refuses when CLOSED count exists for the date', inOrg(async () => {
    mockNextStockCount({ id: 5, status: StockCountStatus.CLOSED });
    await expect(service.openOrCreate(1, '2026-04-27', 99)).rejects.toThrow(BadRequestException);
  }));

  it('upsertEntry creates new COUNT movement when none exists', inOrg(async () => {
    mockNextStockCount({ id: 5, status: StockCountStatus.DRAFT });
    movRepo.findOne.mockResolvedValue(null);
    movRepo.save.mockResolvedValue({ id: 1, lotId: 7, absoluteValue: 12, type: LotMovementType.COUNT });
    const r = await service.upsertEntry(5, 7, { absoluteValue: 12 }, 99);
    expect(r.absoluteValue).toBe(12);
  }));

  it('upsertEntry updates existing COUNT movement', inOrg(async () => {
    mockNextStockCount({ id: 5, status: StockCountStatus.DRAFT });
    movRepo.findOne.mockResolvedValue({ id: 33, lotId: 7, absoluteValue: 8, type: LotMovementType.COUNT, stockCountId: 5 });
    movRepo.save.mockResolvedValue({ id: 33, lotId: 7, absoluteValue: 12, type: LotMovementType.COUNT, stockCountId: 5 });
    const r = await service.upsertEntry(5, 7, { absoluteValue: 12 }, 99);
    expect(r.absoluteValue).toBe(12);
    expect(movRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 33 }));
  }));

  it('upsertEntry rejects writes when CLOSED', inOrg(async () => {
    mockNextStockCount({ id: 5, status: StockCountStatus.CLOSED });
    await expect(service.upsertEntry(5, 7, { absoluteValue: 1 }, 99)).rejects.toThrow(BadRequestException);
  }));

  it('close transitions DRAFT to CLOSED', inOrg(async () => {
    mockNextStockCount({ id: 5, status: StockCountStatus.DRAFT });
    scRepo.save.mockImplementation((e) => Promise.resolve(e));
    const r = await service.close(5);
    expect(r.status).toBe(StockCountStatus.CLOSED);
  }));

  it('close is idempotent on already CLOSED', inOrg(async () => {
    mockNextStockCount({ id: 5, status: StockCountStatus.CLOSED, closedAt: new Date('2026-04-27') });
    const r = await service.close(5);
    expect(r.status).toBe(StockCountStatus.CLOSED);
    expect(scRepo.save).not.toHaveBeenCalled();
  }));
});
