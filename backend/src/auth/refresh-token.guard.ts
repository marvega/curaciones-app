import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class RefreshTokenGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const token = req.body?.refreshToken;
    if (!token) throw new UnauthorizedException('Missing refresh token');
    try {
      const payload = this.jwt.verify(token, {
        secret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'curaciones-secret-key-change-in-production',
      });
      if (payload.type !== 'refresh') throw new UnauthorizedException();
      req.refreshPayload = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
