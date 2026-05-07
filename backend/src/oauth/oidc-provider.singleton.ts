import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import type { Provider as OidcProvider } from 'oidc-provider';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthToken } from './entities/oauth-token.entity';
import { OAuthClient } from './entities/oauth-client.entity';
import { OAuthGrant } from './entities/oauth-grant.entity';
import { OrganizationMembership } from '../organizations/organization-membership.entity';
import { OAuthSigningKeyService } from './services/oauth-signing-key.service';
import { AccountAdapterService } from './adapters/account.adapter';
import { OAuthGrantService } from './services/oauth-grant.service';
import { buildOidcProvider } from './oidc-provider.factory';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/audit-log.entity';

@Injectable()
export class OidcProviderSingleton implements OnApplicationBootstrap {
  private readonly logger = new Logger(OidcProviderSingleton.name);
  private provider!: OidcProvider;

  constructor(
    @InjectRepository(OAuthToken) private readonly tokenRepo: Repository<OAuthToken>,
    @InjectRepository(OAuthClient) private readonly clientRepo: Repository<OAuthClient>,
    @InjectRepository(OAuthGrant) private readonly grantRepo: Repository<OAuthGrant>,
    @InjectRepository(OrganizationMembership) private readonly memRepo: Repository<OrganizationMembership>,
    private readonly signingKeys: OAuthSigningKeyService,
    private readonly accountAdapter: AccountAdapterService,
    private readonly grantService: OAuthGrantService,
    private readonly auditLog: AuditLogService,
  ) {}

  async onApplicationBootstrap() {
    const issuer = process.env.OAUTH_ISSUER || 'http://localhost:3000';
    this.provider = await buildOidcProvider({
      issuer,
      signingKeys: this.signingKeys,
      tokenRepo: this.tokenRepo,
      clientRepo: this.clientRepo,
      grantRepo: this.grantRepo,
      memRepo: this.memRepo,
      findAccount: this.accountAdapter.findAccount,
      loadExistingGrant: this.grantService.loadExistingGrant,
    });
    // Surface oidc-provider's `server_error` events (otherwise they get
    // swallowed by the koa error_handler and only the generic HTML response
    // reaches the client). One-line log keeps prod noise low while making
    // misconfigurations debuggable in tests and during integration work.
    this.provider.on('server_error', (_ctx, err: Error) => {
      this.logger.error(`oidc-provider server_error: ${err.message}`, err.stack);
    });
    // Hook DCR success here (not in OAuthRegisterController) because Nest
    // runs `onApplicationBootstrap` hooks in parallel — the controller can
    // call `oidc.get()` before this async bootstrap finishes building the
    // provider, leaving the listener silently uninstalled. Registering it
    // here, immediately after `buildOidcProvider`, guarantees the listener
    // is attached before anyone reaches `get()`.
    this.provider.on('registration_create.success', (ctx: any, client: any) => {
      /* eslint-disable @typescript-eslint/no-unsafe-member-access,
                        @typescript-eslint/no-unsafe-assignment */
      const clientId: string | null =
        client?.clientId ?? ctx?.oidc?.body?.client_id ?? null;
      const clientName: string | null =
        client?.clientName ?? ctx?.oidc?.body?.client_name ?? null;
      const ipAddress: string | undefined = ctx?.ip;
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
    this.logger.log(`oidc-provider initialized at ${issuer}`);
  }

  get(): OidcProvider {
    if (!this.provider) throw new Error('oidc-provider not initialized');
    return this.provider;
  }
}
