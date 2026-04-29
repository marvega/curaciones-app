import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export type TokenEndpointAuthMethod = 'client_secret_basic' | 'client_secret_post' | 'none';
export type ApplicationType = 'web' | 'native';

@Entity('oauth_client')
@Index('IDX_oauth_client_first_authorized', ['firstAuthorizedAt'])
export class OAuthClient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'text' })
  clientId!: string;

  @Column({ type: 'text', nullable: true })
  clientSecretHash!: string | null;

  @Column({ type: 'text' })
  clientName!: string;

  @Column({ type: 'text', nullable: true })
  clientUri!: string | null;

  @Column({ type: 'text', nullable: true })
  logoUri!: string | null;

  @Column({ type: 'text', nullable: true })
  policyUri!: string | null;

  @Column({ type: 'text', nullable: true })
  tosUri!: string | null;

  @Column({ type: 'text', array: true })
  redirectUris!: string[];

  @Column({ type: 'text', array: true, default: () => "ARRAY['authorization_code','refresh_token']::text[]" })
  grantTypes!: string[];

  @Column({ type: 'text', array: true, default: () => "ARRAY['code']::text[]" })
  responseTypes!: string[];

  @Column({ type: 'text' })
  scope!: string;

  @Column({ type: 'enum', enum: ['client_secret_basic', 'client_secret_post', 'none'], enumName: 'oauth_token_endpoint_auth_method_enum' })
  tokenEndpointAuthMethod!: TokenEndpointAuthMethod;

  @Column({ type: 'enum', enum: ['web', 'native'], enumName: 'oauth_application_type_enum', default: 'web' })
  applicationType!: ApplicationType;

  @Column({ type: 'text', nullable: true })
  softwareId!: string | null;

  @Column({ type: 'text', nullable: true })
  softwareVersion!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @Column({ type: 'timestamptz', nullable: true })
  firstAuthorizedAt!: Date | null;

  @Column({ type: 'text' })
  registrationAccessTokenHash!: string;

  @Column({ type: 'text', nullable: true })
  createdByIp!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
