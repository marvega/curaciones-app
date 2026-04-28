import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { Patient } from '../patients/patient.entity';
import { Curacion } from '../curaciones/curacion.entity';
import { Organization } from '../organizations/organization.entity';

@Entity('appointments')
@Unique(['organizationId', 'date', 'time'])
@Index('IDX_appointment_org', ['organizationId'])
@Index('IDX_appointment_org_date', ['organizationId', 'date'])
export class Appointment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column()
  patientId: number;

  @Column({ nullable: true, unique: true })
  curacionId: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar' })
  time: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @ManyToOne(() => Patient, (patient) => patient.appointments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @OneToOne(() => Curacion, (curacion) => curacion.appointment, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'curacionId' })
  curacion: Curacion;
}
