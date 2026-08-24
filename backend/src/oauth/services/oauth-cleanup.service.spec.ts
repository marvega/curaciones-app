import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull, LessThan } from 'typeorm';
import {
  OAuthCleanupService,
  UNAUTHORIZED_CLIENT_RETENTION_MS,
} from './oauth-cleanup.service';
import { OAuthClient } from '../entities/oauth-client.entity';
import { OAuthToken } from '../entities/oauth-token.entity';
import { OAuthRevocation } from '../entities/oauth-revocation.entity';
import { OAuthGrant } from '../entities/oauth-grant.entity';
import { OAuthSigningKey } from '../entities/oauth-signing-key.entity';

function makeRepo() {
  return { delete: jest.fn().mockResolvedValue({ affected: 0 }), update: jest.fn().mockResolvedValue({ affected: 0 }) };
}

describe('OAuthCleanupService', () => {
  let service: OAuthCleanupService;
  let clientRepo: ReturnType<typeof makeRepo>;
  let tokenRepo: ReturnType<typeof makeRepo>;
  let revocationRepo: ReturnType<typeof makeRepo>;
  let grantRepo: ReturnType<typeof makeRepo>;
  let keyRepo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    clientRepo = makeRepo();
    tokenRepo = makeRepo();
    revocationRepo = makeRepo();
    grantRepo = makeRepo();
    keyRepo = makeRepo();

    const mod = await Test.createTestingModule({
      providers: [
        OAuthCleanupService,
        { provide: getRepositoryToken(OAuthClient), useValue: clientRepo },
        { provide: getRepositoryToken(OAuthToken), useValue: tokenRepo },
        { provide: getRepositoryToken(OAuthRevocation), useValue: revocationRepo },
        { provide: getRepositoryToken(OAuthGrant), useValue: grantRepo },
        { provide: getRepositoryToken(OAuthSigningKey), useValue: keyRepo },
      ],
    }).compile();

    service = mod.get(OAuthCleanupService);
  });

  describe('clients that never completed an authorization', () => {
    // POST /oauth/register is public, so this is the only ceiling on an
    // anonymous-write table sharing an 11 MB Neon free tier with the clinical
    // records. The window is asserted in hours to keep a future edit from
    // quietly returning it to days.
    it('is bounded in hours, not days', () => {
      expect(UNAUTHORIZED_CLIENT_RETENTION_MS).toBe(2 * 60 * 60 * 1000);
      expect(UNAUTHORIZED_CLIENT_RETENTION_MS).toBeLessThan(24 * 60 * 60 * 1000);
    });

    it('outlives the 10-minute Interaction TTL by a wide margin', () => {
      // firstAuthorizedAt is stamped at consent, so the row has to survive the
      // whole register -> browser -> login -> consent leg.
      expect(UNAUTHORIZED_CLIENT_RETENTION_MS).toBeGreaterThanOrEqual(
        10 * 60 * 1000 * 6,
      );
    });

    it('deletes them past the cutoff, and only them', async () => {
      jest.useFakeTimers();
      const now = new Date('2026-05-07T03:00:00Z');
      jest.setSystemTime(now);

      await service.runDailyCleanup();

      const cutoff = new Date(now.getTime() - UNAUTHORIZED_CLIENT_RETENTION_MS);
      expect(cutoff.toISOString()).toBe('2026-05-07T01:00:00.000Z');
      expect(clientRepo.delete).toHaveBeenCalledWith({
        // The IsNull() guard is what keeps an authorized client safe; a
        // two-hour window without it would delete live integrations.
        firstAuthorizedAt: IsNull(),
        createdAt: LessThan(cutoff),
      });

      jest.useRealTimers();
    });
  });

  it('deletes tokens expired more than 7 days ago', async () => {
    jest.useFakeTimers();
    const now = new Date('2026-05-07T03:00:00Z');
    jest.setSystemTime(now);

    await service.runDailyCleanup();

    const expected7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(tokenRepo.delete).toHaveBeenCalledWith({ expiresAt: LessThan(expected7d) });

    jest.useRealTimers();
  });

  it('deletes revocations past their expiry', async () => {
    jest.useFakeTimers();
    const now = new Date('2026-05-07T03:00:00Z');
    jest.setSystemTime(now);

    await service.runDailyCleanup();

    expect(revocationRepo.delete).toHaveBeenCalledWith({ expiresAt: LessThan(now) });

    jest.useRealTimers();
  });

  it('archives revoked grants older than 90 days', async () => {
    jest.useFakeTimers();
    const now = new Date('2026-05-07T03:00:00Z');
    jest.setSystemTime(now);

    await service.runDailyCleanup();

    const expected90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    expect(grantRepo.update).toHaveBeenCalledWith(
      { revokedAt: LessThan(expected90d), archivedAt: IsNull() },
      { archivedAt: now },
    );

    jest.useRealTimers();
  });

  it('finalizes retired keys whose retire window has elapsed', async () => {
    jest.useFakeTimers();
    const now = new Date('2026-05-07T03:00:00Z');
    jest.setSystemTime(now);

    await service.runDailyCleanup();

    expect(keyRepo.update).toHaveBeenCalledWith(
      { status: 'retired', retireScheduledAt: LessThan(now) },
      { status: 'revoked' },
    );

    jest.useRealTimers();
  });
});
