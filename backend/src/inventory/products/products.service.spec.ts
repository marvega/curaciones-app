import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { Product, ProductType } from './product.entity';
import { ProductCode, CodeSystem } from './product-code.entity';
import { NotFoundException } from '@nestjs/common';

describe('ProductsService', () => {
  let service: ProductsService;
  const productRepo = {
    create: jest.fn((dto) => dto),
    save: jest.fn((e) => Promise.resolve({ id: 1, ...e })),
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    update: jest.fn(),
  };
  const codeRepo = {
    findOne: jest.fn(),
    save: jest.fn((e) => Promise.resolve({ id: 1, ...e })),
    create: jest.fn((dto) => dto),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(ProductCode), useValue: codeRepo },
      ],
    }).compile();
    service = m.get(ProductsService);
    jest.clearAllMocks();
  });

  it('create persists product with codes', async () => {
    const dto = {
      name: 'Apósito X',
      type: ProductType.INSUMO,
      packaging: 'UNIDAD',
      codes: [{ codeSystem: CodeSystem.AVIS_QUILPUE, code: '1778' }],
    };
    productRepo.save.mockResolvedValue({ id: 5, ...dto });
    productRepo.findOne.mockResolvedValue({ id: 5, ...dto, codes: dto.codes });
    const result = await service.create(dto as any);
    expect(productRepo.save).toHaveBeenCalled();
    expect(result.id).toBe(5);
  });

  it('upsertByCode updates existing when code matches', async () => {
    codeRepo.findOne.mockResolvedValue({ id: 9, productId: 7, codeSystem: CodeSystem.AVIS_QUILPUE, code: '1778' });
    productRepo.findOne.mockResolvedValue({ id: 7, name: 'Old', type: 'INSUMO', packaging: 'UNIDAD' });
    productRepo.save.mockResolvedValue({ id: 7, name: 'New', type: 'INSUMO', packaging: 'UNIDAD' });

    const result = await service.upsertByCode(
      { codeSystem: CodeSystem.AVIS_QUILPUE, code: '1778' },
      { name: 'New', type: ProductType.INSUMO, packaging: 'UNIDAD' },
    );
    expect(result.action).toBe('updated');
    expect(productRepo.save).toHaveBeenCalled();
  });

  it('upsertByCode creates new when no code matches', async () => {
    codeRepo.findOne.mockResolvedValue(null);
    productRepo.save.mockResolvedValue({ id: 8, name: 'New', type: 'INSUMO', packaging: 'UNIDAD' });
    codeRepo.save.mockResolvedValue({ id: 1, productId: 8, codeSystem: CodeSystem.AVIS_QUILPUE, code: '999' });

    const result = await service.upsertByCode(
      { codeSystem: CodeSystem.AVIS_QUILPUE, code: '999' },
      { name: 'New', type: ProductType.INSUMO, packaging: 'UNIDAD' },
    );
    expect(result.action).toBe('created');
  });

  it('findById throws when missing', async () => {
    productRepo.findOne.mockResolvedValue(null);
    await expect(service.findById(404)).rejects.toThrow(NotFoundException);
  });
});
