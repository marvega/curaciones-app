import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuid } from 'uuid';
import { createHash } from 'crypto';
import { RefreshToken } from './refresh-token.entity';

export interface IssuedRefresh {
  refreshToken: string;
  jti: string;
  expiresAt: Date;
}

@Injectable()
export class SessionsService {
  private readonly TTL_DAYS = 30;

  constructor(
    @InjectRepository(RefreshToken) private readonly repo: Repository<RefreshToken>,
    private readonly jwt: JwtService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private deviceLabelFromUserAgent(ua?: string | null): string | null {
    if (!ua) return null;
    if (/Chrome/i.test(ua) && /Mac/i.test(ua)) return 'Chrome en macOS';
    if (/Chrome/i.test(ua) && /Win/i.test(ua)) return 'Chrome en Windows';
    if (/Safari/i.test(ua) && /iPhone/i.test(ua)) return 'Safari en iPhone';
    if (/Firefox/i.test(ua)) return 'Firefox';
    if (/Edge/i.test(ua)) return 'Edge';
    return ua.slice(0, 60);
  }

  async issue(userId: number, organizationId: string, ip?: string, userAgent?: string | null, rotatedFromJti?: string): Promise<IssuedRefresh> {
    const jti = uuid();
    const refreshToken = this.jwt.sign(
      { sub: userId, jti, type: 'refresh' },
      {
        secret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'curaciones-secret-key-change-in-production',
        expiresIn: `${this.TTL_DAYS}d`,
      },
    );
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.repo.save(this.repo.create({
      jti,
      userId,
      organizationId,
      tokenHash: this.hashToken(refreshToken),
      deviceLabel: this.deviceLabelFromUserAgent(userAgent),
      ipAddress: ip ?? null,
      userAgent: userAgent ?? null,
      issuedAt: now,
      lastUsedAt: now,
      expiresAt,
      revokedAt: null,
      rotatedFromJti: rotatedFromJti ?? null,
    }));
    return { refreshToken, jti, expiresAt };
  }

  async rotate(presentedToken: string, presentedJti: string, userId: number, ip?: string, userAgent?: string | null): Promise<{ row: RefreshToken; issued: IssuedRefresh }> {
    const presented = await this.repo.findOne({ where: { jti: presentedJti } });
    if (!presented) throw new UnauthorizedException('Unknown refresh token');
    if (presented.userId !== userId) throw new UnauthorizedException();

    if (presented.revokedAt) {
      // Reuse attack: revoke all tokens for this user.
      await this.revokeAllForUser(userId);
      throw new ForbiddenException('Refresh token reuse detected; all sessions revoked');
    }
    if (this.hashToken(presentedToken) !== presented.tokenHash) {
      await this.revokeAllForUser(userId);
      throw new ForbiddenException('Refresh token hash mismatch; all sessions revoked');
    }
    if (presented.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    presented.revokedAt = new Date();
    presented.lastUsedAt = new Date();
    await this.repo.save(presented);

    const issued = await this.issue(userId, presented.organizationId, ip, userAgent, presented.jti);
    return { row: presented, issued };
  }

  async revokeByJti(userId: number, jti: string): Promise<void> {
    const t = await this.repo.findOne({ where: { jti } });
    if (!t || t.userId !== userId) throw new UnauthorizedException();
    if (!t.revokedAt) {
      t.revokedAt = new Date();
      await this.repo.save(t);
    }
  }

  async revokeAllForUser(userId: number): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('userId = :userId AND revokedAt IS NULL', { userId })
      .execute();
  }

  async listForUser(userId: number, currentJti: string): Promise<Array<{ jti: string; deviceLabel: string | null; lastUsedAt: Date; current: boolean }>> {
    const rows = await this.repo.find({
      where: { userId, revokedAt: IsNull() },
      order: { lastUsedAt: 'DESC' },
    });
    return rows.map((r) => ({
      jti: r.jti,
      deviceLabel: r.deviceLabel,
      lastUsedAt: r.lastUsedAt,
      current: r.jti === currentJti,
    }));
  }
}
