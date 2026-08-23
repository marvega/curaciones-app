import { Controller, All, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../auth/public.decorator';
import {
  ThrottleIdentity,
  bodyField,
  basicAuthClientId,
} from '../../common/throttle-identity.decorator';
import { OidcProviderSingleton } from '../oidc-provider.singleton';

@Controller('oauth')
export class OAuthTokenController {
  constructor(private readonly oidc: OidcProviderSingleton) {}

  // /oauth/token, /oauth/revoke and /oauth/userinfo all delegate straight into
  // oidc-provider's koa app — same pattern as the authorize controller. The
  // token endpoint is throttled per client to mitigate brute force on the
  // grant-exchange endpoint (refresh, code, client_credentials, etc.).
  //
  // The client is the entity whose request rate this cap is meant to bound, and
  // it identifies itself two ways depending on its type: a public client puts
  // `client_id` in the form body, a confidential one authenticates with HTTP
  // Basic (RFC 6749 §2.3.1). Body first, because a public client sends only
  // that; a confidential client's Basic credential is the fallback. An
  // unregistered `client_id` buys a fresh bucket and nothing else — the request
  // fails `invalid_client`, and an attack that makes progress against a real
  // client necessarily carries that client's id and so stays inside its bucket.
  @Public()
  @Throttle({ default: { ttl: 60 * 1000, limit: 60 } })
  @ThrottleIdentity(bodyField('client_id'), basicAuthClientId())
  @All('token')
  token(@Req() req: Request, @Res() res: Response) {
    return this.oidc.get().callback()(req, res);
  }

  @Public()
  @Throttle({ default: { ttl: 60 * 1000, limit: 60 } })
  @ThrottleIdentity(bodyField('client_id'), basicAuthClientId())
  @All('revoke')
  revoke(@Req() req: Request, @Res() res: Response) {
    return this.oidc.get().callback()(req, res);
  }

  // No declaration on purpose: /oauth/userinfo carries no body and identifies
  // its caller only by bearer token, which OAuthClientThrottlerGuard keys on
  // after verifying it. An unverifiable bearer therefore lands on the shared-IP
  // bucket, which is the correct place for a request that is about to 401.
  @Public()
  @Throttle({ default: { ttl: 60 * 1000, limit: 120 } })
  @All('userinfo')
  userinfo(@Req() req: Request, @Res() res: Response) {
    return this.oidc.get().callback()(req, res);
  }
}
