import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { OrgService } from './org.service';
import { Organization } from '../organizations/organization.entity';
import {
  OrganizationMembership,
  MembershipStatus,
  OrgRole,
} from '../organizations/organization-membership.entity';
import { User } from '../users/user.entity';

describe('OrgService', () => {
  let service: OrgService;
  let orgRepo: { findOne: jest.Mock; save: jest.Mock };
  let memRepo: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock; count: jest.Mock };
  let userRepo: { findBy: jest.Mock };

  beforeEach(async () => {
    orgRepo = { findOne: jest.fn(), save: jest.fn() };
    memRepo = { find: jest.fn(), findOne: jest.fn(), save: jest.fn(), count: jest.fn() };
    userRepo = { findBy: jest.fn() };
    const m = await Test.createTestingModule({
      providers: [
        OrgService,
        { provide: getRepositoryToken(Organization), useValue: orgRepo },
        { provide: getRepositoryToken(OrganizationMembership), useValue: memRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();
    service = m.get(OrgService);
  });

  describe('updateSettings', () => {
    it('persists name and rut', async () => {
      orgRepo.findOne.mockResolvedValue({ id: '1', name: 'Old', rut: null });
      orgRepo.save.mockImplementation(async (o) => o);
      const result = await service.updateSettings('1', { name: 'New', rut: '11.111.111-1' });
      expect(result).toEqual({ name: 'New', rut: '11.111.111-1' });
      expect(orgRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: '1', name: 'New', rut: '11.111.111-1' }),
      );
    });

    it('persists null when rut is omitted', async () => {
      orgRepo.findOne.mockResolvedValue({ id: '1', name: 'Old', rut: '11.111.111-1' });
      orgRepo.save.mockImplementation(async (o) => o);
      const result = await service.updateSettings('1', { name: 'New' });
      expect(result).toEqual({ name: 'New', rut: null });
    });

    it('throws NotFoundException when the organization is missing', async () => {
      orgRepo.findOne.mockResolvedValue(null);
      await expect(service.updateSettings('1', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('listMembers', () => {
    it('returns mapped rows when there are active memberships', async () => {
      memRepo.find.mockResolvedValue([
        { id: '1', userId: 10, organizationId: '1', role: OrgRole.OWNER, status: MembershipStatus.ACTIVE },
        { id: '2', userId: 20, organizationId: '1', role: OrgRole.ADMIN, status: MembershipStatus.ACTIVE },
      ]);
      userRepo.findBy.mockResolvedValue([
        { id: 10, username: 'owner', email: { plaintext: 'o@x.cl' } },
        { id: 20, username: 'admin', email: null },
      ]);
      const result = await service.listMembers('1');
      expect(result).toEqual([
        { userId: 10, username: 'owner', email: 'o@x.cl', role: OrgRole.OWNER, status: MembershipStatus.ACTIVE },
        { userId: 20, username: 'admin', email: null, role: OrgRole.ADMIN, status: MembershipStatus.ACTIVE },
      ]);
    });

    it('returns [] when there are no active memberships', async () => {
      memRepo.find.mockResolvedValue([]);
      const result = await service.listMembers('1');
      expect(result).toEqual([]);
      expect(userRepo.findBy).not.toHaveBeenCalled();
    });

    it('throws when a membership references a missing user', async () => {
      memRepo.find.mockResolvedValue([
        { id: '1', userId: 99, organizationId: '1', role: OrgRole.ADMIN, status: MembershipStatus.ACTIVE },
      ]);
      userRepo.findBy.mockResolvedValue([]);
      await expect(service.listMembers('1')).rejects.toThrow(/missing user 99/);
    });
  });
});
