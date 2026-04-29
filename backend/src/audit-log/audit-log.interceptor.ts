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
        const logEntityId = entityId || responseBody?.id || 0;
        this.auditLogService.log({
          userId: user.id || user.sub,
          username: user.username,
          organizationId: String(user.organizationId),
          establishmentId: user.establishmentId ?? null,
          action,
          entity,
          entityId: logEntityId,
          payload: method !== 'DELETE' ? body : undefined,
          afterJson: method !== 'DELETE' ? responseBody : undefined,
          ipAddress: ip,
          userAgent: headers['user-agent'] ?? null,
          requestId,
        }).catch(() => {/* never break the request */});
      }),
    );
  }
}
