import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import * as React from 'react';
import { Invitation } from './invitation.entity';
import { Organization } from '../organizations/organization.entity';
import { OrganizationMembership, OrgRole, MembershipStatus } from '../organizations/organization-membership.entity';
import { User } from '../users/user.entity';
import { EMAIL_SERVICE, type EmailService } from '../email/email.service';
import { InvitationEmail } from '../email/templates/InvitationEmail';

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(Invitation) private readonly invRepo: Repository<Invitation>,
    @InjectRepository(Organization) private readonly orgRepo: Repository<Organization>,
    @InjectRepository(OrganizationMembership) private readonly memRepo: Repository<OrganizationMembership>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
  ) {}

  private hash(s: string): string { return createHash('sha256').update(s).digest('hex'); }

  async create(organizationId: string, inviterId: number, inviterName: string, email: string, role: OrgRole): Promise<{ invitation: Invitation; token: string }> {
    const token = randomBytes(32).toString('base64url');
    const inv = this.invRepo.create({
      organizationId,
      email,
      role,
      invitedById: inviterId,
      tokenHash: this.hash(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    const saved = await this.invRepo.save(inv);
    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    await this.email.send({
      to: email,
      subject: `Invitación para unirte a ${org?.name}`,
      react: React.createElement(InvitationEmail, {
        inviteeEmail: email,
        organizationName: org?.name ?? '',
        inviterName,
        role,
        acceptUrl: `${baseUrl}/accept-invitation?token=${token}`,
        expiresInDays: 7,
      }),
    });
    return { invitation: saved, token };
  }

  async findValid(token: string): Promise<Invitation | null> {
    const row = await this.invRepo.findOne({ where: { tokenHash: this.hash(token) } });
    if (!row) return null;
    if (row.acceptedAt || row.cancelledAt) return null;
    if (row.expiresAt.getTime() < Date.now()) return null;
    return row;
  }

  async preview(token: string) {
    const inv = await this.findValid(token);
    if (!inv) return { valid: false };
    const org = await this.orgRepo.findOne({ where: { id: inv.organizationId } });
    return {
      valid: true,
      organizationName: org?.name ?? '',
      role: inv.role,
      email: inv.email,
    };
  }

  async accept(token: string, password: string, fullName: string): Promise<User> {
    const inv = await this.findValid(token);
    if (!inv) throw new BadRequestException('Invalid or expired invitation');
    const emailHash = createHash('sha256').update(inv.email.toLowerCase()).digest('hex');
    let user = await this.userRepo.findOne({ where: { emailHash } });
    if (!user) {
      user = this.userRepo.create({
        username: fullName,
        passwordHash: await bcrypt.hash(password, 10),
        emailHash,
        emailVerifiedAt: new Date(),
        passwordChangedAt: new Date(),
      });
      user = await this.userRepo.save(user);
    }
    await this.memRepo.save(this.memRepo.create({
      userId: user.id,
      organizationId: inv.organizationId,
      role: inv.role,
      status: MembershipStatus.ACTIVE,
      acceptedAt: new Date(),
    }));
    inv.acceptedAt = new Date();
    await this.invRepo.save(inv);
    return user;
  }
}
