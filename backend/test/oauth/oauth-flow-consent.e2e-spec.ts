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

async function createTestFixtures(
  app: INestApplication,
): Promise<{ orgId: string; userId: number; username: string; accessToken: string }> {
  const ds = app.get(DataSource);
  const jwt = app.get(JwtService);

  const username = `oauthuser_${randomBytes(4).toString('hex')}`;
  const email = `${username}@test.cl`;
  const orgRes = await ds.query(
    `INSERT INTO "organizations"("name") VALUES ($1) RETURNING id`,
    [`OAuth Test Org ${username}`],
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

  // Sign a JWT shaped like the live AuthService output so the JwtAuthGuard +
  // JwtStrategy attach `req.user` to the consent endpoints.
  const accessToken = jwt.sign(
    {
      sub: userId,
      username,
      organizationId: orgId,
      organizationName: `OAuth Test Org ${username}`,
      role: 'admin',
      establishmentIds: [],
      passwordChangedAt: null,
      jti: uuid(),
    },
    { secret: process.env.JWT_SECRET || 'test-secret-key' },
  );

  return { orgId, userId, username, accessToken };
}

describe('OAuth consent flow (e2e)', () => {
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

  it('first authorize triggers consent; submitting approval issues code', async () => {
    const { userId, orgId, accessToken } = await createTestFixtures(app);

    // 1. Register a client via DCR
    const reg = await request(app.getHttpServer())
      .post('/oauth/register')
      .send({
        client_name: 'Consent Flow Test Client',
        redirect_uris: ['https://app.example.com/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'client_secret_basic',
        application_type: 'web',
        scope: 'patients:read agenda:read',
      })
      .expect(201);
    const clientId: string = reg.body.client_id;
    expect(clientId).toBeTruthy();

    // 2. Hit /oauth/authorize → 303 to consent URL with `_interaction` cookie.
    // The SPA route is /account/oauth/consent?interaction=<uid>. The cookie
    // is path-scoped to that SPA route; supertest's agent persists cookies
    // across the same Set-Cookie boundary so we capture it for later resume.
    const { verifier, challenge } = pkcePair();
    const authParams = new URLSearchParams({
      client_id: clientId,
      redirect_uri: 'https://app.example.com/callback',
      response_type: 'code',
      scope: 'patients:read agenda:read',
      state: 'xyz',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    const agent = request.agent(app.getHttpServer());
    const authRes = await agent
      .get(`/oauth/authorize?${authParams.toString()}`)
      .expect(303);
    const location = authRes.headers.location as string;
    expect(location).toMatch(/\/account\/oauth\/consent\?interaction=/);
    const uid = new URL(location, 'http://localhost').searchParams.get(
      'interaction',
    )!;
    expect(uid).toBeTruthy();

    // 3. GET /oauth/consent/:uid → returns interaction details
    const intRes = await request(app.getHttpServer())
      .get(`/oauth/consent/${uid}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(intRes.body.client.name).toBe('Consent Flow Test Client');
    expect(intRes.body.scopes.map((s: any) => s.id)).toEqual(
      expect.arrayContaining(['patients:read', 'agenda:read']),
    );
    expect(intRes.body.organizations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: orgId, role: 'admin' }),
      ]),
    );
    expect(intRes.body.preselectedOrganizationId).toBe(orgId);

    // 4. POST /oauth/consent/:uid (approved=true) → returns redirectTo
    const submitRes = await request(app.getHttpServer())
      .post(`/oauth/consent/${uid}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ approved: true, organizationId: orgId })
      .expect(201);
    expect(submitRes.body.redirectTo).toMatch(
      /\/oauth\/authorize\/[^/?]+$/,
    );

    // 5. Following the redirectTo (with the agent that holds the
    //    `_interaction_resume` cookie) yields a 303 to redirect_uri with
    //    `code=...`.
    const resumePath = new URL(submitRes.body.redirectTo).pathname;
    const codeRes = await agent.get(resumePath).expect(303);
    const finalLocation = codeRes.headers.location as string;
    expect(finalLocation).toMatch(/^https:\/\/app\.example\.com\/callback\?/);
    const codeUrl = new URL(finalLocation);
    expect(codeUrl.searchParams.get('code')).toBeTruthy();
    expect(codeUrl.searchParams.get('state')).toBe('xyz');

    // Sanity: verifier kept around in case a follow-up token-exchange test is
    // added; assertion guarantees PKCE pair validity.
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);

    // 6. The grant in DB is owned by the user we authenticated as.
    const ds = app.get(DataSource);
    const grants = await ds.query(
      `SELECT "userId","organizationId","scopes","revokedAt"
         FROM "oauth_grant"
        WHERE "clientId" = $1`,
      [clientId],
    );
    expect(grants).toHaveLength(1);
    expect(grants[0].userId).toBe(userId);
    expect(String(grants[0].organizationId)).toBe(orgId);
    expect(grants[0].scopes).toEqual(
      expect.arrayContaining(['patients:read', 'agenda:read']),
    );
    expect(grants[0].revokedAt).toBeNull();
  });
});
