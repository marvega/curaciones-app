import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WoundNotesService } from './wound-notes.service';
import { WoundNote } from './wound-note.entity';
import { runWithOrg } from '../common/org-context';
import { KMS_SERVICE } from '../kms/kms.service';
import { InMemoryKmsService } from '../kms/in-memory-kms.service';

const inOrg = (fn: () => Promise<void>) => () => runWithOrg('1', fn);

describe('WoundNotesService', () => {
  let service: WoundNotesService;

  const mockQb = {
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  const mockRepo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQb),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WoundNotesService,
        { provide: getRepositoryToken(WoundNote), useValue: mockRepo },
        { provide: KMS_SERVICE, useClass: InMemoryKmsService },
      ],
    }).compile();
    service = module.get(WoundNotesService);
    jest.clearAllMocks();
    mockQb.innerJoinAndSelect.mockClear().mockReturnThis();
    mockQb.where.mockClear().mockReturnThis();
    mockQb.andWhere.mockClear().mockReturnThis();
    mockQb.orderBy.mockClear().mockReturnThis();
    mockQb.addOrderBy.mockClear().mockReturnThis();
    mockQb.take.mockClear().mockReturnThis();
    mockQb.getMany.mockReset();
  });

  describe('findByPatient', () => {
    it('decrypts notes on every wound-note returned', inOrg(async () => {
      const kms = (
        service as unknown as { kms: import('../kms/kms.service').KmsService }
      ).kms;
      const enc1 = await kms.encrypt('herida cicatrizando bien', 'WoundNote.notes:21', '1');
      const enc2 = await kms.encrypt('exudado moderado', 'WoundNote.notes:22', '1');

      mockQb.getMany.mockResolvedValueOnce([
        { id: 21, curacionId: 100, notes: enc1, recordedBy: { id: 1 } },
        { id: 22, curacionId: 101, notes: enc2, recordedBy: { id: 1 } },
        { id: 23, curacionId: 102, notes: null, recordedBy: { id: 1 } },
      ]);

      const result = await service.findByPatient(7);

      expect(result).toHaveLength(3);
      expect(result[0].notes as unknown as string).toBe('herida cicatrizando bien');
      expect(result[1].notes as unknown as string).toBe('exudado moderado');
      expect(result[2].notes).toBeNull();
    }));
  });

  describe('findByPatientCursor', () => {
    it('decrypts notes and returns nextCursor when more pages exist', inOrg(async () => {
      const kms = (
        service as unknown as { kms: import('../kms/kms.service').KmsService }
      ).kms;
      const enc1 = await kms.encrypt('herida 1', 'WoundNote.notes:31', '1');
      const enc2 = await kms.encrypt('herida 2', 'WoundNote.notes:32', '1');

      // Return cappedLimit + 1 rows so the service slices and emits a cursor.
      mockQb.getMany.mockResolvedValueOnce([
        {
          id: 32,
          curacionId: 200,
          notes: enc2,
          createdAt: new Date('2026-04-02T10:00:00Z'),
        },
        {
          id: 31,
          curacionId: 199,
          notes: enc1,
          createdAt: new Date('2026-04-01T10:00:00Z'),
        },
        {
          id: 30,
          curacionId: 198,
          notes: null,
          createdAt: new Date('2026-03-31T10:00:00Z'),
        },
      ]);

      const result = await service.findByPatientCursor({ patientId: 7, limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.items[0].notes as unknown as string).toBe('herida 2');
      expect(result.items[1].notes as unknown as string).toBe('herida 1');
      expect(result.nextCursor).toBeDefined();
    }));

    it('returns no nextCursor on the last page', inOrg(async () => {
      mockQb.getMany.mockResolvedValueOnce([
        { id: 1, curacionId: 1, notes: null, createdAt: new Date('2026-04-01T10:00:00Z') },
      ]);

      const result = await service.findByPatientCursor({ patientId: 7, limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeUndefined();
    }));
  });

  describe('findByCuracion', () => {
    it('decrypts notes on the wound-note returned', inOrg(async () => {
      const kms = (
        service as unknown as { kms: import('../kms/kms.service').KmsService }
      ).kms;
      const enc = await kms.encrypt('observación clínica', 'WoundNote.notes:33', '1');

      mockRepo.findOne.mockResolvedValueOnce({
        id: 33,
        curacionId: 200,
        notes: enc,
        recordedBy: { id: 1 },
      });

      const result = await service.findByCuracion(200);

      expect(result).not.toBeNull();
      expect(result!.notes as unknown as string).toBe('observación clínica');
    }));

    it('returns null when no wound-note exists', inOrg(async () => {
      mockRepo.findOne.mockResolvedValueOnce(null);

      const result = await service.findByCuracion(200);

      expect(result).toBeNull();
    }));

    it('passes through null notes without calling decrypt', inOrg(async () => {
      mockRepo.findOne.mockResolvedValueOnce({
        id: 34,
        curacionId: 200,
        notes: null,
        recordedBy: { id: 1 },
      });

      const result = await service.findByCuracion(200);

      expect(result!.notes).toBeNull();
    }));
  });
});
