import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;

  const mockUsersService = {
    findByUsername: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(() => 'signed-token'),
  };

  const mockUser = {
    id: 1,
    username: 'admin',
    passwordHash: 'hashed-pw',
    role: 'admin',
    createdAt: new Date('2026-01-01'),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();
    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    it('returns user without passwordHash for valid credentials', async () => {
      mockUsersService.findByUsername.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('admin', 'correct-pw');

      expect(result).toEqual({
        id: 1,
        username: 'admin',
        role: 'admin',
        createdAt: mockUser.createdAt,
      });
      expect(result).not.toHaveProperty('passwordHash');
      expect(mockUsersService.findByUsername).toHaveBeenCalledWith('admin');
      expect(bcrypt.compare).toHaveBeenCalledWith('correct-pw', 'hashed-pw');
    });

    it('returns null when user not found', async () => {
      mockUsersService.findByUsername.mockResolvedValue(null);

      const result = await service.validateUser('unknown', 'pw');

      expect(result).toBeNull();
    });

    it('returns null when password is incorrect', async () => {
      mockUsersService.findByUsername.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateUser('admin', 'wrong-pw');

      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('returns access_token and user info on valid credentials', async () => {
      mockUsersService.findByUsername.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login('admin', 'correct-pw');

      expect(result).toEqual({
        access_token: 'signed-token',
        user: { id: 1, username: 'admin', role: 'admin' },
      });
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: 1,
        username: 'admin',
        role: 'admin',
      });
    });

    it('throws UnauthorizedException on invalid credentials', async () => {
      mockUsersService.findByUsername.mockResolvedValue(null);

      await expect(service.login('unknown', 'pw')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
