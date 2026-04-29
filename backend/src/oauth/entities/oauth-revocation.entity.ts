import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

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

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
