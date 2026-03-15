import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Curacion } from '../curaciones/curacion.entity';
import { Appointment } from '../appointments/appointment.entity';
import { PatientStatusChange, PatientStatus } from './patient-status-change.entity';

@Entity('patients')
export class Patient {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  rut: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ type: 'date' })
  birthDate: string;

  @Column()
  gender: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  address: string;

  @Column({ type: 'varchar', default: PatientStatus.ACTIVE })
  status: PatientStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Curacion, (curacion) => curacion.patient)
  curaciones: Curacion[];

  @OneToMany(() => Appointment, (appointment) => appointment.patient)
  appointments: Appointment[];

  @OneToMany(() => PatientStatusChange, (sc) => sc.patient)
  statusChanges: PatientStatusChange[];
}
