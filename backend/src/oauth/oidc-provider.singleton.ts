import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Provider as OidcProvider } from 'oidc-provider';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthToken } from './entities/oauth-token.entity';
import { OAuthClient } from './entities/oauth-client.entity';
import { OAuthSigningKeyService } from './services/oauth-signing-key.service';
import { AccountAdapterService } from './adapters/account.adapter';
import { OAuthGrantService } from './services/oauth-grant.service';
import { buildOidcProvider } from './oidc-provider.factory';

@Injectable()
export class OidcProviderSingleton implements OnModuleInit {
  private readonly logger = new Logger(OidcProviderSingleton.name);
  private provider!: OidcProvider;

  constructor(
    @InjectRepository(OAuthToken) private readonly tokenRepo: Repository<OAuthToken>,
    @InjectRepository(OAuthClient) private readonly clientRepo: Repository<OAuthClient>,
    private readonly signingKeys: OAuthSigningKeyService,
    private readonly accountAdapter: AccountAdapterService,
    private readonly grantService: OAuthGrantService,
  ) {}

  async onModuleInit() {
    const issuer = process.env.OAUTH_ISSUER || 'http://localhost:3000';
    this.provider = await buildOidcProvider({
      issuer,
      signingKeys: this.signingKeys,
      tokenRepo: this.tokenRepo,
      clientRepo: this.clientRepo,
      findAccount: this.accountAdapter.findAccount,
      loadExistingGrant: this.grantService.loadExistingGrant,
    });
    this.logger.log(`oidc-provider initialized at ${issuer}`);
  }

  get(): OidcProvider {
    if (!this.provider) throw new Error('oidc-provider not initialized');
    return this.provider;
  }
}
