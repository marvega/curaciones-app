import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OAuthJwtGuard } from './oauth-jwt.guard';
import { NO_OAUTH_ACCESS_KEY } from '../decorators/no-oauth-access.decorator';
import { oauthIssuer } from '../oauth-env';

@Injectable()
export class MultiAuthGuard implements CanActivate {
  /**
   * Resolved once, here, and not per request. Nest instantiates providers
   * during `app.init()`, so a production deploy with `OAUTH_ISSUER` unset
   * fails to boot — which is the point. Reading it inside `canActivate`
   * would instead turn a deploy-time misconfiguration into a per-request
   * throw, i.e. an app that starts, reports healthy, and 500s on every
   * authenticated call.
   */
  private readonly expectedOauthIss = oauthIssuer();

  constructor(
    private readonly jwt: JwtAuthGuard,
    private readonly oauth: OAuthJwtGuard,
    private readonly reflector: Reflector,
  ) {}

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

    if (issuer === this.expectedOauthIss) {
      // Check if this endpoint explicitly opts out of OAuth
      const noOAuthAccess = this.reflector.getAllAndOverride<boolean>(NO_OAUTH_ACCESS_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]);
      if (noOAuthAccess) {
        throw new UnauthorizedException('OAuth tokens not accepted on this endpoint');
      }

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
