import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Curacion } from '../curaciones/curacion.entity';
import { User } from '../users/user.entity';
import { Organization } from '../organizations/organization.entity';
import type { EncryptedField } from '../kms/encrypted-column.transformer';
import { encryptedColumnTransformer } from '../kms/encrypted-column.transformer';
import { OrgScoped } from '../common/org-scoped.decorator';

export enum WoundColor {
  RED = 'red',
  YELLOW = 'yellow',
  BLACK = 'black',
  PINK = 'pink',
  MIXED = 'mixed',
}

export enum ExudateLevel {
  NONE = 'none',
  LOW = 'low',
  MODERATE = 'moderate',
  HIGH = 'high',
}

export enum HealingStage {
  INFLAMMATORY = 'inflammatory',
  PROLIFERATIVE = 'proliferative',
  MATURATION = 'maturation',
  CHRONIC = 'chronic',
}

@OrgScoped()
@Entity('wound_notes')
@Index('IDX_wound_note_org', ['organizationId'])
export class WoundNote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column()
  curacionId: number;

  @Column()
  recordedById: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  woundWidth: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  woundLength: number | null;

  @Column({ type: 'decimal', precision: 7, scale: 2, nullable: true })
  woundArea: number | null;

  @Column({ type: 'varchar', nullable: true })
  woundColor: WoundColor | null;

  @Column({ type: 'varchar', nullable: true })
  exudateLevel: ExudateLevel | null;

  @Column({ type: 'varchar', nullable: true })
  healingStage: HealingStage | null;

  @Column({
    type: 'jsonb',
    nullable: true,
    transformer: encryptedColumnTransformer('WoundNote.notes'),
  })
  notes: EncryptedField | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @ManyToOne(() => Curacion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'curacionId' })
  curacion: Curacion;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'recordedById' })
  recordedBy: User;
}
