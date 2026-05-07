import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { OAuthSigningKeyService } from '../services/oauth-signing-key.service';
import { User } from '../../users/user.entity';
import { OrganizationMembership, MembershipStatus } from '../../organizations/organization-membership.entity';
import { OAuthRevocation } from '../entities/oauth-revocation.entity';

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

interface CachedKey {
  kid: string;
  algorithm: string;
  publicKeyPem: string;
}

@Injectable()
export class OAuthJwtStrategy {
  private jwksCache: { value: CachedKey[]; expiresAt: number } | null = null;

  constructor(
    private readonly signingKeys: OAuthSigningKeyService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(OrganizationMembership) private readonly memRepo: Repository<OrganizationMembership>,
    @InjectRepository(OAuthRevocation) private readonly revocationRepo: Repository<OAuthRevocation>,
  ) {}

  async validate(token: string, httpMethod: string): Promise<any> {
    const issuer = process.env.OAUTH_ISSUER || 'http://localhost:3000';
    const keys = await this.getJwks();

    const payload = await new Promise<jwt.JwtPayload>((resolve, reject) => {
      jwt.verify(
        token,
        (header, cb) => {
          const k = keys.find((j) => j.kid === header.kid);
          if (!k) return cb(new Error('Unknown kid'));
          cb(null, k.publicKeyPem);
        },
        { issuer, algorithms: ['RS256', 'ES256', 'PS256'] },
        (err, decoded) => {
          if (err) return reject(new UnauthorizedException(err.message || 'Invalid token'));
          resolve(decoded as jwt.JwtPayload);
        },
      );
    });

    if (!payload.sub) throw new UnauthorizedException('No sub');
    const userId = Number(payload.sub);
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const orgId = (payload as any).org_id;
    if (!orgId) throw new UnauthorizedException('No org claim');
    const membership = await this.memRepo.findOne({
      where: { userId, organizationId: orgId, status: MembershipStatus.ACTIVE },
    });
    if (!membership) throw new UnauthorizedException('Membership inactive');

    if (WRITE_METHODS.has(httpMethod) && payload.jti) {
      const revoked = await this.revocationRepo.findOne({ where: { jti: payload.jti } });
      if (revoked) throw new UnauthorizedException('Token revoked');
    }

    const scopes = String(payload.scope || '').split(/\s+/).filter(Boolean);
    return {
      id: userId,
      sub: userId,
      username: user.username,
      organizationId: orgId,
      organizationName: (payload as any).org_name,
      role: (payload as any).role,
      establishmentIds: (payload as any).establishment_ids ?? [],
      scopes,
      tokenSource: 'oauth',
      jti: payload.jti,
    };
  }

  private async getJwks(): Promise<CachedKey[]> {
    if (this.jwksCache && this.jwksCache.expiresAt > Date.now()) return this.jwksCache.value;
    const keys = await this.signingKeys.getAllPublishableKeys();
    const value: CachedKey[] = keys.map((k) => ({
      kid: k.kid,
      algorithm: k.algorithm,
      publicKeyPem: k.publicKeyPem,
    }));
    this.jwksCache = { value, expiresAt: Date.now() + 5 * 60 * 1000 };
    return value;
  }

  invalidate() {
    this.jwksCache = null;
  }
}
