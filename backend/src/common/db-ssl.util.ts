/**
 * TLS settings for the Postgres pool.
 *
 * node-postgres merges the parsed connection string *over* the `ssl` option
 * (pg/lib/connection-parameters.js), so a DATABASE_URL that opts out of
 * certificate verification silently defeats whatever is set here. Reject those
 * URLs instead of connecting without verification.
 */
export function buildDbSslConfig(env: {
  nodeEnv: string | undefined;
  databaseUrl: string | undefined;
}): false | { rejectUnauthorized: true } {
  if (env.nodeEnv !== 'production') return false;

  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL is required in production');
  }

  const params = new URL(env.databaseUrl).searchParams;

  const sslmode = params.get('sslmode');
  if (sslmode === 'disable' || sslmode === 'no-verify') {
    throw new Error(
      `DATABASE_URL uses sslmode=${sslmode}, which skips certificate verification; use sslmode=verify-full`,
    );
  }

  if (params.get('uselibpqcompat') === 'true') {
    throw new Error(
      'DATABASE_URL sets uselibpqcompat=true, which weakens sslmode to libpq semantics; remove it and use sslmode=verify-full',
    );
  }

  return { rejectUnauthorized: true };
}
