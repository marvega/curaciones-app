/* eslint-disable @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-return,
                  @typescript-eslint/no-unsafe-call,
                  @typescript-eslint/require-await */
// jest mock callbacks are typed as `any`; the matching public method
// signatures on OrgService provide the real type checks.
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrgService } from './org.service';
import { Organization } from '../organizations/organization.entity';
import {
  OrganizationMembership,
  MembershipStatus,
  OrgRole,
} from '../organizations/organization-membership.entity';
import { User } from '../users/user.entity';
import { Invitation } from '../auth/invitation.entity';
import { InvitationsService } from '../auth/invitations.service';
import { KMS_SERVICE } from '../kms/kms.service';
import { Establishment } from '../establishments/establishment.entity';

describe('OrgService', () => {
  let service: OrgService;
  let orgRepo: { findOne: jest.Mock; save: jest.Mock };
  let memRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    count: jest.Mock;
    manager: { getRepository: jest.Mock; transaction: jest.Mock };
  };
  let userRepo: { findBy: jest.Mock; findOne: jest.Mock };
  let invRepo: { find: jest.Mock };
  let estRepo: { create: jest.Mock; save: jest.Mock };
  let kms: { decrypt: jest.Mock; encrypt: jest.Mock };
  let manager: { getRepository: jest.Mock; transaction: jest.Mock };
  let invitationsService: { create: jest.Mock };

  beforeEach(async () => {
    orgRepo = { findOne: jest.fn(), save: jest.fn() };
    invitationsService = { create: jest.fn() };
    manager = {
      getRepository: jest.fn(),
      transaction: jest.fn(async (fn) => fn(manager)),
    };
    memRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      count: jest.fn(),
      manager,
    };
    manager.getRepository.mockReturnValue(memRepo);
    userRepo = { findBy: jest.fn(), findOne: jest.fn() };
    invRepo = { find: jest.fn() };
    estRepo = { create: jest.fn(), save: jest.fn() };
    kms = { decrypt: jest.fn(), encrypt: jest.fn() };
    const m = await Test.createTestingModule({
      providers: [
        OrgService,
        { provide: getRepositoryToken(Organization), useValue: orgRepo },
        {
          provide: getRepositoryToken(OrganizationMembership),
          useValue: memRepo,
        },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Invitation), useValue: invRepo },
        { provide: getRepositoryToken(Establishment), useValue: estRepo },
        { provide: KMS_SERVICE, useValue: kms },
        { provide: InvitationsService, useValue: invitationsService },
      ],
    }).compile();
    service = m.get(OrgService);
  });

  describe('updateSettings', () => {
    it('persists name and rut', async () => {
      orgRepo.findOne.mockResolvedValue({ id: '1', name: 'Old', rut: null });
      orgRepo.save.mockImplementation(async (o) => o);
      const result = await service.updateSettings('1', {
        name: 'New',
        rut: '11.111.111-1',
      });
      expect(result).toEqual({ name: 'New', rut: '11.111.111-1' });
      expect(orgRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: '1', name: 'New', rut: '11.111.111-1' }),
      );
    });

    it('persists null when rut is omitted', async () => {
      orgRepo.findOne.mockResolvedValue({
        id: '1',
        name: 'Old',
        rut: '11.111.111-1',
      });
      orgRepo.save.mockImplementation(async (o) => o);
      const result = await service.updateSettings('1', { name: 'New' });
      expect(result).toEqual({ name: 'New', rut: null });
    });

    it('throws NotFoundException when the organization is missing', async () => {
      orgRepo.findOne.mockResolvedValue(null);
      await expect(service.updateSettings('1', { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listMembers', () => {
    it('returns mapped rows when there are active memberships', async () => {
      memRepo.find.mockResolvedValue([
        {
          id: '1',
          userId: 10,
          organizationId: '1',
          role: OrgRole.OWNER,
          status: MembershipStatus.ACTIVE,
        },
        {
          id: '2',
          userId: 20,
          organizationId: '1',
          role: OrgRole.ADMIN,
          status: MembershipStatus.ACTIVE,
        },
      ]);
      const encryptedEmail = {
        v: 1,
        k: 'fake-k',
        iv: 'fake-iv',
        c: 'fake-c',
        t: 'fake-t',
        aad: 'User.email:10',
      };
      userRepo.findBy.mockResolvedValue([
        { id: 10, username: 'owner', email: encryptedEmail },
        { id: 20, username: 'admin', email: null },
      ]);
      kms.decrypt.mockImplementation(async (_field: unknown, aad: string) =>
        aad.endsWith(':10') ? 'o@x.cl' : 'other@x.cl',
      );
      const result = await service.listMembers('1');
      expect(result).toEqual([
        {
          userId: 10,
          username: 'owner',
          email: 'o@x.cl',
          role: OrgRole.OWNER,
          status: MembershipStatus.ACTIVE,
        },
        {
          userId: 20,
          username: 'admin',
          email: null,
          role: OrgRole.ADMIN,
          status: MembershipStatus.ACTIVE,
        },
      ]);
      expect(kms.decrypt).toHaveBeenCalledTimes(1);
      expect(kms.decrypt).toHaveBeenCalledWith(
        encryptedEmail,
        'User.email:10',
        '1',
      );
    });

    it('returns [] when there are no active memberships', async () => {
      memRepo.find.mockResolvedValue([]);
      const result = await service.listMembers('1');
      expect(result).toEqual([]);
      expect(userRepo.findBy).not.toHaveBeenCalled();
    });

    it('throws when a membership references a missing user', async () => {
      memRepo.find.mockResolvedValue([
        {
          id: '1',
          userId: 99,
          organizationId: '1',
          role: OrgRole.ADMIN,
          status: MembershipStatus.ACTIVE,
        },
      ]);
      userRepo.findBy.mockResolvedValue([]);
      await expect(service.listMembers('1')).rejects.toThrow(/missing user 99/);
    });
  });

  describe('updateRole', () => {
    it('rejects demoting the last owner with 409', async () => {
      memRepo.findOne.mockResolvedValue({
        id: '1',
        userId: 9,
        organizationId: '1',
        role: OrgRole.OWNER,
        status: MembershipStatus.ACTIVE,
      });
      memRepo.count.mockResolvedValue(1); // last owner
      await expect(service.updateRole('1', 9, OrgRole.ADMIN)).rejects.toThrow(
        ConflictException,
      );
      expect(memRepo.save).not.toHaveBeenCalled();
    });

    it('persists when another owner exists', async () => {
      memRepo.findOne.mockResolvedValue({
        id: '1',
        userId: 9,
        organizationId: '1',
        role: OrgRole.OWNER,
        status: MembershipStatus.ACTIVE,
      });
      memRepo.count.mockResolvedValue(2);
      memRepo.save.mockImplementation(async (m) => m);
      userRepo.findOne = jest
        .fn()
        .mockResolvedValue({ id: 9, username: 'x', email: null });
      const result = await service.updateRole('1', 9, OrgRole.ADMIN);
      expect(memRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ role: OrgRole.ADMIN }),
      );
      expect(result).toEqual({
        userId: 9,
        username: 'x',
        email: null,
        role: OrgRole.ADMIN,
        status: MembershipStatus.ACTIVE,
      });
    });

    it('decrypts email when present in the returned member', async () => {
      memRepo.findOne.mockResolvedValue({
        id: '1',
        userId: 9,
        organizationId: '1',
        role: OrgRole.ADMIN,
        status: MembershipStatus.ACTIVE,
      });
      memRepo.save.mockImplementation(async (m) => m);
      userRepo.findOne = jest.fn().mockResolvedValue({
        id: 9,
        username: 'x',
        email: { v: 1, k: 'k', iv: 'iv', c: 'c', t: 't', aad: 'User.email:9' },
      });
      kms.decrypt.mockResolvedValue('x@x.cl');
      const result = await service.updateRole('1', 9, OrgRole.CLINICIAN);
      expect(result.email).toBe('x@x.cl');
      expect(kms.decrypt).toHaveBeenCalledWith(
        expect.objectContaining({ v: 1 }),
        'User.email:9',
        '1',
      );
    });

    it('throws NotFound when membership does not exist', async () => {
      memRepo.findOne.mockResolvedValue(null);
      await expect(service.updateRole('1', 9, OrgRole.ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('revokeMember', () => {
    it('rejects revoking yourself with 409', async () => {
      await expect(service.revokeMember('1', 9, 9)).rejects.toThrow(
        ConflictException,
      );
      expect(memRepo.findOne).not.toHaveBeenCalled();
    });

    it('rejects revoking the last owner with 409', async () => {
      memRepo.findOne.mockResolvedValue({
        id: '1',
        userId: 9,
        organizationId: '1',
        role: OrgRole.OWNER,
        status: MembershipStatus.ACTIVE,
      });
      memRepo.count.mockResolvedValue(1);
      await expect(service.revokeMember('1', 9, 1)).rejects.toThrow(
        ConflictException,
      );
      expect(memRepo.save).not.toHaveBeenCalled();
    });

    it('marks active membership as revoked', async () => {
      memRepo.findOne.mockResolvedValue({
        id: '1',
        userId: 9,
        organizationId: '1',
        role: OrgRole.ADMIN,
        status: MembershipStatus.ACTIVE,
      });
      memRepo.save.mockImplementation(async (m) => m);
      await service.revokeMember('1', 9, 1);
      expect(memRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: MembershipStatus.REVOKED,
          revokedAt: expect.any(Date),
        }),
      );
    });

    it('throws NotFound when membership does not exist', async () => {
      memRepo.findOne.mockResolvedValue(null);
      await expect(service.revokeMember('1', 9, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('invite', () => {
    const inviter = { id: 1, username: 'admin' };

    it('rejects when an active member with the same email already exists', async () => {
      userRepo.findOne.mockResolvedValue({ id: 5 });
      memRepo.findOne.mockResolvedValue({
        id: '7',
        userId: 5,
        organizationId: '1',
        role: OrgRole.CLINICIAN,
        status: MembershipStatus.ACTIVE,
      });
      await expect(
        service.invite('1', inviter, 'foo@test.cl', OrgRole.CLINICIAN),
      ).rejects.toThrow(ConflictException);
      expect(invitationsService.create).not.toHaveBeenCalled();
    });

    it('delegates to InvitationsService.create when no active member exists', async () => {
      userRepo.findOne.mockResolvedValue(null);
      invitationsService.create.mockResolvedValue({
        invitation: { id: '42' },
        token: 't',
      });
      const result = await service.invite(
        '1',
        inviter,
        'foo@test.cl',
        OrgRole.CLINICIAN,
      );
      expect(invitationsService.create).toHaveBeenCalledWith(
        '1',
        1,
        'admin',
        'foo@test.cl',
        OrgRole.CLINICIAN,
      );
      expect(result).toEqual({ id: '42' });
    });

    it('passes through when user exists but is not an active member of this org', async () => {
      userRepo.findOne.mockResolvedValue({ id: 5 });
      memRepo.findOne.mockResolvedValue(null); // no active membership in this org
      invitationsService.create.mockResolvedValue({
        invitation: { id: '42' },
        token: 't',
      });
      const result = await service.invite(
        '1',
        inviter,
        'foo@test.cl',
        OrgRole.CLINICIAN,
      );
      expect(invitationsService.create).toHaveBeenCalled();
      expect(result).toEqual({ id: '42' });
    });
  });

  describe('listInvitations', () => {
    it('maps rows with ISO date strings', async () => {
      const created = new Date('2026-05-01T10:00:00Z');
      const expires = new Date('2026-05-08T10:00:00Z');
      invRepo.find.mockResolvedValue([
        {
          id: '42',
          email: 'a@x.cl',
          role: OrgRole.ADMIN,
          createdAt: created,
          expiresAt: expires,
        },
      ]);
      const result = await service.listInvitations('1');
      expect(result).toEqual([
        {
          id: '42',
          email: 'a@x.cl',
          role: OrgRole.ADMIN,
          createdAt: created.toISOString(),
          expiresAt: expires.toISOString(),
        },
      ]);
      expect(invRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: '1',
          }),
          order: { createdAt: 'DESC' },
        }),
      );
    });

    it('returns [] when there are no pending invitations', async () => {
      invRepo.find.mockResolvedValue([]);
      expect(await service.listInvitations('1')).toEqual([]);
    });
  });

  describe('createEstablishment', () => {
    it('persists with organizationId stamped from the caller', async () => {
      estRepo.create.mockImplementation((data) => ({ ...data }));
      estRepo.save.mockImplementation(async (e) => ({ id: 7, ...e }));
      const result = await service.createEstablishment('1', {
        name: 'New',
        comuna: 'V',
      });
      expect(estRepo.create).toHaveBeenCalledWith({
        name: 'New',
        comuna: 'V',
        organizationId: '1',
      });
      expect(result).toEqual({ id: 7, name: 'New', comuna: 'V' });
    });
  });
});
