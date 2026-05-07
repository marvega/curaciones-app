import {
  Controller,
  Post,
  Req,
  Res,
  Body,
  BadRequestException,
  All,
  OnApplicationBootstrap,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../auth/public.decorator';
import { OidcProviderSingleton } from '../oidc-provider.singleton';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditAction } from '../../audit-log/audit-log.entity';

const ALLOWED_LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];

function validateRedirectUri(uri: string): void {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new BadRequestException(`Invalid redirect_uri: ${uri}`);
  }
  if (parsed.hash)
    throw new BadRequestException('redirect_uri must not contain fragment');
  if (parsed.protocol === 'https:') return;
  if (parsed.protocol === 'http:' && ALLOWED_LOOPBACK.includes(parsed.hostname))
    return;
  throw new BadRequestException(
    `redirect_uri must be HTTPS (or http loopback): ${uri}`,
  );
}

@Controller('oauth/register')
export class OAuthRegisterController implements OnApplicationBootstrap {
  private readonly logger = new Logger(OAuthRegisterController.name);

  constructor(
    private readonly oidc: OidcProviderSingleton,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Hook into oidc-provider's `registration_create.success` event after the
   * provider has been built (it doesn't exist at construction time — see
   * OidcProviderSingleton.onApplicationBootstrap). DCR is `@Public()` so we
   * have no authenticated user — log under a `system` placeholder.
   */
  onApplicationBootstrap(): void {
    try {
      const provider = this.oidc.get() as unknown as {
        on: (event: string, listener: (...args: any[]) => void) => void;
      };
      provider.on('registration_create.success', (ctx: any, client: any) => {
        /* eslint-disable @typescript-eslint/no-unsafe-member-access,
                          @typescript-eslint/no-unsafe-assignment */
        const clientId: string | null =
          client?.clientId ?? ctx?.oidc?.body?.client_id ?? null;
        const clientName: string | null =
          client?.clientName ?? ctx?.oidc?.body?.client_name ?? null;
        const ipAddress: string | undefined = ctx?.request?.ip;
        /* eslint-enable @typescript-eslint/no-unsafe-member-access,
                         @typescript-eslint/no-unsafe-assignment */
        void this.auditLog
          .log({
            userId: 0,
            username: 'system',
            organizationId: '0',
            action: AuditAction.EVENT,
            entity: 'oauth.client.registered',
            entityId: 0,
            afterJson: { clientId, clientName },
            ipAddress,
          })
          .catch(() => {});
      });
    } catch (err) {
      this.logger.warn(
        `Could not attach registration_create.success listener: ${
          (err as Error).message
        }`,
      );
    }
  }

  @Public()
  @Throttle({ default: { ttl: 60 * 60 * 1000, limit: 10 } })
  @Post()
  async register(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    // body is unverified DCR JSON — Nest forwards it to oidc-provider which
    // does full schema validation; we only pre-screen redirect_uris.
    /* eslint-disable @typescript-eslint/no-unsafe-member-access,
                      @typescript-eslint/no-unsafe-call */
    if (Array.isArray(body?.redirect_uris)) {
      body.redirect_uris.forEach(validateRedirectUri);
    }
    /* eslint-enable @typescript-eslint/no-unsafe-member-access,
                    @typescript-eslint/no-unsafe-call */
    return this.oidc.get().callback()(req, res);
  }

  @Public()
  @All(':client_id')
  manage(@Req() req: Request, @Res() res: Response) {
    return this.oidc.get().callback()(req, res);
  }
}
