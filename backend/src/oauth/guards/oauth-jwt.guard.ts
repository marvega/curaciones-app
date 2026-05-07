import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { OAuthJwtStrategy } from '../strategies/oauth-jwt.strategy';

@Injectable()
export class OAuthJwtGuard implements CanActivate {
  constructor(private readonly strategy: OAuthJwtStrategy) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization || '';
    const m = /^Bearer (.+)$/.exec(auth);
    if (!m) throw new UnauthorizedException('No bearer token');
    const token = m[1];
    const user = await this.strategy.validate(token, req.method);
    (req as any).user = user;
    return true;
  }
}
