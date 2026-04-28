import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Product, ProductType } from './product.entity';
import { ProductCode, CodeSystem } from './product-code.entity';
import { CreateProductDto } from './create-product.dto';
import { UpdateProductDto } from './update-product.dto';

interface UpsertResult {
  action: 'created' | 'updated' | 'unchanged';
  product: Product;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductCode) private readonly codeRepo: Repository<ProductCode>,
  ) {}

  async create(dto: CreateProductDto): Promise<Product> {
    const product = this.productRepo.create({
      name: dto.name,
      type: dto.type,
      packaging: dto.packaging,
      tracksExpiration: dto.tracksExpiration ?? true,
    });
    const saved = await this.productRepo.save(product);
    if (dto.codes?.length) {
      for (const c of dto.codes) {
        await this.codeRepo.save(this.codeRepo.create({ ...c, productId: saved.id }));
      }
    }
    return this.findById(saved.id);
  }

  async findById(id: number): Promise<Product> {
    const p = await this.productRepo.findOne({ where: { id }, relations: ['codes'] });
    if (!p) throw new NotFoundException(`Product ${id} not found`);
    return p;
  }

  async list(opts: { search?: string; type?: ProductType; page?: number; limit?: number }) {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 50, 5000);
    const where: any = {};
    if (opts.search) where.name = ILike(`%${opts.search}%`);
    if (opts.type) where.type = opts.type;
    const [data, total] = await this.productRepo.findAndCount({
      where,
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['codes'],
    });
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  async listAll(): Promise<Product[]> {
    return this.productRepo.find({ order: { name: 'ASC' }, relations: ['codes'] });
  }

  async update(id: number, dto: UpdateProductDto): Promise<Product> {
    await this.findById(id);
    const { codes, ...patch } = dto;
    if (Object.keys(patch).length) await this.productRepo.update(id, patch);
    return this.findById(id);
  }

  async addCode(productId: number, dto: { codeSystem: CodeSystem; code: string }) {
    await this.findById(productId);
    return this.codeRepo.save(this.codeRepo.create({ ...dto, productId }));
  }

  async removeCode(codeId: number) {
    await this.codeRepo.delete(codeId);
  }

  async upsertByCode(
    codeRef: { codeSystem: CodeSystem; code: string },
    productData: { name: string; type: ProductType; packaging: string; tracksExpiration?: boolean },
  ): Promise<UpsertResult> {
    const existing = await this.codeRepo.findOne({ where: codeRef });
    if (existing) {
      const product = await this.productRepo.findOne({ where: { id: existing.productId } });
      if (!product) throw new NotFoundException('Inconsistent code without product');
      const changed =
        product.name !== productData.name ||
        product.type !== productData.type ||
        product.packaging !== productData.packaging;
      if (!changed) return { action: 'unchanged', product };
      Object.assign(product, productData);
      const saved = await this.productRepo.save(product);
      return { action: 'updated', product: saved };
    }
    const created = await this.productRepo.save(
      this.productRepo.create({ ...productData, tracksExpiration: productData.tracksExpiration ?? true }),
    );
    await this.codeRepo.save(this.codeRepo.create({ ...codeRef, productId: created.id }));
    return { action: 'created', product: created };
  }
}
