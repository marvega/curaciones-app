import { Controller, Get, Headers, NotFoundException, Req, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';

@ApiTags('Health')
@SkipThrottle()
@Controller('api/health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('memory')
  memory(@Headers('x-health-token') token?: string) {
    const expected = process.env.HEALTH_TOKEN;
    if (!expected) throw new NotFoundException();
    if (token !== expected) throw new UnauthorizedException();

    const m = process.memoryUsage();
    const mb = (n: number) => Math.round((n / 1024 / 1024) * 100) / 100;
    return {
      timestamp: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
      pid: process.pid,
      memoryMB: {
        rss: mb(m.rss),
        heapTotal: mb(m.heapTotal),
        heapUsed: mb(m.heapUsed),
        external: mb(m.external),
        arrayBuffers: mb(m.arrayBuffers),
      },
    };
  }

  /**
   * Reports the proxy chain this process actually receives, so the correct
   * `TRUST_PROXY_HOPS` can be measured on a Firebase preview channel instead
   * of guessed. Call it from a machine whose public IP you know:
   *
   *   curl -H "x-health-token: $HEALTH_TOKEN" \
   *        -H "x-forwarded-for: 192.0.2.1" \
   *        https://<channel>.web.app/api/health/proxy
   *
   * `xForwardedFor` is the raw chain. `192.0.2.1` is the planted value: count
   * how many entries sit to its right — that count is the number of hops the
   * infrastructure appends, and `TRUST_PROXY_HOPS` must not exceed it.
   * `ip` must never come back as `192.0.2.1`.
   *
   * Gated on the same HEALTH_TOKEN as /memory (a plain env var, not a
   * Secret Manager entry) and 404s when unset, so it does not exist at all on
   * a deploy that has not opted in.
   */
  @Get('proxy')
  proxy(@Req() req: Request, @Headers('x-health-token') token?: string) {
    const expected = process.env.HEALTH_TOKEN;
    if (!expected) throw new NotFoundException();
    if (token !== expected) throw new UnauthorizedException();

    return {
      trustProxySetting: req.app.get('trust proxy') as unknown,
      xForwardedFor: req.headers['x-forwarded-for'] ?? null,
      xForwardedProto: req.headers['x-forwarded-proto'] ?? null,
      // Present when the Firebase Hosting edge (Fastly) is in front of us.
      // Reported for completeness only: Fastly documents that it does not
      // protect this header from client modification, so it must not be
      // trusted as an identity.
      fastlyClientIp: req.headers['fastly-client-ip'] ?? null,
      ip: req.ip,
      ips: req.ips,
      protocol: req.protocol,
    };
  }
}
