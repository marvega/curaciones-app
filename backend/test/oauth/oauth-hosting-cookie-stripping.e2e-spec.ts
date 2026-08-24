/* eslint-disable @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-argument */
// supertest response bodies are JSON blobs from oidc-provider — typing them
// adds noise without value in e2e.
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { v4 as uuid } from 'uuid';
import request from 'supertest';
import { createTestApp, cleanDatabase } from '../setup';

// The single cookie name Firebase Hosting forwards to a Cloud Run rewrite
// origin. Every other cookie in the browser jar is dropped before the
// request reaches the backend.
const HOSTING_FORWARDED_COOKIE = '__session';

/**
 * A browser cookie jar that reproduces Firebase Hosting's behaviour.
 *
 * `store()` accepts everything the origin sets, exactly like a real browser.
 * `header()` returns only what Hosting would actually forward: cookies whose
 * name is exactly `__session`. Anything else — including a `.sig` signature
 * twin or a `.legacy` SameSite twin — is discarded, which is the whole point
 * of this test.
 */
class HostingCookieJar {
  private readonly jar = new Map<string, string>();

  store(res: request.Response): void {
    const raw = res.headers['set-cookie'];
    if (!raw) return;
    const list: string[] = Array.isArray(raw) ? raw : [raw];
    for (const entry of list) {
      const [pair] = entry.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === '') {
        this.jar.delete(name);
        continue;
      }
      this.jar.set(name, value);
    }
  }

  /** Every cookie the browser holds — what a non-Hosting deployment sends. */
  names(): string[] {
    return [...this.jar.keys()];
  }

  /** Only what survives Hosting's filter, as a `Cookie` request header. */
  header(): string {
    return [...this.jar.entries()]
      .filter(([name]) => name === HOSTING_FORWARDED_COOKIE)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
}

function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function createTestFixtures(app: INestApplication): Promise<{
  orgId: string;
  userId: number;
  accessToken: string;
}> {
  const ds = app.get(DataSource);
  const jwt = app.get(JwtService);

  const username = `hostcookie_${randomBytes(4).toString('hex')}`;
  const email = `${username}@test.cl`;
  const orgRes = await ds.query(
    `INSERT INTO "organizations"("name") VALUES ($1) RETURNING id`,
    [`Hosting Cookie Org ${username}`],
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
      organizationName: `Hosting Cookie Org ${username}`,
      role: 'admin',
      establishmentIds: [],
      passwordChangedAt: null,
      jti: uuid(),
    },
    { secret: process.env.JWT_SECRET || 'test-secret-key' },
  );

  return { orgId, userId, accessToken };
}

describe('OAuth authorization behind Firebase Hosting cookie stripping (e2e)', () => {
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

  it('completes authorize -> consent -> resume -> token forwarding only the __session cookie', async () => {
    const server = app.getHttpServer();
    const { orgId, accessToken } = await createTestFixtures(app);
    const { verifier, challenge } = pkcePair();
    const jar = new HostingCookieJar();
    const redirectUri = 'https://app.example.com/callback';

    const reg = await request(server)
      .post('/oauth/register')
      .send({
        client_name: `Hosting Cookie Client ${randomBytes(2).toString('hex')}`,
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        application_type: 'web',
        scope: 'openid patients:read',
      })
      .expect(201);
    const clientId: string = reg.body.client_id;

    // 1. Authorization request. Arrives through Hosting, so it carries no
    //    cookies at all on the first hop.
    const authParams = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid patients:read',
      state: 'hosting-state',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    const authRes = await request(server)
      .get(`/oauth/authorize?${authParams.toString()}`)
      .expect(303);
    jar.store(authRes);

    // Evidence that the filter under test is actually load-bearing: the
    // provider sets cookies Hosting will never give back, and exactly one
    // survives — the resume cookie, which must be named `__session`.
    expect(jar.names().length).toBeGreaterThan(1);
    expect(jar.names()).toContain(HOSTING_FORWARDED_COOKIE);
    expect(jar.header().split('; ')).toHaveLength(1);
    // No signature twin: a `__session.sig` would be stripped too, and the
    // signed read of `__session` would then return undefined.
    expect(jar.names()).not.toContain(`${HOSTING_FORWARDED_COOKIE}.sig`);

    const uid = new URL(
      authRes.headers.location,
      'http://localhost',
    ).searchParams.get('interaction')!;

    // 2. Consent submit from the SPA. Authenticated by the app's own JWT,
    //    not by an AS session cookie, and still Hosting-filtered.
    const submit = await request(server)
      .post(`/oauth/consent/${uid}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', jar.header())
      .send({ approved: true, organizationId: orgId })
      .expect(201);
    jar.store(submit);

    // 3. Resume. This is the hop that fails with SessionNotFound unless the
    //    resume cookie is the one cookie Hosting forwards.
    const resumePath = new URL(submit.body.redirectTo).pathname;
    const resumeRes = await request(server)
      .get(resumePath)
      .set('Cookie', jar.header())
      .expect(303);
    jar.store(resumeRes);

    const code = new URL(resumeRes.headers.location).searchParams.get('code');
    expect(code).toBeTruthy();

    // 4. Code exchange. Must yield a usable access token.
    const tokenRes = await request(server)
      .post('/oauth/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: verifier,
      })
      .expect(200);

    expect(tokenRes.body.access_token).toBeTruthy();
    expect(tokenRes.body.token_type).toBe('Bearer');

    // A usable token, not merely a non-empty string: JWT-format, bound to
    // the issuer as audience, carrying the granted scope and org context.
    const [, payloadB64] = String(tokenRes.body.access_token).split('.');
    const claims = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    );
    expect(claims.scope).toContain('patients:read');
    expect(String(claims.org_id)).toBe(orgId);
  });
});

// The other half of the Hosting fix: TLS terminates at Hosting, so the API
// only sees plain HTTP and must trust `X-Forwarded-Proto`. This needs an
// https issuer to be observable, hence its own provider instance.
describe('OAuth provider trusts the Hosting TLS proxy (e2e)', () => {
  let app: INestApplication;
  let previousIssuer: string | undefined;

  beforeAll(async () => {
    previousIssuer = process.env.OAUTH_ISSUER;
    process.env.OAUTH_ISSUER = 'https://curaciones.web.app';
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
    if (previousIssuer === undefined) delete process.env.OAUTH_ISSUER;
    else process.env.OAUTH_ISSUER = previousIssuer;
  });

  beforeEach(async () => {
    await cleanDatabase(app);
  });

  it('marks the __session cookie Secure when X-Forwarded-Proto is https', async () => {
    const server = app.getHttpServer();
    await createTestFixtures(app);
    const { challenge } = pkcePair();
    const redirectUri = 'https://app.example.com/callback';

    const reg = await request(server)
      .post('/oauth/register')
      .send({
        client_name: `Proxy Client ${randomBytes(2).toString('hex')}`,
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        application_type: 'web',
        scope: 'openid patients:read',
      })
      .expect(201);

    const authParams = new URLSearchParams({
      client_id: reg.body.client_id,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid patients:read',
      state: 'proxy-state',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    const authRes = await request(server)
      .get(`/oauth/authorize?${authParams.toString()}`)
      .set('X-Forwarded-Proto', 'https')
      .expect(303);

    const raw = authRes.headers['set-cookie'];
    const setCookies: string[] = Array.isArray(raw) ? raw : [raw];
    const resumeCookie = setCookies.find((c) =>
      c.startsWith(`${HOSTING_FORWARDED_COOKIE}=`),
    );
    expect(resumeCookie).toBeTruthy();
    // `Secure` appears only if koa resolved `ctx.secure === true`, which for a
    // plain-HTTP request requires `provider.proxy = true`. Without it the
    // production cookie would be sent unprotected.
    expect(resumeCookie).toMatch(/;\s*secure/i);
  });
});
