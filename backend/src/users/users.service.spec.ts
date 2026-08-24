import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { User, DEFAULT_PREFERENCES } from './user.entity';

jest.mock('bcrypt', () => ({
  hash: jest.fn(() => Promise.resolve('hashed-password')),
}));

describe('UsersService', () => {
  let service: UsersService;

  const mockRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((dto) => dto),
    save: jest.fn((entity) => Promise.resolve({ id: 1, createdAt: new Date('2026-01-01'), ...entity })),
  };

  const mockUser: User = {
    id: 1,
    username: 'admin',
    passwordHash: 'hashed-pw',
    email: null,
    emailHash: null,
    emailVerifiedAt: null,
    passwordChangedAt: null,
    preferences: null,
    createdAt: new Date('2026-01-01'),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
      ],
    }).compile();
    service = module.get(UsersService);
    jest.clearAllMocks();
  });

  describe('findByUsername', () => {
    it('returns user when found', async () => {
      mockRepo.findOne.mockResolvedValue(mockUser);

      const result = await service.findByUsername('admin');

      expect(result).toEqual(mockUser);
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { username: 'admin' } });
    });

    it('returns null when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.findByUsername('unknown');

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('returns user when found', async () => {
      mockRepo.findOne.mockResolvedValue(mockUser);

      const result = await service.findById(1);

      expect(result).toEqual(mockUser);
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('throws NotFoundException when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.findById(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates user with hashed password', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.create(
        { username: 'newuser', password: 'secret123' },
        { id: 1, role: 'admin' },
      );

      expect(bcrypt.hash).toHaveBeenCalledWith('secret123', 10);
      expect(mockRepo.create).toHaveBeenCalledWith({
        username: 'newuser',
        passwordHash: 'hashed-password',
      });
      expect(mockRepo.save).toHaveBeenCalled();
      expect(result).toHaveProperty('id');
    });

    it('returns only the findAll projection, never the password hash', async () => {
      // `save()` resolves to the full entity and `passwordHash` is a plain
      // @Column with no `select: false`, with no ClassSerializerInterceptor
      // registered in main.ts — so returning it shipped the bcrypt hash to the
      // HTTP client *and*, this route being audited, into
      // `audit_logs.afterJson`, which is hash-chained and cannot be scrubbed
      // afterwards. The exact-shape assertion is what keeps a future column
      // from widening the response silently.
      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.create(
        { username: 'newuser', password: 'secret123' },
        { id: 1, role: 'admin' },
      );

      expect(result).toEqual({
        id: 1,
        username: 'newuser',
        createdAt: new Date('2026-01-01'),
      });
      expect(JSON.stringify(result)).not.toContain('hashed-password');
    });

    it('throws ConflictException when username exists', async () => {
      mockRepo.findOne.mockResolvedValue(mockUser);

      await expect(
        service.create({ username: 'admin', password: 'secret123' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when non-admin tries to create', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create(
          { username: 'newuser', password: 'secret123' },
          { id: 2, role: 'user' },
        ),
      ).rejects.toThrow(ConflictException);
    });

    // TODO(phase-13.1b): role now lives on OrganizationMembership; restore once
    // create() accepts an organizationId and creates a membership row.
    it.skip('defaults role to user', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await service.create({ username: 'newuser', password: 'secret123' });

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'user' }),
      );
    });
  });

  describe('findAll', () => {
    it('calls repo.find with correct options', async () => {
      mockRepo.find.mockResolvedValue([]);

      await service.findAll();

      expect(mockRepo.find).toHaveBeenCalledWith({
        order: { username: 'ASC' },
        select: ['id', 'username', 'createdAt'],
      });
    });
  });

  describe('getPreferences', () => {
    it('returns defaults when user has no preferences', async () => {
      mockRepo.findOne.mockResolvedValue({ ...mockUser, preferences: null });

      const result = await service.getPreferences(1);

      expect(result).toEqual(DEFAULT_PREFERENCES);
    });

    it('returns merged preferences when user has some', async () => {
      mockRepo.findOne.mockResolvedValue({
        ...mockUser,
        preferences: { inactivityThresholdDays: 30 },
      });

      const result = await service.getPreferences(1);

      expect(result).toEqual({ inactivityThresholdDays: 30 });
    });
  });

  describe('updatePreferences', () => {
    it('deep merges and saves', async () => {
      mockRepo.findOne.mockResolvedValue({ ...mockUser, preferences: null });

      const result = await service.updatePreferences(1, { inactivityThresholdDays: 7 });

      expect(result).toEqual({ inactivityThresholdDays: 7 });
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          preferences: { inactivityThresholdDays: 7 },
        }),
      );
    });
  });

  describe('seed', () => {
    const prevUser = process.env.SEED_USERNAME;
    const prevPass = process.env.SEED_PASSWORD;

    afterEach(() => {
      if (prevUser === undefined) delete process.env.SEED_USERNAME;
      else process.env.SEED_USERNAME = prevUser;
      if (prevPass === undefined) delete process.env.SEED_PASSWORD;
      else process.env.SEED_PASSWORD = prevPass;
    });

    // The bootstrap credentials used to be literals in the service, which put
    // two real production passwords in a public repository. They now come from
    // the environment, and an unconfigured deployment must create nothing at
    // all — that is what makes the anonymous POST /api/users/seed endpoint
    // inert on a running installation.
    it('creates nothing when the seed credentials are unset', async () => {
      delete process.env.SEED_USERNAME;
      delete process.env.SEED_PASSWORD;

      const result = await service.seed();

      expect(result).toEqual({ created: 0 });
      expect(mockRepo.save).not.toHaveBeenCalled();
      expect(mockRepo.findOne).not.toHaveBeenCalled();
    });

    it('creates nothing when only one of the two is set', async () => {
      process.env.SEED_USERNAME = 'bootstrap';
      delete process.env.SEED_PASSWORD;

      const result = await service.seed();

      expect(result).toEqual({ created: 0 });
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('creates the configured user when both are set and it does not exist', async () => {
      process.env.SEED_USERNAME = 'bootstrap';
      process.env.SEED_PASSWORD = 'bootstrap-password';
      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.seed();

      expect(result).toEqual({ created: 1 });
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      expect(bcrypt.hash).toHaveBeenCalledWith('bootstrap-password', 10);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'bootstrap' }),
      );
    });

    it('skips a user that already exists', async () => {
      process.env.SEED_USERNAME = 'bootstrap';
      process.env.SEED_PASSWORD = 'bootstrap-password';
      mockRepo.findOne.mockResolvedValue(mockUser);

      const result = await service.seed();

      expect(result).toEqual({ created: 0 });
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });
});
