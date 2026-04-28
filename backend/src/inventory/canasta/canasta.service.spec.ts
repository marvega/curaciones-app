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
  const productsServiceMock: any = { list: jest.fn(), listAll: jest.fn() };

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
});
