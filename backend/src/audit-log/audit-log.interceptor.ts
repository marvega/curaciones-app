import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { v4 as uuid } from 'uuid';
import { AuditLogService } from './audit-log.service';
import { AuditAction } from './audit-log.entity';

const SKIP_PATHS = [
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/invitations/preview',
  '/api/auth/invitations/accept',
  '/api/health',
  '/api/users/seed',
  '/api/patients/seed',
  '/api/inventory/products/import',
];

const CUSTOM_AUDIT_PATHS: Array<{ pattern: RegExp; method: string }> = [
  { pattern: /^\/api\/curaciones\/\d+$/, method: 'PUT' },
  { pattern: /^\/api\/patients\/\d+\/discharge$/, method: 'POST' },
  { pattern: /^\/api\/patients\/\d+\/readmit$/, method: 'POST' },
];

export const REDACTED_MARKER = '[REDACTED]';

/**
 * Field names that must never reach `audit_logs`, redacted wherever they appear
 * in an audited request body or response body.
 *
 * Both columns are plaintext `jsonb` and every row is hash-chained, so a secret
 * that lands there cannot be scrubbed later without invalidating the chain
 * (`npm run audit:verify`). Redacting on the way in is the only option.
 *
 * Declare the field here rather than adding the route to SKIP_PATHS: skipping
 * would erase the audit record of the request itself, and in a clinical system
 * who did what and when is precisely what the trail exists to answer. The
 * marker keeps the redaction visible in the row instead of silently dropping
 * the key.
 *
 * Why this is keyed on the field name alone and not on `method` + a route
 * pattern, which is what it used to be. Express is mounted with its defaults,
 * so `strict routing` and `case sensitive routing` are both off: `POST
 * /api/org/invitations`, `/api/org/invitations/` and `/api/org/Invitations` all
 * reach the same handler and all return 200, and `req.path` hands the
 * interceptor back whichever spelling the caller used. An anchored,
 * case-sensitive `/^\/api\/org\/invitations$/` therefore matched exactly one of
 * the three, and adding a trailing slash was enough to write the cleartext
 * invitation token into `afterJson` — permanently. Tightening the regex to
 * `/^\/api\/org\/invitations\/?$/i` closes those two spellings, but it leaves
 * the shape intact: the next sensitive field declared here has to get its own
 * pattern right against the same routing defaults, and a pattern that is merely
 * too narrow fails open, silently, into an append-only table.
 *
 * A field name has no such degrees of freedom. It also covers the case route
 * scoping structurally cannot: the same field returned by a second endpoint —
 * a bulk invite, a resend, an error body that echoes the request — is redacted
 * the day that endpoint is written rather than the day someone remembers to add
 * a rule. The asymmetry justifies the bluntness: over-redacting costs one
 * field's value in the trail, under-redacting persists a live credential that
 * grants the invited role, up to and including OWNER.
 *
 * Names here must therefore be specific enough that redacting them anywhere is
 * always right. `acceptUrl` qualifies; a name like `url` or `token` would not,
 * which is why `token` is absent even though several unauthenticated routes
 * carry one — those routes are never audited (their callers have no `user`), so
 * the generic name buys nothing and would blind the trail on any future
 * endpoint that legitimately logs a non-secret `token` field.
 */
const REDACTED_FIELDS: ReadonlySet<string> = new Set([
  // acceptUrl embeds the raw invitation token, valid for 7 days and good for the
  // invited role — including OWNER. Invitation itself stores only a SHA-256
  // tokenHash (invitation.entity.ts), so the audit row would be the one place
  // the plaintext survives.
  'acceptUrl',

  // --- Request bodies. Reached only now that `payload` is redacted too; until
  // this commit `payload: body` bypassed this set entirely and every name below
  // was being written to the table in cleartext on live traffic. Verified by
  // running the interceptor over each route's real body shape.

  // POST /api/auth/change-password (ChangePasswordDto). Two cleartext
  // passwords, one of them still valid at the moment it is logged. `users`
  // stores only a bcrypt hash, so the audit row would be the only place either
  // plaintext exists.
  'currentPassword',
  'newPassword',
  // POST /api/users (CreateUserDto.password), and the same name in
  // InvitationAcceptDto. `password` is unambiguous wherever it appears.
  'password',
  // POST /api/auth/logout (RefreshDto.refreshToken). A live refresh token: the
  // route revokes the session it names, but the row outlives the request and
  // `refresh_tokens` stores only a SHA-256 tokenHash.
  'refreshToken',
  // The snake_case spelling OAuth bodies use. No audited route carries it
  // today; it is here because the two spellings of one credential must not
  // depend on which endpoint happens to be audited next.
  'refresh_token',
  // POST /api/consent. The patient's handwritten signature as a
  // `data:image/png;base64,…` URL. Not in the brief's list, and the worst of
  // them: `consent_signatures` deliberately stores only a `filename` and writes
  // the image to disk (consent.service.ts), so the audit row is the one place
  // the image bytes would enter the database — hash-chained, unscrubbable, and
  // a reusable artifact for forging a signed consent on any other document.
  'signature',

  // --- Response bodies beyond acceptUrl.

  // POST /api/auth/switch-org returns { accessToken } — a live bearer JWT,
  // authenticated and audited, and this set already covered `afterJson`, so
  // this one was leaking through the redaction that shipped rather than around
  // it. POST /api/auth/invitations/accept returns the same field.
  'accessToken',
  'access_token',
  // DCR issues a client_secret. /oauth/register is unauthenticated so nothing
  // audits it today, but a client-management endpoint under /api/org is the
  // obvious next step and this is the name it will use.
  'client_secret',
  'clientSecret',
]);

/**
 * True for a container this function may take apart and rebuild.
 *
 * An object that defines its own `toJSON` decides its own serialized form —
 * `Date` becomes an ISO string, `Buffer` a `{type,data}` pair — so rebuilding it
 * from `Object.entries` would silently change what the `jsonb` column stores
 * (`Object.entries(new Date())` is `[]`). Those are returned untouched; no
 * declared field name can hide inside one.
 */
function isTraversable(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  return typeof (value as { toJSON?: unknown }).toJSON !== 'function';
}

function redactValue(value: unknown, done: WeakMap<object, unknown>): unknown {
  if (!isTraversable(value)) return value;

  // Repeated and circular references: hand back the copy already made for this
  // object so a second reference cannot smuggle an unredacted duplicate through,
  // and so a cycle terminates. The copy is registered before it is filled, which
  // is what makes the cyclic case reach a fixed point.
  const seen = done.get(value);
  if (seen !== undefined) return seen;

  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    done.set(value, copy);
    for (const item of value) copy.push(redactValue(item, done));
    return copy;
  }

  const copy: Record<string, unknown> = {};
  done.set(value, copy);
  for (const [key, item] of Object.entries(value)) {
    copy[key] = REDACTED_FIELDS.has(key)
      ? REDACTED_MARKER
      : redactValue(item, done);
  }
  return copy;
}

/**
 * Returns a copy of `body` with every field named in REDACTED_FIELDS replaced by
 * REDACTED_MARKER, at any depth. Never mutates the caller's object — neither the
 * client's response (the interceptor reads the stream through `tap` and cannot
 * alter what it emits) nor `req.body`, which later middleware and the handler
 * itself still need intact.
 *
 * A primitive body is returned as-is: there is no field in it to redact. The one
 * shape this cannot see is a secret returned as a bare string rather than under
 * a name, which no field rule can catch and which would be a deliberate change
 * to a handler's contract.
 */
export function redactAuditedBody<T>(body: T): T {
  return redactValue(body, new WeakMap()) as T;
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly auditLogService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, path, body, user, ip, headers } = req;

    if (!['POST', 'PUT', 'DELETE'].includes(method)) {
      return next.handle();
    }
    if (SKIP_PATHS.includes(path)) {
      return next.handle();
    }
    if (
      CUSTOM_AUDIT_PATHS.some(
        (e) => e.pattern.test(path) && method === e.method,
      )
    ) {
      return next.handle();
    }
    if (!user) {
      return next.handle();
    }

    const action =
      method === 'POST'
        ? AuditAction.CREATE
        : method === 'PUT'
          ? AuditAction.UPDATE
          : AuditAction.DELETE;

    const pathParts = path.replace('/api/', '').split('/');
    const entity = pathParts[0];
    const entityId = parseInt(pathParts[1], 10) || 0;
    const requestId: string = headers['x-request-id'] || uuid();

    return next.handle().pipe(
      tap((responseBody) => {
        // `responseBody` is untyped and a bigint primary key (Invitation,
        // Organization, …) arrives here as a *string*. AuditLog.entityId is an
        // `int` column, so a string would be hashed into payloadHash as `"1"` but
        // read back out of Postgres as `1`, leaving the row permanently
        // unverifiable by `npm run audit:verify`. Normalise at this boundary so
        // the hashed value is the value the column stores.
        const logEntityId = entityId || Number(responseBody?.id) || 0;
        this.auditLogService
          .log({
            userId: user.id || user.sub,
            username: user.username,
            organizationId: String(user.organizationId),
            establishmentId: user.establishmentId ?? null,
            action,
            entity,
            entityId: logEntityId,
            // Both columns go through the same redaction. `payload` used to be
            // written raw, which put cleartext passwords, a live refresh token
            // and a patient's signature image into a hash-chained table on every
            // ordinary day of use.
            payload: method !== 'DELETE' ? redactAuditedBody(body) : undefined,
            afterJson:
              method !== 'DELETE' ? redactAuditedBody(responseBody) : undefined,
            ipAddress: ip,
            userAgent: headers['user-agent'] ?? null,
            requestId,
          })
          .catch(() => {
            /* never break the request */
          });
      }),
    );
  }
}
