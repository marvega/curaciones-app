import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Patient } from '../patients/patient.entity';
import { Curacion } from '../curaciones/curacion.entity';

@Entity('appointments')
@Unique(['date', 'time'])
export class Appointment {
  @PrimaryGeneratedColumn()
  id: number;

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

  @ManyToOne(() => Patient, (patient) => patient.appointments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @OneToOne(() => Curacion, (curacion) => curacion.appointment, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'curacionId' })
  curacion: Curacion;
}
