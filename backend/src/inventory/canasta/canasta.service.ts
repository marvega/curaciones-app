import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CanastaCategory, CanastaSection } from './canasta-category.entity';
import { ProductsService } from '../products/products.service';

@Injectable()
export class CanastaService {
  constructor(
    @InjectRepository(CanastaCategory) private readonly repo: Repository<CanastaCategory>,
    private readonly dataSource: DataSource,
    private readonly products: ProductsService,
  ) {}

  list(includeArchived = false): Promise<CanastaCategory[]> {
    return this.repo.find({
      where: includeArchived ? {} : { archived: false },
      relations: ['products'],
      order: { displayOrder: 'ASC' },
    });
  }

  async findById(id: number): Promise<CanastaCategory> {
    const c = await this.repo.findOne({ where: { id }, relations: ['products'] });
    if (!c) throw new NotFoundException(`Canasta category ${id} not found`);
    return c;
  }

  async replaceProducts(id: number, productIds: number[]): Promise<CanastaCategory> {
    await this.findById(id);
    // Manual replacement: wipe ALL associations (manual + auto), insert new as manual
    await this.dataSource.query(
      'DELETE FROM canasta_category_products WHERE "canastaCategoryId" = $1',
      [id],
    );
    if (productIds.length) {
      const placeholders = productIds.map((_, i) => `($1, $${i + 2}, FALSE)`).join(', ');
      await this.dataSource.query(
        `INSERT INTO canasta_category_products ("canastaCategoryId", "productId", "auto_mapped") VALUES ${placeholders}`,
        [id, ...productIds],
      );
    }
    return this.findById(id);
  }

  async createCategory(dto: {
    name: string;
    section: CanastaSection;
    displayOrder?: number;
    isOptional?: boolean;
    notes?: string;
  }): Promise<CanastaCategory> {
    const entity = this.repo.create({
      name: dto.name,
      section: dto.section,
      displayOrder: dto.displayOrder ?? (await this.repo.count()) + 1,
      isOptional: dto.isOptional ?? false,
      notes: dto.notes ?? null,
      archived: false,
      sourceKey: null,
    });
    return this.repo.save(entity);
  }

  async updateCategory(
    id: number,
    dto: Partial<{
      name: string;
      section: CanastaSection;
      displayOrder: number;
      isOptional: boolean;
      notes: string | null;
      archived: boolean;
    }>,
  ): Promise<CanastaCategory> {
    const entity = await this.findById(id);
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async deleteCategory(id: number): Promise<void> {
    await this.findById(id);
    await this.dataSource.query(
      `DELETE FROM canasta_category_products WHERE "canastaCategoryId" = $1`,
      [id],
    );
    await this.repo.delete(id);
  }
}
