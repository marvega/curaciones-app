/**
 * Single source of truth for the two OAuth environment variables that must
 * never fall back to a default in production.
 *
 * Before this module, `OAUTH_COOKIE_SECRET` defaulted to the literal
 * `'change-in-production'` and `OAUTH_ISSUER` to `http://localhost:3000` at
 * four independent call sites. A production deploy that forgot either one
 * booted anyway: signing cookies with a key printed in the public repository,
 * and minting tokens whose `iss` points at a host that does not exist. Both
 * failures are silent, which is exactly what the project's fail-fast rule
 * exists to prevent.
 *
 * Outside production the defaults stay. They are useful for local development
 * and no real data is at stake.
 */

/** Development-only default. Matches the port `npm run start:dev` listens on. */
export const DEV_OAUTH_ISSUER = 'http://localhost:3000';

/**
 * Development-only default, and simultaneously the value `.env.example` ships.
 * Because it is published, production must reject it explicitly — a deploy that
 * copied the example file would otherwise pass a mere presence check.
 */
export const DEV_OAUTH_COOKIE_SECRET = 'change-in-production';

type Env = Record<string, string | undefined>;

function isProduction(env: Env): boolean {
  return env.NODE_ENV === 'production';
}

function fail(variable: string, reason: string): never {
  throw new Error(
    `${variable} ${reason}. It is required when NODE_ENV=production; ` +
      `refusing to start with a development default.`,
  );
}

/**
 * The issuer identifier the AS mints tokens under and every guard compares
 * against. Throws in production when unset.
 */
export function oauthIssuer(env: Env = process.env): string {
  const value = env.OAUTH_ISSUER;
  if (value) return value;
  if (isProduction(env)) fail('OAUTH_ISSUER', 'is not set');
  return DEV_OAUTH_ISSUER;
}

/**
 * The key oidc-provider uses for its cookie keygrip. Throws in production when
 * unset or still set to the published placeholder.
 */
export function oauthCookieSecret(env: Env = process.env): string {
  const value = env.OAUTH_COOKIE_SECRET;
  if (value && value !== DEV_OAUTH_COOKIE_SECRET) return value;
  if (isProduction(env)) {
    fail(
      'OAUTH_COOKIE_SECRET',
      value ? `is still the placeholder '${DEV_OAUTH_COOKIE_SECRET}'` : 'is not set',
    );
  }
  return value ?? DEV_OAUTH_COOKIE_SECRET;
}

/**
 * Boot-time gate. Call once, as early as possible, so a misconfigured deploy
 * dies before it opens a port or a database pool instead of at the first
 * request that happens to need one of these values.
 *
 * Reports every offending variable in one error rather than one per restart.
 */
export function assertOauthEnv(env: Env = process.env): void {
  const errors: string[] = [];
  for (const read of [oauthIssuer, oauthCookieSecret]) {
    try {
      read(env);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));
}
