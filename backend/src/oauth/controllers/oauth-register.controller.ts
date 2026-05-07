import {
  Controller, Post, Req, Res, Body, BadRequestException, All,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../auth/public.decorator';
import { OidcProviderSingleton } from '../oidc-provider.singleton';

const ALLOWED_LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];

function validateRedirectUri(uri: string): void {
  let parsed: URL;
  try { parsed = new URL(uri); } catch { throw new BadRequestException(`Invalid redirect_uri: ${uri}`); }
  if (parsed.hash) throw new BadRequestException('redirect_uri must not contain fragment');
  if (parsed.protocol === 'https:') return;
  if (parsed.protocol === 'http:' && ALLOWED_LOOPBACK.includes(parsed.hostname)) return;
  throw new BadRequestException(`redirect_uri must be HTTPS (or http loopback): ${uri}`);
}

@Controller('oauth/register')
export class OAuthRegisterController {
  constructor(private readonly oidc: OidcProviderSingleton) {}

  @Public()
  @Throttle({ default: { ttl: 60 * 60 * 1000, limit: 10 } })
  @Post()
  async register(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    if (Array.isArray(body?.redirect_uris)) {
      body.redirect_uris.forEach(validateRedirectUri);
    }
    return this.oidc.get().callback()(req, res);
  }

  @Public()
  @All(':client_id')
  manage(@Req() req: Request, @Res() res: Response) {
    return this.oidc.get().callback()(req, res);
  }
}
