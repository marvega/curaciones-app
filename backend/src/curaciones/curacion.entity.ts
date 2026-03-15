import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Patient } from '../patients/patient.entity';
import { Appointment } from '../appointments/appointment.entity';

export enum CuracionType {
  AVANZADA = 'avanzada',
  PIE_DIABETICO = 'pie_diabetico',
  ULCERA_VENOSA = 'ulcera_venosa',
}

@Entity('curaciones')
export class Curacion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  patientId: number;

  @Column({ type: 'varchar' })
  type: CuracionType;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'date', nullable: true })
  nextAppointmentDate: string;

  @Column({ type: 'varchar', nullable: true })
  nextAppointmentTime: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'text', nullable: true })
  observations: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Patient, (patient) => patient.curaciones, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @OneToOne(() => Appointment, (appointment) => appointment.curacion)
  appointment: Appointment;
}
