import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Organization } from './organization.entity';

export enum OrgRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  CLINICIAN = 'clinician',
  RECEPTIONIST = 'receptionist',
}

export enum MembershipStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
}

@Entity('organization_memberships')
@Unique('UQ_membership_user_org', ['userId', 'organizationId'])
@Index('IDX_membership_user', ['userId'])
@Index('IDX_membership_org', ['organizationId'])
export class OrganizationMembership {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column({ type: 'varchar' })
  role: OrgRole;

  @Column({ type: 'varchar', default: MembershipStatus.ACTIVE })
  status: MembershipStatus;

  @Column({ type: 'timestamptz', nullable: true })
  invitedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;
}
