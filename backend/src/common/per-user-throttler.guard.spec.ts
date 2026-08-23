import { sign } from 'jsonwebtoken';
import { PerUserThrottlerGuard } from './per-user-throttler.guard';

const JWT_SECRET = 'test-secret-do-not-use-in-prod';

function createGuard(): PerUserThrottlerGuard {
  return new PerUserThrottlerGuard(
    { throttlers: [{ name: 'default', ttl: 60000, limit: 100 }] },
    {} as any,
    {} as any,
  );
}

function callGetTracker(
  guard: PerUserThrottlerGuard,
  req: Record<string, any>,
): Promise<string> {
  return (guard as any).getTracker(req);
}

function callShouldSkip(
  guard: PerUserThrottlerGuard,
  req: Record<string, any>,
): Promise<boolean> {
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as any;
  return (guard as any).shouldSkip(ctx);
}

describe('PerUserThrottlerGuard.getTracker', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it('returns user:<sub> for a request with a valid Bearer JWT', async () => {
    const token = sign({ sub: 42, username: 'nurse', role: 'user' }, JWT_SECRET);
    const req = {
      headers: { authorization: `Bearer ${token}` },
      ip: '10.0.0.1',
    };

    const tracker = await callGetTracker(createGuard(), req);

    expect(tracker).toBe('user:42');
  });

  it('returns IP when there is no Authorization header', async () => {
    const req = { headers: {}, ip: '10.0.0.1' };

    const tracker = await callGetTracker(createGuard(), req);

    expect(tracker).toBe('ip:10.0.0.1');
  });

  it('returns IP when the JWT signature is invalid', async () => {
    const tamperedToken = sign({ sub: 42 }, 'wrong-secret');
    const req = {
      headers: { authorization: `Bearer ${tamperedToken}` },
      ip: '10.0.0.1',
    };

    const tracker = await callGetTracker(createGuard(), req);

    expect(tracker).toBe('ip:10.0.0.1');
  });

  it('returns IP when the Authorization header is malformed', async () => {
    const req = {
      headers: { authorization: 'NotBearer xyz' },
      ip: '10.0.0.1',
    };

    const tracker = await callGetTracker(createGuard(), req);

    expect(tracker).toBe('ip:10.0.0.1');
  });

  it('returns IP when the JWT is expired', async () => {
    const expiredToken = sign({ sub: 42 }, JWT_SECRET, { expiresIn: '-1h' });
    const req = {
      headers: { authorization: `Bearer ${expiredToken}` },
      ip: '10.0.0.1',
    };

    const tracker = await callGetTracker(createGuard(), req);

    expect(tracker).toBe('ip:10.0.0.1');
  });
});

/**
 * The bug these pin. `trust proxy` is 1, so `req.ip` is the right-most
 * X-Forwarded-For element, which for every caller arriving through Firebase
 * Hosting is the one Hosting egress address. Every test below therefore uses the
 * *same* IP: that is the production condition, not an edge case, and a tracker
 * that only reads `req.ip` collapses all of them into one 5-per-minute bucket.
 */
describe('PerUserThrottlerGuard.getTracker — anonymous callers on one shared IP', () => {
  const HOSTING_IP = '35.201.10.7';
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  function loginReq(usernameOrEmail: string) {
    return {
      headers: {},
      ip: HOSTING_IP,
      path: '/api/auth/login',
      body: { usernameOrEmail, password: 'irrelevant' },
    };
  }

  it('gives two different login attempts two different buckets', async () => {
    const guard = createGuard();

    const nurse = await callGetTracker(guard, loginReq('cynthia'));
    const admin = await callGetTracker(guard, loginReq('admin'));

    expect(nurse).not.toBe(admin);
  });

  it('does not let one account exhaust another account’s login bucket', async () => {
    // The clinic-wide lockout, stated as an invariant: no matter how many
    // distinct users log in from the same egress IP, no two share a bucket.
    const guard = createGuard();
    const users = ['admin', 'cynthia', 'marcelo', 'kine1', 'tens@cesfam.cl'];

    const trackers = await Promise.all(
      users.map((u) => callGetTracker(guard, loginReq(u))),
    );

    expect(new Set(trackers).size).toBe(users.length);
  });

  it('gives the same account the same bucket across attempts', async () => {
    // The other half of the property: brute force against one account must
    // still be capped, so repeated attempts have to land on one bucket.
    const guard = createGuard();

    const first = await callGetTracker(guard, loginReq('admin'));
    const second = await callGetTracker(guard, loginReq('admin'));

    expect(first).toBe(second);
  });

  it('treats case and surrounding space as the same account', async () => {
    // findUserByUsernameOrEmail hashes the email with toLowerCase()
    // (auth.service.ts:37), so these are one account. If they were three
    // buckets, case-rotation would multiply the 5-per-minute cap at will.
    const guard = createGuard();

    const trackers = await Promise.all([
      callGetTracker(guard, loginReq('tens@cesfam.cl')),
      callGetTracker(guard, loginReq('Tens@CESFAM.cl')),
      callGetTracker(guard, loginReq('  tens@cesfam.cl  ')),
    ]);

    expect(new Set(trackers).size).toBe(1);
  });

  it('never puts the submitted identity in the key in cleartext', async () => {
    const tracker = await callGetTracker(
      createGuard(),
      loginReq('tens@cesfam.cl'),
    );

    expect(tracker).not.toContain('tens@cesfam.cl');
    expect(tracker).not.toContain('cesfam');
  });

  it('keys the token endpoint on client_id, in preference to refresh_token', async () => {
    const guard = createGuard();
    const base = { headers: {}, ip: HOSTING_IP, path: '/oauth/token' };

    const a = await callGetTracker(guard, {
      ...base,
      body: { grant_type: 'refresh_token', client_id: 'mcp-a', refresh_token: 'rt-1' },
    });
    const b = await callGetTracker(guard, {
      ...base,
      body: { grant_type: 'refresh_token', client_id: 'mcp-b', refresh_token: 'rt-2' },
    });
    // Same client, rotated refresh token: still one bucket, because client_id
    // is read first.
    const aAgain = await callGetTracker(guard, {
      ...base,
      body: { grant_type: 'refresh_token', client_id: 'mcp-a', refresh_token: 'rt-9' },
    });

    expect(a).not.toBe(b);
    expect(a).toBe(aAgain);
  });

  it('reads client_id out of an HTTP Basic credential', async () => {
    const guard = createGuard();
    const basic = (id: string) => ({
      headers: {
        authorization: `Basic ${Buffer.from(`${id}:secret`).toString('base64')}`,
      },
      ip: HOSTING_IP,
      path: '/oauth/token',
      body: { grant_type: 'client_credentials' },
    });

    const a = await callGetTracker(guard, basic('confidential-a'));
    const b = await callGetTracker(guard, basic('confidential-b'));

    expect(a).not.toBe(b);
  });

  it('discriminates refresh and password-reset callers by their token', async () => {
    const guard = createGuard();

    const refreshA = await callGetTracker(guard, {
      headers: {},
      ip: HOSTING_IP,
      body: { refreshToken: 'rt-aaa' },
    });
    const refreshB = await callGetTracker(guard, {
      headers: {},
      ip: HOSTING_IP,
      body: { refreshToken: 'rt-bbb' },
    });
    const reset = await callGetTracker(guard, {
      headers: {},
      ip: HOSTING_IP,
      body: { token: 'rt-aaa', newPassword: 'x' },
    });

    expect(refreshA).not.toBe(refreshB);
    // Same string under a different field name must not merge two callers.
    expect(refreshA).not.toBe(reset);
  });

  it('falls back to the shared IP for dynamic client registration', async () => {
    // Deliberate: every field of a DCR body is caller-chosen, so keying on one
    // would let a single caller mint unlimited buckets and void the 10/hour cap.
    const guard = createGuard();
    const dcr = (name: string) => ({
      headers: {},
      ip: HOSTING_IP,
      path: '/oauth/register',
      body: { client_name: name, redirect_uris: ['https://x.test/cb'] },
    });

    expect(await callGetTracker(guard, dcr('one'))).toBe(`ip:${HOSTING_IP}`);
    expect(await callGetTracker(guard, dcr('two'))).toBe(`ip:${HOSTING_IP}`);
  });

  it('ignores a non-string identity field rather than bucketing on an object', async () => {
    const guard = createGuard();

    const tracker = await callGetTracker(guard, {
      headers: {},
      ip: HOSTING_IP,
      body: { usernameOrEmail: { $ne: null }, password: 'x' },
    });

    expect(tracker).toBe(`ip:${HOSTING_IP}`);
  });

  it('prefers a valid bearer token over any body field', async () => {
    const token = sign({ sub: 42 }, JWT_SECRET);
    const tracker = await callGetTracker(createGuard(), {
      headers: { authorization: `Bearer ${token}` },
      ip: HOSTING_IP,
      body: { usernameOrEmail: 'someone-else' },
    });

    expect(tracker).toBe('user:42');
  });

  it('survives a request with no body at all', async () => {
    const tracker = await callGetTracker(createGuard(), {
      headers: {},
      ip: HOSTING_IP,
    });

    expect(tracker).toBe(`ip:${HOSTING_IP}`);
  });
});

describe('PerUserThrottlerGuard.shouldSkip', () => {
  it('skips throttling for /api/health (Render health probe)', async () => {
    const skipped = await callShouldSkip(createGuard(), { path: '/api/health' });
    expect(skipped).toBe(true);
  });

  it('skips throttling for /api/health/memory diagnostic', async () => {
    const skipped = await callShouldSkip(createGuard(), { path: '/api/health/memory' });
    expect(skipped).toBe(true);
  });

  it('falls through to ThrottlerGuard.shouldSkip for non-health paths', async () => {
    const skipped = await callShouldSkip(createGuard(), { path: '/api/patients' });
    expect(skipped).toBe(false);
  });

  it('uses req.url when req.path is absent', async () => {
    const skipped = await callShouldSkip(createGuard(), { url: '/api/health' });
    expect(skipped).toBe(true);
  });
});
