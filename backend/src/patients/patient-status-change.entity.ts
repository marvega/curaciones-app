import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Patient } from './patient.entity';
import { User } from '../users/user.entity';

export enum PatientStatus {
  ACTIVE = 'active',
  DISCHARGED = 'discharged',
}

export enum PatientStatusChangeType {
  DISCHARGE = 'discharge',
  READMISSION = 'readmission',
}

@Entity('patient_status_changes')
@Index('IDX_psc_org', ['organizationId'])
export class PatientStatusChange {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  patientId: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column({ type: 'varchar' })
  type: PatientStatusChangeType;

  @Column()
  performedById: number;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Patient, (patient) => patient.statusChanges, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'performedById' })
  performedBy: User;
}
