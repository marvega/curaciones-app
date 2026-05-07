import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OAuthJwtGuard } from './oauth-jwt.guard';

@Injectable()
export class MultiAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtAuthGuard, private readonly oauth: OAuthJwtGuard) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const auth: string = req.headers.authorization || '';
    const m = /^Bearer (.+)$/.exec(auth);
    if (!m) throw new UnauthorizedException('No bearer token');

    // Decide which strategy by inspecting the issuer claim
    let issuer: string | undefined;
    try {
      const [, payloadB64] = m[1].split('.');
      const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      issuer = decoded?.iss;
    } catch {
      /* malformed */
    }

    const expectedOauthIss = process.env.OAUTH_ISSUER || 'http://localhost:3000';
    if (issuer === expectedOauthIss) {
      const ok = await this.oauth.canActivate(ctx);
      if (ok) {
        (req.user ??= {}).tokenSource = 'oauth';
      }
      return ok;
    }

    // fall back to internal JWT
    const ok = await Promise.resolve(this.jwt.canActivate(ctx) as any);
    if (ok) {
      (req.user ??= {}).tokenSource = 'internal';
    }
    return !!ok;
  }
}
