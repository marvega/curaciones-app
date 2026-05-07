import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { OAuthGrant } from '../entities/oauth-grant.entity';
import { OAuthClient } from '../entities/oauth-client.entity';
import { OAuthToken } from '../entities/oauth-token.entity';
import { OAuthRevocation } from '../entities/oauth-revocation.entity';
import { Organization } from '../../organizations/organization.entity';

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
    @InjectRepository(OAuthGrant) private readonly grantRepo: Repository<OAuthGrant>,
    @InjectRepository(OAuthClient) private readonly clientRepo: Repository<OAuthClient>,
    @InjectRepository(OAuthToken) private readonly tokenRepo: Repository<OAuthToken>,
    @InjectRepository(OAuthRevocation) private readonly revocationRepo: Repository<OAuthRevocation>,
    @InjectRepository(Organization) private readonly orgRepo: Repository<Organization>,
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
    if (grant.userId !== userId) throw new ForbiddenException('Grant not owned by user');

    grant.revokedAt = new Date();
    await this.grantRepo.save(grant);

    const tokens = await this.tokenRepo.find({ where: { grantId } });
    if (!tokens.length) return;

    const now = new Date();
    // Expire all tokens for this grant — refresh tokens become unusable.
    await this.tokenRepo.update({ grantId }, { expiresAt: now });

    // Denylist any access-token JTIs still inside their original TTL so
    // bearer validation rejects in-flight tokens immediately.
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
      await this.revocationRepo.insert(revocations);
    }
  }
}
