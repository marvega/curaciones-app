import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Curacion } from '../curaciones/curacion.entity';
import { User } from '../users/user.entity';

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

@Entity('wound_notes')
export class WoundNote {
  @PrimaryGeneratedColumn()
  id: number;

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

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Curacion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'curacionId' })
  curacion: Curacion;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'recordedById' })
  recordedBy: User;
}
