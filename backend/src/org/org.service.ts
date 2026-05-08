import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, MoreThan, Repository } from 'typeorm';
import { Organization } from '../organizations/organization.entity';
import {
  OrganizationMembership,
  MembershipStatus,
  OrgRole,
} from '../organizations/organization-membership.entity';
import { User } from '../users/user.entity';
import { Invitation } from '../auth/invitation.entity';
import { KMS_SERVICE, type KmsService } from '../kms/kms.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

export type Member = {
  userId: number;
  username: string;
  email: string | null;
  role: OrgRole;
  status: MembershipStatus;
};

@Injectable()
export class OrgService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(OrganizationMembership)
    private readonly memRepo: Repository<OrganizationMembership>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Invitation)
    private readonly invRepo: Repository<Invitation>,
    @Inject(KMS_SERVICE) private readonly kms: KmsService,
  ) {}

  async getSettings(organizationId: string): Promise<{ name: string; rut: string | null }> {
    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    if (!org) throw new NotFoundException('Organization not found');
    return { name: org.name, rut: org.rut };
  }

  async updateSettings(
    organizationId: string,
    dto: UpdateSettingsDto,
  ): Promise<{ name: string; rut: string | null }> {
    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    if (!org) throw new NotFoundException('Organization not found');
    org.name = dto.name;
    org.rut = dto.rut ?? null;
    const saved = await this.orgRepo.save(org);
    return { name: saved.name, rut: saved.rut };
  }

  async listMembers(organizationId: string): Promise<Member[]> {
    const rows = await this.memRepo.find({
      where: { organizationId, status: MembershipStatus.ACTIVE },
      order: { id: 'ASC' },
    });
    if (rows.length === 0) return [];
    const userIds = rows.map((r) => r.userId);
    const users = await this.userRepo.findBy({ id: In(userIds) });
    const byId = new Map(users.map((u) => [u.id, u]));
    return Promise.all(
      rows.map(async (r) => {
        const u = byId.get(r.userId);
        if (!u) throw new Error(`Membership ${r.id} references missing user ${r.userId}`);
        const email = u.email
          ? await this.kms.decrypt(u.email, `User.email:${u.id}`, organizationId)
          : null;
        return {
          userId: u.id,
          username: u.username,
          email,
          role: r.role,
          status: r.status,
        };
      }),
    );
  }

  private async countActiveOwners(
    organizationId: string,
    manager: EntityManager = this.memRepo.manager,
  ): Promise<number> {
    return manager.getRepository(OrganizationMembership).count({
      where: { organizationId, role: OrgRole.OWNER, status: MembershipStatus.ACTIVE },
    });
  }

  async updateRole(
    organizationId: string,
    userId: number,
    role: OrgRole,
  ): Promise<Member> {
    const membership = await this.memRepo.manager.transaction(async (manager) => {
      const memRepo = manager.getRepository(OrganizationMembership);
      const m = await memRepo.findOne({
        where: { organizationId, userId, status: MembershipStatus.ACTIVE },
        lock: { mode: 'pessimistic_write' },
      });
      if (!m) throw new NotFoundException('Member not found');
      if (m.role === OrgRole.OWNER && role !== OrgRole.OWNER) {
        const owners = await this.countActiveOwners(organizationId, manager);
        if (owners <= 1) throw new ConflictException('Cannot demote the last owner');
      }
      m.role = role;
      await memRepo.save(m);
      return m;
    });

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new Error(`User ${userId} not found after membership update`);
    const email = user.email
      ? await this.kms.decrypt(user.email, `User.email:${user.id}`, organizationId)
      : null;
    return {
      userId: user.id,
      username: user.username,
      email,
      role: membership.role,
      status: membership.status,
    };
  }

  async revokeMember(
    organizationId: string,
    targetUserId: number,
    callerUserId: number,
  ): Promise<void> {
    if (targetUserId === callerUserId) {
      throw new ConflictException('Cannot revoke yourself');
    }
    await this.memRepo.manager.transaction(async (manager) => {
      const memRepo = manager.getRepository(OrganizationMembership);
      const membership = await memRepo.findOne({
        where: { organizationId, userId: targetUserId, status: MembershipStatus.ACTIVE },
        lock: { mode: 'pessimistic_write' },
      });
      if (!membership) throw new NotFoundException('Member not found');
      if (membership.role === OrgRole.OWNER) {
        const owners = await this.countActiveOwners(organizationId, manager);
        if (owners <= 1) throw new ConflictException('Cannot revoke the last owner');
      }
      membership.status = MembershipStatus.REVOKED;
      membership.revokedAt = new Date();
      await memRepo.save(membership);
    });
  }

  async listInvitations(organizationId: string) {
    const rows = await this.invRepo.find({
      where: {
        organizationId,
        acceptedAt: IsNull(),
        cancelledAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
    }));
  }
}
