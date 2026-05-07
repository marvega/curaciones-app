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
    this.logger.log(`oidc-provider initialized at ${issuer}`);
  }

  get(): OidcProvider {
    if (!this.provider) throw new Error('oidc-provider not initialized');
    return this.provider;
  }
}
