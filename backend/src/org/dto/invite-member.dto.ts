import { IsEmail, IsEnum, NotEquals } from 'class-validator';
import { OrgRole } from '../../organizations/organization-membership.entity';

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsEnum(OrgRole)
  @NotEquals(OrgRole.OWNER)
  role!: OrgRole;
}
