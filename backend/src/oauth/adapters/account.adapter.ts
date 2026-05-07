/* eslint-disable @typescript-eslint/no-explicit-any,
                  @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-return */
// oidc-provider's ctx is dynamically typed; the cast is localized here.
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

    // The runtime Grant carries the org the user picked at consent time. It
    // isn't available during the first `loadAccount` pass (loadGrant runs
    // *after* loadAccount in oidc-provider's middleware order), so we fall
    // back to the post-consent interaction result and finally to the user's
    // first active membership. Returning the account unconditionally lets the
    // authorization request progress; org-scoped claims are resolved lazily
    // by the closure below, by which point all entities are set.
    return {
      accountId: String(userId),
      claims: async (): Promise<Record<string, unknown>> => {
        const grantOrgId: string | undefined =
          ctx?.oidc?.entities?.Grant?.organizationId
          ?? ctx?.oidc?.result?.consent?.organizationId;
        const orgId = grantOrgId ?? (await this.firstOrgFor(userId));
        if (!orgId) {
          return { sub: String(userId), username: user.username };
        }
        const membership = await this.memRepo.findOne({
          where: { userId, organizationId: orgId, status: MembershipStatus.ACTIVE },
        });
        if (!membership) {
          return { sub: String(userId), username: user.username };
        }
        const org = await this.orgRepo.findOne({ where: { id: orgId } });
        const ueas = await this.ueaRepo.find({ where: { userId } });
        return {
          sub: String(userId),
          username: user.username,
          name: user.username,
          org_id: orgId,
          org_name: org?.name ?? '',
          role: membership.role,
          establishment_ids: ueas.map((u) => String(u.establishmentId)),
        };
      },
    };
  };

  private async firstOrgFor(userId: number): Promise<string | undefined> {
    const m = await this.memRepo.findOne({
      where: { userId, status: MembershipStatus.ACTIVE },
    });
    return m?.organizationId;
  }
}
