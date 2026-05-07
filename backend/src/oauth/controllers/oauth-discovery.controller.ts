import { Controller, Req, Res, All } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../auth/public.decorator';
import { OidcProviderSingleton } from '../oidc-provider.singleton';

@Controller()
export class OAuthDiscoveryController {
  constructor(private readonly oidc: OidcProviderSingleton) {}

  @Public()
  @All('/.well-known/oauth-authorization-server')
  asMetadata(@Req() req: Request, @Res() res: Response) {
    // oidc-provider v8 only exposes /.well-known/openid-configuration. RFC 8414
    // (oauth-authorization-server) is a valid subset of the OIDC discovery doc,
    // so we rewrite the URL and serve the same metadata for both endpoints.
    req.url = '/.well-known/openid-configuration';
    return this.oidc.get().callback()(req, res);
  }

  @Public()
  @All('/.well-known/openid-configuration')
  oidcMetadata(@Req() req: Request, @Res() res: Response) {
    return this.oidc.get().callback()(req, res);
  }

  @Public()
  @All('/jwks.json')
  jwks(@Req() req: Request, @Res() res: Response) {
    return this.oidc.get().callback()(req, res);
  }
}
