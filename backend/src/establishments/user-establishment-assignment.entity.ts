import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Establishment } from './establishment.entity';

@Entity('user_establishment_assignments')
export class UserEstablishmentAssignment {
  @PrimaryColumn({ type: 'int' })
  userId: number;

  @PrimaryColumn({ type: 'bigint' })
  establishmentId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Establishment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'establishmentId' })
  establishment: Establishment;
}
