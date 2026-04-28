import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CanastaCategory } from './canasta-category.entity';
import { ProductsService } from '../products/products.service';

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
}
