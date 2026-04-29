import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('oauth_revocation')
@Index('IDX_oauth_revocation_expires', ['expiresAt'])
export class OAuthRevocation {
  @PrimaryColumn({ type: 'text' })
  jti!: string;

  @Column({ type: 'int' })
  userId!: number;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
