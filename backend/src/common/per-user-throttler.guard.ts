import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { verify, JwtPayload } from 'jsonwebtoken';

@Injectable()
export class PerUserThrottlerGuard extends ThrottlerGuard {
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
