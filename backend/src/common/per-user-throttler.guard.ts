import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { verify, JwtPayload } from 'jsonwebtoken';
import { createHash } from 'crypto';
import {
  THROTTLE_IDENTITY_KEY,
  ThrottleIdentitySource,
} from './throttle-identity.decorator';

// Health-check paths the platform probes frequently. Throttling these returns
// 429, which the platform interprets as "unhealthy" and restarts the
// container — caused our prod crash-loop.
const ALWAYS_SKIP_PATHS = new Set(['/api/health', '/api/health/memory']);

/**
 * A stable, non-reversible stand-in for an identity, safe to use as a
 * rate-limit key.
 *
 * Hashed for two reasons: some declared discriminators are secrets (refresh and
 * reset tokens) and the rest are PII (a username, an email) in a clinical
 * system, and a throttler key is not a place either belongs. The field name is
 * folded in so that the same string arriving under two different names cannot
 * merge two callers into one bucket.
 *
 * Lower-cased because the lookups behind these fields are case-insensitive:
 * `findUserByUsernameOrEmail` hashes the email with `email.toLowerCase()`
 * (auth.service.ts:37), so `A@B.cl` and `a@b.cl` are the same account. Without
 * this, case-rotating one email would hand an attacker a fresh 5-per-minute
 * bucket per spelling against a single account, which is the forgeable-IP bug in
 * a different costume.
 */
function fingerprint(field: string, value: string): string {
  return createHash('sha256')
    .update(`${field}:${value.trim().toLowerCase()}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * The client_id from an HTTP Basic credential, which is how a confidential OAuth
 * client authenticates at the token endpoint (RFC 6749 §2.3.1).
 *
 * The value is used exactly as sent, without percent-decoding: decoding is what
 * §2.3.1 asks of the authorization server, but this is only a bucket label, and
 * a malformed sequence would make `decodeURIComponent` throw inside a guard and
 * turn a bad header into a 500. The same client always sends the same encoding,
 * which is all a discriminator needs.
 */
function basicAuthClientId(req: Record<string, any>): string | null {
  const headers = req.headers as Record<string, unknown> | undefined;
  const auth = headers?.authorization;
  if (typeof auth !== 'string' || !auth.startsWith('Basic ')) return null;
  const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  const clientId = separator === -1 ? decoded : decoded.slice(0, separator);
  return clientId.trim() === '' ? null : clientId;
}

/**
 * Reads one declared source out of the request, or null when this request does
 * not carry it.
 *
 * Only strings count. A caller may send `{"usernameOrEmail": {...}}`, and an
 * object coerced into a key would bucket every such caller together.
 */
function readSource(
  req: Record<string, any>,
  source: ThrottleIdentitySource,
): string | null {
  switch (source.kind) {
    case 'body': {
      const body: unknown = req.body;
      if (body === null || typeof body !== 'object') return null;
      const value = (body as Record<string, unknown>)[source.field];
      if (typeof value !== 'string' || value.trim() === '') return null;
      return fingerprint(source.field, value);
    }
    case 'basic-auth-client-id': {
      const clientId = basicAuthClientId(req);
      return clientId === null ? null : fingerprint('client_id', clientId);
    }
    default:
      // Exhaustiveness, enforced by the compiler: a new source kind must be
      // handled here rather than silently reading as "no discriminator", which
      // would degrade a route's cap without any test noticing.
      return assertNever(source);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled ThrottleIdentitySource: ${JSON.stringify(value)}`);
}

@Injectable()
export class PerUserThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const path = typeof req?.path === 'string' ? req.path : req?.url;
    if (path && ALWAYS_SKIP_PATHS.has(path)) return true;
    return super.shouldSkip(context);
  }

  /**
   * The rate-limit bucket for this request.
   *
   * `context` is declared optional only because `@nestjs/throttler`'s
   * `ThrottlerGuard.getTracker` is typed `(req) => Promise<string>` in its
   * `.d.ts`, and an override cannot add a required parameter to a narrower base
   * signature. At runtime the argument is always present — see the three
   * independent confirmations in `getRequiredContext` — so a missing one is a
   * broken assumption, not a case to degrade around, and it throws.
   */
  protected async getTracker(
    req: Record<string, any>,
    context?: ExecutionContext,
  ): Promise<string> {
    const ctx = getRequiredContext(context);

    const auth = req.headers?.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      const token = auth.slice(7);
      const secret =
        process.env.JWT_SECRET || 'curaciones-secret-key-change-in-production';
      try {
        // A real signature check, not a decode: the subject below is used as a
        // bucket label, so it has to be one this server issued.
        const payload = verify(token, secret) as JwtPayload;
        if (payload && payload.sub !== undefined) {
          return `user:${payload.sub}`;
        }
      } catch {
        // invalid/expired token — fall through to the anonymous tracker
      }
    }
    return this.anonymousTracker(req, ctx);
  }

  /**
   * The bucket for a caller with no usable bearer token.
   *
   * The IP stays in the key even though it is currently the same value for every
   * caller through Hosting. It costs nothing while it is constant, and it means
   * that the day TRUST_PROXY_HOPS is raised to the measured depth, these buckets
   * tighten from per-identity to per-(client, identity) with no further change
   * here. `ThrottlerGuard.generateKey` already folds in the controller class and
   * handler name, so a caller's login bucket and forgot-password bucket are
   * distinct without this tracker having to say so.
   *
   * Falling back to the IP is a real availability limit on a route that
   * declares no discriminator — behind Firebase Hosting `req.ip` is one shared
   * egress address, so that route's cap is app-wide. The only thing that lifts
   * it is measuring the true proxy depth via `GET /api/health/proxy` and raising
   * TRUST_PROXY_HOPS; guessing at it reintroduces a forgeable IP, so it stays
   * out of scope here.
   */
  protected anonymousTracker(
    req: Record<string, any>,
    context: ExecutionContext,
  ): string {
    const ip = typeof req.ip === 'string' ? req.ip : 'unknown';
    const identity = this.declaredIdentity(req, context);
    return identity === null ? `ip:${ip}` : `ip:${ip}|id:${identity}`;
  }

  /**
   * The caller's identity according to the handler's own `@ThrottleIdentity`
   * declaration, or null when the handler declares none or the request does not
   * carry what it declared.
   *
   * Nothing here inspects the request for anything the route did not name, which
   * is the whole point: an undeclared field cannot influence the bucket.
   */
  private declaredIdentity(
    req: Record<string, any>,
    context: ExecutionContext,
  ): string | null {
    const sources = this.reflector.getAllAndOverride<
      ThrottleIdentitySource[] | undefined
    >(THROTTLE_IDENTITY_KEY, [context.getHandler(), context.getClass()]);
    if (sources === undefined) return null;

    for (const source of sources) {
      const identity = readSource(req, source);
      if (identity !== null) return identity;
    }
    return null;
  }
}

/**
 * The ExecutionContext `@nestjs/throttler` passes to `getTracker` at runtime,
 * despite its `.d.ts` declaring the method as taking only `req`.
 *
 * Three independent confirmations, all against the pinned 6.5.0 in this repo:
 *
 * 1. `dist/throttler.guard.js:114` — `const tracker = await getTracker(req,
 *    context);`
 * 2. `dist/throttler.guard.js:57` — the `getTracker` it calls is
 *    `this.getTracker.bind(this)` whenever the module options do not override
 *    it, i.e. this very method.
 * 3. `dist/throttler-module-options.interface.d.ts:35` — the library's own
 *    public type for that value is
 *    `(req: Record<string, any>, context: ExecutionContext) => …`, with
 *    `context` **required**. The narrower method signature in
 *    `throttler.guard.d.ts:19` is the outlier.
 *
 * And a fourth, which is the one that will keep being checked: the contract
 * test in `per-user-throttler.guard.spec.ts` drives the real
 * `ThrottlerGuard.canActivate` and asserts the override receives an
 * ExecutionContext. If a future upgrade drops the argument, that test fails in
 * CI rather than this guard silently losing every route's discriminator.
 */
function getRequiredContext(
  context: ExecutionContext | undefined,
): ExecutionContext {
  if (context === undefined) {
    throw new Error(
      'PerUserThrottlerGuard.getTracker was called without an ExecutionContext. ' +
        '@nestjs/throttler passes one at throttler.guard.js:114; if that has ' +
        'changed, the per-route @ThrottleIdentity declarations cannot be read ' +
        'and every declared route would silently collapse onto the shared-IP ' +
        'bucket. Fix the call path rather than defaulting the argument.',
    );
  }
  return context;
}
