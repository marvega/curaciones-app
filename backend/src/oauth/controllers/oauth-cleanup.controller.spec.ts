import 'reflect-metadata';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { OAuthCleanupController } from './oauth-cleanup.controller';

describe('OAuthCleanupController', () => {
  let cleanup: { runDailyCleanup: jest.Mock };
  let verifier: { verify: jest.Mock };
  let controller: OAuthCleanupController;
  let warn: jest.SpyInstance;
  let logged: string[];

  beforeEach(() => {
    logged = [];
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((message: unknown) => {
        logged.push(String(message));
      });
    cleanup = { runDailyCleanup: jest.fn().mockResolvedValue(undefined) };
    verifier = { verify: jest.fn() };
    controller = new OAuthCleanupController(
      cleanup as never,
      verifier as never,
    );
    process.env.CLEANUP_OIDC_AUDIENCE =
      'https://api.example/api/internal/oauth-cleanup';
    process.env.CLEANUP_SERVICE_ACCOUNT =
      'scheduler@proj.iam.gserviceaccount.com';
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('rejects a request with no bearer token', async () => {
    await expect(controller.run(undefined)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(cleanup.runDailyCleanup).not.toHaveBeenCalled();
  });

  it('rejects a token from an unexpected service account', async () => {
    verifier.verify.mockResolvedValue({
      email: 'someone-else@proj.iam.gserviceaccount.com',
    });
    await expect(controller.run('Bearer tok')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(cleanup.runDailyCleanup).not.toHaveBeenCalled();
  });

  it('runs the cleanup for a valid token', async () => {
    verifier.verify.mockResolvedValue({
      email: 'scheduler@proj.iam.gserviceaccount.com',
    });
    await expect(controller.run('Bearer tok')).resolves.toEqual({
      status: 'ok',
    });
    expect(verifier.verify).toHaveBeenCalledWith(
      'tok',
      'https://api.example/api/internal/oauth-cleanup',
    );
    expect(cleanup.runDailyCleanup).toHaveBeenCalledTimes(1);
  });

  // The route is @Public() and reachable on the public Cloud Run URL, so every
  // path that is not a positively verified Scheduler token must fail closed.
  it.each([
    ['empty header', ''],
    ['no scheme', 'tok'],
    ['wrong scheme', 'Basic dXNlcjpwYXNz'],
    ['bearer with no token', 'Bearer '],
    ['lowercase scheme', 'bearer tok'],
  ])(
    'rejects a malformed authorization header (%s)',
    async (_label, header) => {
      await expect(controller.run(header)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(verifier.verify).not.toHaveBeenCalled();
      expect(cleanup.runDailyCleanup).not.toHaveBeenCalled();
    },
  );

  // Bad signature, wrong `aud`, wrong `iss` and structurally invalid JWTs all
  // surface as a throw out of jose; none of them may reach the cleanup.
  it('rejects when the verifier throws', async () => {
    verifier.verify.mockRejectedValue(
      new Error('signature verification failed'),
    );
    await expect(controller.run('Bearer tok')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(cleanup.runDailyCleanup).not.toHaveBeenCalled();
  });

  it('rejects a verified token that carries no email claim', async () => {
    verifier.verify.mockResolvedValue({});
    await expect(controller.run('Bearer tok')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(cleanup.runDailyCleanup).not.toHaveBeenCalled();
  });

  it.each(['CLEANUP_OIDC_AUDIENCE', 'CLEANUP_SERVICE_ACCOUNT'])(
    'fails closed when %s is unset',
    async (name) => {
      delete process.env[name];
      verifier.verify.mockResolvedValue({
        email: 'scheduler@proj.iam.gserviceaccount.com',
      });
      await expect(controller.run('Bearer tok')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(verifier.verify).not.toHaveBeenCalled();
      expect(cleanup.runDailyCleanup).not.toHaveBeenCalled();
    },
  );

  it('never discloses why authorization failed', async () => {
    verifier.verify.mockRejectedValue(
      new Error('unexpected "aud" claim value'),
    );
    const errors: UnauthorizedException[] = [];
    for (const header of [undefined, 'Basic x', 'Bearer tok']) {
      await controller
        .run(header)
        .catch((e: UnauthorizedException) => errors.push(e));
    }
    // A validly signed token refused only on identity must be
    // indistinguishable from the rest, even though it now logs too.
    verifier.verify.mockResolvedValue({
      email: 'someone-else@proj.iam.gserviceaccount.com',
    });
    await controller
      .run('Bearer tok')
      .catch((e: UnauthorizedException) => errors.push(e));

    expect(errors).toHaveLength(4);
    const responses = errors.map((e) => e.getResponse());
    expect(responses).toEqual(responses.map(() => responses[0]));
    expect(JSON.stringify(responses[0])).not.toContain('aud');
    expect(JSON.stringify(responses[0])).not.toContain('someone-else');
    // Both reasons went to the log, neither to the caller.
    expect(logged).toHaveLength(2);
  });

  // The one rejection that means a validly signed Google token with the right
  // audience was refused purely on identity — a service account change we did
  // not follow, or someone else's Google identity aimed here. It used to be the
  // only failure mode that left no trace anywhere.
  it('logs the service account that was presented', async () => {
    verifier.verify.mockResolvedValue({
      email: 'someone-else@proj.iam.gserviceaccount.com',
    });
    await expect(controller.run('Bearer tok')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(logged).toEqual([
      'Cleanup token rejected: unexpected service account ' +
        'someone-else@proj.iam.gserviceaccount.com',
    ]);
  });

  it('logs a verified token with no email claim as <none>', async () => {
    verifier.verify.mockResolvedValue({});
    await expect(controller.run('Bearer tok')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(logged).toEqual([
      'Cleanup token rejected: unexpected service account <none>',
    ]);
  });

  it('never logs the token on an identity mismatch', async () => {
    verifier.verify.mockResolvedValue({ email: 'someone-else@proj.example' });
    await expect(
      controller.run('Bearer eyJhbGciOiJSUzI1NiJ9.SUPER-SECRET-TOKEN.sig'),
    ).rejects.toThrow(UnauthorizedException);
    expect(logged).toHaveLength(1);
    expect(logged[0]).not.toContain('SUPER-SECRET');
  });

  it('cannot be used to forge log records through the email claim', async () => {
    verifier.verify.mockResolvedValue({
      email: 'a@b\n2026-08-22 WARN [Auth] cleanup succeeded',
    });
    await expect(controller.run('Bearer tok')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(logged[0]).not.toContain('\n');
    expect(logged[0]).toBe(
      'Cleanup token rejected: unexpected service account ' +
        'a@b 2026-08-22 WARN [Auth] cleanup succeeded',
    );
  });

  // A lazily imported jose turns a boot-time crash into a per-request
  // rejection, so the reason has to reach the operator even though it never
  // reaches the caller.
  it('logs why a verified token was rejected', async () => {
    const joseError = Object.assign(new Error('unexpected "aud" claim value'), {
      name: 'JWTClaimValidationFailed',
      code: 'ERR_JWT_CLAIM_VALIDATION_FAILED',
    });
    verifier.verify.mockRejectedValue(joseError);
    await expect(controller.run('Bearer tok')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(logged).toHaveLength(1);
    expect(logged[0]).toBe(
      'Cleanup token rejected: JWTClaimValidationFailed ' +
        '[ERR_JWT_CLAIM_VALIDATION_FAILED]: unexpected "aud" claim value',
    );
  });

  it('logs the underlying cause when the JWKS endpoint is unreachable', async () => {
    const fetchFailed = new TypeError('fetch failed');
    fetchFailed.cause = Object.assign(
      new Error('getaddrinfo ENOTFOUND www.googleapis.com'),
      { code: 'ENOTFOUND' },
    );
    verifier.verify.mockRejectedValue(fetchFailed);
    await expect(controller.run('Bearer tok')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(logged[0]).toBe(
      'Cleanup token rejected: TypeError: fetch failed (cause: ENOTFOUND)',
    );
  });

  it('never logs the token', async () => {
    verifier.verify.mockRejectedValue(
      new Error('signature verification failed'),
    );
    await expect(
      controller.run('Bearer eyJhbGciOiJSUzI1NiJ9.SUPER-SECRET-TOKEN.sig'),
    ).rejects.toThrow(UnauthorizedException);
    expect(logged).toHaveLength(1);
    expect(logged[0]).not.toContain('SUPER-SECRET');
  });

  it('collapses the reason to one line so it cannot forge log records', async () => {
    verifier.verify.mockRejectedValue(
      new Error('boom\n2026-08-22 WARN [Auth] cleanup succeeded'),
    );
    await expect(controller.run('Bearer tok')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(logged[0]).not.toContain('\n');
    expect(logged[0]).toBe(
      'Cleanup token rejected: Error: boom 2026-08-22 WARN [Auth] cleanup succeeded',
    );
  });
});

// ThrottlerGuard reads its config from metadata on the route handler. Rather
// than hardcode @nestjs/throttler's internal metadata keys, mint the expected
// metadata with the same decorators on probe methods and compare — that way the
// assertion keeps working if the library renames a key.
class ThrottleProbe {
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  route(): void {}
}

class SkipProbe {
  @SkipThrottle()
  route(): void {}
}

// The decorators store their metadata on the method itself, which is where
// ThrottlerGuard reads it from via the route handler.
function metadataOf(prototype: object, method: string): Map<string, unknown> {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, method);
  if (!descriptor) throw new Error(`${method} is not an own property`);
  const target = descriptor.value as object;
  const keys = Reflect.getMetadataKeys(target) as string[];
  return new Map(
    keys.map((k) => [k, Reflect.getMetadata(k, target) as unknown]),
  );
}

describe('OAuthCleanupController throttling', () => {
  const route = metadataOf(OAuthCleanupController.prototype, 'run');

  it('is rate limited at 10 requests per minute', () => {
    const expected = metadataOf(ThrottleProbe.prototype, 'route');
    expect(expected.size).toBeGreaterThan(0);
    for (const [key, value] of expected) {
      expect([key, route.get(key)]).toEqual([key, value]);
    }
  });

  it('does not skip the throttler', () => {
    const skipKeys = [...metadataOf(SkipProbe.prototype, 'route').keys()];
    expect(skipKeys.length).toBeGreaterThan(0);
    for (const key of skipKeys) {
      expect(route.has(key)).toBe(false);
    }
  });
});
