import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, IsNull, In } from 'typeorm';
import { OAuthGrant } from '../entities/oauth-grant.entity';
import { OAuthClient } from '../entities/oauth-client.entity';
import { OAuthToken } from '../entities/oauth-token.entity';
import { OAuthRevocation } from '../entities/oauth-revocation.entity';
import { Organization } from '../../organizations/organization.entity';
import { User } from '../../users/user.entity';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/audit-log.entity';

/**
 * Connected apps surface for the user-facing settings page.
 *
 * `listForUser` returns the unrevoked grants for the user, enriched with
 * client metadata (display name, logo, policy URL) and the organization
 * name they apply to.
 *
 * `revoke` performs a cascade: marks the grant as revoked, expires the
 * tokens that belong to it (so refresh tokens cannot be used to mint new
 * access tokens), and inserts denylist rows for any access-token JTIs that
 * are still inside their TTL window — bearer-validation will then reject
 * them on the next request.
 */
@Injectable()
export class ConnectedAppsService {
  constructor(
    @InjectRepository(OAuthGrant)
    private readonly grantRepo: Repository<OAuthGrant>,
    @InjectRepository(OAuthClient)
    private readonly clientRepo: Repository<OAuthClient>,
    @InjectRepository(OAuthToken)
    private readonly tokenRepo: Repository<OAuthToken>,
    @InjectRepository(OAuthRevocation)
    private readonly revocationRepo: Repository<OAuthRevocation>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly auditLog: AuditLogService,
  ) {}

  async listForUser(userId: number) {
    const grants = await this.grantRepo.find({
      where: { userId, revokedAt: IsNull() },
    });
    if (!grants.length) return [];

    const clientIds = Array.from(new Set(grants.map((g) => g.clientId)));
    const orgIds = Array.from(new Set(grants.map((g) => g.organizationId)));

    const [clients, orgs] = await Promise.all([
      this.clientRepo.find({ where: { clientId: In(clientIds) } }),
      this.orgRepo.find({ where: { id: In(orgIds) } }),
    ]);

    return grants.map((g) => {
      const c = clients.find((x) => x.clientId === g.clientId);
      const o = orgs.find((x) => x.id === g.organizationId);
      return {
        grantId: g.id,
        client: {
          name: c?.clientName ?? 'Unknown',
          logoUri: c?.logoUri ?? null,
          policyUri: c?.policyUri ?? null,
        },
        organizationId: g.organizationId,
        organizationName: o?.name ?? '',
        scopes: g.scopes,
        lastUsedAt: g.lastUsedAt,
        createdAt: g.createdAt,
        expiresAt: g.expiresAt,
      };
    });
  }

  async revoke(userId: number, grantId: string): Promise<void> {
    const grant = await this.grantRepo.findOne({ where: { id: grantId } });
    if (!grant) throw new NotFoundException('Grant not found');
    if (grant.userId !== userId)
      throw new ForbiddenException('Grant not owned by user');

    // Idempotent: if the grant is already revoked, there is nothing to do.
    // A second call must not re-run the cascade (which would re-insert
    // denylist rows and bump expiresAt) and must not error out.
    if (grant.revokedAt) return;

    // Wrap the multi-step mutation in a single DB transaction so a failure
    // halfway through (e.g. denylist insert collision) does not leave the
    // grant marked revoked while tokens are still alive — the whole cascade
    // either commits or rolls back.
    await this.dataSource.transaction(async (em) => {
      grant.revokedAt = new Date();
      await em.save(OAuthGrant, grant);

      // `oauth_grant.id` is our UUID; `oauth_token.grantId` stores the
      // oidc-provider nanoid grant id. The two id-spaces are joined via
      // `OAuthGrant.oidcGrantId`, populated by consent.controller.ts when
      // the user authorizes the prompt. It may be null for grants that
      // pre-date that wiring — those have no token rows to cascade to.
      if (!grant.oidcGrantId) return;

      const tokens = await em.find(OAuthToken, {
        where: { grantId: grant.oidcGrantId },
      });
      if (!tokens.length) return;

      const now = new Date();
      // Expire all tokens for this grant — refresh tokens become unusable.
      await em.update(
        OAuthToken,
        { grantId: grant.oidcGrantId },
        { expiresAt: now },
      );

      // Denylist any access-token JTIs still inside their original TTL so
      // bearer validation rejects in-flight tokens immediately.
      // Note: under JWT-AT config, kind='access' rows are stateless and not
      // persisted by oidc-provider — this branch is dormant but kept for
      // parity with opaque-AT deployments.
      const revocations = tokens
        .filter((t) => t.kind === 'access')
        .map((t) => {
          const payload = t.payload as { jti?: string } | null;
          return {
            jti: payload?.jti ?? t.id,
            userId,
            reason: 'user_revoked',
            expiresAt: t.expiresAt,
          };
        });
      if (revocations.length) {
        await em.insert(OAuthRevocation, revocations);
      }
    });

    // Audit log AFTER the transaction commits — fire-and-forget so a failure
    // in the audit chain never rolls back the revocation cascade.
    const user = await this.userRepo.findOne({ where: { id: userId } });
    // TS narrows `grant.revokedAt` to `null` from the early-return guard
    // above, but the transaction callback assigns it a Date. Cast for the
    // ISO serialization in the audit payload.
    const revokedAtIso =
      (grant.revokedAt as Date | null)?.toISOString() ?? null;
    void this.auditLog
      .log({
        userId,
        username: user?.username ?? 'unknown',
        organizationId: String(grant.organizationId),
        action: AuditAction.EVENT,
        entity: 'oauth.grant.revoked',
        entityId: 0,
        beforeJson: { scopes: grant.scopes, clientId: grant.clientId },
        afterJson: { revokedAt: revokedAtIso },
      })
      .catch(() => {});
  }
}
