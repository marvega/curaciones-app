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

jest.setTimeout(30_000);

function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

interface Fixtures {
  orgId: string;
  orgName: string;
  userId: number;
  username: string;
  role: string;
  spaAccessToken: string;
}

async function createTestFixtures(app: INestApplication): Promise<Fixtures> {
  const ds = app.get(DataSource);
  const jwt = app.get(JwtService);

  const username = `oauthuserinfo_${randomBytes(4).toString('hex')}`;
  const email = `${username}@test.cl`;
  const orgName = `OAuth UserInfo Org ${username}`;
  const orgRes = await ds.query(
    `INSERT INTO "organizations"("name") VALUES ($1) RETURNING id`,
    [orgName],
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
      organizationName: orgName,
      role: 'admin',
      establishmentIds: [],
      passwordChangedAt: null,
      jti: uuid(),
    },
    { secret: process.env.JWT_SECRET || 'test-secret-key' },
  );

  return { orgId, orgName, userId, username, role: 'admin', spaAccessToken };
}

describe('OAuth userinfo endpoint (e2e)', () => {
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

  it('GET /oauth/userinfo returns identity claims for the bearer access token', async () => {
    const fixtures = await createTestFixtures(app);
    // `openid` only — without any resource-server scope, oidc-provider issues
    // an opaque, unbound AT (no `aud`) that the userinfo endpoint accepts. An
    // AT bound to the issuer-as-resource (the case when `patients:read` or
    // any domain scope is granted) is rejected by oidc-provider's userinfo
    // action with `token audience prevents accessing the userinfo endpoint`.
    const requestedScopes = 'openid';

    // 1. DCR — public client.
    const reg = await request(app.getHttpServer())
      .post('/oauth/register')
      .send({
        client_name: `UserInfo Client ${randomBytes(2).toString('hex')}`,
        redirect_uris: ['https://app.example.com/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        application_type: 'web',
        scope: requestedScopes,
      })
      .expect(201);
    const clientId: string = reg.body.client_id;

    // 2. Authorize → consent → token (PKCE, public client).
    const { verifier, challenge } = pkcePair();
    const authParams = new URLSearchParams({
      client_id: clientId,
      redirect_uri: 'https://app.example.com/callback',
      response_type: 'code',
      scope: requestedScopes,
      state: 'userinfo-state',
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
    const accessToken: string = tok.body.access_token;
    expect(accessToken).toBeTruthy();

    // 3. Call /oauth/userinfo with the bearer access token. The endpoint is
    //    delegated to oidc-provider, which runs `findAccount` and returns the
    //    custom claims defined in `account.adapter.ts`.
    const userinfoRes = await request(app.getHttpServer())
      .get('/oauth/userinfo')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(userinfoRes.body).toEqual(
      expect.objectContaining({
        sub: expect.any(String),
        username: expect.any(String),
        org_id: expect.any(String),
        org_name: expect.any(String),
        role: expect.any(String),
      }),
    );
    // Sanity check: the claim values reflect the seeded fixtures, not
    // arbitrary stand-ins. This catches regressions where findAccount returns
    // the wrong user/org pairing under the multi-tenant flow.
    expect(userinfoRes.body.sub).toBe(String(fixtures.userId));
    expect(userinfoRes.body.username).toBe(fixtures.username);
    expect(userinfoRes.body.org_id).toBe(fixtures.orgId);
    expect(userinfoRes.body.org_name).toBe(fixtures.orgName);
    expect(userinfoRes.body.role).toBe(fixtures.role);
  });
});
