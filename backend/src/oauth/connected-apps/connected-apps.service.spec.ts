import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OAuthGrant } from '../entities/oauth-grant.entity';
import { OAuthClient } from '../entities/oauth-client.entity';
import { OAuthToken } from '../entities/oauth-token.entity';
import { OAuthRevocation } from '../entities/oauth-revocation.entity';
import { Organization } from '../../organizations/organization.entity';
import { User } from '../../users/user.entity';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { ConnectedAppsService } from './connected-apps.service';

describe('ConnectedAppsService', () => {
  let service: ConnectedAppsService;
  let grantRepo: any;
  let clientRepo: any;
  let tokenRepo: any;
  let revocationRepo: any;
  let orgRepo: any;
  let userRepo: any;
  let auditLog: any;
  let entityManager: any;
  let dataSource: any;

  beforeEach(async () => {
    grantRepo = { find: jest.fn(), findOne: jest.fn(), save: jest.fn() };
    clientRepo = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    tokenRepo = { find: jest.fn(), update: jest.fn() };
    revocationRepo = { save: jest.fn(), insert: jest.fn() };
    orgRepo = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    userRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 1, username: 'alice' }),
    };
    auditLog = { log: jest.fn().mockResolvedValue(undefined) };

    // Mock EntityManager to forward calls to the per-repo mocks above so
    // assertions on the repo mocks keep working under the transaction wrapper.
    entityManager = {
      save: jest.fn(async (_entity: unknown, payload: unknown) => {
        return grantRepo.save(payload);
      }),
      find: jest.fn(async (_entity: unknown, options: unknown) => {
        return tokenRepo.find(options);
      }),
      update: jest.fn(
        async (_entity: unknown, where: unknown, partial: unknown) => {
          return tokenRepo.update(where, partial);
        },
      ),
      insert: jest.fn(async (_entity: unknown, payload: unknown) => {
        return revocationRepo.insert(payload);
      }),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (em: any) => Promise<unknown>) =>
        cb(entityManager),
      ),
    };
    const m = await Test.createTestingModule({
      providers: [
        ConnectedAppsService,
        { provide: getRepositoryToken(OAuthGrant), useValue: grantRepo },
        { provide: getRepositoryToken(OAuthClient), useValue: clientRepo },
        { provide: getRepositoryToken(OAuthToken), useValue: tokenRepo },
        {
          provide: getRepositoryToken(OAuthRevocation),
          useValue: revocationRepo,
        },
        { provide: getRepositoryToken(Organization), useValue: orgRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: AuditLogService, useValue: auditLog },
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
    grantRepo.findOne.mockResolvedValue({
      id: 'g1',
      userId: 1,
      revokedAt: null,
      oidcGrantId: 'oidc-g1',
    });
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
    // The cascade must use the oidc-provider grant nanoid as the join key,
    // not our internal UUID — otherwise the token query returns [] and the
    // cascade is silently a no-op.
    expect(tokenRepo.find).toHaveBeenCalledWith({
      where: { grantId: 'oidc-g1' },
    });
    expect(tokenRepo.update).toHaveBeenCalledWith(
      { grantId: 'oidc-g1' },
      expect.objectContaining({ expiresAt: expect.any(Date) }),
    );
    expect(revocationRepo.insert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ jti: 'jti-at' })]),
    );
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'oauth.grant.revoked',
        userId: 1,
        action: 'EVENT',
      }),
    );
  });

  it('revoke is idempotent when the grant is already revoked', async () => {
    grantRepo.findOne.mockResolvedValue({
      id: 'g1',
      userId: 1,
      revokedAt: new Date(),
      oidcGrantId: 'oidc-g1',
    });
    await service.revoke(1, 'g1');
    expect(grantRepo.save).not.toHaveBeenCalled();
    expect(tokenRepo.find).not.toHaveBeenCalled();
    expect(tokenRepo.update).not.toHaveBeenCalled();
    expect(revocationRepo.insert).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(auditLog.log).not.toHaveBeenCalled();
  });

  it('revoke skips token cascade when oidcGrantId is null', async () => {
    grantRepo.findOne.mockResolvedValue({
      id: 'g1',
      userId: 1,
      revokedAt: null,
      oidcGrantId: null,
    });
    await service.revoke(1, 'g1');
    expect(grantRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'g1', revokedAt: expect.any(Date) }),
    );
    expect(tokenRepo.find).not.toHaveBeenCalled();
    expect(tokenRepo.update).not.toHaveBeenCalled();
    expect(revocationRepo.insert).not.toHaveBeenCalled();
  });

  it('revoke throws if grant not owned by user', async () => {
    grantRepo.findOne.mockResolvedValue({ id: 'g1', userId: 999 });
    await expect(service.revoke(1, 'g1')).rejects.toThrow();
    expect(auditLog.log).not.toHaveBeenCalled();
  });
});
