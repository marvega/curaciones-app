import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../organizations/organization.entity';
import { UpdateSettingsDto } from './dto/update-settings.dto';

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
}
