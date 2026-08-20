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

  it('requires DATABASE_URL to be set in production', () => {
    expect(() =>
      buildDbSslConfig({ nodeEnv: 'production', databaseUrl: undefined }),
    ).toThrow(/DATABASE_URL/);
  });
});
