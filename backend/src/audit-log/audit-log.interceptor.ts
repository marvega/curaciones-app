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
 * Response fields that must never reach `audit_logs`.
 *
 * `afterJson` is plaintext `jsonb` and every row is hash-chained, so a secret
 * that lands there cannot be scrubbed later without invalidating the chain
 * (`npm run audit:verify`). Redacting on the way in is the only option.
 *
 * Declare the field here rather than adding the route to SKIP_PATHS: skipping
 * would erase the audit record of the request itself, and in a clinical system
 * who did what and when is precisely what the trail exists to answer. The
 * marker keeps the redaction visible in the row instead of silently dropping
 * the key.
 *
 * `pattern` is matched against `req.path` — `/api/...` prefix included, no query
 * string. `fields` are top-level keys of the response body.
 */
const REDACTED_RESPONSE_FIELDS: Array<{
  pattern: RegExp;
  method: string;
  fields: string[];
}> = [
  // acceptUrl embeds the raw invitation token, valid for 7 days and good for the
  // invited role — including OWNER. Invitation itself stores only a SHA-256
  // tokenHash (invitation.entity.ts), so the audit row would be the one place
  // the plaintext survives.
  {
    pattern: /^\/api\/org\/invitations$/,
    method: 'POST',
    fields: ['acceptUrl'],
  },
];

/**
 * Returns a copy of `body` with every field declared in REDACTED_RESPONSE_FIELDS
 * for this route replaced by REDACTED_MARKER, or `body` itself when no rule
 * applies. Never mutates the caller's object — the client still gets the real
 * response.
 */
export function redactResponseBody<T>(
  method: string,
  path: string,
  body: T,
): T {
  const rules = REDACTED_RESPONSE_FIELDS.filter(
    (r) => r.method === method && r.pattern.test(path),
  );
  if (rules.length === 0) {
    return body;
  }
  // A declared rule that cannot be applied is a misdeclaration, not a runtime
  // condition to absorb: passing the body through unredacted is exactly the leak
  // the rule exists to prevent, so fail loudly instead.
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error(
      `Audit redaction is declared for ${method} ${path} but the response body ` +
        `is ${Array.isArray(body) ? 'an array' : String(body)}, not an object`,
    );
  }
  const redacted: Record<string, unknown> = {
    ...(body as unknown as Record<string, unknown>),
  };
  for (const rule of rules) {
    for (const field of rule.fields) {
      if (field in redacted) {
        redacted[field] = REDACTED_MARKER;
      }
    }
  }
  return redacted as T;
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
    if (CUSTOM_AUDIT_PATHS.some((e) => e.pattern.test(path) && method === e.method)) {
      return next.handle();
    }
    if (!user) {
      return next.handle();
    }

    const action = method === 'POST'
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
        this.auditLogService.log({
          userId: user.id || user.sub,
          username: user.username,
          organizationId: String(user.organizationId),
          establishmentId: user.establishmentId ?? null,
          action,
          entity,
          entityId: logEntityId,
          payload: method !== 'DELETE' ? body : undefined,
          afterJson:
            method !== 'DELETE'
              ? redactResponseBody(method, path, responseBody)
              : undefined,
          ipAddress: ip,
          userAgent: headers['user-agent'] ?? null,
          requestId,
        }).catch(() => {/* never break the request */});
      }),
    );
  }
}
