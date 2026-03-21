import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogService } from './audit-log.service';
import { AuditLog, AuditAction } from './audit-log.entity';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let repo: Partial<Repository<AuditLog>>;

  beforeEach(async () => {
    repo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((entity) => Promise.resolve({ id: 1, ...entity })),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getRepositoryToken(AuditLog), useValue: repo },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  describe('log', () => {
    it('should create an audit log entry', async () => {
      await service.log({
        userId: 1,
        username: 'admin',
        action: AuditAction.CREATE,
        entity: 'Patient',
        entityId: 42,
        payload: { firstName: 'Test' },
      });
      expect(repo.create).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page', 1);
      expect(result).toHaveProperty('totalPages');
    });

    it('should filter by entity', async () => {
      await service.findAll({ page: 1, limit: 20, entity: 'Patient' });
      const callArgs = (repo.findAndCount as jest.Mock).mock.calls[0][0];
      expect(callArgs.where.entity).toBe('Patient');
    });

    it('should filter by userId', async () => {
      await service.findAll({ page: 1, limit: 20, userId: 5 });
      const callArgs = (repo.findAndCount as jest.Mock).mock.calls[0][0];
      expect(callArgs.where.userId).toBe(5);
    });
  });
});
