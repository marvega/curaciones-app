import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Patient } from '../patients/patient.entity';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';
import { OrgScoped } from '../common/org-scoped.decorator';

@OrgScoped()
@Entity('consent_signatures')
@Index('IDX_consent_org', ['organizationId'])
export class ConsentSignature {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column()
  patientId: number;

  @Column()
  witnessedById: number;

  @Column()
  filename: string;

  @Column({ type: 'text', nullable: true })
  consentText: string;

  @CreateDateColumn()
  signedAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @ManyToOne(() => Patient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'witnessedById' })
  witnessedBy: User;
}
