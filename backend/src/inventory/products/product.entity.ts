import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { ProductCode } from './product-code.entity';

export enum ProductType {
  INSUMO = 'INSUMO',
  MEDICAMENTO = 'MEDICAMENTO',
  ORTESIS = 'ORTESIS',
  OTRO = 'OTRO',
}

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn() id: number;
  @Column() name: string;
  @Column({ type: 'varchar' }) type: ProductType;
  @Column() packaging: string;
  @Column({ type: 'boolean', default: true }) tracksExpiration: boolean;
  @CreateDateColumn() createdAt: Date;

  @OneToMany(() => ProductCode, (c) => c.product, { cascade: true })
  codes: ProductCode[];
}
