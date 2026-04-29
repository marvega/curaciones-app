import { SetMetadata, applyDecorators, UseInterceptors, Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { AuditLogService } from './audit-log.service';
import { AuditAction } from './audit-log.entity';
import { v4 as uuid } from 'uuid';

const AUDIT_EVENT_KEY = 'audit:event:name';

export function AuditEvent(eventName: string) {
  return applyDecorators(
    SetMetadata(AUDIT_EVENT_KEY, eventName),
    UseInterceptors(AuditEventInterceptor),
  );
}

@Injectable()
export class AuditEventInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLog: AuditLogService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const eventName = this.reflector.get<string>(AUDIT_EVENT_KEY, ctx.getHandler());
    if (!eventName) return next.handle();

    const req = ctx.switchToHttp().getRequest();
    const { user, ip, headers, body } = req;
    const requestId = headers['x-request-id'] || uuid();
    return next.handle().pipe(
      tap((res) => {
        if (!user?.organizationId) return;
        this.auditLog.log({
          userId: user.id || user.sub,
          username: user.username,
          organizationId: String(user.organizationId),
          action: AuditAction.EVENT,
          entity: eventName,
          entityId: res?.id || 0,
          payload: body,
          afterJson: res ?? null,
          ipAddress: ip,
          userAgent: headers['user-agent'] ?? null,
          requestId,
        }).catch(() => {});
      }),
    );
  }
}
