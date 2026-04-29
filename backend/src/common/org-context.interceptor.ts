import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { orgContext } from './org-context';

/**
 * Org context interceptor. Runs AFTER guards (so JwtAuthGuard has already
 * populated `req.user`), wraps the handler call inside `orgContext.run` so
 * downstream service code sees the org id via `getCurrentOrgId()` /
 * `findScoped` / `findOneScoped`. Canonical and only source of org context;
 * a middleware variant was removed because middleware runs before guards
 * and cannot see `req.user`.
 */
@Injectable()
export class OrgContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req: any = context.switchToHttp().getRequest();
    const organizationId: string | undefined = req?.user?.organizationId;
    if (!organizationId) {
      return next.handle();
    }
    return new Observable((subscriber) => {
      orgContext.run({ organizationId: String(organizationId) }, () => {
        next.handle().subscribe({
          next: (v) => subscriber.next(v),
          error: (e) => subscriber.error(e),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
