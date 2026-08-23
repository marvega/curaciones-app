import {
  Controller,
  Post,
  Req,
  Res,
  Body,
  BadRequestException,
  All,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../auth/public.decorator';
import { OidcProviderSingleton } from '../oidc-provider.singleton';

const ALLOWED_LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];

function validateRedirectUri(uri: string): void {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new BadRequestException(`Invalid redirect_uri: ${uri}`);
  }
  if (parsed.hash)
    throw new BadRequestException('redirect_uri must not contain fragment');
  if (parsed.protocol === 'https:') return;
  if (parsed.protocol === 'http:' && ALLOWED_LOOPBACK.includes(parsed.hostname))
    return;
  throw new BadRequestException(
    `redirect_uri must be HTTPS (or http loopback): ${uri}`,
  );
}

@Controller('oauth/register')
export class OAuthRegisterController {
  constructor(private readonly oidc: OidcProviderSingleton) {}

  // No @ThrottleIdentity, deliberately. Every field of a DCR body —
  // `client_name`, `redirect_uris`, `software_id` — is invented by the caller
  // and names no pre-existing identity, so declaring any of them would let one
  // caller mint unlimited buckets and void this cap outright, which is what
  // used to happen: before the discriminator became handler-declared, appending
  // a `client_id` field to a registration body turned five requests into five
  // buckets, measured. This endpoint therefore keeps the coarse shared-IP
  // bucket on purpose. It is a real availability limit at cutover — 10
  // registrations per hour for the whole app — and the only thing that lifts it
  // is measuring the true proxy depth via `GET /api/health/proxy` and raising
  // TRUST_PROXY_HOPS. Raising it on a guess reintroduces a forgeable IP, so it
  // stays out of scope.
  @Public()
  @Throttle({ default: { ttl: 60 * 60 * 1000, limit: 10 } })
  @Post()
  async register(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    // body is unverified DCR JSON — Nest forwards it to oidc-provider which
    // does full schema validation; we only pre-screen redirect_uris.
    /* eslint-disable @typescript-eslint/no-unsafe-member-access,
                      @typescript-eslint/no-unsafe-call */
    if (Array.isArray(body?.redirect_uris)) {
      body.redirect_uris.forEach(validateRedirectUri);
    }
    /* eslint-enable @typescript-eslint/no-unsafe-member-access,
                    @typescript-eslint/no-unsafe-call */
    return this.oidc.get().callback()(req, res);
  }

  @Public()
  @All(':client_id')
  manage(@Req() req: Request, @Res() res: Response) {
    return this.oidc.get().callback()(req, res);
  }
}
