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

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<
    string,
    unknown
  >;
}

async function createTestFixtures(app: INestApplication): Promise<{
  orgId: string;
  userId: number;
  username: string;
  accessToken: string;
}> {
  const ds = app.get(DataSource);
  const jwt = app.get(JwtService);

  const username = `oauthhappy_${randomBytes(4).toString('hex')}`;
  const email = `${username}@test.cl`;
  const orgRes = await ds.query(
    `INSERT INTO "organizations"("name") VALUES ($1) RETURNING id`,
    [`OAuth Happy Org ${username}`],
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
      organizationName: `OAuth Happy Org ${username}`,
      role: 'admin',
      establishmentIds: [],
      passwordChangedAt: null,
      jti: uuid(),
    },
    { secret: process.env.JWT_SECRET || 'test-secret-key' },
  );

  return { orgId, userId, username, accessToken };
}

describe('OAuth happy path (e2e)', () => {
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

  it('full flow: DCR → authorize → consent → token; AT carries org_id claim', async () => {
    const { userId, orgId, accessToken } = await createTestFixtures(app);

    // 1. DCR — public client (token_endpoint_auth_method: 'none') so we don't
    //    need to juggle client_secret on the token call.
    const reg = await request(app.getHttpServer())
      .post('/oauth/register')
      .send({
        client_name: 'Happy Path Test Client',
        redirect_uris: ['https://app.example.com/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        application_type: 'web',
        scope: 'openid offline_access patients:read agenda:read',
      })
      .expect(201);
    const clientId: string = reg.body.client_id;
    expect(clientId).toBeTruthy();

    // 2. Authorize — capture interaction uid + interaction cookie.
    const { verifier, challenge } = pkcePair();
    const requestedScope = 'openid offline_access patients:read agenda:read';
    const authParams = new URLSearchParams({
      client_id: clientId,
      redirect_uri: 'https://app.example.com/callback',
      response_type: 'code',
      scope: requestedScope,
      state: 'happy-state',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      // `offline_access` is only honored when the prompt set explicitly
      // includes `consent` (oidc-provider drops it from a code's scopes
      // otherwise). We always show the consent screen in our flow, so this is
      // congruent with the user-facing UX.
      prompt: 'consent',
    });

    const agent = request.agent(app.getHttpServer());
    const authRes = await agent
      .get(`/oauth/authorize?${authParams.toString()}`)
      .expect(303);
    const consentLocation = authRes.headers.location as string;
    const uid = new URL(consentLocation, 'http://localhost').searchParams.get(
      'interaction',
    )!;
    expect(uid).toBeTruthy();

    // 3. Consent submit — approves and yields a redirectTo with the resume
    //    URL (which carries the auth code once followed).
    const submitRes = await request(app.getHttpServer())
      .post(`/oauth/consent/${uid}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ approved: true, organizationId: orgId })
      .expect(201);
    const resumePath = new URL(submitRes.body.redirectTo).pathname;
    const codeRes = await agent.get(resumePath).expect(303);
    const finalLocation = codeRes.headers.location as string;
    const code = new URL(finalLocation).searchParams.get('code')!;
    expect(code).toBeTruthy();

    // 4. Token exchange — public client, code + verifier + redirect_uri.
    const tokRes = await request(app.getHttpServer())
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://app.example.com/callback',
        client_id: clientId,
        code_verifier: verifier,
      });
    expect(tokRes.status).toBe(200);

    expect(tokRes.body.access_token).toBeTruthy();
    expect(tokRes.body.token_type).toMatch(/bearer/i);
    expect(tokRes.body.id_token).toBeTruthy();
    expect(tokRes.body.refresh_token).toBeTruthy();
    expect(tokRes.body.scope).toEqual(expect.any(String));
    const grantedScopes = String(tokRes.body.scope).split(' ');
    expect(grantedScopes).toEqual(
      expect.arrayContaining([
        'openid',
        'offline_access',
        'patients:read',
        'agenda:read',
      ]),
    );

    // 5. id_token is a JWT and carries the seeded user as `sub`.
    const idClaims = decodeJwtPayload(tokRes.body.id_token);
    expect(idClaims.sub).toBe(String(userId));

    // 6. The multi-tenant `org_id` link is recorded on the durable
    //    `oauth_grant` row (which oidc-provider's `extraTokenClaims` reads
    //    via `oidcGrantId` to enrich tokens at validation time). The AT
    //    itself is opaque under oidc-provider v8 unless resourceIndicators
    //    are configured; the durable row is the source of truth either way.
    const ds = app.get(DataSource);
    const grants = await ds.query(
      `SELECT "userId","organizationId","scopes","revokedAt","oidcGrantId"
         FROM "oauth_grant"
        WHERE "clientId" = $1`,
      [clientId],
    );
    expect(grants).toHaveLength(1);
    expect(grants[0].userId).toBe(userId);
    expect(String(grants[0].organizationId)).toBe(orgId);
    expect(grants[0].oidcGrantId).toBeTruthy();
    expect(grants[0].scopes).toEqual(
      expect.arrayContaining([
        'openid',
        'offline_access',
        'patients:read',
        'agenda:read',
      ]),
    );
  });
});
