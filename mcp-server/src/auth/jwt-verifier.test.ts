import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createJwtVerifier, type VerifiedToken } from './jwt-verifier.js';

describe('JwtVerifier', () => {
  let signKey: any;
  let publicJwk: any;
  const issuer = 'http://test.issuer';
  const audience = 'http://test.issuer';

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    signKey = privateKey;
    publicJwk = { ...(await exportJWK(publicKey)), alg: 'RS256', use: 'sig', kid: 'test-1' };
  });

  async function makeToken(claims: any): Promise<string> {
    return await new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-1' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(signKey);
  }

  function fakeJwks() {
    return {
      async getKey() { return await (await import('jose')).importJWK(publicJwk, 'RS256'); },
    };
  }

  it('accepts a valid token', async () => {
    const verifier = createJwtVerifier({ issuer, audience, jwksUrl: '' }, { jwks: fakeJwks() as any });
    const jwt = await makeToken({ iss: issuer, aud: audience, sub: '42', scope: 'patients:read', org_id: '1', username: 'juan' });
    const verified: VerifiedToken = await verifier.verify(jwt);
    expect(verified.sub).toBe('42');
    expect(verified.scope).toBe('patients:read');
    expect(verified.org_id).toBe('1');
  });

  it('rejects expired token', async () => {
    const verifier = createJwtVerifier({ issuer, audience, jwksUrl: '' }, { jwks: fakeJwks() as any });
    const expired = await new SignJWT({ iss: issuer, aud: audience, sub: '42' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-1' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(signKey);
    await expect(verifier.verify(expired)).rejects.toThrow(/exp/);
  });

  it('rejects wrong issuer', async () => {
    const verifier = createJwtVerifier({ issuer, audience, jwksUrl: '' }, { jwks: fakeJwks() as any });
    const jwt = await makeToken({ iss: 'http://evil', aud: audience, sub: '42' });
    await expect(verifier.verify(jwt)).rejects.toThrow(/iss/);
  });

  it('rejects wrong audience', async () => {
    const verifier = createJwtVerifier({ issuer, audience, jwksUrl: '' }, { jwks: fakeJwks() as any });
    const jwt = await makeToken({ iss: issuer, aud: 'http://other', sub: '42' });
    await expect(verifier.verify(jwt)).rejects.toThrow(/aud/);
  });

  it('rejects malformed token', async () => {
    const verifier = createJwtVerifier({ issuer, audience, jwksUrl: '' }, { jwks: fakeJwks() as any });
    await expect(verifier.verify('not-a-jwt')).rejects.toThrow();
  });
});
