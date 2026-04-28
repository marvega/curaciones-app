import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity('refresh_tokens')
@Index('IDX_refresh_user_revoked', ['userId', 'revokedAt'])
export class RefreshToken {
  @PrimaryColumn({ type: 'uuid' })
  jti: string;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  deviceLabel: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ type: 'timestamptz' })
  issuedAt: Date;

  @Column({ type: 'timestamptz' })
  lastUsedAt: Date;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  rotatedFromJti: string | null;
}
