import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CuracionesController } from './curaciones.controller';
import { CuracionesService } from './curaciones.service';
import { MultiAuthGuard } from '../oauth/guards/multi-auth.guard';
import { OAuthScopeGuard } from '../oauth/guards/oauth-scope.guard';
import { RolesGuard } from '../auth/roles.guard';

/**
 * Lightweight controller spec focused on the new cursor-pagination routing
 * branch on GET /api/curaciones/patient/:patientId. Mirrors the patients
 * controller spec — fully mocked service, guards bypassed, direct method calls.
 */
describe('CuracionesController (cursor branch)', () => {
  let controller: CuracionesController;

  const mockService = {
    findByPatient: jest.fn(),
    findByPatientCursor: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [CuracionesController],
      providers: [{ provide: CuracionesService, useValue: mockService }],
    })
      .overrideGuard(MultiAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OAuthScopeGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(CuracionesController);
  });

  it('returns nextCursor when more curaciones exist', async () => {
    mockService.findByPatientCursor.mockResolvedValue({
      items: [
        { id: 3, patientId: 1 },
        { id: 2, patientId: 1 },
      ],
      nextCursor: 'opaque-cursor-token',
    });

    const result = (await controller.findByPatient(1, '2', '')) as {
      items: unknown[];
      nextCursor?: string;
    };

    expect(mockService.findByPatientCursor).toHaveBeenCalledWith({
      patientId: 1,
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

  it('falls back to findByPatient when cursor is undefined and limit is undefined', async () => {
    mockService.findByPatient.mockResolvedValue([]);

    await controller.findByPatient(1, undefined, undefined);

    expect(mockService.findByPatientCursor).not.toHaveBeenCalled();
    expect(mockService.findByPatient).toHaveBeenCalledWith(1);
  });

  it('throws BadRequestException for malformed cursor', async () => {
    mockService.findByPatientCursor.mockRejectedValue(new Error('invalid cursor'));

    await expect(controller.findByPatient(1, '20', 'garbage')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rethrows unrelated service errors as-is', async () => {
    mockService.findByPatientCursor.mockRejectedValue(new Error('database connection lost'));

    await expect(controller.findByPatient(1, '20', 'whatever')).rejects.toThrow(
      'database connection lost',
    );
    await expect(controller.findByPatient(1, '20', 'whatever')).rejects.not.toThrow(
      BadRequestException,
    );
  });

  it('caps limit at 100 in the cursor branch', async () => {
    mockService.findByPatientCursor.mockResolvedValue({ items: [], nextCursor: undefined });

    await controller.findByPatient(1, '5000', '');

    expect(mockService.findByPatientCursor).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
    );
  });

  it('falls back to limit=20 for non-positive limit input in cursor branch', async () => {
    mockService.findByPatientCursor.mockResolvedValue({ items: [], nextCursor: undefined });

    await controller.findByPatient(1, '-5', '');

    expect(mockService.findByPatientCursor).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20 }),
    );
  });
});
