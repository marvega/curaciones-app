import {
  DEV_OAUTH_COOKIE_SECRET,
  DEV_OAUTH_ISSUER,
  assertOauthEnv,
  oauthCookieSecret,
  oauthIssuer,
} from './oauth-env';

const prod = (extra: Record<string, string> = {}) => ({
  NODE_ENV: 'production',
  ...extra,
});

describe('oauthIssuer', () => {
  it('returns the configured issuer in production', () => {
    expect(oauthIssuer(prod({ OAUTH_ISSUER: 'https://curaciones.web.app' }))).toBe(
      'https://curaciones.web.app',
    );
  });

  it('throws in production when unset, naming the variable', () => {
    expect(() => oauthIssuer(prod())).toThrow(/OAUTH_ISSUER/);
    expect(() => oauthIssuer(prod())).toThrow(/NODE_ENV=production/);
  });

  it('throws in production when set to the empty string', () => {
    expect(() => oauthIssuer(prod({ OAUTH_ISSUER: '' }))).toThrow(/OAUTH_ISSUER/);
  });

  it('keeps the localhost default outside production', () => {
    expect(oauthIssuer({ NODE_ENV: 'development' })).toBe(DEV_OAUTH_ISSUER);
    expect(oauthIssuer({ NODE_ENV: 'test' })).toBe(DEV_OAUTH_ISSUER);
    expect(oauthIssuer({})).toBe(DEV_OAUTH_ISSUER);
  });
});

describe('oauthCookieSecret', () => {
  it('returns the configured secret in production', () => {
    expect(oauthCookieSecret(prod({ OAUTH_COOKIE_SECRET: 's3cret' }))).toBe('s3cret');
  });

  it('throws in production when unset, naming the variable', () => {
    expect(() => oauthCookieSecret(prod())).toThrow(/OAUTH_COOKIE_SECRET/);
  });

  it('throws in production when it is still the placeholder from .env.example', () => {
    // The placeholder is committed to a public repository, so a presence
    // check alone would let a deploy sign cookies with a known key.
    expect(() =>
      oauthCookieSecret(prod({ OAUTH_COOKIE_SECRET: DEV_OAUTH_COOKIE_SECRET })),
    ).toThrow(/placeholder/);
  });

  it('keeps the placeholder default outside production', () => {
    expect(oauthCookieSecret({ NODE_ENV: 'development' })).toBe(DEV_OAUTH_COOKIE_SECRET);
    expect(oauthCookieSecret({ NODE_ENV: 'test' })).toBe(DEV_OAUTH_COOKIE_SECRET);
  });
});

describe('assertOauthEnv', () => {
  it('is silent when both variables are set in production', () => {
    expect(() =>
      assertOauthEnv(
        prod({ OAUTH_ISSUER: 'https://curaciones.web.app', OAUTH_COOKIE_SECRET: 's3cret' }),
      ),
    ).not.toThrow();
  });

  it('is silent outside production', () => {
    expect(() => assertOauthEnv({ NODE_ENV: 'test' })).not.toThrow();
  });

  it('reports both missing variables in one error', () => {
    // One restart, one message: the operator should not have to fix these
    // one deploy at a time.
    let message = '';
    try {
      assertOauthEnv(prod());
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/OAUTH_ISSUER/);
    expect(message).toMatch(/OAUTH_COOKIE_SECRET/);
  });
});
