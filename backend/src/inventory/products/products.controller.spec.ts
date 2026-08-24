import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ExcelImportService } from './excel-import.service';
import { MultiAuthGuard } from '../../oauth/guards/multi-auth.guard';
import { OAuthScopeGuard } from '../../oauth/guards/oauth-scope.guard';
import { RolesGuard } from '../../auth/roles.guard';

/**
 * Lightweight controller spec focused on the new cursor-pagination routing
 * branch on GET /api/inventory/products. Mirrors the patients controller spec
 * — fully mocked service, guards bypassed, direct method calls.
 */
describe('ProductsController (cursor branch)', () => {
  let controller: ProductsController;

  const mockService = {
    list: jest.fn(),
    findByCursor: jest.fn(),
  };

  const mockImporter = {
    import: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        { provide: ProductsService, useValue: mockService },
        { provide: ExcelImportService, useValue: mockImporter },
      ],
    })
      .overrideGuard(MultiAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OAuthScopeGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ProductsController);
  });

  it('returns nextCursor when more products exist', async () => {
    mockService.findByCursor.mockResolvedValue({
      items: [
        { id: 3, name: 'C' },
        { id: 2, name: 'B' },
      ],
      nextCursor: 'opaque-cursor-token',
    });

    const result = (await controller.list(undefined, undefined, undefined, '2', '', undefined)) as {
      items: unknown[];
      nextCursor?: string;
    };

    expect(mockService.findByCursor).toHaveBeenCalledWith({
      cursor: undefined,
      limit: 2,
      q: undefined,
    });
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeDefined();
  });

  it('forwards a non-empty cursor verbatim and parses limit', async () => {
    mockService.findByCursor.mockResolvedValue({ items: [], nextCursor: undefined });

    await controller.list(undefined, undefined, undefined, '50', 'abc123', '  apósito  ');

    expect(mockService.findByCursor).toHaveBeenCalledWith({
      cursor: 'abc123',
      limit: 50,
      q: 'apósito',
    });
  });

  it('falls back to list() when cursor is undefined', async () => {
    mockService.list.mockResolvedValue({ data: [], total: 0, page: 1, totalPages: 0 });

    await controller.list('apos', undefined, '1', '20', undefined, undefined);

    expect(mockService.findByCursor).not.toHaveBeenCalled();
    expect(mockService.list).toHaveBeenCalled();
  });

  it('throws BadRequestException for malformed cursor', async () => {
    mockService.findByCursor.mockRejectedValue(new Error('invalid cursor'));

    await expect(
      controller.list(undefined, undefined, undefined, '20', 'garbage', undefined),
    ).rejects.toThrow(BadRequestException);
  });

  it('rethrows unrelated service errors as-is', async () => {
    mockService.findByCursor.mockRejectedValue(new Error('database connection lost'));

    await expect(
      controller.list(undefined, undefined, undefined, '20', 'whatever', undefined),
    ).rejects.toThrow('database connection lost');
    await expect(
      controller.list(undefined, undefined, undefined, '20', 'whatever', undefined),
    ).rejects.not.toThrow(BadRequestException);
  });

  it('caps limit at 100 in the cursor branch', async () => {
    mockService.findByCursor.mockResolvedValue({ items: [], nextCursor: undefined });

    await controller.list(undefined, undefined, undefined, '5000', '', undefined);

    expect(mockService.findByCursor).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
    );
  });

  it('falls back to limit=20 for non-positive limit input', async () => {
    mockService.findByCursor.mockResolvedValue({ items: [], nextCursor: undefined });

    await controller.list(undefined, undefined, undefined, '-5', '', undefined);

    expect(mockService.findByCursor).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20 }),
    );
  });

  it('truncates q at 100 chars in the cursor branch', async () => {
    mockService.findByCursor.mockResolvedValue({ items: [], nextCursor: undefined });
    const longQ = 'a'.repeat(250);

    await controller.list(undefined, undefined, undefined, undefined, '', longQ);

    expect(mockService.findByCursor).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'a'.repeat(100) }),
    );
  });
});
