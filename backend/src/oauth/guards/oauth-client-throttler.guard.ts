import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerStorage,
} from '@nestjs/throttler';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import { PerUserThrottlerGuard } from '../../common/per-user-throttler.guard';
import { OAuthJwtStrategy } from '../strategies/oauth-jwt.strategy';
import { oauthIssuer } from '../oauth-env';
import { unverifiedIssuer } from '../unverified-issuer';

/**
 * Gives each OAuth client its own rate-limit bucket, keyed on claims this
 * server signed.
 *
 * What this used to do, and why it was worse than no bucketing at all. It read
 * `client_id` and `sub` from `decode()` — a parse, not a verification — and
 * returned `oauth:<client_id>:<sub>`. Since the guard is the global APP_GUARD it
 * runs on every route, so a bearer token with `alg: none` and an invented
 * `client_id` produced a fresh bucket per request everywhere in the app.
 * Measured on this branch before the change, counting the keys handed to
 * ThrottlerStorage over real HTTP:
 *
 *   POST /api/patients   x5, alg:none bearer, rotating client_id  ->  5 buckets
 *   POST /oauth/register x5, alg:none bearer, rotating client_id  ->  5 buckets
 *   POST /api/patients   x5, no bearer at all                     ->  1 bucket
 *
 * The second line is the one that mattered: `/oauth/register` is capped at
 * 10/hour because it writes rows into a publicly reachable table, and a header
 * anyone can type removed the cap. The old comment argued the shortcut was safe
 * because "actual verification happens downstream in MultiAuthGuard, so
 * fail-open here is safe" — true of *authentication*, and irrelevant to rate
 * limiting, which has already made its decision and moved on by the time the
 * 401 is raised.
 *
 * Why verify here rather than key on something else. Three options were on the
 * table:
 *
 *   1. Key the tracker on the token or its hash. Rejected: an attacker mints
 *      unlimited distinct unsigned tokens, so this is the same bug spelled
 *      differently.
 *   2. Stop deriving anything from a bearer and let OAuth traffic fall to the
 *      shared-IP bucket. Closes the hole, but every MCP client in the estate
 *      then shares one bucket behind Firebase Hosting's single egress address,
 *      which makes one chatty client an outage for all of them — the same
 *      global-lockout shape the owner rejected for login.
 *   3. Verify, then key on the verified claims. Chosen.
 *
 * Option 3 costs one `jwt.verify` against a JWKS cached for five minutes on the
 * shared `OAuthJwtStrategy` instance, and only for tokens whose unverified
 * `iss` already claims to be ours — so a forged token bearing someone else's
 * issuer, or an internal SPA token, never reaches the crypto at all. It adds no
 * database traffic beyond what `MultiAuthGuard` was going to do a moment later
 * on the same request.
 *
 * A caller that cannot be verified is not rewarded with a bucket of its own: it
 * falls through to `PerUserThrottlerGuard`, which keys on the route's declared
 * discriminator or the shared IP. That is a tighter cap than a verified caller
 * gets, which is correct — an unverifiable bearer is a request that is about to
 * 401, and there is no reason to give 401-generating traffic per-caller
 * allowances.
 */
@Injectable()
export class OAuthClientThrottlerGuard extends PerUserThrottlerGuard {
  /**
   * Resolved once, at construction, for the same reason `MultiAuthGuard` does
   * it: a production deploy with `OAUTH_ISSUER` unset must fail to boot rather
   * than throw inside a guard on every request.
   */
  private readonly expectedIssuer = oauthIssuer();

  constructor(
    // Param decorators are not inherited, so ThrottlerGuard's own
    // @InjectThrottlerOptions / @InjectThrottlerStorage have to be restated
    // here now that this subclass declares a constructor.
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly oauthTokens: OAuthJwtStrategy,
  ) {
    super(options, storageService, reflector);
  }

  protected async getTracker(
    req: Record<string, any>,
    context?: ExecutionContext,
  ): Promise<string> {
    const verified = await this.verifiedOAuthTracker(req);
    return verified ?? super.getTracker(req, context);
  }

  /**
   * `oauth:<client_id>:<sub>` when the request carries an access token this
   * server actually issued, null otherwise.
   *
   * `client_id` is not optional here even though oidc-provider always emits it
   * (RFC 9068 §2.2): a verified token that somehow lacks it has no client to
   * bucket, and guessing one would merge unrelated clients.
   */
  private async verifiedOAuthTracker(
    req: Record<string, any>,
  ): Promise<string | null> {
    const auth = (req.headers as Record<string, unknown>)?.authorization;
    if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;

    const token = auth.slice(7);
    // Routing only. It decides whether to spend a signature check, never
    // whether to trust anything — see unverified-issuer.ts.
    if (unverifiedIssuer(token) !== this.expectedIssuer) return null;

    let payload;
    try {
      payload = await this.oauthTokens.verifyAccessToken(token);
    } catch (err) {
      // A token that fails verification is an anonymous caller as far as rate
      // limiting is concerned. Anything that is not a verification failure —
      // the signing-key store being unreachable, KMS refusing to decrypt — is
      // not this guard's to absorb, and rethrows.
      if (err instanceof UnauthorizedException) return null;
      throw err;
    }

    const clientId = payload.client_id;
    if (typeof clientId !== 'string') return null;
    return `oauth:${clientId}:${String(payload.sub ?? 'anon')}`;
  }
}
