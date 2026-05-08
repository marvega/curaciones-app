import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '../organizations/organization.entity';
import { OrganizationMembership } from '../organizations/organization-membership.entity';
import { Invitation } from '../auth/invitation.entity';
import { User } from '../users/user.entity';
import { Establishment } from '../establishments/establishment.entity';
import { AuthModule } from '../auth/auth.module';
import { EstablishmentsModule } from '../establishments/establishments.module';
import { OrgController } from './org.controller';
import { OrgService } from './org.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organization,
      OrganizationMembership,
      Invitation,
      User,
      Establishment,
    ]),
    AuthModule,
    EstablishmentsModule,
  ],
  controllers: [OrgController],
  providers: [OrgService],
})
export class OrgModule {}
