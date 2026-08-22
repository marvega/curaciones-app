import {
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../auth/public.decorator';
import { OAuthCleanupService } from '../services/oauth-cleanup.service';
import { GoogleOidcVerifier } from '../services/google-oidc.verifier';

// Invoked by Cloud Scheduler, which signs an OIDC identity token whose
// audience is this endpoint's URL. Validating that token is what authorises
// the call — no shared secret, so no extra Secret Manager slot.
@Controller('api/internal/oauth-cleanup')
export class OAuthCleanupController {
  constructor(
    private readonly cleanup: OAuthCleanupService,
    private readonly verifier: GoogleOidcVerifier,
  ) {}

  @Public()
  // Unauthenticated and reachable on the public Cloud Run URL, so it stays
  // metered: every request wakes a container and pays a JWKS-backed signature
  // check before it can be rejected. Cloud Scheduler calls this once a day —
  // 10/min is an enormous margin for the job and a ceiling for abuse. The
  // counter advances before, and independently of, the authorisation logic, so
  // the limit is never an oracle for token validity.
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post()
  async run(
    @Headers('authorization') authorization?: string,
  ): Promise<{ status: string }> {
    const match = /^Bearer (.+)$/.exec(authorization ?? '');
    if (!match) throw new UnauthorizedException();

    const audience = process.env.CLEANUP_OIDC_AUDIENCE;
    const expectedAccount = process.env.CLEANUP_SERVICE_ACCOUNT;
    if (!audience || !expectedAccount) throw new UnauthorizedException();

    let email: string | undefined;
    try {
      ({ email } = await this.verifier.verify(match[1], audience));
    } catch {
      throw new UnauthorizedException();
    }
    if (email !== expectedAccount) throw new UnauthorizedException();

    await this.cleanup.runDailyCleanup();
    return { status: 'ok' };
  }
}
