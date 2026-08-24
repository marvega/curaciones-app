import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerStorage } from '@nestjs/throttler';
import { sign } from 'jsonwebtoken';
import { PerUserThrottlerGuard } from './per-user-throttler.guard';
import {
  ThrottleIdentity,
  ThrottleIdentitySource,
  bodyField,
  basicAuthClientId,
} from './throttle-identity.decorator';

const JWT_SECRET = 'test-secret-do-not-use-in-prod';

function createGuard(): PerUserThrottlerGuard {
  return new PerUserThrottlerGuard(
    { throttlers: [{ name: 'default', ttl: 60000, limit: 100 }] },
    {} as any,
    new Reflector(),
  );
}

/**
 * A context whose handler carries the given declaration, built the way Nest
 * builds one: the metadata goes on a real method via the real decorator, so the
 * test exercises `@ThrottleIdentity` and `Reflector` rather than a hand-written
 * metadata key that could drift from either.
 */
function contextDeclaring(
  ...sources: ThrottleIdentitySource[]
): ExecutionContext {
  class StubController {
    handler(): void {}
  }
  if (sources.length > 0) {
    const descriptor = Object.getOwnPropertyDescriptor(
      StubController.prototype,
      'handler',
    )!;
    ThrottleIdentity(...sources)(
      StubController.prototype,
      'handler',
      descriptor,
    );
  }
  return {
    getHandler: () => StubController.prototype.handler,
    getClass: () => StubController,
  } as unknown as ExecutionContext;
}

/** A context for a handler that declares nothing. */
const undeclared = () => contextDeclaring();

function callGetTracker(
  guard: PerUserThrottlerGuard,
  req: Record<string, any>,
  context: ExecutionContext,
): Promise<string> {
  return (guard as any).getTracker(req, context);
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
    const token = sign(
      { sub: 42, username: 'nurse', role: 'user' },
      JWT_SECRET,
    );
    const req = {
      headers: { authorization: `Bearer ${token}` },
      ip: '10.0.0.1',
    };

    const tracker = await callGetTracker(createGuard(), req, undeclared());

    expect(tracker).toBe('user:42');
  });

  it('returns IP when there is no Authorization header', async () => {
    const req = { headers: {}, ip: '10.0.0.1' };

    const tracker = await callGetTracker(createGuard(), req, undeclared());

    expect(tracker).toBe('ip:10.0.0.1');
  });

  it('returns IP when the JWT signature is invalid', async () => {
    const tamperedToken = sign({ sub: 42 }, 'wrong-secret');
    const req = {
      headers: { authorization: `Bearer ${tamperedToken}` },
      ip: '10.0.0.1',
    };

    const tracker = await callGetTracker(createGuard(), req, undeclared());

    expect(tracker).toBe('ip:10.0.0.1');
  });

  it('returns IP when the Authorization header is malformed', async () => {
    const req = {
      headers: { authorization: 'NotBearer xyz' },
      ip: '10.0.0.1',
    };

    const tracker = await callGetTracker(createGuard(), req, undeclared());

    expect(tracker).toBe('ip:10.0.0.1');
  });

  it('returns IP when the JWT is expired', async () => {
    const expiredToken = sign({ sub: 42 }, JWT_SECRET, { expiresIn: '-1h' });
    const req = {
      headers: { authorization: `Bearer ${expiredToken}` },
      ip: '10.0.0.1',
    };

    const tracker = await callGetTracker(createGuard(), req, undeclared());

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

  // Mirrors AuthController.login's declaration.
  const loginCtx = () => contextDeclaring(bodyField('usernameOrEmail'));

  function loginReq(
    usernameOrEmail: string,
    extra: Record<string, unknown> = {},
  ) {
    return {
      headers: {},
      ip: HOSTING_IP,
      path: '/api/auth/login',
      body: { usernameOrEmail, password: 'irrelevant', ...extra },
    };
  }

  it('gives two different login attempts two different buckets', async () => {
    const guard = createGuard();
    const ctx = loginCtx();

    const nurse = await callGetTracker(guard, loginReq('cynthia'), ctx);
    const admin = await callGetTracker(guard, loginReq('admin'), ctx);

    expect(nurse).not.toBe(admin);
  });

  it('does not let one account exhaust another account’s login bucket', async () => {
    // The clinic-wide lockout, stated as an invariant: no matter how many
    // distinct users log in from the same egress IP, no two share a bucket.
    const guard = createGuard();
    const ctx = loginCtx();
    const users = ['admin', 'cynthia', 'marcelo', 'kine1', 'tens@cesfam.cl'];

    const trackers = await Promise.all(
      users.map((u) => callGetTracker(guard, loginReq(u), ctx)),
    );

    expect(new Set(trackers).size).toBe(users.length);
  });

  it('gives the same account the same bucket across attempts', async () => {
    // The other half of the property: brute force against one account must
    // still be capped, so repeated attempts have to land on one bucket.
    const guard = createGuard();
    const ctx = loginCtx();

    const first = await callGetTracker(guard, loginReq('admin'), ctx);
    const second = await callGetTracker(guard, loginReq('admin'), ctx);

    expect(first).toBe(second);
  });

  it('treats case and surrounding space as the same account', async () => {
    // findUserByUsernameOrEmail hashes the email with toLowerCase()
    // (auth.service.ts:37), so these are one account. If they were three
    // buckets, case-rotation would multiply the 5-per-minute cap at will.
    const guard = createGuard();
    const ctx = loginCtx();

    const trackers = await Promise.all([
      callGetTracker(guard, loginReq('tens@cesfam.cl'), ctx),
      callGetTracker(guard, loginReq('Tens@CESFAM.cl'), ctx),
      callGetTracker(guard, loginReq('  tens@cesfam.cl  '), ctx),
    ]);

    expect(new Set(trackers).size).toBe(1);
  });

  it('never puts the submitted identity in the key in cleartext', async () => {
    const tracker = await callGetTracker(
      createGuard(),
      loginReq('tens@cesfam.cl'),
      loginCtx(),
    );

    expect(tracker).not.toContain('tens@cesfam.cl');
    expect(tracker).not.toContain('cesfam');
  });

  it('keys the token endpoint on client_id, in preference to the Basic credential', async () => {
    // Mirrors OAuthTokenController.token: body first, Basic as the fallback.
    const guard = createGuard();
    const ctx = contextDeclaring(bodyField('client_id'), basicAuthClientId());
    const base = { headers: {}, ip: HOSTING_IP, path: '/oauth/token' };

    const a = await callGetTracker(
      guard,
      {
        ...base,
        body: {
          grant_type: 'refresh_token',
          client_id: 'mcp-a',
          refresh_token: 'rt-1',
        },
      },
      ctx,
    );
    const b = await callGetTracker(
      guard,
      {
        ...base,
        body: {
          grant_type: 'refresh_token',
          client_id: 'mcp-b',
          refresh_token: 'rt-2',
        },
      },
      ctx,
    );
    // Same client, rotated refresh token: still one bucket, because
    // `refresh_token` is not declared and cannot influence the key.
    const aAgain = await callGetTracker(
      guard,
      {
        ...base,
        body: {
          grant_type: 'refresh_token',
          client_id: 'mcp-a',
          refresh_token: 'rt-9',
        },
      },
      ctx,
    );

    expect(a).not.toBe(b);
    expect(a).toBe(aAgain);
  });

  it('reads client_id out of an HTTP Basic credential', async () => {
    const guard = createGuard();
    const ctx = contextDeclaring(bodyField('client_id'), basicAuthClientId());
    const basic = (id: string) => ({
      headers: {
        authorization: `Basic ${Buffer.from(`${id}:secret`).toString('base64')}`,
      },
      ip: HOSTING_IP,
      path: '/oauth/token',
      body: { grant_type: 'client_credentials' },
    });

    const a = await callGetTracker(guard, basic('confidential-a'), ctx);
    const b = await callGetTracker(guard, basic('confidential-b'), ctx);

    expect(a).not.toBe(b);
  });

  it('discriminates refresh and password-reset callers by their declared field', async () => {
    const guard = createGuard();

    const refreshCtx = contextDeclaring(bodyField('refreshToken'));
    const resetCtx = contextDeclaring(bodyField('token'));

    const refreshA = await callGetTracker(
      guard,
      { headers: {}, ip: HOSTING_IP, body: { refreshToken: 'rt-aaa' } },
      refreshCtx,
    );
    const refreshB = await callGetTracker(
      guard,
      { headers: {}, ip: HOSTING_IP, body: { refreshToken: 'rt-bbb' } },
      refreshCtx,
    );
    const reset = await callGetTracker(
      guard,
      {
        headers: {},
        ip: HOSTING_IP,
        body: { token: 'rt-aaa', newPassword: 'x' },
      },
      resetCtx,
    );

    expect(refreshA).not.toBe(refreshB);
    // Same string under a different field name must not merge two callers.
    expect(refreshA).not.toBe(reset);
  });

  it('falls back to the shared IP for a route that declares nothing', async () => {
    // Deliberate for dynamic client registration: every field of a DCR body is
    // caller-chosen, so declaring one would let a single caller mint unlimited
    // buckets and void the 10/hour cap.
    const guard = createGuard();
    const dcr = (name: string) => ({
      headers: {},
      ip: HOSTING_IP,
      path: '/oauth/register',
      body: { client_name: name, redirect_uris: ['https://x.test/cb'] },
    });

    expect(await callGetTracker(guard, dcr('one'), undeclared())).toBe(
      `ip:${HOSTING_IP}`,
    );
    expect(await callGetTracker(guard, dcr('two'), undeclared())).toBe(
      `ip:${HOSTING_IP}`,
    );
  });

  it('ignores a non-string declared field rather than bucketing on an object', async () => {
    const guard = createGuard();

    const tracker = await callGetTracker(
      guard,
      {
        headers: {},
        ip: HOSTING_IP,
        body: { usernameOrEmail: { $ne: null }, password: 'x' },
      },
      loginCtx(),
    );

    expect(tracker).toBe(`ip:${HOSTING_IP}`);
  });

  it('prefers a valid bearer token over any body field', async () => {
    const token = sign({ sub: 42 }, JWT_SECRET);
    const tracker = await callGetTracker(
      createGuard(),
      {
        headers: { authorization: `Bearer ${token}` },
        ip: HOSTING_IP,
        body: { usernameOrEmail: 'someone-else' },
      },
      loginCtx(),
    );

    expect(tracker).toBe('user:42');
  });

  it('survives a request with no body at all', async () => {
    const tracker = await callGetTracker(
      createGuard(),
      { headers: {}, ip: HOSTING_IP },
      loginCtx(),
    );

    expect(tracker).toBe(`ip:${HOSTING_IP}`);
  });
});

/**
 * The bypass, at the unit level. The e2e counterpart in
 * `test/throttler-tracker-declaration.e2e-spec.ts` counts the same thing over
 * real HTTP with the real ValidationPipe; this one states the rule directly.
 */
describe('PerUserThrottlerGuard.getTracker — undeclared fields cannot influence the bucket', () => {
  const HOSTING_IP = '35.201.10.7';
  const loginCtx = () => contextDeclaring(bodyField('usernameOrEmail'));

  it('ignores client_id on the login route', async () => {
    // The measured bypass: `client_id` led the old body-sniffing list, so five
    // logins carrying five random client_ids consumed five buckets instead of
    // one and the per-account cap was gone.
    const guard = createGuard();
    const ctx = loginCtx();
    const attempt = (clientId: string) =>
      callGetTracker(
        guard,
        {
          headers: {},
          ip: HOSTING_IP,
          path: '/api/auth/login',
          body: {
            client_id: clientId,
            usernameOrEmail: 'admin',
            password: 'x',
          },
        },
        ctx,
      );

    const trackers = await Promise.all(
      ['a', 'b', 'c', 'd', 'e'].map((c) => attempt(c)),
    );

    expect(new Set(trackers).size).toBe(1);
  });

  it('ignores every other name the old list honoured, and one it did not', async () => {
    const guard = createGuard();
    const ctx = loginCtx();
    const inventions: Array<Record<string, unknown>> = [
      {},
      { client_id: 'x' },
      { token: 'x' },
      { email: 'x@y.cl' },
      { refreshToken: 'x' },
      { refresh_token: 'x' },
      { entirely_made_up: 'x' },
    ];

    const trackers = await Promise.all(
      inventions.map((extra) =>
        callGetTracker(
          guard,
          {
            headers: {},
            ip: HOSTING_IP,
            body: { usernameOrEmail: 'admin', password: 'x', ...extra },
          },
          ctx,
        ),
      ),
    );

    expect(new Set(trackers).size).toBe(1);
  });

  it('gives no bucket at all to a body field on an undeclared route', async () => {
    const guard = createGuard();
    const trackers = await Promise.all(
      ['a', 'b', 'c'].map((c) =>
        callGetTracker(
          guard,
          {
            headers: {},
            ip: HOSTING_IP,
            body: { client_id: c, usernameOrEmail: c },
          },
          undeclared(),
        ),
      ),
    );

    expect(new Set(trackers)).toEqual(new Set([`ip:${HOSTING_IP}`]));
  });
});

/**
 * The library contract this guard depends on and the published types do not
 * state: `ThrottlerGuard` calls `getTracker(req, context)`.
 *
 * `throttler.guard.d.ts:19` declares the method as `(req) => Promise<string>`,
 * which is why the override takes `context` as optional. The runtime truth is
 * `dist/throttler.guard.js:114` (`await getTracker(req, context)`), reached via
 * `dist/throttler.guard.js:57` (`commonOptions.getTracker ??=
 * this.getTracker.bind(this)`), and the library's own public type for that
 * value — `ThrottlerGetTrackerFunction` in
 * `throttler-module-options.interface.d.ts:35` — declares `context` as
 * **required**.
 *
 * Reading source is a point-in-time check; this is the standing one. It drives
 * the real inherited `canActivate`, so an upgrade that stopped passing the
 * argument fails here instead of silently collapsing every `@ThrottleIdentity`
 * route onto the shared-IP bucket.
 */
describe('@nestjs/throttler passes the ExecutionContext to getTracker', () => {
  it('hands the override a real ExecutionContext as its second argument', async () => {
    const storage: ThrottlerStorage = {
      increment: async () => ({
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      }),
    };
    const guard = new PerUserThrottlerGuard(
      { throttlers: [{ name: 'default', ttl: 60000, limit: 100 }] },
      storage,
      new Reflector(),
    );
    // The spy goes on before onModuleInit, because that hook is where the
    // library captures `this.getTracker.bind(this)` into its options
    // (dist/throttler.guard.js:57). It delegates, so the assertion is about the
    // real override being called with a real context, not a stub standing in
    // for it.
    const spy = jest.spyOn(guard as any, 'getTracker');
    await guard.onModuleInit();

    class StubController {
      handler(): void {}
    }
    const req = { headers: {}, ip: '10.0.0.1', body: {} };
    const context = {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({ header: () => undefined }),
      }),
      getHandler: () => StubController.prototype.handler,
      getClass: () => StubController,
    } as unknown as ExecutionContext;

    await guard.canActivate(context);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]).toHaveLength(2);
    expect(spy.mock.calls[0][1]).toBe(context);
    // And the real implementation ran to completion with it.
    await expect(spy.mock.results[0].value).resolves.toBe('ip:10.0.0.1');
  });

  it('throws rather than degrading when the context is absent', async () => {
    // Fail-fast: without a context there is no declaration to read, and every
    // declared route would silently lose its discriminator. A loud failure is
    // the only honest option, and the test above is what keeps it unreachable.
    await expect(
      (createGuard() as any).getTracker({ headers: {}, ip: '10.0.0.1' }),
    ).rejects.toThrow(/without an ExecutionContext/);
  });
});

describe('PerUserThrottlerGuard.shouldSkip', () => {
  it('skips throttling for /api/health (platform health probe)', async () => {
    const skipped = await callShouldSkip(createGuard(), {
      path: '/api/health',
    });
    expect(skipped).toBe(true);
  });

  it('skips throttling for /api/health/memory diagnostic', async () => {
    const skipped = await callShouldSkip(createGuard(), {
      path: '/api/health/memory',
    });
    expect(skipped).toBe(true);
  });

  it('falls through to ThrottlerGuard.shouldSkip for non-health paths', async () => {
    const skipped = await callShouldSkip(createGuard(), {
      path: '/api/patients',
    });
    expect(skipped).toBe(false);
  });

  it('uses req.url when req.path is absent', async () => {
    const skipped = await callShouldSkip(createGuard(), { url: '/api/health' });
    expect(skipped).toBe(true);
  });
});

describe('@ThrottleIdentity', () => {
  it('refuses a declaration with no sources', () => {
    // A route that means "per IP" says so by carrying no decorator; an empty
    // decorator is a typo that would silently mean the same thing.
    expect(() => ThrottleIdentity()).toThrow(/at least one source/);
  });

  it('refuses an empty body field name', () => {
    expect(() => bodyField('  ')).toThrow(/requires a field name/);
  });
});
