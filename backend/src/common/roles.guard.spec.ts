import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function mkContext(user: { role?: string } | null, reflectorRoles: string[] | null) {
  const reflector = { get: jest.fn(() => reflectorRoles) } as unknown as Reflector;
  const ctx = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return { ctx, reflector };
}

describe('RolesGuard', () => {
  it('allows when no roles required', () => {
    const { ctx, reflector } = mkContext({ role: 'user' }, null);
    expect(new RolesGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it('allows when user role matches required', () => {
    const { ctx, reflector } = mkContext({ role: 'admin' }, ['admin']);
    expect(new RolesGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it('rejects when user role does not match', () => {
    const { ctx, reflector } = mkContext({ role: 'user' }, ['admin']);
    expect(new RolesGuard(reflector).canActivate(ctx)).toBe(false);
  });

  it('rejects when no user on request', () => {
    const { ctx, reflector } = mkContext(null, ['admin']);
    expect(new RolesGuard(reflector).canActivate(ctx)).toBe(false);
  });
});
