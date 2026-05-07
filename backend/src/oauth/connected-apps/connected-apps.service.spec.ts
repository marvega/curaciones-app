import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OAuthGrant } from '../entities/oauth-grant.entity';
import { OAuthClient } from '../entities/oauth-client.entity';
import { OAuthToken } from '../entities/oauth-token.entity';
import { OAuthRevocation } from '../entities/oauth-revocation.entity';
import { Organization } from '../../organizations/organization.entity';
import { ConnectedAppsService } from './connected-apps.service';

describe('ConnectedAppsService', () => {
  let service: ConnectedAppsService;
  let grantRepo: any;
  let clientRepo: any;
  let tokenRepo: any;
  let revocationRepo: any;
  let orgRepo: any;

  beforeEach(async () => {
    grantRepo = { find: jest.fn(), findOne: jest.fn(), save: jest.fn() };
    clientRepo = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    tokenRepo = { find: jest.fn(), update: jest.fn() };
    revocationRepo = { save: jest.fn(), insert: jest.fn() };
    orgRepo = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    const m = await Test.createTestingModule({
      providers: [
        ConnectedAppsService,
        { provide: getRepositoryToken(OAuthGrant), useValue: grantRepo },
        { provide: getRepositoryToken(OAuthClient), useValue: clientRepo },
        { provide: getRepositoryToken(OAuthToken), useValue: tokenRepo },
        { provide: getRepositoryToken(OAuthRevocation), useValue: revocationRepo },
        { provide: getRepositoryToken(Organization), useValue: orgRepo },
      ],
    }).compile();
    service = m.get(ConnectedAppsService);
  });

  it('list returns user grants enriched with client + org info', async () => {
    grantRepo.find.mockResolvedValue([
      {
        id: 'g1',
        clientId: 'c1',
        userId: 1,
        organizationId: 'o1',
        scopes: ['patients:read'],
        lastUsedAt: null,
        createdAt: new Date(),
        expiresAt: new Date(),
        revokedAt: null,
      },
    ]);
    clientRepo.find.mockResolvedValue([
      { clientId: 'c1', clientName: 'Claude', logoUri: null, policyUri: null },
    ]);
    orgRepo.find.mockResolvedValue([{ id: 'o1', name: 'Acme' }]);
    const apps = await service.listForUser(1);
    expect(apps[0]).toMatchObject({
      grantId: 'g1',
      client: { name: 'Claude' },
      organizationName: 'Acme',
    });
  });

  it('revoke marks grant + denylists AT jti + deletes refresh tokens', async () => {
    grantRepo.findOne.mockResolvedValue({ id: 'g1', userId: 1, revokedAt: null });
    tokenRepo.find.mockResolvedValue([
      {
        id: 'jti-at',
        kind: 'access',
        expiresAt: new Date(Date.now() + 600000),
        payload: { jti: 'jti-at' },
      },
      {
        id: 'rt-1',
        kind: 'refresh',
        expiresAt: new Date(Date.now() + 86400000),
        payload: {},
      },
    ]);
    await service.revoke(1, 'g1');
    expect(grantRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'g1', revokedAt: expect.any(Date) }),
    );
    expect(revocationRepo.insert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ jti: 'jti-at' })]),
    );
    expect(tokenRepo.update).toHaveBeenCalled(); // expiresAt = now()
  });

  it('revoke throws if grant not owned by user', async () => {
    grantRepo.findOne.mockResolvedValue({ id: 'g1', userId: 999 });
    await expect(service.revoke(1, 'g1')).rejects.toThrow();
  });
});
