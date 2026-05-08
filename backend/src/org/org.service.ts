import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Organization } from '../organizations/organization.entity';
import {
  OrganizationMembership,
  MembershipStatus,
} from '../organizations/organization-membership.entity';
import { User } from '../users/user.entity';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class OrgService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(OrganizationMembership)
    private readonly memRepo: Repository<OrganizationMembership>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
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

  async listMembers(organizationId: string) {
    const rows = await this.memRepo.find({
      where: { organizationId, status: MembershipStatus.ACTIVE },
      order: { id: 'ASC' },
    });
    if (rows.length === 0) return [];
    const userIds = rows.map((r) => r.userId);
    const users = await this.userRepo.findBy({ id: In(userIds) });
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => {
      const u = byId.get(r.userId);
      if (!u) throw new Error(`Membership ${r.id} references missing user ${r.userId}`);
      return {
        userId: u.id,
        username: u.username,
        email: u.email?.plaintext ?? null,
        role: r.role,
        status: r.status,
      };
    });
  }
}
