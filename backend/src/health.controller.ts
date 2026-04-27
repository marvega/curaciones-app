import { Controller, Get, Headers, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

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
}
