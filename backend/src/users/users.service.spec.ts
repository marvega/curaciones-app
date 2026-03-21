import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { User } from './user.entity';

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
    role: 'admin',
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
        role: 'user',
      });
      expect(mockRepo.save).toHaveBeenCalled();
      expect(result).toHaveProperty('id');
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

    it('defaults role to user', async () => {
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
        select: ['id', 'username', 'role', 'createdAt'],
      });
    });
  });

  describe('seed', () => {
    it('creates default users when they do not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await service.seed();

      expect(result).toEqual({ created: 2 });
      expect(mockRepo.save).toHaveBeenCalledTimes(2);
      expect(bcrypt.hash).toHaveBeenCalledTimes(2);
    });

    it('skips existing users', async () => {
      mockRepo.findOne.mockResolvedValue(mockUser);

      const result = await service.seed();

      expect(result).toEqual({ created: 0 });
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });
});
