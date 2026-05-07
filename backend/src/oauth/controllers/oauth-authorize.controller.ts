import { Controller, All, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../auth/public.decorator';
import { OidcProviderSingleton } from '../oidc-provider.singleton';

@Controller('oauth')
export class OAuthAuthorizeController {
  constructor(private readonly oidc: OidcProviderSingleton) {}

  // Both `/oauth/authorize` and `/oauth/auth` are accepted: the former is the
  // route configured in the oidc-provider factory (and hence advertised by the
  // discovery doc); the latter is a common alias many OAuth client libraries
  // hit by default. Both forward straight into oidc-provider's koa app.

  @Public()
  @All('authorize')
  authorize(@Req() req: Request, @Res() res: Response) {
    return this.oidc.get().callback()(req, res);
  }

  @Public()
  @All('auth')
  authAlias(@Req() req: Request, @Res() res: Response) {
    return this.oidc.get().callback()(req, res);
  }
}
