import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/user.entity';
import { OrganizationMembership, MembershipStatus } from '../../organizations/organization-membership.entity';
import { Organization } from '../../organizations/organization.entity';
import { UserEstablishmentAssignment } from '../../establishments/user-establishment-assignment.entity';

@Injectable()
export class AccountAdapterService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(OrganizationMembership) private readonly memRepo: Repository<OrganizationMembership>,
    @InjectRepository(Organization) private readonly orgRepo: Repository<Organization>,
    @InjectRepository(UserEstablishmentAssignment) private readonly ueaRepo: Repository<UserEstablishmentAssignment>,
  ) {}

  findAccount = async (ctx: any, sub: string): Promise<any | undefined> => {
    const userId = Number(sub);
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return undefined;
    const grantOrgId: string | undefined = ctx?.oidc?.entities?.Grant?.organizationId;
    if (!grantOrgId) return undefined;
    const membership = await this.memRepo.findOne({
      where: { userId, organizationId: grantOrgId, status: MembershipStatus.ACTIVE },
    });
    if (!membership) return undefined;
    const org = await this.orgRepo.findOne({ where: { id: grantOrgId } });
    const ueas = await this.ueaRepo.find({ where: { userId } });
    const claims = {
      sub: String(userId),
      username: user.username,
      name: (user as any).fullName ?? user.username,
      org_id: grantOrgId,
      org_name: org?.name ?? '',
      role: membership.role,
      establishment_ids: ueas.map((u) => u.establishmentId),
    };
    return {
      accountId: String(userId),
      async claims() { return claims; },
    };
  };
}
