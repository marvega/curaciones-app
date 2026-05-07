import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_SCOPES_KEY } from '../decorators/required-scopes.decorator';

@Injectable()
export class OAuthScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(REQUIRED_SCOPES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user || user.tokenSource !== 'oauth') return true; // internal JWT bypasses

    const granted = new Set<string>(user.scopes ?? []);
    const hasAll = required.every(
      (s) => granted.has(s) || (s.endsWith(':read') && granted.has(s.replace(':read', ':write'))),
    );
    if (hasAll) return true;

    const missing = required.find(
      (s) => !granted.has(s) && !(s.endsWith(':read') && granted.has(s.replace(':read', ':write'))),
    )!;
    const res = ctx.switchToHttp().getResponse();
    res.setHeader('WWW-Authenticate', `Bearer error="insufficient_scope" scope="${missing}"`);
    throw new ForbiddenException({
      error: 'insufficient_scope',
      scope: missing,
      message: `insufficient_scope: ${missing}`,
    });
  }
}
