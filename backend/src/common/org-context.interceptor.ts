import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { orgContext } from './org-context';

/**
 * Interceptor variant of org context. Runs AFTER guards (so JwtAuthGuard has
 * already populated `req.user`), wraps the handler call inside
 * `orgContext.run` so downstream service code sees the org id via
 * `getCurrentOrgId()` / `findScoped` / `findOneScoped`.
 *
 * The middleware (`OrgContextMiddleware`) runs before guards and cannot see
 * `req.user`; the interceptor is the actual workhorse for authenticated
 * routes. Middleware is kept for non-auth routes (e.g. health checks).
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
