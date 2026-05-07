import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../../users/user.entity';
import { OrganizationMembership, MembershipStatus, OrgRole } from '../../organizations/organization-membership.entity';
import { Organization } from '../../organizations/organization.entity';
import { UserEstablishmentAssignment } from '../../establishments/user-establishment-assignment.entity';
import { AccountAdapterService } from './account.adapter';

describe('AccountAdapterService', () => {
  let service: AccountAdapterService;
  let userRepo: any;
  let memRepo: any;
  let orgRepo: any;
  let ueaRepo: any;

  beforeEach(async () => {
    userRepo = { findOne: jest.fn() };
    memRepo = { findOne: jest.fn() };
    orgRepo = { findOne: jest.fn() };
    ueaRepo = { find: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AccountAdapterService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(OrganizationMembership), useValue: memRepo },
        { provide: getRepositoryToken(Organization), useValue: orgRepo },
        { provide: getRepositoryToken(UserEstablishmentAssignment), useValue: ueaRepo },
      ],
    }).compile();
    service = moduleRef.get(AccountAdapterService);
  });

  it('findAccount returns claims with org bound from grant context', async () => {
    userRepo.findOne.mockResolvedValue({ id: 12, username: 'marcelo' });
    memRepo.findOne.mockResolvedValue({ userId: 12, organizationId: 'uuid-acme', role: OrgRole.ADMIN, status: MembershipStatus.ACTIVE });
    orgRepo.findOne.mockResolvedValue({ id: 'uuid-acme', name: 'CESFAM Acme' });
    ueaRepo.find.mockResolvedValue([{ establishmentId: 7 }]);

    const ctx = { oidc: { entities: { Grant: { organizationId: 'uuid-acme' } } } } as any;
    const account = await service.findAccount(ctx, '12');
    expect(account!.accountId).toBe('12');

    const claims = await account!.claims!('id_token', 'openid');
    expect(claims).toMatchObject({
      sub: '12',
      username: 'marcelo',
      name: 'marcelo',
      org_id: 'uuid-acme',
      org_name: 'CESFAM Acme',
      role: OrgRole.ADMIN,
      establishment_ids: ['7'],
    });
  });

  it('findAccount returns the user even when grant entity not yet set; claims fall back to first active membership', async () => {
    // oidc-provider runs `loadAccount` before `loadGrant`, so we must not
    // gate the account on the Grant entity. The org-scoped claims are
    // resolved lazily inside `claims()` from the user's first active
    // membership when no grant is available.
    userRepo.findOne.mockResolvedValue({ id: 12, username: 'marcelo' });
    memRepo.findOne.mockResolvedValueOnce({
      userId: 12,
      organizationId: 'uuid-fallback',
      role: OrgRole.CLINICIAN,
      status: MembershipStatus.ACTIVE,
    });
    memRepo.findOne.mockResolvedValueOnce({
      userId: 12,
      organizationId: 'uuid-fallback',
      role: OrgRole.CLINICIAN,
      status: MembershipStatus.ACTIVE,
    });
    orgRepo.findOne.mockResolvedValue({ id: 'uuid-fallback', name: 'Fallback Org' });
    ueaRepo.find.mockResolvedValue([]);

    const ctx = { oidc: { entities: {}, result: undefined } } as any;
    const account = await service.findAccount(ctx, '12');
    expect(account!.accountId).toBe('12');

    const claims = await account!.claims!('id_token', 'openid');
    expect(claims).toMatchObject({
      sub: '12',
      org_id: 'uuid-fallback',
      role: OrgRole.CLINICIAN,
    });
  });

  it('findAccount returns undefined when user not found', async () => {
    userRepo.findOne.mockResolvedValue(null);
    const ctx = { oidc: { entities: {} } } as any;
    const account = await service.findAccount(ctx, '999');
    expect(account).toBeUndefined();
  });

  it('findAccount returns minimal claims when user has no active membership', async () => {
    // We still return the account so the authorization request can proceed
    // far enough for the consent UI to surface the "no orgs" error to the
    // user; the claim shape is degraded to just `sub` and `username` rather
    // than throwing — the consent screen will block submission anyway.
    userRepo.findOne.mockResolvedValue({ id: 12, username: 'marcelo' });
    memRepo.findOne.mockResolvedValue(null);
    const ctx = { oidc: { entities: { Grant: { organizationId: 'x' } } } } as any;
    const account = await service.findAccount(ctx, '12');
    expect(account!.accountId).toBe('12');
    const claims = await account!.claims!('id_token', 'openid');
    expect(claims).toEqual({ sub: '12', username: 'marcelo' });
  });
});
