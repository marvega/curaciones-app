import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Patient } from '../patients/patient.entity';
import { User } from '../users/user.entity';

@Entity('consent_signatures')
export class ConsentSignature {
  @PrimaryGeneratedColumn()
  id: number;

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

  @ManyToOne(() => Patient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'witnessedById' })
  witnessedBy: User;
}
