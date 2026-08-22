import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { OAuthCleanupController } from './oauth-cleanup.controller';

describe('OAuthCleanupController', () => {
  let cleanup: { runDailyCleanup: jest.Mock };
  let verifier: { verify: jest.Mock };
  let controller: OAuthCleanupController;

  beforeEach(() => {
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
    expect(errors).toHaveLength(3);
    const responses = errors.map((e) => e.getResponse());
    expect(responses).toEqual([responses[0], responses[0], responses[0]]);
    expect(JSON.stringify(responses[0])).not.toContain('aud');
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
