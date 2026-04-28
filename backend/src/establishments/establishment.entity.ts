import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Organization } from '../organizations/organization.entity';

@Entity('establishments')
@Index('IDX_establishment_org', ['organizationId'])
export class Establishment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint' })
  organizationId: string;

  @Column()
  name: string;

  @Column()
  comuna: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;
}
