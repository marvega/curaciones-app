import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Curacion } from './curacion.entity';
import { User } from '../users/user.entity';

@Entity('curacion_edits')
@Index('IDX_curacion_edit_org', ['organizationId'])
export class CuracionEdit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  curacionId: number;

  @Column({ type: 'bigint' })
  organizationId: string;

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
