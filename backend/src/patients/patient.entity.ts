import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Curacion } from '../curaciones/curacion.entity';
import { Appointment } from '../appointments/appointment.entity';
import { PatientStatusChange, PatientStatus } from './patient-status-change.entity';
import { Organization } from '../organizations/organization.entity';
import type { EncryptedField } from '../kms/encrypted-column.transformer';
import { encryptedColumnTransformer } from '../kms/encrypted-column.transformer';
import { OrgScoped } from '../common/org-scoped.decorator';

@OrgScoped()
@Entity('patients')
@Index('IDX_patient_org', ['organizationId'])
@Index('IDX_patient_org_status', ['organizationId', 'status'])
@Index('IDX_patient_rut_hash', ['rutHash'])
export class Patient {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column({
    type: 'jsonb',
    transformer: encryptedColumnTransformer('Patient.rut'),
  })
  rut: EncryptedField;

  @Column({ type: 'char', length: 64 })
  rutHash: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ type: 'date' })
  birthDate: string;

  @Column()
  gender: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    transformer: encryptedColumnTransformer('Patient.phone'),
  })
  phone: EncryptedField | null;

  @Column({
    type: 'jsonb',
    nullable: true,
    transformer: encryptedColumnTransformer('Patient.address'),
  })
  address: EncryptedField | null;

  @Column({ type: 'varchar', default: PatientStatus.ACTIVE })
  status: PatientStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @OneToMany(() => Curacion, (curacion) => curacion.patient)
  curaciones: Curacion[];

  @OneToMany(() => Appointment, (appointment) => appointment.patient)
  appointments: Appointment[];

  @OneToMany(() => PatientStatusChange, (sc) => sc.patient)
  statusChanges: PatientStatusChange[];
}
