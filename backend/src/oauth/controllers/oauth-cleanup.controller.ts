import {
  Controller,
  Headers,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../auth/public.decorator';
import { OAuthCleanupService } from '../services/oauth-cleanup.service';
import { GoogleOidcVerifier } from '../services/google-oidc.verifier';

// Collapsed to a single line so that a hostile string can't forge extra log
// records, and capped so it can't flood them.
function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').slice(0, 300);
}

// Describes a rejection for the operator without ever touching the token: the
// error's own identity only. One level of `cause` is included because that is
// where `fetch` keeps the actionable part (`TypeError: fetch failed` alone says
// nothing).
function describeFailure(err: unknown): string {
  if (!(err instanceof Error)) return `non-error rejection (${typeof err})`;
  const code = (err as { code?: unknown }).code;
  const head = typeof code === 'string' ? `${err.name} [${code}]` : err.name;
  const cause = err.cause;
  let tail = '';
  if (cause instanceof Error) {
    const causeCode = (cause as { code?: unknown }).code;
    tail = ` (cause: ${typeof causeCode === 'string' ? causeCode : cause.message})`;
  }
  return oneLine(`${head}: ${err.message}${tail}`);
}

// Invoked by Cloud Scheduler, which signs an OIDC identity token whose
// audience is this endpoint's URL. Validating that token is what authorises
// the call — no shared secret, so no extra Secret Manager slot.
@Controller('api/internal/oauth-cleanup')
export class OAuthCleanupController {
  private readonly logger = new Logger(OAuthCleanupController.name);

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
    if (!audience || !expectedAccount) {
      // Operationally the likeliest failure of all: it needs no attacker and no
      // infrastructure fault, only a deploy missing two --set-env-vars entries.
      // Silent, it is an endpoint that refuses Cloud Scheduler forever while
      // looking exactly like a probe. Nothing here is attacker-controlled — it
      // is our own configuration — so naming the variable is safe and turns a
      // mystery into a one-minute fix. Its own prefix, because unlike a
      // rejected token this means *every* future call fails: worth alerting on.
      const missing: string[] = [];
      if (!audience) missing.push('CLEANUP_OIDC_AUDIENCE');
      if (!expectedAccount) missing.push('CLEANUP_SERVICE_ACCOUNT');
      this.logger.warn(`Cleanup misconfigured: unset ${missing.join(', ')}`);
      throw new UnauthorizedException();
    }

    let email: string | undefined;
    try {
      ({ email } = await this.verifier.verify(match[1], audience));
    } catch (err) {
      // jose is imported lazily (see the verifier), so a module-resolution
      // failure or blocked egress to Google's JWKS endpoint arrives here as a
      // per-request rejection instead of a crash at boot. Without this line it
      // would be indistinguishable from a bad token and the daily cleanup would
      // fail silently forever. The response is deliberately unchanged: the 401
      // stays byte-identical across every failure mode.
      this.logger.warn(`Cleanup token rejected: ${describeFailure(err)}`);
      throw new UnauthorizedException();
    }
    if (email !== expectedAccount) {
      // The only rejection that means a validly signed Google token, carrying
      // the right audience, was refused purely on identity: either a service
      // account change we did not follow, or someone with a real Google
      // identity aiming it here. Both need to be visible. The presented address
      // is an identifier the caller chose, not a secret — and it is what tells
      // those two cases apart. The expected value stays out of the log; it is
      // readable from the service's own config.
      this.logger.warn(
        `Cleanup token rejected: unexpected service account ${oneLine(email ?? '<none>')}`,
      );
      throw new UnauthorizedException();
    }

    await this.cleanup.runDailyCleanup();
    return { status: 'ok' };
  }
}
