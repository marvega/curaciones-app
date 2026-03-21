import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditLogService } from './audit-log.service';
import { AuditAction } from './audit-log.entity';

const SKIP_PATHS = [
  '/api/auth/login',
  '/api/health',
  '/api/users/seed',
  '/api/patients/seed',
];

// Paths with their own audit trail: [pattern, method]
const CUSTOM_AUDIT_PATHS: Array<{ pattern: RegExp; method: string }> = [
  { pattern: /^\/api\/curaciones\/\d+$/, method: 'PUT' },       // CuracionEdit
  { pattern: /^\/api\/patients\/\d+\/discharge$/, method: 'POST' },  // PatientStatusChange
  { pattern: /^\/api\/patients\/\d+\/readmit$/, method: 'POST' },    // PatientStatusChange
];

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly auditLogService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, path, body, user, ip } = request;

    // Only audit write operations
    if (!['POST', 'PUT', 'DELETE'].includes(method)) {
      return next.handle();
    }

    // Skip paths that don't need auditing
    if (SKIP_PATHS.includes(path)) {
      return next.handle();
    }

    // Skip paths that have their own audit trail
    if (CUSTOM_AUDIT_PATHS.some((entry) => entry.pattern.test(path) && method === entry.method)) {
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

    // Extract entity name and ID from path
    const pathParts = path.replace('/api/', '').split('/');
    const entity = pathParts[0];
    const entityId = parseInt(pathParts[1], 10) || 0;

    return next.handle().pipe(
      tap((responseBody) => {
        const logEntityId = entityId || responseBody?.id || 0;
        this.auditLogService.log({
          userId: user.id || user.sub,
          username: user.username,
          action,
          entity,
          entityId: logEntityId,
          payload: method !== 'DELETE' ? body : undefined,
          ipAddress: ip,
        }).catch(() => {
          // Audit log failure should not break the request
        });
      }),
    );
  }
}
