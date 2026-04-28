import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Establishment } from '../../establishments/establishment.entity';
import { User } from '../../users/user.entity';

export enum StockCountStatus {
  DRAFT = 'DRAFT',
  CLOSED = 'CLOSED',
}

@Entity('stock_counts')
@Unique(['establishmentId', 'countDate'])
export class StockCount {
  @PrimaryGeneratedColumn() id: number;
  @Column() establishmentId: number;
  @Column({ type: 'date' }) countDate: string;
  @Column({ type: 'varchar', default: StockCountStatus.DRAFT }) status: StockCountStatus;
  @Column({ type: 'timestamp', nullable: true }) closedAt: Date | null;
  @Column() performedById: number;
  @CreateDateColumn() createdAt: Date;

  @ManyToOne(() => Establishment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'establishmentId' })
  establishment: Establishment;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'performedById' })
  performedBy: User;
}
