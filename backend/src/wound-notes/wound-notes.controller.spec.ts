import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { WoundNotesController } from './wound-notes.controller';
import { WoundNotesService } from './wound-notes.service';
import { MultiAuthGuard } from '../oauth/guards/multi-auth.guard';
import { OAuthScopeGuard } from '../oauth/guards/oauth-scope.guard';

/**
 * Lightweight controller spec focused on the new cursor-pagination routing
 * branch on GET /api/wound-notes/patient/:patientId. Mirrors the patients
 * controller spec — fully mocked service, guards bypassed, direct method calls.
 */
describe('WoundNotesController (cursor branch)', () => {
  let controller: WoundNotesController;

  const mockService = {
    findByPatient: jest.fn(),
    findByPatientCursor: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [WoundNotesController],
      providers: [{ provide: WoundNotesService, useValue: mockService }],
    })
      .overrideGuard(MultiAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OAuthScopeGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(WoundNotesController);
  });

  it('returns nextCursor when more wound-notes exist', async () => {
    mockService.findByPatientCursor.mockResolvedValue({
      items: [
        { id: 22, curacionId: 101, notes: 'plain text 1' },
        { id: 21, curacionId: 100, notes: 'plain text 2' },
      ],
      nextCursor: 'opaque-cursor-token',
    });

    const result = (await controller.findByPatient(7, '2', '')) as {
      items: unknown[];
      nextCursor?: string;
    };

    expect(mockService.findByPatientCursor).toHaveBeenCalledWith({
      patientId: 7,
      limit: 2,
      cursor: undefined,
    });
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeDefined();
  });

  it('forwards a non-empty cursor verbatim and parses limit', async () => {
    mockService.findByPatientCursor.mockResolvedValue({ items: [], nextCursor: undefined });

    await controller.findByPatient(7, '50', 'abc123');

    expect(mockService.findByPatientCursor).toHaveBeenCalledWith({
      patientId: 7,
      limit: 50,
      cursor: 'abc123',
    });
  });

  it('falls back to findByPatient when cursor is undefined', async () => {
    mockService.findByPatient.mockResolvedValue([]);

    await controller.findByPatient(7, undefined, undefined);

    expect(mockService.findByPatientCursor).not.toHaveBeenCalled();
    expect(mockService.findByPatient).toHaveBeenCalledWith(7);
  });

  it('throws BadRequestException for malformed cursor', async () => {
    mockService.findByPatientCursor.mockRejectedValue(new Error('invalid cursor'));

    await expect(controller.findByPatient(7, '20', 'garbage')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rethrows unrelated service errors as-is', async () => {
    mockService.findByPatientCursor.mockRejectedValue(new Error('database connection lost'));

    await expect(controller.findByPatient(7, '20', 'whatever')).rejects.toThrow(
      'database connection lost',
    );
    await expect(controller.findByPatient(7, '20', 'whatever')).rejects.not.toThrow(
      BadRequestException,
    );
  });

  it('caps limit at 100 in the cursor branch', async () => {
    mockService.findByPatientCursor.mockResolvedValue({ items: [], nextCursor: undefined });

    await controller.findByPatient(7, '5000', '');

    expect(mockService.findByPatientCursor).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
    );
  });

  it('falls back to limit=20 for non-positive limit input', async () => {
    mockService.findByPatientCursor.mockResolvedValue({ items: [], nextCursor: undefined });

    await controller.findByPatient(7, '-5', '');

    expect(mockService.findByPatientCursor).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20 }),
    );
  });
});
