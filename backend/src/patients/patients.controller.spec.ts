import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { PatientPdfService } from './patient-pdf.service';
import { MultiAuthGuard } from '../oauth/guards/multi-auth.guard';
import { OAuthScopeGuard } from '../oauth/guards/oauth-scope.guard';

/**
 * Lightweight controller spec focused on the new cursor-pagination routing
 * branch. Uses a fully mocked PatientsService so the test does not depend on
 * a database; the goal is to verify request → service-method dispatch.
 *
 * Auth is bypassed because we instantiate the controller via Nest's testing
 * module and call .find() directly — guards are not invoked at the method
 * level, only at the HTTP layer.
 */
describe('PatientsController (cursor branch)', () => {
  let controller: PatientsController;

  const mockService = {
    findByRut: jest.fn(),
    findByCursor: jest.fn(),
    findAdvanced: jest.fn(),
    findPaginated: jest.fn(),
    findAll: jest.fn(),
  };

  const mockPdfService = {
    generatePdf: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [PatientsController],
      providers: [
        { provide: PatientsService, useValue: mockService },
        { provide: PatientPdfService, useValue: mockPdfService },
      ],
    })
      .overrideGuard(MultiAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OAuthScopeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(PatientsController);
  });

  // Helper that mirrors the controller's argument order. The signature is
  // (rut, q, page, limit, cursor, status, gender, curacionType, dateFrom,
  // dateTo, ageMin, ageMax) — keeping a helper makes the tests readable
  // without re-counting positional `undefined`s.
  const callFind = (overrides: {
    rut?: string;
    q?: string;
    page?: string;
    limit?: string;
    cursor?: string;
  } = {}) =>
    controller.find(
      overrides.rut,
      overrides.q,
      overrides.page,
      overrides.limit,
      overrides.cursor,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );

  it('returns nextCursor when more results exist', async () => {
    mockService.findByCursor.mockResolvedValue({
      items: [
        { id: 3, firstName: 'C' },
        { id: 2, firstName: 'B' },
      ],
      nextCursor: 'opaque-cursor-token',
    });

    const result = (await callFind({ cursor: '', limit: '2' })) as {
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

  it('returns no nextCursor on last page', async () => {
    mockService.findByCursor.mockResolvedValue({
      items: [{ id: 1, firstName: 'Z' }],
      nextCursor: undefined,
    });

    const result = (await callFind({ cursor: '', limit: '10' })) as {
      items: unknown[];
      nextCursor?: string;
    };

    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.nextCursor).toBeUndefined();
  });

  it('forwards a non-empty cursor verbatim and parses limit', async () => {
    mockService.findByCursor.mockResolvedValue({ items: [], nextCursor: undefined });

    await callFind({ cursor: 'abc123', limit: '50', q: '  ana  ' });

    expect(mockService.findByCursor).toHaveBeenCalledWith({
      cursor: 'abc123',
      limit: 50,
      q: 'ana',
    });
  });

  it('cursor branch wins over page when both are present', async () => {
    mockService.findByCursor.mockResolvedValue({ items: [], nextCursor: undefined });

    await callFind({ cursor: 'abc123', page: '5', limit: '10' });

    expect(mockService.findByCursor).toHaveBeenCalledTimes(1);
    expect(mockService.findPaginated).not.toHaveBeenCalled();
    expect(mockService.findAdvanced).not.toHaveBeenCalled();
  });

  it('falls back to existing branches when cursor is undefined', async () => {
    mockService.findPaginated.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      totalPages: 0,
    });

    await callFind({ page: '1', limit: '20' });

    expect(mockService.findByCursor).not.toHaveBeenCalled();
    expect(mockService.findPaginated).toHaveBeenCalledWith(1, 20);
  });

  it('throws BadRequestException for malformed cursor', async () => {
    // Service's decodeCursor() throws plain Error on bad input; without the
    // controller's try/catch this would surface as a 500. Verify the
    // contract that bad opaque cursor → 400.
    mockService.findByCursor.mockRejectedValue(new Error('invalid cursor'));

    await expect(callFind({ cursor: 'garbage' })).rejects.toThrow(BadRequestException);
  });

  it('rethrows unrelated service errors as-is (not 400)', async () => {
    // Defence: the catch must only convert "invalid cursor" — other failures
    // (e.g. DB outage) keep their original error type so Nest maps them to 500.
    mockService.findByCursor.mockRejectedValue(new Error('database connection lost'));

    await expect(callFind({ cursor: 'whatever' })).rejects.toThrow('database connection lost');
    await expect(callFind({ cursor: 'whatever' })).rejects.not.toThrow(BadRequestException);
  });

  it('caps limit at 100 in the cursor branch', async () => {
    mockService.findByCursor.mockResolvedValue({ items: [], nextCursor: undefined });

    await callFind({ cursor: '', limit: '5000' });

    expect(mockService.findByCursor).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
    );
  });

  it('falls back to limit=20 for non-positive limit input', async () => {
    mockService.findByCursor.mockResolvedValue({ items: [], nextCursor: undefined });

    await callFind({ cursor: '', limit: '-5' });

    expect(mockService.findByCursor).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20 }),
    );
  });

  it('truncates q at 100 chars in the cursor branch', async () => {
    mockService.findByCursor.mockResolvedValue({ items: [], nextCursor: undefined });
    const longQ = 'a'.repeat(250);

    await callFind({ cursor: '', q: longQ });

    expect(mockService.findByCursor).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'a'.repeat(100) }),
    );
  });
});
