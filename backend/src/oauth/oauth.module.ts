import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KmsModule } from '../kms/kms.module';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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
import { OAuthDiscoveryController } from './controllers/oauth-discovery.controller';
import { OAuthRegisterController } from './controllers/oauth-register.controller';
import { OAuthAuthorizeController } from './controllers/oauth-authorize.controller';
import { OAuthTokenController } from './controllers/oauth-token.controller';
import { ConsentController } from './consent/consent.controller';
import { ConsentService } from './consent/consent.service';
import { OAuthJwtStrategy } from './strategies/oauth-jwt.strategy';
import { OAuthJwtGuard } from './guards/oauth-jwt.guard';
import { OAuthScopeGuard } from './guards/oauth-scope.guard';
import { MultiAuthGuard } from './guards/multi-auth.guard';
import { ConnectedAppsController } from './connected-apps/connected-apps.controller';
import { ConnectedAppsService } from './connected-apps/connected-apps.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      OAuthClient, OAuthGrant, OAuthToken, OAuthSigningKey, OAuthRevocation,
      User, OrganizationMembership, Organization, UserEstablishmentAssignment,
    ]),
    KmsModule,
    AuthModule,
  ],
  controllers: [
    OAuthDiscoveryController,
    OAuthRegisterController,
    OAuthAuthorizeController,
    OAuthTokenController,
    ConsentController,
    ConnectedAppsController,
  ],
  providers: [
    OAuthBootstrapService, OAuthSigningKeyService, OAuthGrantService,
    AccountAdapterService, OidcProviderSingleton,
    ConsentService,
    ConnectedAppsService,
    OAuthJwtStrategy, OAuthJwtGuard, OAuthScopeGuard,
    JwtAuthGuard, MultiAuthGuard,
  ],
  exports: [
    OidcProviderSingleton, OAuthSigningKeyService, OAuthGrantService,
    OAuthJwtStrategy, OAuthJwtGuard, OAuthScopeGuard, MultiAuthGuard,
    // JwtAuthGuard must be exported because MultiAuthGuard injects it; with
    // @UseGuards(MultiAuthGuard) on domain controllers, Nest resolves the
    // guard chain in the host module's context and needs JwtAuthGuard
    // discoverable from there.
    JwtAuthGuard,
  ],
})
export class OAuthModule {}
