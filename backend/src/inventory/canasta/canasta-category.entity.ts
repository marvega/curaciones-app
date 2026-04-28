import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable } from 'typeorm';
import { Product } from '../products/product.entity';

export enum CanastaSection {
  INSUMOS = 'INSUMOS',
  AYUDAS_TECNICAS = 'AYUDAS_TECNICAS',
}

@Entity('canasta_categories')
export class CanastaCategory {
  @PrimaryGeneratedColumn() id: number;
  @Column() name: string;
  @Column({ type: 'varchar' }) section: CanastaSection;
  @Column() displayOrder: number;
  @Column({ type: 'boolean', default: false }) isOptional: boolean;
  @Column({ type: 'text', nullable: true }) notes: string | null;

  @ManyToMany(() => Product)
  @JoinTable({
    name: 'canasta_category_products',
    joinColumn: { name: 'canastaCategoryId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'productId', referencedColumnName: 'id' },
  })
  products: Product[];
}
