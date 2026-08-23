import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { verify, JwtPayload } from 'jsonwebtoken';
import { createHash } from 'crypto';

// Health-check paths the platform (Render) probes frequently. Throttling
// these returns 429, which Render interprets as "unhealthy" and restarts
// the container — caused our prod crash-loop.
const ALWAYS_SKIP_PATHS = new Set(['/api/health', '/api/health/memory']);

/**
 * Request-body field names that identify an otherwise anonymous caller, in
 * priority order.
 *
 * Why this exists. `req.ip` is not a per-caller value here. `trust proxy` is 1
 * (see trust-proxy.ts, deliberately, because the real chain depth is still
 * unmeasured), so `req.ip` is the right-most `X-Forwarded-For` element — the
 * address of the last proxy in front of this container. `firebase.json` routes
 * `/api/**` through Firebase Hosting, so for every user of the app that element
 * is one and the same Hosting egress address. Falling back to it collapsed every
 * unauthenticated caller into a single bucket, and `POST /api/auth/login` is
 * capped at 5/minute in production (auth.controller.ts): one clinic, one bucket,
 * and any single caller — or one user mistyping a password — locks out everyone
 * else for the rest of the minute. Login is unauthenticated by definition, so the
 * "every authenticated request is already keyed on user:<sub>" argument for
 * tolerating a coarse IP does not cover the routes where the cap actually bites.
 *
 * Why field names and not a route table. The same reason the audit redaction
 * rule is keyed on a field name (audit-log.interceptor.ts): Express runs with
 * `strict routing` and `case sensitive routing` off, so a route pattern silently
 * fails to match spellings that reach the handler anyway. A field name present
 * in the parsed body cannot be missed that way, and a route that grows a second
 * spelling or a second mount point keeps its discriminator.
 *
 * Order matters only where a body carries more than one of these. `/oauth/token`
 * with `grant_type=refresh_token` carries both `client_id` and `refresh_token`;
 * `client_id` wins because the client is the entity whose request rate the cap
 * is meant to bound, and it is stable across that client's requests.
 */
const ANON_IDENTITY_FIELDS = [
  // POST /oauth/token, POST /oauth/revoke. Claiming an arbitrary client_id gets
  // a fresh bucket, but the attempt then fails as invalid_client; an attack that
  // makes progress against a real client necessarily carries that client's id.
  'client_id',
  // POST /api/auth/login (LoginDto.usernameOrEmail).
  'usernameOrEmail',
  // POST /api/auth/forgot-password (ForgotPasswordDto.email).
  'email',
  // POST /api/auth/refresh (RefreshDto.refreshToken).
  'refreshToken',
  'refresh_token',
  // POST /api/auth/reset-password, POST /api/auth/invitations/{preview,accept}.
  'token',
] as const;

/**
 * A stable, non-reversible stand-in for an identity, safe to use as a
 * rate-limit key.
 *
 * Hashed for two reasons: half of ANON_IDENTITY_FIELDS are secrets (refresh and
 * reset tokens) and the other half are PII (a username, an email) in a clinical
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
 * Identifies an anonymous caller, or null when the request carries nothing that
 * distinguishes one caller from another.
 *
 * Null is the honest answer for dynamic client registration (`POST
 * /oauth/register`, 10/hour): every field in a DCR body — `client_name`,
 * `redirect_uris`, `software_id` — is chosen by the caller, so keying on any of
 * them would let one caller mint unlimited buckets and remove the cap outright.
 * That endpoint therefore keeps the coarse shared-IP bucket on purpose. It is a
 * real availability limit at cutover (10 registrations per hour for the whole
 * app) and the only thing that lifts it is measuring the true proxy depth via
 * `GET /api/health/proxy` and raising TRUST_PROXY_HOPS — deliberately out of
 * scope here, because raising it on a guess reintroduces the forgeable IP.
 */
function anonymousIdentity(req: Record<string, any>): string | null {
  const body: unknown = req.body;
  if (body !== null && typeof body === 'object') {
    const fields = body as Record<string, unknown>;
    for (const field of ANON_IDENTITY_FIELDS) {
      const value = fields[field];
      // Only strings. A caller may send `{"usernameOrEmail": {...}}`, and an
      // object coerced into a key would bucket every such caller together.
      if (typeof value === 'string' && value.trim() !== '') {
        return fingerprint(field, value);
      }
    }
  }
  const clientId = basicAuthClientId(req);
  return clientId === null ? null : fingerprint('client_id', clientId);
}

@Injectable()
export class PerUserThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const path = typeof req?.path === 'string' ? req.path : req?.url;
    if (path && ALWAYS_SKIP_PATHS.has(path)) return true;
    return super.shouldSkip(context);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const auth = req.headers?.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      const token = auth.slice(7);
      const secret =
        process.env.JWT_SECRET || 'curaciones-secret-key-change-in-production';
      try {
        const payload = verify(token, secret) as JwtPayload;
        if (payload && payload.sub !== undefined) {
          return `user:${payload.sub}`;
        }
      } catch {
        // invalid/expired token — fall through to the anonymous tracker
      }
    }
    return this.anonymousTracker(req);
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
   */
  protected anonymousTracker(req: Record<string, any>): string {
    const ip = typeof req.ip === 'string' ? req.ip : 'unknown';
    const identity = anonymousIdentity(req);
    return identity === null ? `ip:${ip}` : `ip:${ip}|id:${identity}`;
  }
}
