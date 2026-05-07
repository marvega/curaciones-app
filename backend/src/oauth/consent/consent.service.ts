import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthGrant } from '../entities/oauth-grant.entity';
import {
  OrganizationMembership,
  MembershipStatus,
} from '../../organizations/organization-membership.entity';

const GRANT_TTL_MS = 180 * 24 * 60 * 60 * 1000;

@Injectable()
export class ConsentService {
  constructor(
    @InjectRepository(OAuthGrant)
    private readonly grantRepo: Repository<OAuthGrant>,
    @InjectRepository(OrganizationMembership)
    private readonly memRepo: Repository<OrganizationMembership>,
  ) {}

  async recordConsent(input: {
    clientId: string;
    userId: number;
    organizationId: string;
    scopes: string[];
  }): Promise<OAuthGrant> {
    const membership = await this.memRepo.findOne({
      where: {
        userId: input.userId,
        organizationId: input.organizationId,
        status: MembershipStatus.ACTIVE,
      },
    });
    if (!membership) {
      throw new ForbiddenException(
        'User has no active membership in this organization',
      );
    }

    const existing = await this.grantRepo.findOne({
      where: {
        clientId: input.clientId,
        userId: input.userId,
        organizationId: input.organizationId,
      },
    });
    if (existing) {
      const merged = Array.from(
        new Set([...existing.scopes, ...input.scopes]),
      );
      return this.grantRepo.save({
        ...existing,
        revokedAt: null,
        scopes: merged,
        expiresAt: new Date(Date.now() + GRANT_TTL_MS),
      });
    }
    return this.grantRepo.save({
      clientId: input.clientId,
      userId: input.userId,
      organizationId: input.organizationId,
      scopes: input.scopes,
      expiresAt: new Date(Date.now() + GRANT_TTL_MS),
    } as Partial<OAuthGrant>);
  }
}
