import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../setup';

describe('OAuth discovery (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => { await app.close(); });

  it('GET /.well-known/oauth-authorization-server returns metadata', async () => {
    const res = await request(app.getHttpServer())
      .get('/.well-known/oauth-authorization-server')
      .expect(200);
    expect(res.body).toMatchObject({
      issuer: expect.any(String),
      authorization_endpoint: expect.stringMatching(/\/oauth\/authorize$/),
      token_endpoint: expect.stringMatching(/\/oauth\/token$/),
      jwks_uri: expect.stringMatching(/\/jwks\.json$/),
      registration_endpoint: expect.stringMatching(/\/oauth\/register$/),
      revocation_endpoint: expect.stringMatching(/\/oauth\/revoke$/),
    });
    expect(res.body.code_challenge_methods_supported).toEqual(['S256']);
    expect(res.body.scopes_supported).toEqual(expect.arrayContaining([
      'patients:read','patients:write','clinical:read','clinical:write','agenda:read','agenda:write',
      'inventory:read','inventory:write','reports:read','org:admin','openid','offline_access',
    ]));
  });

  it('GET /.well-known/openid-configuration returns OIDC metadata', async () => {
    const res = await request(app.getHttpServer())
      .get('/.well-known/openid-configuration')
      .expect(200);
    expect(res.body.userinfo_endpoint).toMatch(/\/oauth\/userinfo$/);
    expect(res.body.id_token_signing_alg_values_supported).toEqual(['RS256']);
  });

  it('GET /jwks.json returns active key as JWK', async () => {
    const res = await request(app.getHttpServer()).get('/jwks.json').expect(200);
    expect(res.body.keys.length).toBeGreaterThanOrEqual(1);
    const k = res.body.keys[0];
    expect(k.kty).toBe('RSA');
    expect(k.use).toBe('sig');
    expect(k.alg).toBe('RS256');
    expect(k.kid).toBeTruthy();
    expect(k.n).toBeTruthy();
    expect(k.e).toBeTruthy();
  });
});
