import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CanastaService } from './canasta.service';
import { CanastaCategory } from './canasta-category.entity';
import { ProductsService } from '../products/products.service';

describe('CanastaService', () => {
  let service: CanastaService;
  const repo: any = { find: jest.fn(), findOne: jest.fn(), save: jest.fn() };
  const ds: any = { query: jest.fn() };
  const productsServiceMock: any = { list: jest.fn() };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      providers: [
        CanastaService,
        { provide: getRepositoryToken(CanastaCategory), useValue: repo },
        { provide: DataSource, useValue: ds },
        { provide: ProductsService, useValue: productsServiceMock },
      ],
    }).compile();
    service = m.get(CanastaService);
    jest.clearAllMocks();
  });

  it('list returns categories ordered by displayOrder with products', async () => {
    repo.find.mockResolvedValue([{ id: 1, name: 'A', displayOrder: 1, products: [] }]);
    const r = await service.list();
    expect(r).toHaveLength(1);
    expect(repo.find).toHaveBeenCalledWith({ relations: ['products'], order: { displayOrder: 'ASC' } });
  });

  it('replaceProducts deletes old links then inserts new ones in transaction', async () => {
    repo.findOne.mockResolvedValue({ id: 5 });
    ds.query.mockResolvedValue(undefined);
    await service.replaceProducts(5, [10, 20, 30]);
    expect(ds.query).toHaveBeenCalledWith(
      'DELETE FROM canasta_category_products WHERE "canastaCategoryId" = $1',
      [5],
    );
    expect(ds.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO canasta_category_products'),
      expect.any(Array),
    );
  });

  describe('applyDefaultMappings', () => {
    it('matches products by avisCodes and namePatterns', async () => {
      repo.find.mockResolvedValue([
        { id: 1, displayOrder: 1, name: 'Apósitos bacteriostáticos', section: 'INSUMOS' },
      ]);
      productsServiceMock.list.mockResolvedValue({
        data: [
          { id: 100, name: 'APÓSITO RINGER CON PHMB 10X10 CM', codes: [{ codeSystem: 'AVIS_QUILPUE', code: '1778' }] },
          { id: 101, name: 'APÓSITO MIEL GEL 30 GR', codes: [{ codeSystem: 'AVIS_QUILPUE', code: '2066' }] },
          { id: 102, name: 'GASA 10X10', codes: [{ codeSystem: 'AVIS_QUILPUE', code: '819' }] },
        ],
        total: 3, page: 1, totalPages: 1,
      });
      repo.findOne.mockResolvedValue({ id: 1, products: [] });
      ds.query.mockResolvedValue(undefined);
      const result = await service.applyDefaultMappings();
      // Bacteriostáticos: matches AVIS 1778 + Miel Gel by name = 2 matches; GASA does not match.
      expect(result.associated).toBeGreaterThanOrEqual(2);
      expect(result.details[0].productIds).toContain(100);
      expect(result.details[0].productIds).toContain(101);
      expect(result.details[0].productIds).not.toContain(102);
    });
  });
});
