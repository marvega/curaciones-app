import { OAuthJwtStrategy } from './oauth-jwt.strategy';
import { generateKeyPairSync } from 'crypto';
import * as jwt from 'jsonwebtoken';

describe('OAuthJwtStrategy', () => {
  let strategy: OAuthJwtStrategy;
  let signingKeys: any;
  let userRepo: any;
  let memRepo: any;
  let revocationRepo: any;
  let kid: string;
  let privateKeyPem: string;
  let publicKeyPem: string;

  beforeEach(() => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    kid = 'kid-test';

    signingKeys = {
      getAllPublishableKeys: jest.fn().mockResolvedValue([{
        kid,
        algorithm: 'RS256',
        publicKeyPem,
        privateKeyPem,
        publicJwk: { kty: 'RSA', alg: 'RS256', use: 'sig', kid },
      }]),
    };
    userRepo = { findOne: jest.fn().mockResolvedValue({ id: 12, username: 'u' }) };
    memRepo = { findOne: jest.fn().mockResolvedValue({ status: 'active', role: 'Admin' }) };
    revocationRepo = { findOne: jest.fn().mockResolvedValue(null) };

    strategy = new OAuthJwtStrategy(signingKeys as any, userRepo, memRepo, revocationRepo);
  });

  function signToken(claims: object, signKey = privateKeyPem, headerKid = kid): string {
    return jwt.sign(claims, signKey, { algorithm: 'RS256', keyid: headerKid });
  }

  it('validates a valid token and returns user shape', async () => {
    process.env.OAUTH_ISSUER = 'http://issuer';
    const token = signToken({
      iss: 'http://issuer',
      aud: ['issuer'],
      sub: '12',
      org_id: 'uuid-acme',
      org_name: 'Acme',
      role: 'Admin',
      scope: 'patients:read',
      jti: 'j-1',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    const user = await strategy.validate(token, 'GET');
    expect(user.id).toBe(12);
    expect(user.organizationId).toBe('uuid-acme');
    expect(user.scopes).toEqual(['patients:read']);
    expect(user.tokenSource).toBe('oauth');
    expect(user.jti).toBe('j-1');
  });

  it('rejects token signed with unknown kid', async () => {
    process.env.OAUTH_ISSUER = 'http://issuer';
    const otherPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const otherPriv = otherPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const token = jwt.sign(
      { sub: '12', iss: 'http://issuer', aud: 'issuer', jti: 'j' },
      otherPriv,
      { algorithm: 'RS256', keyid: 'unknown', expiresIn: '10m' },
    );
    await expect(strategy.validate(token, 'GET')).rejects.toThrow();
  });

  it('rejects when jti is in revocation list and method is write', async () => {
    process.env.OAUTH_ISSUER = 'http://issuer';
    revocationRepo.findOne.mockResolvedValue({ jti: 'j-revoked', expiresAt: new Date(Date.now() + 60000) });
    const token = signToken({
      iss: 'http://issuer',
      aud: ['issuer'],
      sub: '12',
      org_id: 'org',
      role: 'Admin',
      scope: 'patients:write',
      jti: 'j-revoked',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    await expect(strategy.validate(token, 'POST')).rejects.toThrow();
  });

  it('does not consult revocation list on read methods', async () => {
    process.env.OAUTH_ISSUER = 'http://issuer';
    const token = signToken({
      iss: 'http://issuer',
      aud: ['issuer'],
      sub: '12',
      org_id: 'org',
      role: 'Admin',
      scope: 'patients:read',
      jti: 'j-revoked',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    await strategy.validate(token, 'GET');
    expect(revocationRepo.findOne).not.toHaveBeenCalled();
  });
});
