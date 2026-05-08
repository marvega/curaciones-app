import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../organizations/organization.entity';

@Injectable()
export class OrgService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
  ) {}

  async getSettings(organizationId: string): Promise<{ name: string; rut: string | null }> {
    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    if (!org) throw new NotFoundException('Organization not found');
    return { name: org.name, rut: org.rut };
  }
}
