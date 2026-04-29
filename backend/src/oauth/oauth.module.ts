import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OAuthClient } from './entities/oauth-client.entity';
import { OAuthGrant } from './entities/oauth-grant.entity';
import { OAuthToken } from './entities/oauth-token.entity';
import { OAuthSigningKey } from './entities/oauth-signing-key.entity';
import { OAuthRevocation } from './entities/oauth-revocation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OAuthClient, OAuthGrant, OAuthToken, OAuthSigningKey, OAuthRevocation,
    ]),
  ],
  controllers: [],
  providers: [],
  exports: [],
})
export class OAuthModule {}
