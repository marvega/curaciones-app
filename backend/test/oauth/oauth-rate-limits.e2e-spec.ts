/* eslint-disable @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-argument,
                  @typescript-eslint/no-unsafe-call */
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { v4 as uuid } from 'uuid';
import request from 'supertest';
import { createTestApp, cleanDatabase } from '../setup';

jest.setTimeout(60_000);

function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function getOAuthAt(
  app: INestApplication,
  spaToken: string,
  orgId: string,
  scope: string,
): Promise<{ accessToken: string; clientId: string }> {
  const reg = await request(app.getHttpServer())
    .post('/oauth/register')
    .send({
      client_name: `RateLimit Client ${randomBytes(2).toString('hex')}`,
      redirect_uris: ['https://app.example.com/callback'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      scope,
    })
    .expect(201);
  const clientId: string = reg.body.client_id;

  const { verifier, challenge } = pkcePair();
  const authParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: 'https://app.example.com/callback',
    response_type: 'code',
    scope,
    state: 'rate-state',
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
    .set('Authorization', `Bearer ${spaToken}`)
    .send({ approved: true, organizationId: orgId })
    .expect(201);
  const resumePath = new URL(submit.body.redirectTo).pathname;
  const codeRes = await agent.get(resumePath).expect(303);
  const code = new URL(codeRes.headers.location as string).searchParams.get('code')!;

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
  return { accessToken: tok.body.access_token as string, clientId };
}

describe('OAuth per-client rate limiting (e2e)', () => {
  let app: INestApplication;
  let spaToken: string;
  let orgId: string;
  let oauthAT: string;
  let patientId: number;

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);

    const ds = app.get(DataSource);
    const jwt = app.get(JwtService);

    const username = `ratelimit_${randomBytes(4).toString('hex')}`;
    const email = `${username}@test.cl`;
    const orgRes = await ds.query(
      `INSERT INTO "organizations"("name") VALUES ($1) RETURNING id`,
      [`RateLimit Org ${username}`],
    );
    orgId = String(orgRes[0].id);
    const passwordHash = await bcrypt.hash('pass123', 10);
    const emailHash = createHash('sha256').update(email.toLowerCase()).digest('hex');
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

    spaToken = jwt.sign(
      {
        sub: userId,
        username,
        organizationId: orgId,
        organizationName: `RateLimit Org ${username}`,
        role: 'admin',
        establishmentIds: [],
        passwordChangedAt: null,
        jti: uuid(),
      },
      { secret: process.env.JWT_SECRET || 'test-secret-key' },
    );

    const rut = `RL${randomBytes(3).toString('hex').toUpperCase()}`;
    const createRes = await request(app.getHttpServer())
      .post('/api/patients')
      .set('Authorization', `Bearer ${spaToken}`)
      .send({
        rut,
        firstName: 'RateLimit',
        lastName: 'Test',
        birthDate: '1990-01-01',
        gender: 'Masculino',
      })
      .expect(201);
    patientId = createRes.body.id as number;

    const { accessToken } = await getOAuthAt(
      app,
      spaToken,
      orgId,
      'openid offline_access patients:read patients:write',
    );
    oauthAT = accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('60 OAuth PUT requests succeed; 61st returns 429 with Retry-After', async () => {
    for (let i = 0; i < 60; i++) {
      await request(app.getHttpServer())
        .put(`/api/patients/${patientId}`)
        .set('Authorization', `Bearer ${oauthAT}`)
        .send({
          firstName: `RateLimit${i}`,
          lastName: 'Test',
          birthDate: '1990-01-01',
          gender: 'Masculino',
        })
        .expect(200);
    }

    const limited = await request(app.getHttpServer())
      .put(`/api/patients/${patientId}`)
      .set('Authorization', `Bearer ${oauthAT}`)
      .send({ firstName: 'LimitedUser', lastName: 'Test', birthDate: '1990-01-01', gender: 'Masculino' });

    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('SPA token requests use a separate tracker key and are not affected', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/patients/${patientId}`)
      .set('Authorization', `Bearer ${spaToken}`)
      .expect(200);
    expect(res.body).toMatchObject({ id: patientId });
  });
});
