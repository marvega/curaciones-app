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

@Entity('wound_photos')
@Index('IDX_wound_photo_org', ['organizationId'])
export class WoundPhoto {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column()
  patientId: number;

  @Column()
  uploadedById: number;

  @Column()
  filename: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'date' })
  photoDate: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @ManyToOne(() => Patient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploadedById' })
  uploadedBy: User;
}
