import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ProductCode } from './product-code.entity';
import { Organization } from '../../organizations/organization.entity';
import { OrgScoped } from '../../common/org-scoped.decorator';

export enum ProductType {
  INSUMO = 'INSUMO',
  MEDICAMENTO = 'MEDICAMENTO',
  ORTESIS = 'ORTESIS',
  OTRO = 'OTRO',
}

@OrgScoped()
@Entity('products')
@Index('IDX_product_org', ['organizationId'])
export class Product {
  @PrimaryGeneratedColumn() id: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column() name: string;
  @Column({ type: 'varchar' }) type: ProductType;
  @Column() packaging: string;
  @Column({ type: 'boolean', default: true }) tracksExpiration: boolean;
  @CreateDateColumn() createdAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @OneToMany(() => ProductCode, (c) => c.product, { cascade: true })
  codes: ProductCode[];
}
