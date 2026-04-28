// Standalone entity describing the join table — TypeORM uses ManyToMany above,
// but this file exposes the join table for direct queries when needed.
import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('canasta_category_products')
export class CanastaCategoryProduct {
  @PrimaryColumn() canastaCategoryId: number;
  @PrimaryColumn() productId: number;
  @Column({ name: 'auto_mapped', type: 'boolean', default: false }) autoMapped: boolean;
}
