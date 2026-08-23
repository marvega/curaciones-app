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

// OIDC-only scopes that don't bind a resource server. Any scope outside this
// set is treated as a domain (resource-server) scope and triggers the
// issuer-as-resource default in `resourceIndicators.defaultResource`.
const OIDC_ONLY_SCOPES = new Set(['openid', 'offline_access']);

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
    // Map our custom claims onto the `openid` scope so that the userinfo
    // endpoint actually returns them. oidc-provider's `Claims#scope()` filter
    // (see `lib/helpers/claims.js`) only includes claims that are listed in
    // this `claims` config under one of the requested scopes — without this
    // entry, the claims our `findAccount.claims()` returns (`username`,
    // `org_id`, `org_name`, `role`) get silently stripped from the userinfo
    // response, leaving only `sub`.
    claims: {
      openid: ['sub', 'username', 'org_id', 'org_name', 'role'],
    },
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
        // Only default to the issuer-as-resource when the request includes a
        // resource-server (domain) scope. Pure OIDC requests (`openid` and/or
        // `offline_access` only) must NOT be bound to a resource — otherwise
        // the resulting AT carries an `aud` claim and oidc-provider's
        // userinfo endpoint rejects it with `token audience prevents accessing
        // the userinfo endpoint`. With this guard, an AT obtained via
        // `scope=openid` is opaque and accepted by /oauth/userinfo; ATs
        // obtained with any domain scope remain JWT-format and bound to the
        // issuer-as-resource (the original intent of resource indicators).
        defaultResource: ((ctx) => {
          const rawScope = (ctx.oidc?.params?.scope as string | undefined) ?? '';
          const scopes = rawScope.split(/\s+/).filter(Boolean);
          const hasDomainScope = scopes.some((s) => !OIDC_ONLY_SCOPES.has(s));
          // undefined is intentional: oidc-provider treats a falsy return as
          // "no resource binding" (opaque AT), allowing the userinfo endpoint.
          // The cast satisfies the `string` return type declared by
          // @types/oidc-provider.
          return (hasDomainScope ? deps.issuer : undefined) as string;
        }) as any,
        useGrantedResource: () => true,
        getResourceServerInfo: () => ({
          // Resource Server scopes — only domain/functional scopes belong
          // here. `openid` and `offline_access` are OIDC-only and live on
          // `grant.openid`, never `grant.resources[issuer]`. If we listed
          // them here the consent policy's `rs_scopes_missing` check would
          // re-fire because `getResourceScopeEncountered(issuer)` won't
          // contain them.
          scope: SUPPORTED_SCOPES.filter((s) => !OIDC_ONLY_SCOPES.has(s)).join(
            ' ',
          ),
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
    // Firebase Hosting, when it rewrites a request to Cloud Run, drops every
    // incoming cookie except one named exactly `__session`. The AS is served
    // on the same origin as the SPA (https://curaciones.web.app), so every
    // cookie oidc-provider relies on is subject to that filter. This block is
    // what makes the authorization flow survive it. It reads like a hack; it
    // is not. The reasoning, per cookie:
    //
    //   resume       REQUIRED. `lib/actions/authorization/resume.js:14-23`
    //                reads it to recover the interaction uid when the SPA
    //                redirects back after consent. Missing => SessionNotFound,
    //                which is exactly the bug this fixes. It therefore gets
    //                the single name Hosting forwards.
    //   interaction  Unused. `consent.controller.ts` never calls
    //                `provider.interactionResult()` — it looks the Interaction
    //                up by the uid in the URL and persists the result itself,
    //                precisely because this cookie is path-scoped to the SPA
    //                route and never reaches the API.
    //   session      Unused. The SPA authenticates to the consent endpoint
    //                with its own JWT, so the AS never establishes a login
    //                session. `Interaction` persists a session only when
    //                `session.accountId` is set (`lib/models/interaction.js:11`
    //                stores `session: undefined` otherwise), so the
    //                origin-session check in `resume.js:43` short-circuits.
    //
    // Accepted consequence: with no session cookie there is no SSO between
    // authorizations, so every authorization shows the consent screen. For an
    // MCP client that authorizes occasionally this is fine, arguably better.
    //
    // The two unused names are set to inert, self-documenting values rather
    // than left at their defaults, so nobody reads a default name and assumes
    // the cookie still carries state.
    cookies: {
      keys: [process.env.OAUTH_COOKIE_SECRET || 'change-in-production'],
      names: {
        resume: '__session',
        interaction: '__unused_stripped_by_hosting_interaction',
        session: '__unused_stripped_by_hosting_session',
      },
      // A signed cookie is physically two cookies: the `cookies` package puts
      // the signature in a companion `<name>.sig` and, whenever `keys` are
      // configured, defaults `signed` to true on read as well
      // (`node_modules/cookies/index.js:86`). Hosting forwards ONE name, so
      // `__session.sig` never arrives, the signed read of `__session` returns
      // undefined, and we are back to SessionNotFound. Signing is therefore
      // impossible for a cookie that has to cross Hosting, and must be
      // explicitly disabled — `cookies.short.signed` is a documented option
      // (`lib/helpers/defaults.js:840`).
      //
      // What the signature protected: tampering with the cookie value. That
      // value is a random nanoid that must match a live server-side
      // Interaction row, and that row's `result` is written by the consent
      // endpoint against a JWT-authenticated user. So the cookie is an
      // unguessable handle to server-held state, never a trusted assertion,
      // and the authorization code it leads to is still bound to the client's
      // registered redirect_uri and its PKCE verifier. `web.app` is on the
      // Public Suffix List, so a sibling site cannot toss a `__session`
      // cookie onto our origin either.
      short: { httpOnly: true, sameSite: 'lax', signed: false },
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
  const provider = new ProviderCtor(deps.issuer, config);
  // TLS terminates at Firebase Hosting; the API only ever sees plain HTTP
  // from the Cloud Run ingress. Without trusting the proxy, koa reports
  // `ctx.secure === false` and `ctx.ip` as the proxy's address, so
  // oidc-provider omits `Secure` on its cookies, mis-derives absolute URLs,
  // and the DCR audit entry records the proxy IP instead of the client's.
  // `provider.proxy` is the documented setter for koa's `app.proxy`
  // (`lib/provider.js:360`). Not typed by @types/oidc-provider, hence the
  // cast. Mirrors `app.set('trust proxy', true)` in `main.ts` for Express.
  (provider as { proxy: boolean }).proxy = true;
  return provider;
}

function randomClientId(): string {
  return randomBytes(16).toString('hex');
}
