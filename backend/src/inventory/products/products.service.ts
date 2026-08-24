import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Product, ProductType } from './product.entity';
import { ProductCode, CodeSystem } from './product-code.entity';
import { CreateProductDto } from './create-product.dto';
import { UpdateProductDto } from './update-product.dto';
import { findScoped, findOneScoped } from '../../common/org-scoped.repository';
import { getCurrentOrgId } from '../../common/org-context';
import { encodeCursor, decodeCursor } from '../../common/cursor-pagination';

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
    const p = await findOneScoped(this.productRepo, { where: { id }, relations: ['codes'] });
    if (!p) throw new NotFoundException(`Product ${id} not found`);
    return p;
  }

  async list(opts: { search?: string; type?: ProductType; page?: number; limit?: number }) {
    const orgId = getCurrentOrgId();
    if (!orgId) throw new Error('No org context');
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 50, 5000);
    const where: any = { organizationId: orgId };
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
    return findScoped(this.productRepo, { order: { name: 'ASC' }, relations: ['codes'] });
  }

  /**
   * Cursor-paginated listing for stable iteration (used by the MCP server).
   * Orders by (createdAt DESC, id DESC) so the cursor tuple is unique.
   *
   * The existing `list()` method uses `name ASC` and supports `?search=`. The
   * cursor branch instead orders by (createdAt, id) — name is not unique
   * enough to form a stable total order. Search continues to ILIKE on `name`
   * (the only plaintext text column on Product).
   *
   * Contract: returns `{ items, nextCursor }`. `nextCursor` is `undefined`
   * when there are no more rows.
   */
  async findByCursor(args: {
    cursor?: string;
    limit: number;
    q?: string;
  }): Promise<{ items: Product[]; nextCursor?: string }> {
    const orgId = getCurrentOrgId();
    if (!orgId) throw new Error('No org context');
    const cappedLimit = Math.max(1, Math.min(args.limit, 100));
    const decoded = decodeCursor(args.cursor);

    const qb = this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.codes', 'codes')
      .where('p."organizationId" = :orgId', { orgId })
      // Property path, not pre-quoted SQL — `take` plus the joined-and-selected
      // `codes` relation sends this through TypeORM's DISTINCT-id subquery,
      // whose ORDER BY rewrite resolves each key through entity metadata and
      // cannot resolve `'p."createdAt"'`. See the note in
      // `WoundNotesService.findByPatientCursor`. `take` (not `limit`) is
      // required here because `codes` is `@OneToMany`: pages are entities, not
      // rows.
      .orderBy('p.createdAt', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .take(cappedLimit + 1);

    if (decoded) {
      qb.andWhere(
        '(p."createdAt", p.id) < (:cursorCreatedAt, :cursorId)',
        { cursorCreatedAt: decoded.createdAt, cursorId: decoded.id },
      );
    }
    if (args.q) {
      qb.andWhere('p.name ILIKE :q', { q: `%${args.q}%` });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > cappedLimit;
    const items = hasMore ? rows.slice(0, cappedLimit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({ id: last.id, createdAt: last.createdAt })
        : undefined;

    return { items, nextCursor };
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
      const product = await findOneScoped(this.productRepo, { where: { id: existing.productId } });
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
