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

interface DualOrgFixture {
  userId: number;
  username: string;
  orgAId: string;
  orgBId: string;
  spaTokenForOrgA: string;
  spaTokenForOrgB: string;
}

async function createDualOrgFixture(
  app: INestApplication,
): Promise<DualOrgFixture> {
  const ds = app.get(DataSource);
  const jwt = app.get(JwtService);

  const username = `oauthmulti_${randomBytes(4).toString('hex')}`;
  const email = `${username}@test.cl`;
  const orgAName = `MultiOrg A ${username}`;
  const orgBName = `MultiOrg B ${username}`;
  const [orgARow] = await ds.query(
    `INSERT INTO "organizations"("name") VALUES ($1) RETURNING id`,
    [orgAName],
  );
  const [orgBRow] = await ds.query(
    `INSERT INTO "organizations"("name") VALUES ($1) RETURNING id`,
    [orgBName],
  );
  const orgAId = String(orgARow.id);
  const orgBId = String(orgBRow.id);

  const passwordHash = await bcrypt.hash('password123', 10);
  const emailHash = createHash('sha256')
    .update(email.toLowerCase())
    .digest('hex');
  const [userRow] = await ds.query(
    `INSERT INTO "users"("username","passwordHash","email","emailHash","emailVerifiedAt","passwordChangedAt")
     VALUES ($1,$2,$3,$4,now(),now()) RETURNING id`,
    [username, passwordHash, JSON.stringify({ plaintext: email }), emailHash],
  );
  const userId: number = userRow.id;

  await ds.query(
    `INSERT INTO "organization_memberships"("userId","organizationId","role","status","acceptedAt")
     VALUES ($1,$2,'admin','active',now()), ($1,$3,'admin','active',now())`,
    [userId, orgAId, orgBId],
  );

  // The consent endpoint relies on the SPA-issued JWT to authenticate the
  // user *and* identify which org the consent should bind to. We mint two
  // SPA tokens — one preselects org A, the other org B — to drive each
  // OAuth flow without needing a UI org-switcher.
  const tokenFor = (orgId: string, orgName: string): string =>
    jwt.sign(
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

  return {
    userId,
    username,
    orgAId,
    orgBId,
    spaTokenForOrgA: tokenFor(orgAId, orgAName),
    spaTokenForOrgB: tokenFor(orgBId, orgBName),
  };
}

async function getAccessTokenForOrg(
  app: INestApplication,
  spaToken: string,
  organizationId: string,
  scopes: string,
): Promise<string> {
  const reg = await request(app.getHttpServer())
    .post('/oauth/register')
    .send({
      client_name: `Multi-Org Client ${randomBytes(2).toString('hex')}`,
      redirect_uris: ['https://app.example.com/callback'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      scope: scopes,
    })
    .expect(201);
  const clientId: string = reg.body.client_id;

  const { verifier, challenge } = pkcePair();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: 'https://app.example.com/callback',
    response_type: 'code',
    scope: scopes,
    state: 'multi-org',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'consent',
  });
  const agent = request.agent(app.getHttpServer());
  const authRes = await agent
    .get(`/oauth/authorize?${params.toString()}`)
    .expect(303);
  const uid = new URL(
    authRes.headers.location as string,
    'http://localhost',
  ).searchParams.get('interaction')!;

  const submit = await request(app.getHttpServer())
    .post(`/oauth/consent/${uid}`)
    .set('Authorization', `Bearer ${spaToken}`)
    .send({ approved: true, organizationId })
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

describe('OAuth multi-org token binding (e2e)', () => {
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

  it('AT for org A and AT for org B are distinct grants and tokens', async () => {
    const fx = await createDualOrgFixture(app);
    const scopes = 'openid offline_access patients:read patients:write';
    const atA = await getAccessTokenForOrg(
      app,
      fx.spaTokenForOrgA,
      fx.orgAId,
      scopes,
    );
    const atB = await getAccessTokenForOrg(
      app,
      fx.spaTokenForOrgB,
      fx.orgBId,
      scopes,
    );

    expect(atA).toBeTruthy();
    expect(atB).toBeTruthy();
    expect(atA).not.toBe(atB);

    // Each AT carries its bound org as the `org_id` claim. A different
    // member-org cannot be smuggled into the JWT post hoc — the
    // `extraTokenClaims` resolver reads the org from the durable
    // `oauth_grant` row keyed by oidc-provider's runtime grantId.
    const decode = (jwt: string): Record<string, unknown> => {
      const [, payload] = jwt.split('.');
      return JSON.parse(Buffer.from(payload, 'base64url').toString());
    };
    const claimsA = decode(atA);
    const claimsB = decode(atB);
    expect(claimsA.org_id).toBe(fx.orgAId);
    expect(claimsB.org_id).toBe(fx.orgBId);
    expect(claimsA.sub).toBe(String(fx.userId));
    expect(claimsB.sub).toBe(String(fx.userId));

    // The durable grant rows are independent (one per org) so revoking
    // one cannot accidentally collapse access to the other.
    const ds = app.get(DataSource);
    const grants = await ds.query(
      `SELECT "organizationId" FROM "oauth_grant" WHERE "userId" = $1 AND "revokedAt" IS NULL ORDER BY "organizationId"`,
      [fx.userId],
    );
    const grantOrgIds = grants
      .map((g: { organizationId: string }) => String(g.organizationId))
      .sort();
    expect(grantOrgIds).toEqual([fx.orgAId, fx.orgBId].sort());
  });

  it('cross-org isolation: patient created via AT-A is invisible to AT-B', async () => {
    const fx = await createDualOrgFixture(app);
    const scopes = 'openid offline_access patients:read patients:write';
    const atA = await getAccessTokenForOrg(
      app,
      fx.spaTokenForOrgA,
      fx.orgAId,
      scopes,
    );
    const atB = await getAccessTokenForOrg(
      app,
      fx.spaTokenForOrgB,
      fx.orgBId,
      scopes,
    );

    // Create a patient using AT-A — should land in org A.
    const created = await request(app.getHttpServer())
      .post('/api/patients')
      .set('Authorization', `Bearer ${atA}`)
      .send({
        rut: '11111111-1',
        firstName: 'OrgA',
        lastName: 'Patient',
        birthDate: '1980-01-01',
        gender: 'M',
      });
    expect(created.status).toBe(201);
    const patientId = created.body.id;
    expect(patientId).toBeTruthy();

    // AT-A can list / fetch the patient.
    const listA = await request(app.getHttpServer())
      .get('/api/patients')
      .set('Authorization', `Bearer ${atA}`)
      .expect(200);
    const itemsA = listA.body.data ?? listA.body;
    expect(Array.isArray(itemsA) ? itemsA : []).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: patientId })]),
    );

    // AT-B's listing must NOT include org A's patient — `OrgScopeSubscriber`
    // + `OrgContextInterceptor` filter every query by the AT's org_id.
    const listB = await request(app.getHttpServer())
      .get('/api/patients')
      .set('Authorization', `Bearer ${atB}`)
      .expect(200);
    const itemsB = listB.body.data ?? listB.body;
    expect(Array.isArray(itemsB) ? itemsB : []).toEqual([]);

    // AT-B fetching the org-A patient by id must 404, not 403/200 — the
    // tenant filter is applied at the query layer so the resource simply
    // doesn't exist for this token.
    await request(app.getHttpServer())
      .get(`/api/patients/${patientId}`)
      .set('Authorization', `Bearer ${atB}`)
      .expect(404);
  });
});
