import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type OAuthTokenKind =
  | 'access' | 'refresh' | 'authorization_code'
  | 'interaction' | 'session' | 'registration_access_token';

@Entity('oauth_token')
@Index('IDX_oauth_token_kind_expires', ['kind', 'expiresAt'])
@Index('IDX_oauth_token_grant', ['grantId'])
@Index('IDX_oauth_token_user', ['userId'])
export class OAuthToken {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ type: 'enum', enum: ['access', 'refresh', 'authorization_code', 'interaction', 'session', 'registration_access_token'], enumName: 'oauth_token_kind_enum' })
  kind!: OAuthTokenKind;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'uuid', nullable: true })
  grantId!: string | null;

  @Column({ type: 'text', nullable: true })
  clientId!: string | null;

  @Column({ type: 'int', nullable: true })
  userId!: number | null;

  @Column({ type: 'bigint', nullable: true })
  organizationId!: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'boolean', default: false })
  consumed!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
