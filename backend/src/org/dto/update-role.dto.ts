import { IsEnum, NotEquals } from 'class-validator';
import { OrgRole } from '../../organizations/organization-membership.entity';

export class UpdateRoleDto {
  @IsEnum(OrgRole)
  @NotEquals(OrgRole.OWNER)
  role!: OrgRole;
}
