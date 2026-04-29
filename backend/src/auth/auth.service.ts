import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { v4 as uuid } from 'uuid';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { OrganizationMembership, MembershipStatus, OrgRole } from '../organizations/organization-membership.entity';
import { Organization } from '../organizations/organization.entity';
import { UserEstablishmentAssignment } from '../establishments/user-establishment-assignment.entity';
import { SessionsService } from './sessions.service';
import { PasswordResetService } from './password-reset.service';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: { id: number; username: string };
  organizations: Array<{ id: string; name: string; role: string }>;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(OrganizationMembership) private readonly membershipRepo: Repository<OrganizationMembership>,
    @InjectRepository(Organization) private readonly orgRepo: Repository<Organization>,
    @InjectRepository(UserEstablishmentAssignment) private readonly ueaRepo: Repository<UserEstablishmentAssignment>,
    private readonly usersService: UsersService,
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  private emailHash(email: string) {
    return createHash('sha256').update(email.toLowerCase()).digest('hex');
  }

  async findUserByUsernameOrEmail(usernameOrEmail: string): Promise<User | null> {
    const byUsername = await this.userRepo.findOne({ where: { username: usernameOrEmail } });
    if (byUsername) return byUsername;
    return this.userRepo.findOne({ where: { emailHash: this.emailHash(usernameOrEmail) } });
  }

  async signAccessToken(user: User, organizationId: string): Promise<{ accessToken: string; jti: string; orgName: string; role: OrgRole }> {
    const membership = await this.membershipRepo.findOne({
      where: { userId: user.id, organizationId, status: MembershipStatus.ACTIVE },
    });
    if (!membership) throw new UnauthorizedException('No active membership for this org');
    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    const ueas = await this.ueaRepo.find({ where: { userId: user.id } });
    const jti = uuid();
    const accessToken = this.jwt.sign({
      sub: user.id,
      username: user.username,
      organizationId,
      organizationName: org?.name ?? '',
      role: membership.role,
      establishmentIds: ueas.map((u) => u.establishmentId),
      passwordChangedAt: user.passwordChangedAt?.getTime() ?? null,
      jti,
    });
    return { accessToken, jti, orgName: org?.name ?? '', role: membership.role };
  }

  async login(usernameOrEmail: string, password: string, ip?: string, userAgent?: string | null): Promise<LoginResult> {
    const user = await this.findUserByUsernameOrEmail(usernameOrEmail);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    const memberships = await this.membershipRepo.find({
      where: { userId: user.id, status: MembershipStatus.ACTIVE },
    });
    if (memberships.length === 0) throw new UnauthorizedException('No memberships');

    const primary = memberships[0];
    const { accessToken } = await this.signAccessToken(user, primary.organizationId);
    const refresh = await this.sessions.issue(user.id, primary.organizationId, ip, userAgent);

    const orgs = await this.orgRepo.findByIds(memberships.map((m) => m.organizationId));
    return {
      accessToken,
      refreshToken: refresh.refreshToken,
      user: { id: user.id, username: user.username },
      organizations: orgs.map((o) => {
        const m = memberships.find((mm) => mm.organizationId === o.id)!;
        return { id: String(o.id), name: o.name, role: m.role };
      }),
    };
  }

  async logoutAll(userId: number) {
    await this.sessions.revokeAllForUser(userId);
    await this.userRepo.update(userId, { passwordChangedAt: new Date() });
  }

  async refresh(refreshToken: string, payload: { sub: number; jti: string }, ip?: string, ua?: string | null) {
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException();
    const { row, issued } = await this.sessions.rotate(refreshToken, payload.jti, payload.sub, ip, ua);
    const { accessToken } = await this.signAccessToken(user, row.organizationId);
    return { accessToken, refreshToken: issued.refreshToken };
  }

  async switchOrg(userId: number, newOrgId: string): Promise<{ accessToken: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const { accessToken } = await this.signAccessToken(user, newOrgId);
    return { accessToken };
  }

  async resetPassword(token: string, newPassword: string, ip?: string, ua?: string | null) {
    const row = await this.passwordReset.findValidToken(token);
    if (!row) throw new UnauthorizedException('Invalid or expired token');
    const user = await this.userRepo.findOne({ where: { id: row.userId } });
    if (!user) throw new UnauthorizedException();
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordChangedAt = new Date();
    await this.userRepo.save(user);
    await this.passwordReset.markUsed(row.id);
    await this.sessions.revokeAllForUser(user.id);
    // auto-login on first membership
    const m = await this.membershipRepo.findOne({ where: { userId: user.id, status: MembershipStatus.ACTIVE } });
    if (!m) throw new UnauthorizedException('No memberships');
    const { accessToken } = await this.signAccessToken(user, m.organizationId);
    const refresh = await this.sessions.issue(user.id, m.organizationId, ip, ua);
    return { accessToken, refreshToken: refresh.refreshToken };
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    if (newPassword.length < 12) throw new BadRequestException('Password must be at least 12 chars');
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password incorrect');
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordChangedAt = new Date();
    await this.userRepo.save(user);
  }
}
