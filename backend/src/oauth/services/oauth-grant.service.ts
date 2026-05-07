import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { OAuthGrant } from '../entities/oauth-grant.entity';

@Injectable()
export class OAuthGrantService {
  constructor(@InjectRepository(OAuthGrant) private readonly repo: Repository<OAuthGrant>) {}

  loadExistingGrant = async (ctx: any): Promise<any | undefined> => {
    const clientId = ctx.oidc?.client?.clientId;
    const accountId = ctx.oidc?.session?.accountId;
    const requestedOrgId: string | undefined = ctx.oidc?.params?.organization_id;
    if (!clientId || !accountId) return undefined;

    const orgId = requestedOrgId;
    if (!orgId) return undefined;

    const grant = await this.repo.findOne({
      where: { clientId, userId: Number(accountId), organizationId: orgId, revokedAt: IsNull() },
    });
    if (!grant) return undefined;

    const requestedScopes: string[] = ctx.oidc?.requestParamScopes ? Array.from(ctx.oidc.requestParamScopes) : [];
    const covers = requestedScopes.every((s) => grant.scopes.includes(s));
    if (!covers) return undefined;

    const Grant = ctx.oidc.provider.Grant;
    const g = new Grant({ accountId, clientId });
    grant.scopes.forEach((s) => g.addOIDCScope(s));
    g.organizationId = grant.organizationId;
    return g;
  };
}
