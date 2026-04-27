import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Patient } from '../patients/patient.entity';
import { User } from '../users/user.entity';

@Entity('wound_photos')
export class WoundPhoto {
  @PrimaryGeneratedColumn()
  id: number;

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

  @ManyToOne(() => Patient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploadedById' })
  uploadedBy: User;
}
