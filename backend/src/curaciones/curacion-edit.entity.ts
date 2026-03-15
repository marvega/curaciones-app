import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Curacion } from './curacion.entity';
import { User } from '../users/user.entity';

@Entity('curacion_edits')
export class CuracionEdit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  curacionId: number;

  @Column()
  editedById: number;

  @Column({ type: 'text' })
  reason: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Curacion, (curacion) => curacion.edits, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'curacionId' })
  curacion: Curacion;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'editedById' })
  editedBy: User;
}
