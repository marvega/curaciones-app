import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import { User } from '../users/user.entity';
import { PasswordResetToken } from './password-reset-token.entity';
import { EMAIL_SERVICE, EmailService } from '../email/email.service';
import { PasswordResetEmail } from '../email/templates/PasswordResetEmail';
import * as React from 'react';

@Injectable()
export class PasswordResetService {
  private readonly TTL_MIN = 60;

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(PasswordResetToken) private readonly resetRepo: Repository<PasswordResetToken>,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async forgot(email: string): Promise<void> {
    const emailHash = createHash('sha256').update(email.toLowerCase()).digest('hex');
    const user = await this.userRepo.findOne({ where: { emailHash } });
    if (!user) return; // anti-enumeration: return 204 silently
    const token = randomBytes(32).toString('base64url');
    await this.resetRepo.save(this.resetRepo.create({
      userId: user.id,
      tokenHash: this.hash(token),
      expiresAt: new Date(Date.now() + this.TTL_MIN * 60 * 1000),
    }));
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    await this.email.send({
      to: email,
      subject: 'Restablecé tu contraseña',
      react: React.createElement(PasswordResetEmail, {
        resetUrl: `${baseUrl}/reset-password?token=${token}`,
        expiresInMinutes: this.TTL_MIN,
      }),
    });
  }

  async findValidToken(token: string): Promise<PasswordResetToken | null> {
    const row = await this.resetRepo.findOne({ where: { tokenHash: this.hash(token) } });
    if (!row) return null;
    if (row.usedAt) return null;
    if (row.expiresAt.getTime() < Date.now()) return null;
    return row;
  }

  async markUsed(id: string): Promise<void> {
    await this.resetRepo.update(id, { usedAt: new Date() });
  }
}
