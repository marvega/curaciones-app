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

  const username = `oauthpkce_${randomBytes(4).toString('hex')}`;
  const email = `${username}@test.cl`;
  const orgRes = await ds.query(
    `INSERT INTO "organizations"("name") VALUES ($1) RETURNING id`,
    [`OAuth PKCE Org ${username}`],
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
      organizationName: `OAuth PKCE Org ${username}`,
      role: 'admin',
      establishmentIds: [],
      passwordChangedAt: null,
      jti: uuid(),
    },
    { secret: process.env.JWT_SECRET || 'test-secret-key' },
  );

  return { orgId, userId, username, accessToken };
}

interface GrantedCode {
  clientId: string;
  code: string;
  verifier: string;
  redirectUri: string;
}

async function runFlowToCode(
  app: INestApplication,
  challenge: string,
  verifier: string,
): Promise<GrantedCode> {
  const { orgId, accessToken } = await createTestFixtures(app);
  const reg = await request(app.getHttpServer())
    .post('/oauth/register')
    .send({
      client_name: `PKCE Test Client ${randomBytes(2).toString('hex')}`,
      redirect_uris: ['https://app.example.com/callback'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      scope: 'openid patients:read',
    })
    .expect(201);
  const clientId: string = reg.body.client_id;

  const authParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: 'https://app.example.com/callback',
    response_type: 'code',
    scope: 'openid patients:read',
    state: 'pkce-state',
    code_challenge: challenge,
    code_challenge_method: 'S256',
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
  return {
    clientId,
    code,
    verifier,
    redirectUri: 'https://app.example.com/callback',
  };
}

describe('OAuth PKCE enforcement (e2e)', () => {
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

  it('rejects token without code_verifier', async () => {
    const { verifier, challenge } = pkcePair();
    const granted = await runFlowToCode(app, challenge, verifier);
    const res = await request(app.getHttpServer())
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: granted.code,
        redirect_uri: granted.redirectUri,
        client_id: granted.clientId,
        // intentionally no code_verifier
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('rejects token with wrong code_verifier', async () => {
    const { verifier, challenge } = pkcePair();
    const granted = await runFlowToCode(app, challenge, verifier);
    const res = await request(app.getHttpServer())
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: granted.code,
        redirect_uri: granted.redirectUri,
        client_id: granted.clientId,
        code_verifier: 'wrongverifierwrongverifierwrongverifierwrongverifier',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_grant');
  });

  it('rejects authorize with plain code_challenge_method', async () => {
    // Seed a real client so we get past the client lookup and reach the
    // PKCE-method validator. Public client to keep the URL simple.
    await createTestFixtures(app);
    const reg = await request(app.getHttpServer())
      .post('/oauth/register')
      .send({
        client_name: 'PKCE Plain Client',
        redirect_uris: ['https://app.example.com/callback'],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        application_type: 'web',
        scope: 'openid patients:read',
      })
      .expect(201);
    const clientId: string = reg.body.client_id;

    const { verifier } = pkcePair();
    // `plain` is the actual literal verifier (per RFC 7636 §4.4) — the only
    // valid value when method=plain. We use it here just to ensure the
    // failure isn't due to a malformed challenge.
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: 'https://app.example.com/callback',
      response_type: 'code',
      scope: 'openid patients:read',
      state: 'pkce-plain',
      code_challenge: verifier,
      code_challenge_method: 'plain',
    });
    const res = await request(app.getHttpServer()).get(
      `/oauth/authorize?${params.toString()}`,
    );
    // oidc-provider may either redirect back to the client with `error=...`
    // (303) or render a 400 directly depending on where the rejection
    // happens. Either is a valid PKCE-enforcement signal — we accept both
    // and assert the error code.
    if (res.status === 303) {
      const loc = res.headers.location as string;
      const url = new URL(loc);
      const err =
        url.searchParams.get('error') ?? url.hash.match(/error=([^&]+)/)?.[1];
      expect(err).toBeTruthy();
      expect(['invalid_request', 'unsupported_response_type']).toContain(err);
    } else {
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    }
  });
});
