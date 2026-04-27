import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { verify, JwtPayload } from 'jsonwebtoken';

// Health-check paths the platform (Render) probes frequently. Throttling
// these returns 429, which Render interprets as "unhealthy" and restarts
// the container — caused our prod crash-loop.
const ALWAYS_SKIP_PATHS = new Set(['/api/health', '/api/health/memory']);

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
        // invalid/expired token — fall through to IP
      }
    }
    return req.ip;
  }
}
