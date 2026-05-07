import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type SigningKeyStatus = 'active' | 'retired' | 'revoked';

@Entity('oauth_signing_key')
@Index('IDX_oauth_signing_key_status', ['status'])
export class OAuthSigningKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  algorithm!: string;

  @Column({ type: 'text' })
  publicKeyPem!: string;

  @Column({ type: 'bytea' })
  privateKeyEncrypted!: Buffer;

  @Column({ type: 'enum', enum: ['active', 'retired', 'revoked'], enumName: 'oauth_signing_key_status_enum' })
  status!: SigningKeyStatus;

  @Column({ type: 'timestamptz', nullable: true })
  activatedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  retiredAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  retireScheduledAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
