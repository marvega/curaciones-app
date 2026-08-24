import { Reflector } from '@nestjs/core';
import { OAuthScopeGuard } from './oauth-scope.guard';

function makeCtx(user: any, response: any = { setHeader: jest.fn() }) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => response,
    }),
    getHandler: () => () => null,
    getClass: () => function C() {},
  } as any;
}

describe('OAuthScopeGuard', () => {
  let reflector: Reflector;
  let guard: OAuthScopeGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new OAuthScopeGuard(reflector);
  });

  it('skips when no scopes required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(makeCtx({ tokenSource: 'oauth', scopes: [] }))).toBe(true);
  });

  it('skips when token is internal JWT (not oauth)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['patients:write']);
    expect(guard.canActivate(makeCtx({ tokenSource: 'internal' }))).toBe(true);
  });

  it('passes when scope present', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['patients:read']);
    expect(guard.canActivate(makeCtx({ tokenSource: 'oauth', scopes: ['patients:read'] }))).toBe(true);
  });

  it('write implies read', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['patients:read']);
    expect(guard.canActivate(makeCtx({ tokenSource: 'oauth', scopes: ['patients:write'] }))).toBe(true);
  });

  it('throws insufficient_scope when missing', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['patients:write']);
    const setHeader = jest.fn();
    expect(() => guard.canActivate(makeCtx({ tokenSource: 'oauth', scopes: ['patients:read'] }, { setHeader })))
      .toThrow(/insufficient_scope/);
    expect(setHeader).toHaveBeenCalledWith('WWW-Authenticate', expect.stringContaining('insufficient_scope'));
  });
});
