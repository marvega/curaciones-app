import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThan } from 'typeorm';
import { OAuthClient } from '../entities/oauth-client.entity';
import { OAuthToken } from '../entities/oauth-token.entity';
import { OAuthRevocation } from '../entities/oauth-revocation.entity';
import { OAuthGrant } from '../entities/oauth-grant.entity';
import { OAuthSigningKey } from '../entities/oauth-signing-key.entity';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * How long a client that never completed an authorization is kept.
 *
 * `POST /oauth/register` is public by design — it is how MCP clients obtain a
 * client_id — so `oauth_client` is an anonymous-write table on an 11 MB Neon
 * free tier that also holds the clinical records. A 30-day window meant a
 * month of unbounded registrations before anything was reclaimed.
 *
 * Two hours, not less: `firstAuthorizedAt` is stamped at the consent step, so
 * the row must outlive the whole registration → browser → login → consent leg.
 * The AS itself gives that leg 10 minutes (the `Interaction` TTL); past that the
 * client has to start over anyway. Two hours is 12× the longest wait the AS will
 * tolerate, so no client that could still finish is ever deleted.
 *
 * Two hours, not more: a legitimate client finishes in minutes. Anything still
 * unauthorized after two hours is abandoned or hostile, and neither earns disk.
 *
 * Note the effective bound is this window *plus* one scheduler period, since
 * Cloud Scheduler drives the job. At a daily cadence that is ~26 h instead of
 * ~30 days; moving the schedule to hourly brings it to ~3 h and needs no code
 * change (`gcloud scheduler jobs update http …`).
 */
export const UNAUTHORIZED_CLIENT_RETENTION_MS = 2 * MS_PER_HOUR;

@Injectable()
export class OAuthCleanupService {
  private readonly logger = new Logger(OAuthCleanupService.name);

  constructor(
    @InjectRepository(OAuthClient) private readonly clientRepo: Repository<OAuthClient>,
    @InjectRepository(OAuthToken) private readonly tokenRepo: Repository<OAuthToken>,
    @InjectRepository(OAuthRevocation) private readonly revocationRepo: Repository<OAuthRevocation>,
    @InjectRepository(OAuthGrant) private readonly grantRepo: Repository<OAuthGrant>,
    @InjectRepository(OAuthSigningKey) private readonly keyRepo: Repository<OAuthSigningKey>,
  ) {}

  async runDailyCleanup(): Promise<void> {
    const now = new Date();
    const orphanCutoff = new Date(now.getTime() - UNAUTHORIZED_CLIENT_RETENTION_MS);
    const tokenCutoff = new Date(now.getTime() - 7 * MS_PER_DAY);
    const grantArchiveCutoff = new Date(now.getTime() - 90 * MS_PER_DAY);

    const [orphans, tokens, revocs, archives, retiredKeys] = await Promise.all([
      // Clients that never completed a first authorization. See
      // UNAUTHORIZED_CLIENT_RETENTION_MS for why the window is hours.
      this.clientRepo.delete({ firstAuthorizedAt: IsNull(), createdAt: LessThan(orphanCutoff) }),
      // Expired tokens older than 7 days past expiry
      this.tokenRepo.delete({ expiresAt: LessThan(tokenCutoff) }),
      // Revocation entries past their expiry
      this.revocationRepo.delete({ expiresAt: LessThan(now) }),
      // Archive revoked grants older than 90 days
      this.grantRepo.update(
        { revokedAt: LessThan(grantArchiveCutoff), archivedAt: IsNull() },
        { archivedAt: now },
      ),
      // Finalize retired keys whose retire window has elapsed
      this.keyRepo.update(
        { status: 'retired', retireScheduledAt: LessThan(now) },
        { status: 'revoked' },
      ),
    ]);

    this.logger.log(
      `Cleanup: orphans=${orphans.affected} tokens=${tokens.affected} ` +
        `revoc=${revocs.affected} archived=${archives.affected} keysRevoked=${retiredKeys.affected}`,
    );
  }
}
