import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

@Entity('oauth_grant')
@Index('UQ_oauth_grant_active', ['clientId', 'userId', 'organizationId'], { unique: true, where: '"revokedAt" IS NULL' })
@Index('IDX_oauth_grant_user', ['userId'])
export class OAuthGrant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  clientId!: string;

  @Column({ type: 'int' })
  userId!: number;

  @Column({ type: 'bigint' })
  organizationId!: string;

  @Column({ type: 'text', array: true })
  scopes!: string[];

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  oidcGrantId!: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
