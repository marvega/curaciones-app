import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Product } from './product.entity';

export enum CodeSystem {
  AVIS_QUILPUE = 'AVIS_QUILPUE',
  AVIS_OTRA = 'AVIS_OTRA',
  RAYEN = 'RAYEN',
  OTRO = 'OTRO',
}

@Entity('product_codes')
@Unique(['codeSystem', 'code'])
export class ProductCode {
  @PrimaryGeneratedColumn() id: number;
  @Column() productId: number;
  @Column({ type: 'varchar' }) codeSystem: CodeSystem;
  @Column() code: string;

  @ManyToOne(() => Product, (p) => p.codes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;
}
