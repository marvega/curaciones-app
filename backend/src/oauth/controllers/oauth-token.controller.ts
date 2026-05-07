import { Controller, All, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../auth/public.decorator';
import { OidcProviderSingleton } from '../oidc-provider.singleton';

@Controller('oauth')
export class OAuthTokenController {
  constructor(private readonly oidc: OidcProviderSingleton) {}

  // /oauth/token, /oauth/revoke and /oauth/userinfo all delegate straight into
  // oidc-provider's koa app — same pattern as the authorize controller. The
  // token endpoint is throttled per IP to mitigate brute force on the
  // grant-exchange endpoint (refresh, code, client_credentials, etc.).
  @Public()
  @Throttle({ default: { ttl: 60 * 1000, limit: 60 } })
  @All('token')
  token(@Req() req: Request, @Res() res: Response) {
    return this.oidc.get().callback()(req, res);
  }

  @Public()
  @All('revoke')
  revoke(@Req() req: Request, @Res() res: Response) {
    return this.oidc.get().callback()(req, res);
  }

  @Public()
  @All('userinfo')
  userinfo(@Req() req: Request, @Res() res: Response) {
    return this.oidc.get().callback()(req, res);
  }
}
