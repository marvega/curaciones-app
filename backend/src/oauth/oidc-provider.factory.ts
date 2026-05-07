/* eslint-disable @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-return,
                  @typescript-eslint/no-unsafe-call */
// oidc-provider's Configuration types are loose at the boundaries we tweak
// (token claims, adapter factory cast, dynamic ESM import). Asserting at
// each site adds noise without buying real safety.
import { randomBytes, createPrivateKey } from 'crypto';
import type { Provider as OidcProvider, Configuration } from 'oidc-provider';
import { OAuthSigningKeyService } from './services/oauth-signing-key.service';
import { IsNull, Repository } from 'typeorm';
import { OAuthToken } from './entities/oauth-token.entity';
import { OAuthClient } from './entities/oauth-client.entity';
import { OAuthGrant } from './entities/oauth-grant.entity';
import {
  OrganizationMembership,
  MembershipStatus,
} from '../organizations/organization-membership.entity';
import { makePostgresAdapterFactory } from './adapters/postgres.adapter';
import { ClientAdapter } from './adapters/client.adapter';

export const SUPPORTED_SCOPES = [
  'openid',
  'offline_access',
  'patients:read',
  'patients:write',
  'clinical:read',
  'clinical:write',
  'agenda:read',
  'agenda:write',
  'inventory:read',
  'inventory:write',
  'reports:read',
  'org:admin',
];

export interface OidcFactoryDeps {
  issuer: string;
  signingKeys: OAuthSigningKeyService;
  tokenRepo: Repository<OAuthToken>;
  clientRepo: Repository<OAuthClient>;
  grantRepo: Repository<OAuthGrant>;
  memRepo: Repository<OrganizationMembership>;
  findAccount: Configuration['findAccount'];
  loadExistingGrant: Configuration['loadExistingGrant'];
}

export async function buildOidcProvider(
  deps: OidcFactoryDeps,
): Promise<OidcProvider> {
  const allKeys = await deps.signingKeys.getAllPublishableKeys();
  const jwks = {
    keys: allKeys.map((k) => {
      // Node built-in crypto: PEM (PKCS#8) → KeyObject → JWK. Avoids the
      // ESM-only `jose` package which Jest CJS transforms cannot resolve.
      const keyObj = createPrivateKey({ key: k.privateKeyPem, format: 'pem' });
      const jwk = keyObj.export({ format: 'jwk' });
      return { ...jwk, alg: k.algorithm, use: 'sig', kid: k.kid };
    }),
  };

  const tokenAdapterFactory = makePostgresAdapterFactory(deps.tokenRepo);
  const clientAdapter = new ClientAdapter(deps.clientRepo);
  // oidc-provider asks the adapter factory for a different model `name` per
  // call: 'AccessToken', 'RefreshToken', 'Client', etc. Route 'Client' to
  // the dedicated adapter so DCR persists registered clients to the
  // `oauth_client` table; everything else continues to share `oauth_token`.
  const Adapter = (name: string) =>
    name === 'Client' ? clientAdapter : tokenAdapterFactory(name);

  const config: Configuration = {
    adapter: Adapter as any,
    jwks,
    scopes: SUPPORTED_SCOPES,
    // @types/oidc-provider v9 dropped `methods`, but runtime v8 still accepts
    // it. Cast to satisfy the type-checker without losing the runtime config.
    pkce: { required: () => true, methods: ['S256'] } as any,
    features: {
      devInteractions: { enabled: false },
      registration: {
        enabled: true,
        initialAccessToken: false,
        idFactory: () => randomClientId(),
      },
      registrationManagement: {
        enabled: true,
        rotateRegistrationAccessToken: false,
      },
      revocation: { enabled: true },
      userinfo: { enabled: true },
      jwtUserinfo: { enabled: false },
      introspection: { enabled: false },
      clientCredentials: { enabled: false },
      // Resource Indicators (RFC 8707) — used here for one purpose only:
      // enabling JWT-format access tokens. `OAuthScopeGuard` reads scopes
      // off the AT, and `OAuthJwtStrategy` validates iss/aud/sig and reads
      // `org_id` from the JWT payload. Without this, oidc-provider v8
      // issues opaque ATs and our domain controllers can't authorize them.
      //
      // - `defaultResource` returns the issuer URL so a single, fixed
      //   audience is bound to every AT the AS issues. Clients don't need
      //   to send a `resource` parameter; the AS fills it in.
      // - `useGrantedResource` returns true so token requests don't have to
      //   echo the resource back. The granted resource (== issuer) is used.
      // - `getResourceServerInfo` advertises every supported scope as
      //   belonging to this single resource server, with `accessTokenFormat
      //   = 'jwt'` and RS256 signing. ttl matches our top-level
      //   `ttl.AccessToken` for consistency.
      resourceIndicators: {
        enabled: true,
        defaultResource: () => deps.issuer,
        useGrantedResource: () => true,
        getResourceServerInfo: () => ({
          // Resource Server scopes — only domain/functional scopes belong
          // here. `openid` and `offline_access` are OIDC-only and live on
          // `grant.openid`, never `grant.resources[issuer]`. If we listed
          // them here the consent policy's `rs_scopes_missing` check would
          // re-fire because `getResourceScopeEncountered(issuer)` won't
          // contain them.
          scope: SUPPORTED_SCOPES.filter(
            (s) => s !== 'openid' && s !== 'offline_access',
          ).join(' '),
          audience: deps.issuer,
          accessTokenTTL: 10 * 60,
          accessTokenFormat: 'jwt',
          // RS256 to match the algorithm of the keys seeded by
          // OAuthBootstrapService (`'RS256'` per its constructor).
          jwt: { sign: { alg: 'RS256' } },
        }),
      },
    },
    clients: [],
    findAccount: deps.findAccount,
    loadExistingGrant: deps.loadExistingGrant,
    routes: {
      authorization: '/oauth/authorize',
      token: '/oauth/token',
      jwks: '/jwks.json',
      registration: '/oauth/register',
      revocation: '/oauth/revoke',
      userinfo: '/oauth/userinfo',
      end_session: '/oauth/logout',
    },
    ttl: {
      AccessToken: 10 * 60,
      AuthorizationCode: 60,
      IdToken: 10 * 60,
      RefreshToken: 30 * 24 * 60 * 60,
      Interaction: 10 * 60,
      Session: 14 * 24 * 60 * 60,
    },
    rotateRefreshToken: true,
    interactions: {
      url(_ctx, interaction) {
        return `/account/oauth/consent?interaction=${interaction.uid}`;
      },
    },
    cookies: {
      keys: [process.env.OAUTH_COOKIE_SECRET || 'change-in-production'],
    },
    issueRefreshToken(_ctx, client, code) {
      return code.scopes?.has('offline_access') ?? false;
    },
    extraTokenClaims: async (_ctx, token) => {
      // `token.extra` is never populated by oidc-provider for our flows, so
      // we resolve org context from the durable join `OAuthGrant.oidcGrantId
      // -> oauth_grant` (set at consent time). `t.grantId` is oidc-provider's
      // runtime nanoid — it is in `IN_PAYLOAD` and survives serialization,
      // so it is the deterministic key. Looking up by (userId, clientId)
      // alone is non-deterministic when a user has consented the same client
      // for multiple orgs (two active rows, ORDER unspecified).
      const t = token as any;
      const accountId = Number(t.accountId);
      const oidcGrantId: string | undefined = t.grantId;
      if (!accountId || !oidcGrantId) return {};
      const oauthGrant = await deps.grantRepo.findOne({
        where: { oidcGrantId, revokedAt: IsNull() },
      });
      if (!oauthGrant) return {};
      const membership = await deps.memRepo.findOne({
        where: {
          userId: accountId,
          organizationId: oauthGrant.organizationId,
          status: MembershipStatus.ACTIVE,
        },
      });
      if (!membership) return {};
      return { org_id: oauthGrant.organizationId, role: membership.role };
    },
  };

  // oidc-provider v8 is ESM-only. We need a real native dynamic `import()`
  // here. TypeScript with `module: commonjs` (production runtime *and*
  // ts-jest) lowers `await import(x)` to `require(x)`, which fails on
  // ESM packages. `eval('import(...)')` survives the transform and runs
  // through Node's native ESM loader.

  const dynamicImport = (mod: string) =>
    // Preserve native dynamic import through ts/Jest CJS transform; see
    // comment above for context.
    (eval('(m) => import(m)') as (m: string) => Promise<any>)(mod);
  const { default: ProviderCtor } = await dynamicImport('oidc-provider');
  return new ProviderCtor(deps.issuer, config);
}

function randomClientId(): string {
  return randomBytes(16).toString('hex');
}
