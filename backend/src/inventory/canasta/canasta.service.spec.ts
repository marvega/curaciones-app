import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CanastaService } from './canasta.service';
import { CanastaCategory, CanastaSection } from './canasta-category.entity';
import { ProductsService } from '../products/products.service';
import { runWithOrg } from '../../common/org-context';

const inOrg = (fn: () => Promise<void>) => () => runWithOrg('1', fn);

describe('CanastaService', () => {
  let service: CanastaService;
  const repo: any = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  };
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

  it('list excludes archived by default', inOrg(async () => {
    repo.find.mockResolvedValue([{ id: 1, name: 'A', displayOrder: 1, products: [] }]);
    const r = await service.list();
    expect(r).toHaveLength(1);
    expect(repo.find).toHaveBeenCalledWith({
      where: { archived: false, organizationId: '1' },
      relations: ['products'],
      order: { displayOrder: 'ASC' },
    });
  }));

  it('list(true) includes archived', inOrg(async () => {
    repo.find.mockResolvedValue([
      { id: 1, name: 'A', displayOrder: 1, products: [], archived: false },
      { id: 2, name: 'B', displayOrder: 2, products: [], archived: true },
    ]);
    const r = await service.list(true);
    expect(r).toHaveLength(2);
    expect(repo.find).toHaveBeenCalledWith({
      where: { organizationId: '1' },
      relations: ['products'],
      order: { displayOrder: 'ASC' },
    });
  }));

  it('replaceProducts wipes ALL associations and inserts new with auto_mapped=FALSE', inOrg(async () => {
    repo.findOne.mockResolvedValue({ id: 5 });
    ds.query.mockResolvedValue(undefined);
    await service.replaceProducts(5, [10, 20, 30]);
    expect(ds.query).toHaveBeenCalledWith(
      'DELETE FROM canasta_category_products WHERE "canastaCategoryId" = $1',
      [5],
    );
    expect(ds.query).toHaveBeenCalledWith(
      expect.stringContaining('"auto_mapped"'),
      expect.any(Array),
    );
    const insertCall = ds.query.mock.calls.find((c: any[]) =>
      String(c[0]).includes('INSERT INTO canasta_category_products'),
    );
    expect(insertCall![0]).toContain('FALSE');
  }));

  it('createCategory uses default displayOrder = count + 1 when omitted', inOrg(async () => {
    repo.count.mockResolvedValue(7);
    const created = { id: 99, name: 'Nueva', section: CanastaSection.INSUMOS, displayOrder: 8 };
    repo.create.mockReturnValue(created);
    repo.save.mockResolvedValue(created);
    const r = await service.createCategory({ name: 'Nueva', section: CanastaSection.INSUMOS });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Nueva',
        section: CanastaSection.INSUMOS,
        displayOrder: 8,
        archived: false,
        sourceKey: null,
      }),
    );
    expect(r).toBe(created);
  }));

  it('updateCategory loads, assigns, and saves', inOrg(async () => {
    const entity = { id: 4, name: 'Old', section: CanastaSection.INSUMOS, archived: false };
    repo.findOne.mockResolvedValue(entity);
    repo.save.mockImplementation(async (e: any) => e);
    const r = await service.updateCategory(4, { name: 'New', archived: true });
    expect(r.name).toBe('New');
    expect(r.archived).toBe(true);
  }));

  it('deleteCategory removes products links then deletes entity', inOrg(async () => {
    repo.findOne.mockResolvedValue({ id: 9 });
    ds.query.mockResolvedValue(undefined);
    repo.delete.mockResolvedValue(undefined);
    await service.deleteCategory(9);
    expect(ds.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM canasta_category_products'),
      [9],
    );
    expect(repo.delete).toHaveBeenCalledWith(9);
  }));
});
