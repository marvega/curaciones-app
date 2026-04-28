import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Product } from '../products/product.entity';
import { Establishment } from '../../establishments/establishment.entity';
import { LotMovement } from '../movements/lot-movement.entity';

@Entity('lots')
export class Lot {
  @PrimaryGeneratedColumn() id: number;
  @Column() productId: number;
  @Column() establishmentId: number;
  @Column({ nullable: true, type: 'varchar' }) lotCode: string | null;
  @Column({ nullable: true, type: 'date' }) expiresAt: string | null;
  @Column({ type: 'date' }) receivedAt: string;
  @CreateDateColumn() createdAt: Date;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @ManyToOne(() => Establishment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'establishmentId' })
  establishment: Establishment;

  @OneToMany(() => LotMovement, (m) => m.lot)
  movements: LotMovement[];
}
