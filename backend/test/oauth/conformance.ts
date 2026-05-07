/* eslint-disable no-console */
// Usage: npx ts-node -r tsconfig-paths/register test/oauth/conformance.ts [BASE_URL] [--username U] [--password P]
// Full conformance requires --username and --password for a valid user in the target environment.

import { createHash, randomBytes } from 'crypto';

const BASE = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:3000';
const argv = process.argv.slice(3);
const username = argv[argv.indexOf('--username') + 1];
const password = argv[argv.indexOf('--password') + 1];

const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', B = '\x1b[1m', X = '\x1b[0m';
let passed = 0, failed = 0;

function ok(label: string) { passed++; console.log(`${G}✓${X} ${label}`); }
function fail(label: string, detail?: string) {
  failed++;
  console.log(`${R}✗${X} ${label}${detail ? `\n  ${Y}→ ${detail.slice(0, 120)}${X}` : ''}`);
}
function skip(label: string) { console.log(`${Y}–${X} ${label} (skipped — provide --username/--password)`); }

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function get(path: string, headers: Record<string, string> = {}) {
  return fetch(`${BASE}${path}`, { headers, redirect: 'manual' });
}

async function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    redirect: 'manual',
  });
}

async function postForm(path: string, body: Record<string, string>, headers: Record<string, string> = {}) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(body).toString(),
    redirect: 'manual',
  });
}

// Extract cookies from Set-Cookie headers for manual jar
function getCookies(r: Response): string {
  const raw = r.headers.getSetCookie?.() ?? [];
  return raw.map((c) => c.split(';')[0]).join('; ');
}

async function main() {
  console.log(`\n${B}OAuth Conformance Report — ${BASE}${X}\n`);

  // ── 1. Discovery ──────────────────────────────────────────────────────────
  {
    const r = await get('/.well-known/openid-configuration');
    const b = (await r.json()) as Record<string, unknown>;
    const required = ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri', 'revocation_endpoint', 'userinfo_endpoint'];
    const missing = required.filter((k) => !b[k]);
    missing.length === 0
      ? ok('Discovery: all required fields present')
      : fail('Discovery: missing fields', missing.join(', '));
  }

  // ── 2. JWKS ───────────────────────────────────────────────────────────────
  {
    const r = await get('/jwks.json');
    const b = (await r.json()) as { keys?: unknown[] };
    r.status === 200 && Array.isArray(b.keys) && b.keys.length > 0
      ? ok('JWKS: 200 with keys array')
      : fail('JWKS: unexpected response', `status=${r.status}`);
    const cc = r.headers.get('cache-control');
    cc ? ok(`JWKS: cache-control present (${cc})`) : fail('JWKS: cache-control header missing');
  }

  // ── 3. RFC 6749 error shape ────────────────────────────────────────────────
  {
    const r = await postForm('/oauth/token', { grant_type: 'unsupported_xyz', client_id: 'x' });
    const b = (await r.json()) as Record<string, unknown>;
    typeof b.error === 'string'
      ? ok(`RFC 6749 error shape: "error" field present (${b.error})`)
      : fail('RFC 6749 error shape: missing "error" field', JSON.stringify(b));
  }

  // ── 4. DCR non-loopback HTTP rejected ─────────────────────────────────────
  {
    const r = await postJson('/oauth/register', {
      client_name: 'Conformance Bad Redirect Test',
      redirect_uris: ['http://attacker.example.com/callback'],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'openid patients:read',
    });
    r.status >= 400
      ? ok('DCR: non-loopback HTTP redirect_uri rejected')
      : fail('DCR: non-loopback HTTP redirect_uri accepted (SECURITY ISSUE)', `status=${r.status}`);
  }

  // ── 5. DCR valid registration ─────────────────────────────────────────────
  let clientId = '';
  {
    const r = await postJson('/oauth/register', {
      client_name: 'Conformance Test Client',
      redirect_uris: ['https://conformance.test/callback'],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'openid offline_access patients:read',
    });
    const b = (await r.json()) as Record<string, unknown>;
    if (r.status === 201 && typeof b.client_id === 'string') {
      clientId = b.client_id;
      ok(`DCR: registration succeeded → client_id ${clientId.slice(0, 8)}…`);
    } else {
      fail('DCR: registration failed', `${r.status} ${JSON.stringify(b)}`);
    }
  }

  // ── 6. PKCE plain method rejected ─────────────────────────────────────────
  if (clientId) {
    const { challenge } = pkce();
    const p = new URLSearchParams({
      client_id: clientId,
      redirect_uri: 'https://conformance.test/callback',
      response_type: 'code',
      scope: 'openid patients:read',
      code_challenge: challenge,
      code_challenge_method: 'plain',
      prompt: 'consent',
    });
    const r = await get(`/oauth/authorize?${p.toString()}`);
    const loc = r.headers.get('location') ?? '';
    r.status >= 400 || loc.includes('error=')
      ? ok('PKCE: plain method rejected')
      : fail('PKCE: plain method not rejected (SECURITY ISSUE)', `status=${r.status} loc=${loc}`);
  }

  // ── 7. redirect_uri mismatch rejected ────────────────────────────────────
  if (clientId) {
    const { challenge } = pkce();
    const p = new URLSearchParams({
      client_id: clientId,
      redirect_uri: 'https://wrong-domain.example.com/callback',
      response_type: 'code',
      scope: 'openid patients:read',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'consent',
    });
    const r = await get(`/oauth/authorize?${p.toString()}`);
    const loc = r.headers.get('location') ?? '';
    // oidc-provider must NOT redirect to the unregistered URI
    const redirectedToAttacker = loc.includes('wrong-domain.example.com');
    !redirectedToAttacker
      ? ok('redirect_uri mismatch: not redirected to unregistered URI')
      : fail('redirect_uri mismatch: redirected to unregistered URI (SECURITY ISSUE)', loc);
  }

  // ── Auth-gated checks ─────────────────────────────────────────────────────
  if (!username || !password) {
    console.log();
    ['JWT claims', 'Userinfo', 'Revocation'].forEach((c) => skip(c));
    return printSummary();
  }

  // ── 8. Login → internal JWT ───────────────────────────────────────────────
  let internalJwt = '';
  let orgId = '';
  {
    const r = await postJson('/api/auth/login', { usernameOrEmail: username, password });
    const b = (await r.json()) as Record<string, unknown> & { accessToken?: string; organizations?: { id: string }[] };
    if (r.status === 200 && b.accessToken) {
      internalJwt = b.accessToken;
      orgId = b.organizations?.[0]?.id ?? '';
      ok('Login: obtained internal JWT');
    } else {
      fail('Login: failed', `${r.status} ${JSON.stringify(b)}`);
      return printSummary();
    }
  }

  // ── 9. Full flow: authorize → consent → token ─────────────────────────────
  let accessToken = '';
  if (clientId && internalJwt && orgId) {
    const { verifier, challenge } = pkce();
    const p = new URLSearchParams({
      client_id: clientId,
      redirect_uri: 'https://conformance.test/callback',
      response_type: 'code',
      scope: 'openid offline_access patients:read',
      state: randomBytes(8).toString('hex'),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'consent',
    });

    const authR = await get(`/oauth/authorize?${p.toString()}`);
    const jar = getCookies(authR);
    const consentLoc = authR.headers.get('location') ?? '';
    const uid = new URL(consentLoc, BASE).searchParams.get('interaction');

    if (!uid) {
      fail('Authorize: no interaction uid in redirect', `status=${authR.status} loc=${consentLoc}`);
    } else {
      ok(`Authorize: interaction uid obtained`);

      const consentR = await postJson(
        `/oauth/consent/${uid}`,
        { approved: true, organizationId: orgId },
        { Authorization: `Bearer ${internalJwt}` },
      );
      const consentB = (await consentR.json()) as { redirectTo?: string };
      const resumePath = consentB.redirectTo ? new URL(consentB.redirectTo).pathname : '';

      if (!resumePath) {
        fail('Consent: no redirectTo', JSON.stringify(consentB));
      } else {
        ok('Consent: approved');

        const resumeR = await get(resumePath, { Cookie: jar });
        const finalLoc = resumeR.headers.get('location') ?? '';
        let code = '';
        try { code = new URL(finalLoc).searchParams.get('code') ?? ''; } catch { /* non-URL loc */ }

        if (!code) {
          fail('Authorize code: not found in final redirect', finalLoc);
        } else {
          ok('Authorize code: received');

          const tokR = await postForm('/oauth/token', {
            grant_type: 'authorization_code',
            code,
            redirect_uri: 'https://conformance.test/callback',
            client_id: clientId,
            code_verifier: verifier,
          });
          const tokB = (await tokR.json()) as Record<string, unknown>;

          if (tokR.status === 200 && typeof tokB.access_token === 'string') {
            accessToken = tokB.access_token;
            ok('Token: access_token received');

            // ── 10. JWT claims ──────────────────────────────────────────────
            const [, pl] = accessToken.split('.');
            const claims = JSON.parse(Buffer.from(pl, 'base64url').toString()) as Record<string, unknown>;
            const req = ['iss', 'sub', 'aud', 'exp', 'iat', 'jti', 'scope'];
            const missing = req.filter((c) => !claims[c]);
            missing.length === 0
              ? ok('JWT claims: iss, sub, aud, exp, iat, jti, scope all present')
              : fail('JWT claims: missing', missing.join(', '));
          } else {
            fail('Token exchange: failed', `${tokR.status} ${JSON.stringify(tokB)}`);
          }
        }
      }
    }
  }

  // ── 11. Userinfo ──────────────────────────────────────────────────────────
  if (accessToken) {
    const r = await get('/oauth/userinfo', { Authorization: `Bearer ${accessToken}` });
    const b = (await r.json()) as Record<string, unknown>;
    r.status === 200 && b.sub
      ? ok(`Userinfo: 200 with sub="${b.sub}"`)
      : fail('Userinfo: unexpected response', `${r.status} ${JSON.stringify(b)}`);
  } else {
    skip('Userinfo (no access_token from flow above)');
  }

  // ── 12. Revocation ────────────────────────────────────────────────────────
  if (accessToken) {
    const revokeR = await postForm('/oauth/revoke', { token: accessToken, client_id: clientId });
    revokeR.status === 200
      ? ok('Revocation: 200 accepted')
      : fail('Revocation: unexpected status', String(revokeR.status));

    const afterR = await get('/oauth/userinfo', { Authorization: `Bearer ${accessToken}` });
    afterR.status === 401
      ? ok('Revocation: revoked AT rejected by userinfo (401)')
      : fail('Revocation: revoked AT still accepted (SECURITY ISSUE)', `status=${afterR.status}`);
  } else {
    skip('Revocation (no access_token from flow above)');
  }

  printSummary();
}

function printSummary() {
  const total = passed + failed;
  console.log(`\n${B}Summary: ${passed}/${total} checks passed${X}`);
  console.log(failed === 0 ? `${G}All checks passed ✓${X}` : `${R}${failed} check(s) failed ✗${X}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
