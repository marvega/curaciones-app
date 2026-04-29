import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Patient } from '../patients/patient.entity';
import { Appointment } from '../appointments/appointment.entity';
import { CuracionEdit } from './curacion-edit.entity';
import { Organization } from '../organizations/organization.entity';
import type { EncryptedField } from '../kms/encrypted-column.transformer';
import { encryptedColumnTransformer } from '../kms/encrypted-column.transformer';
import { OrgScoped } from '../common/org-scoped.decorator';

export enum CuracionType {
  AVANZADA = 'avanzada',
  PIE_DIABETICO = 'pie_diabetico',
  ULCERA_VENOSA = 'ulcera_venosa',
}

@OrgScoped()
@Entity('curaciones')
@Index('IDX_curacion_org', ['organizationId'])
@Index('IDX_curacion_org_date', ['organizationId', 'date'])
export class Curacion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column()
  patientId: number;

  @Column({ type: 'varchar' })
  type: CuracionType;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({
    type: 'jsonb',
    nullable: true,
    transformer: encryptedColumnTransformer('Curacion.observations'),
  })
  observations: EncryptedField | null;

  @Column({ type: 'boolean', default: false })
  bootDelivered: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @ManyToOne(() => Patient, (patient) => patient.curaciones, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @OneToOne(() => Appointment, (appointment) => appointment.curacion)
  appointment: Appointment;

  @OneToMany(() => CuracionEdit, (edit) => edit.curacion)
  edits: CuracionEdit[];
}
