import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KmsModule } from '../kms/kms.module';
import { OAuthClient } from './entities/oauth-client.entity';
import { OAuthGrant } from './entities/oauth-grant.entity';
import { OAuthToken } from './entities/oauth-token.entity';
import { OAuthSigningKey } from './entities/oauth-signing-key.entity';
import { OAuthRevocation } from './entities/oauth-revocation.entity';
import { User } from '../users/user.entity';
import { OrganizationMembership } from '../organizations/organization-membership.entity';
import { Organization } from '../organizations/organization.entity';
import { UserEstablishmentAssignment } from '../establishments/user-establishment-assignment.entity';
import { OAuthBootstrapService } from './services/oauth-bootstrap.service';
import { OAuthSigningKeyService } from './services/oauth-signing-key.service';
import { OAuthGrantService } from './services/oauth-grant.service';
import { AccountAdapterService } from './adapters/account.adapter';
import { OidcProviderSingleton } from './oidc-provider.singleton';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OAuthClient, OAuthGrant, OAuthToken, OAuthSigningKey, OAuthRevocation,
      User, OrganizationMembership, Organization, UserEstablishmentAssignment,
    ]),
    KmsModule,
  ],
  providers: [
    OAuthBootstrapService, OAuthSigningKeyService, OAuthGrantService,
    AccountAdapterService, OidcProviderSingleton,
  ],
  exports: [OidcProviderSingleton, OAuthSigningKeyService, OAuthGrantService],
})
export class OAuthModule {}
