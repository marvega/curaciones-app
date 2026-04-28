import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CanastaCategory } from './canasta-category.entity';
import { ProductsService } from '../products/products.service';
import { CANASTA_MAPPINGS } from '../../seeds/canasta-mappings';

@Injectable()
export class CanastaService {
  constructor(
    @InjectRepository(CanastaCategory) private readonly repo: Repository<CanastaCategory>,
    private readonly dataSource: DataSource,
    private readonly products: ProductsService,
  ) {}

  list(): Promise<CanastaCategory[]> {
    return this.repo.find({ relations: ['products'], order: { displayOrder: 'ASC' } });
  }

  async findById(id: number): Promise<CanastaCategory> {
    const c = await this.repo.findOne({ where: { id }, relations: ['products'] });
    if (!c) throw new NotFoundException(`Canasta category ${id} not found`);
    return c;
  }

  async replaceProducts(id: number, productIds: number[]): Promise<CanastaCategory> {
    await this.findById(id);
    await this.dataSource.query(
      'DELETE FROM canasta_category_products WHERE "canastaCategoryId" = $1',
      [id],
    );
    if (productIds.length) {
      const placeholders = productIds.map((_, i) => `($1, $${i + 2})`).join(', ');
      await this.dataSource.query(
        `INSERT INTO canasta_category_products ("canastaCategoryId", "productId") VALUES ${placeholders}`,
        [id, ...productIds],
      );
    }
    return this.findById(id);
  }

  async applyDefaultMappings(): Promise<{ associated: number; skipped: number; details: Array<{ category: string; productIds: number[] }> }> {
    const categories = await this.repo.find({ order: { displayOrder: 'ASC' } });
    const allProducts = await this.products.list({ limit: 5000 });
    let associated = 0;
    let skipped = 0;
    const details: Array<{ category: string; productIds: number[] }> = [];

    for (const mapping of CANASTA_MAPPINGS) {
      const category = categories.find((c) => c.displayOrder === mapping.displayOrder);
      if (!category) { skipped++; continue; }
      const matchedProductIds = new Set<number>();
      for (const p of allProducts.data) {
        const codes = (p.codes ?? []).map((c: any) => c.code);
        for (const matcher of mapping.matchers) {
          const codeHit = matcher.avisCodes?.some((c) => codes.includes(c)) ?? false;
          const nameHit = matcher.namePatterns?.some((re) => re.test(p.name)) ?? false;
          if (codeHit || nameHit) {
            matchedProductIds.add(p.id);
            break;
          }
        }
      }
      if (matchedProductIds.size > 0) {
        await this.replaceProducts(category.id, [...matchedProductIds]);
        associated += matchedProductIds.size;
      }
      details.push({ category: category.name, productIds: [...matchedProductIds] });
    }
    return { associated, skipped, details };
  }
}
