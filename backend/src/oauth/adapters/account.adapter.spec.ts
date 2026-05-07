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
    userRepo.findOne.mockResolvedValue({ id: 12, username: 'marcelo', fullName: 'Marcelo' });
    memRepo.findOne.mockResolvedValue({ userId: 12, organizationId: 'uuid-acme', role: OrgRole.ADMIN, status: MembershipStatus.ACTIVE });
    orgRepo.findOne.mockResolvedValue({ id: 'uuid-acme', name: 'CESFAM Acme' });
    ueaRepo.find.mockResolvedValue([{ establishmentId: 'est-1' }]);

    const ctx = { oidc: { entities: { Grant: { organizationId: 'uuid-acme' } } } } as any;
    const account = await service.findAccount(ctx, '12');
    expect(account!.accountId).toBe('12');

    const claims = await account!.claims!('id_token', 'openid');
    expect(claims).toMatchObject({
      sub: '12',
      username: 'marcelo',
      name: 'Marcelo',
      org_id: 'uuid-acme',
      org_name: 'CESFAM Acme',
      role: OrgRole.ADMIN,
    });
  });

  it('findAccount returns undefined when membership inactive', async () => {
    userRepo.findOne.mockResolvedValue({ id: 12 });
    memRepo.findOne.mockResolvedValue(null);
    const ctx = { oidc: { entities: { Grant: { organizationId: 'x' } } } } as any;
    const account = await service.findAccount(ctx, '12');
    expect(account).toBeUndefined();
  });
});
