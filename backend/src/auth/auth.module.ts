import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { OrganizationMembership } from '../organizations/organization-membership.entity';
import { Organization } from '../organizations/organization.entity';
import { RefreshToken } from './refresh-token.entity';
import { Invitation } from './invitation.entity';
import { PasswordResetToken } from './password-reset-token.entity';
import { UserEstablishmentAssignment } from '../establishments/user-establishment-assignment.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { UsersModule } from '../users/users.module';
import { SessionsService } from './sessions.service';
import { InvitationsService } from './invitations.service';
import { PasswordResetService } from './password-reset.service';
import { RefreshTokenGuard } from './refresh-token.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User, Organization, OrganizationMembership, RefreshToken, Invitation,
      PasswordResetToken, UserEstablishmentAssignment,
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'curaciones-secret-key-change-in-production',
      signOptions: { expiresIn: '4h' },
    }),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, SessionsService, InvitationsService, PasswordResetService, RefreshTokenGuard],
  exports: [AuthService, JwtStrategy],
})
export class AuthModule {}
