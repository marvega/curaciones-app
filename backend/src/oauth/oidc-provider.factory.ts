import { randomBytes } from 'crypto';
import { Provider as OidcProvider, Configuration } from 'oidc-provider';
import { OAuthSigningKeyService } from './services/oauth-signing-key.service';
import { Repository } from 'typeorm';
import { OAuthToken } from './entities/oauth-token.entity';
import { OAuthClient } from './entities/oauth-client.entity';
import { makePostgresAdapterFactory } from './adapters/postgres.adapter';

export const SUPPORTED_SCOPES = [
  'openid', 'offline_access',
  'patients:read', 'patients:write',
  'clinical:read', 'clinical:write',
  'agenda:read', 'agenda:write',
  'inventory:read', 'inventory:write',
  'reports:read', 'org:admin',
];

export interface OidcFactoryDeps {
  issuer: string;
  signingKeys: OAuthSigningKeyService;
  tokenRepo: Repository<OAuthToken>;
  clientRepo: Repository<OAuthClient>;
  findAccount: Configuration['findAccount'];
  loadExistingGrant: Configuration['loadExistingGrant'];
}

export async function buildOidcProvider(deps: OidcFactoryDeps): Promise<OidcProvider> {
  const allKeys = await deps.signingKeys.getAllPublishableKeys();
  const jwks = {
    keys: await Promise.all(
      allKeys.map(async (k) => {
        const { exportJWK, importPKCS8 } = await import('jose');
        const priv = await importPKCS8(k.privateKeyPem, k.algorithm);
        const jwk = await exportJWK(priv);
        return { ...jwk, alg: k.algorithm, use: 'sig', kid: k.kid };
      }),
    ),
  };

  const Adapter = makePostgresAdapterFactory(deps.tokenRepo);

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
      registrationManagement: { enabled: true, rotateRegistrationAccessToken: false },
      revocation: { enabled: true },
      userinfo: { enabled: true },
      jwtUserinfo: { enabled: false },
      introspection: { enabled: false },
      clientCredentials: { enabled: false },
      resourceIndicators: { enabled: false },
    },
    clients: [],
    findAccount: deps.findAccount,
    loadExistingGrant: deps.loadExistingGrant,
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
    extraTokenClaims(_ctx, token) {
      const payload: Record<string, unknown> = {};
      const t = token as any;
      if (t.extra?.org_id) payload.org_id = t.extra.org_id;
      if (t.extra?.org_name) payload.org_name = t.extra.org_name;
      if (t.extra?.role) payload.role = t.extra.role;
      if (t.extra?.establishment_ids) payload.establishment_ids = t.extra.establishment_ids;
      return payload;
    },
  };

  return new OidcProvider(deps.issuer, config);
}

function randomClientId(): string {
  return randomBytes(16).toString('hex');
}
