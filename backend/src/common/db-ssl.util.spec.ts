import { buildDbSslConfig } from './db-ssl.util';

describe('buildDbSslConfig', () => {
  it('disables TLS outside production', () => {
    expect(
      buildDbSslConfig({
        nodeEnv: 'development',
        databaseUrl:
          'postgresql://curaciones:curaciones@localhost:5433/curaciones',
      }),
    ).toBe(false);
  });

  it('verifies the server certificate in production', () => {
    expect(
      buildDbSslConfig({
        nodeEnv: 'production',
        databaseUrl:
          'postgresql://u:p@ep-x.us-west-2.aws.neon.tech/neondb?sslmode=verify-full',
      }),
    ).toEqual({ rejectUnauthorized: true });
  });

  it.each(['disable', 'no-verify'])(
    'rejects a production DATABASE_URL with sslmode=%s',
    (mode) => {
      expect(() =>
        buildDbSslConfig({
          nodeEnv: 'production',
          databaseUrl: `postgresql://u:p@ep-x.us-west-2.aws.neon.tech/neondb?sslmode=${mode}`,
        }),
      ).toThrow(/sslmode/);
    },
  );

  // pg only applies libpq's weaker `require` semantics (no CA check) when
  // uselibpqcompat is set; the flag would silently defeat verification because
  // the connection string overrides the ssl option object.
  it('rejects a production DATABASE_URL using libpq compatibility mode', () => {
    expect(() =>
      buildDbSslConfig({
        nodeEnv: 'production',
        databaseUrl:
          'postgresql://u:p@ep-x.us-west-2.aws.neon.tech/neondb?uselibpqcompat=true&sslmode=require',
      }),
    ).toThrow(/uselibpqcompat/);
  });

  // pg-connection-string maps ?ssl=0 to `ssl: false` and an empty ?ssl= to the
  // falsy string ''; pg maps ?ssl=no-verify to { rejectUnauthorized: false }.
  // All three reach the pool because the connection string overrides the ssl
  // option, so the util has to refuse them.
  it.each(['0', '', 'no-verify', 'false', 'off'])(
    'rejects a production DATABASE_URL with ssl=%s',
    (value) => {
      expect(() =>
        buildDbSslConfig({
          nodeEnv: 'production',
          databaseUrl: `postgresql://u:p@ep-x.us-west-2.aws.neon.tech/neondb?ssl=${value}`,
        }),
      ).toThrow(/ssl=/);
    },
  );

  it('rejects ssl=0 even when sslmode=verify-full is also present', () => {
    expect(() =>
      buildDbSslConfig({
        nodeEnv: 'production',
        databaseUrl:
          'postgresql://u:p@ep-x.us-west-2.aws.neon.tech/neondb?sslmode=verify-full&ssl=0',
      }),
    ).toThrow(/ssl=0/);
  });

  it.each(['true', '1'])(
    'accepts ssl=%s, which pg reads as plain TLS',
    (value) => {
      expect(
        buildDbSslConfig({
          nodeEnv: 'production',
          databaseUrl: `postgresql://u:p@ep-x.us-west-2.aws.neon.tech/neondb?ssl=${value}`,
        }),
      ).toEqual({ rejectUnauthorized: true });
    },
  );

  it('still verifies a plain sslmode=verify-full production URL', () => {
    expect(
      buildDbSslConfig({
        nodeEnv: 'production',
        databaseUrl:
          'postgresql://u:p@ep-x.us-west-2.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require',
      }),
    ).toEqual({ rejectUnauthorized: true });
  });

  it('requires DATABASE_URL to be set in production', () => {
    expect(() =>
      buildDbSslConfig({ nodeEnv: 'production', databaseUrl: undefined }),
    ).toThrow(/DATABASE_URL/);
  });
});
