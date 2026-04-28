import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Lot } from '../lots/lot.entity';
import { User } from '../../users/user.entity';

export enum LotMovementType {
  RECEPTION = 'RECEPTION',
  COUNT = 'COUNT',
  ADJUSTMENT = 'ADJUSTMENT',
}

@Entity('lot_movements')
export class LotMovement {
  @PrimaryGeneratedColumn() id: number;
  @Column() lotId: number;
  @Column({ type: 'varchar' }) type: LotMovementType;
  @Column({ type: 'int', nullable: true }) delta: number | null;
  @Column({ type: 'int', nullable: true }) absoluteValue: number | null;
  @Column({ type: 'int', nullable: true }) stockCountId: number | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @Column() performedById: number;
  @CreateDateColumn() createdAt: Date;

  @ManyToOne(() => Lot, (l) => l.movements, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lotId' })
  lot: Lot;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'performedById' })
  performedBy: User;
}
