import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { OrganizationMembership, MembershipStatus, OrgRole } from '../organizations/organization-membership.entity';

export interface AccessJwtPayload {
  sub: number;
  username: string;
  organizationId: string;
  organizationName: string;
  role: OrgRole;
  establishmentIds: string[];
  passwordChangedAt: number | null;
  jti: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(OrganizationMembership)
    private readonly membershipRepo: Repository<OrganizationMembership>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'curaciones-secret-key-change-in-production',
    });
  }

  async validate(payload: AccessJwtPayload) {
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException();

    const userPwdChanged = user.passwordChangedAt?.getTime() ?? 0;
    if (payload.passwordChangedAt && userPwdChanged > payload.passwordChangedAt) {
      throw new UnauthorizedException('Password changed since token issued');
    }

    const membership = await this.membershipRepo.findOne({
      where: {
        userId: user.id,
        organizationId: payload.organizationId,
        status: MembershipStatus.ACTIVE,
      },
    });
    if (!membership) throw new UnauthorizedException('Membership not active');

    return {
      id: user.id,
      sub: user.id,
      username: user.username,
      organizationId: payload.organizationId,
      organizationName: payload.organizationName,
      role: payload.role,
      establishmentIds: payload.establishmentIds,
      jti: payload.jti,
    };
  }
}
