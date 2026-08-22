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

  // The `ssl` parameter is a separate lever from `sslmode` and just as capable
  // of disabling TLS: pg-connection-string turns ?ssl=0 into `ssl: false`, an
  // empty ?ssl= into the falsy string '', and pg itself turns ?ssl=no-verify
  // into { rejectUnauthorized: false }. Any other spelling is a value pg does
  // not read as "verified TLS" at all. Only the two spellings pg normalises to
  // plain `true` are allowed through.
  if (params.has('ssl')) {
    const ssl = params.get('ssl');
    if (ssl !== 'true' && ssl !== '1') {
      throw new Error(
        `DATABASE_URL sets ssl=${ssl}, which pg does not read as verified TLS; remove it and use sslmode=verify-full`,
      );
    }
  }

  return { rejectUnauthorized: true };
}
