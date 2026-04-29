import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  EVENT = 'EVENT',
}

@Entity('audit_logs')
@Index('IDX_audit_org_id', ['organizationId', 'id'])
@Index('IDX_audit_entity', ['entity', 'entityId'])
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint', nullable: true })
  organizationId: string | null;

  @Column({ type: 'bigint', nullable: true })
  establishmentId: string | null;

  @Column()
  userId: number;

  @Column()
  username: string;

  @Column({ type: 'varchar' })
  action: AuditAction;

  @Column()
  entity: string;

  @Column()
  entityId: number;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  beforeJson: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  afterJson: Record<string, any> | null;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ type: 'uuid', nullable: true })
  requestId: string | null;

  @Column({ type: 'char', length: 64 })
  payloadHash: string;

  @Column({ type: 'char', length: 64, nullable: true })
  prevHash: string | null;

  @Column({ type: 'char', length: 64 })
  chainHash: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;
}
