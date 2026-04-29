import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  JoinTable,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Product } from '../products/product.entity';
import { Organization } from '../../organizations/organization.entity';
import { OrgScoped } from '../../common/org-scoped.decorator';

export enum CanastaSection {
  INSUMOS = 'INSUMOS',
  AYUDAS_TECNICAS = 'AYUDAS_TECNICAS',
}

@OrgScoped()
@Entity('canasta_categories')
@Index('IDX_canasta_category_org', ['organizationId'])
export class CanastaCategory {
  @PrimaryGeneratedColumn() id: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column() name: string;
  @Column({ type: 'varchar' }) section: CanastaSection;
  @Column({ name: 'displayOrder' }) displayOrder: number;
  @Column({ type: 'boolean', default: false }) isOptional: boolean;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @Column({ type: 'boolean', default: false }) archived: boolean;
  @Index()
  @Column({ name: 'source_key', type: 'varchar', length: 120, nullable: true })
  sourceKey: string | null;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @ManyToMany(() => Product)
  @JoinTable({
    name: 'canasta_category_products',
    joinColumn: { name: 'canastaCategoryId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'productId', referencedColumnName: 'id' },
  })
  products: Product[];
}
