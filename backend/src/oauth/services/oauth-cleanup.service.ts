import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThan } from 'typeorm';
import { OAuthClient } from '../entities/oauth-client.entity';
import { OAuthToken } from '../entities/oauth-token.entity';
import { OAuthRevocation } from '../entities/oauth-revocation.entity';
import { OAuthGrant } from '../entities/oauth-grant.entity';
import { OAuthSigningKey } from '../entities/oauth-signing-key.entity';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runDailyCleanup(): Promise<void> {
    const now = new Date();
    const orphanCutoff = new Date(now.getTime() - 30 * MS_PER_DAY);
    const tokenCutoff = new Date(now.getTime() - 7 * MS_PER_DAY);
    const grantArchiveCutoff = new Date(now.getTime() - 90 * MS_PER_DAY);

    const [orphans, tokens, revocs, archives, retiredKeys] = await Promise.all([
      // Unregistered clients (never had a first authorization) older than 30 days
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
