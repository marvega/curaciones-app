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

async function createTestFixtures(app: INestApplication): Promise<{
  orgId: string;
  userId: number;
  username: string;
  accessToken: string;
}> {
  const ds = app.get(DataSource);
  const jwt = app.get(JwtService);

  const username = `oauthrefresh_${randomBytes(4).toString('hex')}`;
  const email = `${username}@test.cl`;
  const orgRes = await ds.query(
    `INSERT INTO "organizations"("name") VALUES ($1) RETURNING id`,
    [`OAuth Refresh Org ${username}`],
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

  const accessToken = jwt.sign(
    {
      sub: userId,
      username,
      organizationId: orgId,
      organizationName: `OAuth Refresh Org ${username}`,
      role: 'admin',
      establishmentIds: [],
      passwordChangedAt: null,
      jti: uuid(),
    },
    { secret: process.env.JWT_SECRET || 'test-secret-key' },
  );

  return { orgId, userId, username, accessToken };
}

interface IssuedTokens {
  clientId: string;
  redirectUri: string;
  accessToken: string;
  refreshToken: string;
}

async function fullFlowToTokens(app: INestApplication): Promise<IssuedTokens> {
  const { orgId, accessToken } = await createTestFixtures(app);
  const reg = await request(app.getHttpServer())
    .post('/oauth/register')
    .send({
      client_name: `Refresh Test Client ${randomBytes(2).toString('hex')}`,
      redirect_uris: ['https://app.example.com/callback'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      scope: 'openid offline_access patients:read',
    })
    .expect(201);
  const clientId: string = reg.body.client_id;

  const { verifier, challenge } = pkcePair();
  const authParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: 'https://app.example.com/callback',
    response_type: 'code',
    scope: 'openid offline_access patients:read',
    state: 'refresh-state',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    // `prompt=consent` is required for `offline_access` to survive into the
    // issued code (and thus enable refresh-token issuance).
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
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ approved: true, organizationId: orgId })
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

  expect(tok.body.refresh_token).toBeTruthy();
  return {
    clientId,
    redirectUri: 'https://app.example.com/callback',
    accessToken: tok.body.access_token,
    refreshToken: tok.body.refresh_token,
  };
}

describe('OAuth refresh flow (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(app);
  });

  it('refresh token rotation issues new AT+RT', async () => {
    const initial = await fullFlowToTokens(app);

    const refreshed = await request(app.getHttpServer())
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: initial.refreshToken,
        client_id: initial.clientId,
      })
      .expect(200);
    expect(refreshed.body.access_token).toBeTruthy();
    expect(refreshed.body.refresh_token).toBeTruthy();
    expect(refreshed.body.access_token).not.toBe(initial.accessToken);
    expect(refreshed.body.refresh_token).not.toBe(initial.refreshToken);
  });

  it('refresh token reuse detection invalidates family', async () => {
    const initial = await fullFlowToTokens(app);

    // First refresh — rotates the RT and revokes the original.
    const first = await request(app.getHttpServer())
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: initial.refreshToken,
        client_id: initial.clientId,
      })
      .expect(200);
    const newRefresh: string = first.body.refresh_token;
    expect(newRefresh).toBeTruthy();

    // Replay the original (now-revoked) RT — must fail with invalid_grant.
    const reuse = await request(app.getHttpServer())
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: initial.refreshToken,
        client_id: initial.clientId,
      });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error).toBe('invalid_grant');

    // Reuse detection kills the entire family — the previously-issued (and
    // until-now valid) `newRefresh` must also be rejected.
    const familyKilled = await request(app.getHttpServer())
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: newRefresh,
        client_id: initial.clientId,
      });
    expect(familyKilled.status).toBe(400);
    expect(familyKilled.body.error).toBe('invalid_grant');
  });
});
