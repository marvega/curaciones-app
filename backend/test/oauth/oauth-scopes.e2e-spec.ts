/* eslint-disable @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-argument,
                  @typescript-eslint/no-unsafe-call */
// supertest's response bodies are JSON blobs from oidc-provider — typing
// them adds noise without value in e2e.
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { v4 as uuid } from 'uuid';
import request from 'supertest';
import { createTestApp, cleanDatabase } from '../setup';

function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

interface Fixtures {
  orgId: string;
  userId: number;
  username: string;
  spaAccessToken: string;
}

async function createTestFixtures(app: INestApplication): Promise<Fixtures> {
  const ds = app.get(DataSource);
  const jwt = app.get(JwtService);

  const username = `oauthscope_${randomBytes(4).toString('hex')}`;
  const email = `${username}@test.cl`;
  const orgRes = await ds.query(
    `INSERT INTO "organizations"("name") VALUES ($1) RETURNING id`,
    [`OAuth Scope Org ${username}`],
  );
  const orgId = String(orgRes[0].id);
  const passwordHash = await bcrypt.hash('password123', 10);
  const emailHash = createHash('sha256')
    .update(email.toLowerCase())
    .digest('hex');
  const userRes = await ds.query(
    `INSERT INTO "users"("username","passwordHash","email","emailHash","emailVerifiedAt","passwordChangedAt")
     VALUES ($1,$2,$3,$4,now(),now()) RETURNING id`,
    [username, passwordHash, JSON.stringify({ plaintext: email }), emailHash],
  );
  const userId: number = userRes[0].id;
  await ds.query(
    `INSERT INTO "organization_memberships"("userId","organizationId","role","status","acceptedAt")
     VALUES ($1,$2,'admin','active',now())`,
    [userId, orgId],
  );

  const spaAccessToken = jwt.sign(
    {
      sub: userId,
      username,
      organizationId: orgId,
      organizationName: `OAuth Scope Org ${username}`,
      role: 'admin',
      establishmentIds: [],
      passwordChangedAt: null,
      jti: uuid(),
    },
    { secret: process.env.JWT_SECRET || 'test-secret-key' },
  );

  return { orgId, userId, username, spaAccessToken };
}

/**
 * Drives the full DCR → authorize → consent → token flow against the live
 * NestJS test app and returns the resulting OAuth access token (a JWT under
 * the resource-indicator config). `requestedScopes` is the space-delimited
 * scope string both the DCR registration and the authorize step request;
 * always include `openid` and `offline_access` so a refresh token is
 * issued and the consent prompt fires consistently.
 */
async function getAccessTokenWithScopes(
  app: INestApplication,
  fixtures: Fixtures,
  requestedScopes: string,
): Promise<string> {
  const reg = await request(app.getHttpServer())
    .post('/oauth/register')
    .send({
      client_name: `Scope Client ${randomBytes(2).toString('hex')}`,
      redirect_uris: ['https://app.example.com/callback'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      scope: requestedScopes,
    })
    .expect(201);
  const clientId: string = reg.body.client_id;

  const { verifier, challenge } = pkcePair();
  const authParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: 'https://app.example.com/callback',
    response_type: 'code',
    scope: requestedScopes,
    state: 'scope-state',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'consent',
  });

  const agent = request.agent(app.getHttpServer());
  const authRes = await agent
    .get(`/oauth/authorize?${authParams.toString()}`)
    .expect(303);
  const uid = new URL(
    authRes.headers.location as string,
    'http://localhost',
  ).searchParams.get('interaction')!;

  const submit = await request(app.getHttpServer())
    .post(`/oauth/consent/${uid}`)
    .set('Authorization', `Bearer ${fixtures.spaAccessToken}`)
    .send({ approved: true, organizationId: fixtures.orgId })
    .expect(201);
  const resumePath = new URL(submit.body.redirectTo).pathname;
  const codeRes = await agent.get(resumePath).expect(303);
  const code = new URL(codeRes.headers.location as string).searchParams.get(
    'code',
  )!;

  const tok = await request(app.getHttpServer())
    .post('/oauth/token')
    .type('form')
    .send({
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'https://app.example.com/callback',
      client_id: clientId,
      code_verifier: verifier,
    })
    .expect(200);
  return tok.body.access_token as string;
}

describe('OAuth scope enforcement on domain endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await cleanDatabase(app);
  });

  it('AT with patients:read → GET /api/patients = 200; POST = 403 with insufficient_scope', async () => {
    const fixtures = await createTestFixtures(app);
    const at = await getAccessTokenWithScopes(
      app,
      fixtures,
      'openid offline_access patients:read',
    );

    const getRes = await request(app.getHttpServer())
      .get('/api/patients')
      .set('Authorization', `Bearer ${at}`);
    expect(getRes.status).toBe(200);

    const postRes = await request(app.getHttpServer())
      .post('/api/patients')
      .set('Authorization', `Bearer ${at}`)
      .send({ name: 'Test', rut: '11111111-1' });
    expect(postRes.status).toBe(403);
    expect(postRes.body.error).toBe('insufficient_scope');
    expect(postRes.body.scope).toBe('patients:write');
    // RFC 6750 §3 — challenge MUST advertise the missing scope so a client
    // can re-authorize.
    expect(postRes.headers['www-authenticate']).toMatch(/insufficient_scope/);
    expect(postRes.headers['www-authenticate']).toMatch(/patients:write/);
  });

  it('AT with patients:write implies read → GET /api/patients = 200', async () => {
    const fixtures = await createTestFixtures(app);
    const at = await getAccessTokenWithScopes(
      app,
      fixtures,
      'openid offline_access patients:write',
    );

    const getRes = await request(app.getHttpServer())
      .get('/api/patients')
      .set('Authorization', `Bearer ${at}`);
    expect(getRes.status).toBe(200);
  });

  it('AT with org:admin only → GET /api/patients = 403 (no implicit read)', async () => {
    const fixtures = await createTestFixtures(app);
    const at = await getAccessTokenWithScopes(
      app,
      fixtures,
      'openid offline_access org:admin',
    );

    const getRes = await request(app.getHttpServer())
      .get('/api/patients')
      .set('Authorization', `Bearer ${at}`);
    expect(getRes.status).toBe(403);
    expect(getRes.body.error).toBe('insufficient_scope');
    expect(getRes.body.scope).toBe('patients:read');
  });

  it('Internal SPA JWT bypasses scope check → GET /api/patients = 200', async () => {
    const fixtures = await createTestFixtures(app);

    const getRes = await request(app.getHttpServer())
      .get('/api/patients')
      .set('Authorization', `Bearer ${fixtures.spaAccessToken}`);
    expect(getRes.status).toBe(200);
  });
});
