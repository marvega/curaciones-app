import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { OrganizationMembership, MembershipStatus, OrgRole } from '../organizations/organization-membership.entity';
import { Organization } from '../organizations/organization.entity';
import { UserEstablishmentAssignment } from '../establishments/user-establishment-assignment.entity';
import { SessionsService } from './sessions.service';
import { PasswordResetService } from './password-reset.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(() => Promise.resolve('hashed-password')),
}));

describe('AuthService', () => {
  let service: AuthService;

  const mockUser = {
    id: 1,
    username: 'admin',
    passwordHash: 'hashed-pw',
    email: null,
    emailHash: null,
    emailVerifiedAt: null,
    passwordChangedAt: null,
    preferences: null,
    createdAt: new Date('2026-01-01'),
  } as User;

  const mockMembership: Partial<OrganizationMembership> = {
    userId: 1,
    organizationId: '10',
    role: OrgRole.OWNER,
    status: MembershipStatus.ACTIVE,
  };

  const mockUserRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
    save: jest.fn(),
  };
  const mockMembershipRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const mockOrgRepo = {
    findOne: jest.fn(),
    findByIds: jest.fn(),
  };
  const mockUeaRepo = {
    find: jest.fn().mockResolvedValue([]),
  };
  const mockUsersService = {
    findByUsername: jest.fn(),
  };
  const mockJwtService = {
    sign: jest.fn(() => 'signed-token'),
  };
  const mockSessions = {
    issue: jest.fn().mockResolvedValue({ refreshToken: 'refresh-token' }),
    revokeAllForUser: jest.fn(),
    rotate: jest.fn(),
  };
  const mockPasswordReset = {
    findValidToken: jest.fn(),
    markUsed: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(OrganizationMembership), useValue: mockMembershipRepo },
        { provide: getRepositoryToken(Organization), useValue: mockOrgRepo },
        { provide: getRepositoryToken(UserEstablishmentAssignment), useValue: mockUeaRepo },
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: SessionsService, useValue: mockSessions },
        { provide: PasswordResetService, useValue: mockPasswordReset },
      ],
    }).compile();
    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  // TODO(phase-13.1b): validateUser was removed; the equivalent gate is now
  // baked into login() (findUserByUsernameOrEmail + bcrypt.compare). Reinstate
  // a focused unit test for findUserByUsernameOrEmail when refactoring.
  describe.skip('validateUser (removed)', () => {
    it.skip('returns user without passwordHash for valid credentials', () => {});
    it.skip('returns null when user not found', () => {});
    it.skip('returns null when password is incorrect', () => {});
  });

  describe('login', () => {
    it('returns accessToken, refreshToken, user and organizations on valid credentials', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce(mockUser); // by username
      mockMembershipRepo.find.mockResolvedValueOnce([mockMembership]);
      mockMembershipRepo.findOne.mockResolvedValueOnce(mockMembership);
      mockOrgRepo.findOne.mockResolvedValueOnce({ id: '10', name: 'Org A' });
      mockOrgRepo.findByIds.mockResolvedValueOnce([{ id: '10', name: 'Org A' }]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login('admin', 'correct-pw');

      expect(result).toMatchObject({
        accessToken: 'signed-token',
        refreshToken: 'refresh-token',
        user: { id: 1, username: 'admin' },
      });
      expect(result.organizations).toHaveLength(1);
      expect(result.organizations[0]).toMatchObject({ id: '10', name: 'Org A', role: OrgRole.OWNER });
    });

    it('throws UnauthorizedException on unknown user', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(service.login('unknown', 'pw')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException on bad password', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login('admin', 'wrong-pw')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when no active memberships', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockMembershipRepo.find.mockResolvedValueOnce([]);

      await expect(service.login('admin', 'pw')).rejects.toThrow(UnauthorizedException);
    });
  });
});
