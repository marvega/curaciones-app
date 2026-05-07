import { MultiAuthGuard } from './multi-auth.guard';
import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

function makePayload(claims: object): string {
  // Build a minimal unsigned JWT (header.payload.signature) where payload is base64url JSON
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${body}.sig`;
}

function makeCtx(authorization: string) {
  const req: any = { headers: { authorization }, method: 'GET' };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => () => null,
    getClass: () => function C() {},
    _req: req,
  } as any;
}

describe('MultiAuthGuard', () => {
  let oauthGuard: { canActivate: jest.Mock };
  let jwtGuard: { canActivate: jest.Mock };
  let reflector: Reflector;
  let guard: MultiAuthGuard;

  beforeEach(() => {
    process.env.OAUTH_ISSUER = 'http://issuer';
    oauthGuard = { canActivate: jest.fn().mockResolvedValue(true) };
    jwtGuard = { canActivate: jest.fn().mockReturnValue(true) };
    reflector = new Reflector();
    guard = new MultiAuthGuard(jwtGuard as any, oauthGuard as any, reflector);
  });

  it('routes to OAuthJwtGuard when token issuer matches OAUTH_ISSUER', async () => {
    const token = makePayload({ iss: 'http://issuer', sub: '12' });
    const ctx = makeCtx(`Bearer ${token}`);
    const ok = await guard.canActivate(ctx);
    expect(ok).toBe(true);
    expect(oauthGuard.canActivate).toHaveBeenCalledTimes(1);
    expect(jwtGuard.canActivate).not.toHaveBeenCalled();
    expect(ctx._req.user?.tokenSource).toBe('oauth');
  });

  it('falls back to JwtAuthGuard when token issuer is missing or different', async () => {
    const token = makePayload({ sub: '12' });
    const ctx = makeCtx(`Bearer ${token}`);
    const ok = await guard.canActivate(ctx);
    expect(ok).toBe(true);
    expect(jwtGuard.canActivate).toHaveBeenCalledTimes(1);
    expect(oauthGuard.canActivate).not.toHaveBeenCalled();
    expect(ctx._req.user?.tokenSource).toBe('internal');
  });

  it('throws when no bearer header is present', async () => {
    const ctx = makeCtx('');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects OAuth token on NoOAuthAccess endpoint', async () => {
    const token = makePayload({ iss: 'http://issuer', sub: '12' });
    const ctx = makeCtx(`Bearer ${token}`);

    // Simulate endpoint marked with @NoOAuthAccess
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    await expect(guard.canActivate(ctx)).rejects.toThrow('OAuth tokens not accepted');
    expect(oauthGuard.canActivate).not.toHaveBeenCalled();
  });
});
