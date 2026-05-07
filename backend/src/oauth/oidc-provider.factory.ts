import { randomBytes, createPrivateKey } from 'crypto';
import type { Provider as OidcProvider, Configuration } from 'oidc-provider';
import { OAuthSigningKeyService } from './services/oauth-signing-key.service';
import { Repository } from 'typeorm';
import { OAuthToken } from './entities/oauth-token.entity';
import { OAuthClient } from './entities/oauth-client.entity';
import { makePostgresAdapterFactory } from './adapters/postgres.adapter';
import { ClientAdapter } from './adapters/client.adapter';

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
  const Adapter = (name: string) => (name === 'Client' ? clientAdapter : tokenAdapterFactory(name));

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

  // oidc-provider v8 is ESM-only. We need a real native dynamic `import()`
  // here. TypeScript with `module: commonjs` (production runtime *and*
  // ts-jest) lowers `await import(x)` to `require(x)`, which fails on
  // ESM packages. `eval('import(...)')` survives the transform and runs
  // through Node's native ESM loader.
  // eslint-disable-next-line no-eval
  const dynamicImport = (mod: string) => (eval('(m) => import(m)') as (m: string) => Promise<any>)(mod);
  const { default: ProviderCtor } = await dynamicImport('oidc-provider');
  return new ProviderCtor(deps.issuer, config);
}

function randomClientId(): string {
  return randomBytes(16).toString('hex');
}
