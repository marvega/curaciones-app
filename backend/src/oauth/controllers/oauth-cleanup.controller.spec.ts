import { UnauthorizedException } from '@nestjs/common';
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
