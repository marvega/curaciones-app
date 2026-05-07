import { Injectable } from '@nestjs/common';
import { decode } from 'jsonwebtoken';
import { PerUserThrottlerGuard } from '../../common/per-user-throttler.guard';

// OAuth access tokens from oidc-provider always carry client_id (RFC 9068 §2.2).
// SPA session tokens (HS256) never have client_id. This lets us identify OAuth
// tokens without verifying the signature — actual verification happens downstream
// in MultiAuthGuard, so fail-open here is safe.
@Injectable()
export class OAuthClientThrottlerGuard extends PerUserThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const auth = (req.headers as Record<string, unknown>)?.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      const decoded = decode(auth.slice(7), { complete: true });
      const payload = decoded?.payload as Record<string, unknown> | undefined;
      if (payload && typeof payload.client_id === 'string') {
        const clientId = payload.client_id;
        const userId = String(payload.sub ?? 'anon');
        return `oauth:${clientId}:${userId}`;
      }
    }
    return super.getTracker(req);
  }
}
