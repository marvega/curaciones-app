import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OAuthGrant } from '../entities/oauth-grant.entity';
import {
  OrganizationMembership,
  MembershipStatus,
  OrgRole,
} from '../../organizations/organization-membership.entity';
import {
  Organization,
  OrganizationStatus,
} from '../../organizations/organization.entity';
import { ConsentService } from './consent.service';

describe('ConsentService', () => {
  let service: ConsentService;
  let grantRepo: any;
  let memRepo: any;
  let orgRepo: any;

  beforeEach(async () => {
    grantRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (e: any) => ({ ...e, id: e.id ?? 'g-1' })),
    };
    memRepo = { findOne: jest.fn() };
    orgRepo = {
      // Default: org exists and is active. Individual tests can override.
      findOne: jest.fn().mockResolvedValue({
        id: 'org-1',
        status: OrganizationStatus.ACTIVE,
      }),
    };
    const m = await Test.createTestingModule({
      providers: [
        ConsentService,
        { provide: getRepositoryToken(OAuthGrant), useValue: grantRepo },
        { provide: getRepositoryToken(OrganizationMembership), useValue: memRepo },
        { provide: getRepositoryToken(Organization), useValue: orgRepo },
      ],
    }).compile();
    service = m.get(ConsentService);
  });

  it('rejects if organization is not active', async () => {
    // findOne queries with status=ACTIVE; suspended/archived org returns null.
    orgRepo.findOne.mockResolvedValue(null);
    await expect(
      service.recordConsent({
        clientId: 'c',
        userId: 1,
        organizationId: 'org-suspended',
        scopes: ['patients:read'],
      }),
    ).rejects.toThrow(/Organization is not active/);
    // Membership lookup must not run if the org check failed.
    expect(memRepo.findOne).not.toHaveBeenCalled();
  });

  it('rejects if user has no active membership in chosen org', async () => {
    memRepo.findOne.mockResolvedValue(null);
    await expect(
      service.recordConsent({
        clientId: 'c',
        userId: 1,
        organizationId: 'org-x',
        scopes: ['patients:read'],
      }),
    ).rejects.toThrow(/membership/);
  });

  it('creates grant when none exists', async () => {
    memRepo.findOne.mockResolvedValue({
      status: MembershipStatus.ACTIVE,
      role: OrgRole.ADMIN,
    });
    grantRepo.findOne.mockResolvedValue(null);
    const g = await service.recordConsent({
      clientId: 'c',
      userId: 1,
      organizationId: 'org-1',
      scopes: ['patients:read'],
    });
    expect(g.id).toBe('g-1');
    expect(grantRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'c',
        userId: 1,
        organizationId: 'org-1',
        scopes: ['patients:read'],
      }),
    );
  });

  it('reactivates revoked grant on re-consent', async () => {
    memRepo.findOne.mockResolvedValue({ status: MembershipStatus.ACTIVE });
    grantRepo.findOne.mockResolvedValue({
      id: 'old',
      revokedAt: new Date(),
      scopes: ['patients:read'],
    });
    await service.recordConsent({
      clientId: 'c',
      userId: 1,
      organizationId: 'org-1',
      scopes: ['patients:read'],
    });
    expect(grantRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'old', revokedAt: null }),
    );
  });
});
