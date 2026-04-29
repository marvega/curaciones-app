import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OAuthClient } from './entities/oauth-client.entity';
import { OAuthGrant } from './entities/oauth-grant.entity';
import { OAuthToken } from './entities/oauth-token.entity';
import { OAuthSigningKey } from './entities/oauth-signing-key.entity';
import { OAuthRevocation } from './entities/oauth-revocation.entity';
import { KmsModule } from '../kms/kms.module';
import { OAuthBootstrapService } from './services/oauth-bootstrap.service';
import { OAuthSigningKeyService } from './services/oauth-signing-key.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OAuthClient, OAuthGrant, OAuthToken, OAuthSigningKey, OAuthRevocation,
    ]),
    KmsModule,
  ],
  controllers: [],
  providers: [OAuthBootstrapService, OAuthSigningKeyService],
  exports: [TypeOrmModule, OAuthBootstrapService, OAuthSigningKeyService],
})
export class OAuthModule {}
