import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { LotsService } from './lots.service';
import { Lot } from './lot.entity';
import { LotMovement, LotMovementType } from '../movements/lot-movement.entity';
import { Establishment } from '../../establishments/establishment.entity';
import { Product } from '../products/product.entity';
import { runWithOrg } from '../../common/org-context';

const inOrg = <T>(fn: () => Promise<T>) => runWithOrg('1', fn);
const okQB = (entity: any) => ({
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getOne: jest.fn().mockResolvedValue(entity),
});

describe('LotsService', () => {
  let service: LotsService;

  const mockManager = {
    create: jest.fn((_E, dto) => dto),
    save: jest.fn((entity) => Promise.resolve({ id: 1, ...entity })),
  };
  const mockQR = {
    connect: jest.fn(), startTransaction: jest.fn(),
    commitTransaction: jest.fn(), rollbackTransaction: jest.fn(), release: jest.fn(),
    manager: mockManager,
  };
  const ds = { createQueryRunner: jest.fn(() => mockQR) } as unknown as DataSource;
  const lotRepo: any = { findOne: jest.fn(), find: jest.fn() };
  const movRepo: any = {
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
  };
  const estRepo: any = { createQueryBuilder: jest.fn() };
  const productRepo: any = { createQueryBuilder: jest.fn() };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      providers: [
        LotsService,
        { provide: getRepositoryToken(Lot), useValue: lotRepo },
        { provide: getRepositoryToken(LotMovement), useValue: movRepo },
        { provide: getRepositoryToken(Establishment), useValue: estRepo },
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: DataSource, useValue: ds },
      ],
    }).compile();
    service = m.get(LotsService);
    jest.clearAllMocks();
  });

  describe('createReception', () => {
    it('creates lot + RECEPTION movement in a transaction', async () => {
      estRepo.createQueryBuilder.mockReturnValue(okQB({ id: 1, organizationId: '1' }));
      productRepo.createQueryBuilder.mockReturnValue(okQB({ id: 1, organizationId: '1' }));
      mockManager.save
        .mockResolvedValueOnce({ id: 7, productId: 1, establishmentId: 1, receivedAt: '2026-04-27' })
        .mockResolvedValueOnce({ id: 1, lotId: 7, type: 'RECEPTION', delta: 50 });
      const lot = await inOrg(() =>
        service.createReception(
          { productId: 1, establishmentId: 1, receivedAt: '2026-04-27', quantity: 50, lotCode: 'L1' },
          99,
        ),
      );
      expect(mockQR.startTransaction).toHaveBeenCalled();
      expect(mockQR.commitTransaction).toHaveBeenCalled();
      expect(lot.id).toBe(7);
      expect(mockManager.save).toHaveBeenCalledTimes(2);
    });

    it('rolls back on error', async () => {
      estRepo.createQueryBuilder.mockReturnValue(okQB({ id: 1, organizationId: '1' }));
      productRepo.createQueryBuilder.mockReturnValue(okQB({ id: 1, organizationId: '1' }));
      mockManager.save.mockRejectedValueOnce(new Error('DB down'));
      await expect(
        inOrg(() =>
          service.createReception(
            { productId: 1, establishmentId: 1, receivedAt: '2026-04-27', quantity: 1 },
            99,
          ),
        ),
      ).rejects.toThrow('DB down');
      expect(mockQR.rollbackTransaction).toHaveBeenCalled();
      expect(mockQR.release).toHaveBeenCalled();
    });
  });

  describe('getCurrentStock', () => {
    function mockMovs(movs: Array<Partial<LotMovement>>) {
      movRepo.find.mockResolvedValue(movs);
    }

    it('returns 0 with no movements', async () => {
      mockMovs([]);
      expect(await service.getCurrentStock(1)).toBe(0);
    });

    it('sums RECEPTION/ADJUSTMENT when no COUNT exists', async () => {
      mockMovs([
        { type: LotMovementType.RECEPTION, delta: 50, createdAt: new Date('2026-04-01') },
        { type: LotMovementType.ADJUSTMENT, delta: -3, createdAt: new Date('2026-04-05') },
      ]);
      expect(await service.getCurrentStock(1)).toBe(47);
    });

    it('uses last COUNT and sums later RECEPTION/ADJUSTMENT', async () => {
      mockMovs([
        { type: LotMovementType.RECEPTION, delta: 50, createdAt: new Date('2026-04-01') },
        { type: LotMovementType.COUNT, absoluteValue: 40, createdAt: new Date('2026-04-15') },
        { type: LotMovementType.RECEPTION, delta: 10, createdAt: new Date('2026-04-20') },
        { type: LotMovementType.ADJUSTMENT, delta: -2, createdAt: new Date('2026-04-22') },
      ]);
      expect(await service.getCurrentStock(1)).toBe(48);
    });

    it('respects atDate parameter (ignores movements after)', async () => {
      mockMovs([
        { type: LotMovementType.RECEPTION, delta: 50, createdAt: new Date('2026-04-01') },
        { type: LotMovementType.COUNT, absoluteValue: 40, createdAt: new Date('2026-04-15') },
        { type: LotMovementType.RECEPTION, delta: 100, createdAt: new Date('2026-04-25') },
      ]);
      const stock = await service.getCurrentStock(1, new Date('2026-04-20'));
      expect(stock).toBe(40);
    });
  });

  describe('createAdjustment', () => {
    it('persists ADJUSTMENT movement with delta and notes', async () => {
      await inOrg(async () => {
        // findById uses an org-scoped queryBuilder; stub it to return a lot.
        lotRepo.createQueryBuilder = jest.fn(() => ({
          innerJoin: jest.fn().mockReturnThis(),
          leftJoinAndSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue({ id: 5 }),
        }));
        lotRepo.findOne.mockResolvedValue({ id: 5 });
        movRepo.save = jest.fn((e) => Promise.resolve({ id: 99, ...e }));
        movRepo.create = jest.fn((dto) => dto);
        const result = await service.createAdjustment(5, { delta: -3, notes: 'damaged' }, 99);
        expect(result.delta).toBe(-3);
        expect(result.type).toBe('ADJUSTMENT');
      });
    });
  });
});
