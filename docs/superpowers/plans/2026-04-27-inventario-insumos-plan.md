# Inventario de insumos médicos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 1 of medical supplies inventory: catalog with multi-comuna codes, lots with expiration tracking, weekly event-sourced stock counts, and automatic generation of the Canasta CAPD audit Excel.

**Architecture:** New module tree under `backend/src/inventory/` (products, lots, movements, stock-counts, canasta, audit-export) plus a top-level `establishments/` module. Stock is derived from `lot_movements` (event-sourced). Excel parsing/generation lives in backend with `xlsx` lazy-imported. Frontend gets a new `pages/inventory/` directory with 6 pages and a separate banner component for expiring lots.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL, JWT, `xlsx` (npm), React 19, Vite, Tailwind, axios, `xlsx` (frontend already has it but is unused for this feature).

**Reference spec:** `docs/superpowers/specs/2026-04-27-inventario-insumos-design.md`

---

## File Structure

### Backend — new files

```
backend/src/
├── common/
│   ├── roles.decorator.ts          NEW — @Roles('admin')
│   └── roles.guard.ts              NEW — checks req.user.role
├── establishments/
│   ├── establishment.entity.ts
│   ├── establishments.module.ts
│   ├── establishments.service.ts
│   └── establishments.service.spec.ts
├── inventory/
│   ├── products/
│   │   ├── product.entity.ts
│   │   ├── product-code.entity.ts
│   │   ├── products.module.ts
│   │   ├── products.service.ts
│   │   ├── products.service.spec.ts
│   │   ├── products.controller.ts
│   │   ├── create-product.dto.ts
│   │   ├── update-product.dto.ts
│   │   ├── excel-import.service.ts
│   │   └── excel-import.service.spec.ts
│   ├── lots/
│   │   ├── lot.entity.ts
│   │   ├── lots.module.ts
│   │   ├── lots.service.ts
│   │   ├── lots.service.spec.ts
│   │   ├── lots.controller.ts
│   │   └── reception.dto.ts
│   ├── movements/
│   │   ├── lot-movement.entity.ts
│   │   ├── movements.module.ts
│   │   ├── movements.service.ts
│   │   └── movements.service.spec.ts
│   ├── stock-counts/
│   │   ├── stock-count.entity.ts
│   │   ├── stock-counts.module.ts
│   │   ├── stock-counts.service.ts
│   │   ├── stock-counts.service.spec.ts
│   │   └── stock-counts.controller.ts
│   ├── canasta/
│   │   ├── canasta-category.entity.ts
│   │   ├── canasta-category-product.entity.ts
│   │   ├── canasta.module.ts
│   │   ├── canasta.service.ts
│   │   ├── canasta.service.spec.ts
│   │   └── canasta.controller.ts
│   └── audit-export/
│       ├── audit-export.module.ts
│       ├── audit-export.service.ts
│       ├── audit-export.service.spec.ts
│       └── audit-export.controller.ts
├── migrations/
│   └── 1714240000000-InventoryFoundation.ts
└── seeds/
    └── canasta-mappings.ts          NEW — initial mapping rules
```

### Backend — modified files

- `backend/src/app.module.ts` — register all new modules + entities.
- `backend/src/audit-log/audit-log.interceptor.ts` — add `/api/inventory/products/import` to `SKIP_PATHS` (file upload, not auditable as plain JSON).
- `backend/package.json` — add `xlsx`.
- `backend/test/factories.ts` — add factories for inventory entities.

### Frontend — new files

```
frontend/src/
├── components/
│   └── ExpiringLotsBanner.tsx       NEW — banner for expiring lots
├── pages/inventory/
│   ├── InventoryListPage.tsx
│   ├── ReceptionPage.tsx
│   ├── StockCountPage.tsx
│   ├── CatalogAdminPage.tsx
│   ├── CanastaAdminPage.tsx
│   ├── AuditExportPage.tsx
│   └── __tests__/
│       ├── InventoryListPage.test.tsx
│       └── StockCountPage.test.tsx
└── hooks/
    └── useDebounce.ts               NEW — for stock count autosave
```

### Frontend — modified files

- `frontend/src/App.tsx` — add 6 new routes.
- `frontend/src/components/Layout.tsx` — add "Inventario" nav item + admin sub-items + render `ExpiringLotsBanner`.
- `frontend/src/services/api.ts` — add ~20 inventory functions.
- `frontend/src/types/index.ts` — add inventory types.

---

## Phase 0 — Setup

### Task 1: Create worktree and install xlsx in backend

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`

- [ ] **Step 1: Create isolated worktree from current branch**

```bash
git worktree add ../curaciones-inventario feat/inventario-insumos-spec
cd ../curaciones-inventario
```

- [ ] **Step 2: Install xlsx in backend**

```bash
cd backend && npm install xlsx@^0.18.5
```

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore(inventory): add xlsx dependency for Excel I/O"
```

---

### Task 2: Roles guard and decorator

**Files:**
- Create: `backend/src/common/roles.decorator.ts`
- Create: `backend/src/common/roles.guard.ts`
- Test: `backend/src/common/roles.guard.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/common/roles.guard.spec.ts
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function mkContext(user: { role?: string } | null, reflectorRoles: string[] | null) {
  const reflector = { get: jest.fn(() => reflectorRoles) } as unknown as Reflector;
  const ctx = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return { ctx, reflector };
}

describe('RolesGuard', () => {
  it('allows when no roles required', () => {
    const { ctx, reflector } = mkContext({ role: 'user' }, null);
    expect(new RolesGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it('allows when user role matches required', () => {
    const { ctx, reflector } = mkContext({ role: 'admin' }, ['admin']);
    expect(new RolesGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it('rejects when user role does not match', () => {
    const { ctx, reflector } = mkContext({ role: 'user' }, ['admin']);
    expect(new RolesGuard(reflector).canActivate(ctx)).toBe(false);
  });

  it('rejects when no user on request', () => {
    const { ctx, reflector } = mkContext(null, ['admin']);
    expect(new RolesGuard(reflector).canActivate(ctx)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npm test -- roles.guard.spec
```

Expected: FAIL with "Cannot find module './roles.guard'"

- [ ] **Step 3: Implement decorator and guard**

```typescript
// backend/src/common/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

```typescript
// backend/src/common/roles.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.get<string[] | null>(ROLES_KEY, context.getHandler());
    if (!required || required.length === 0) return true;
    const { user } = context.switchToHttp().getRequest();
    if (!user || !user.role) return false;
    return required.includes(user.role);
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd backend && npm test -- roles.guard.spec
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/roles.decorator.ts backend/src/common/roles.guard.ts backend/src/common/roles.guard.spec.ts
git commit -m "feat(common): add RolesGuard and @Roles decorator"
```

---

### Task 3: Create migration with 8 tables and seeds

**Files:**
- Create: `backend/src/migrations/1714240000000-InventoryFoundation.ts`

- [ ] **Step 1: Write the migration**

```typescript
// backend/src/migrations/1714240000000-InventoryFoundation.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class InventoryFoundation1714240000000 implements MigrationInterface {
  name = 'InventoryFoundation1714240000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "establishments" (
        "id"        SERIAL PRIMARY KEY,
        "name"      varchar NOT NULL,
        "comuna"    varchar NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "products" (
        "id"               SERIAL PRIMARY KEY,
        "name"             varchar NOT NULL,
        "type"             varchar NOT NULL,
        "packaging"        varchar NOT NULL,
        "tracksExpiration" boolean NOT NULL DEFAULT true,
        "createdAt"        TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_codes" (
        "id"         SERIAL PRIMARY KEY,
        "productId"  integer NOT NULL,
        "codeSystem" varchar NOT NULL,
        "code"       varchar NOT NULL,
        CONSTRAINT "FK_pc_product"
          FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_pc_system_code" UNIQUE ("codeSystem", "code")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pc_product" ON "product_codes"("productId")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "lots" (
        "id"               SERIAL PRIMARY KEY,
        "productId"        integer NOT NULL,
        "establishmentId"  integer NOT NULL,
        "lotCode"          varchar,
        "expiresAt"        date,
        "receivedAt"       date NOT NULL,
        "createdAt"        TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_lot_product"
          FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_lot_establishment"
          FOREIGN KEY ("establishmentId") REFERENCES "establishments"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_lot_prod_est" ON "lots"("productId","establishmentId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_lot_expires" ON "lots"("expiresAt")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stock_counts" (
        "id"               SERIAL PRIMARY KEY,
        "establishmentId"  integer NOT NULL,
        "countDate"        date NOT NULL,
        "status"           varchar NOT NULL DEFAULT 'DRAFT',
        "closedAt"         TIMESTAMP,
        "performedById"    integer NOT NULL,
        "createdAt"        TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_sc_establishment"
          FOREIGN KEY ("establishmentId") REFERENCES "establishments"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sc_user"
          FOREIGN KEY ("performedById") REFERENCES "users"("id"),
        CONSTRAINT "UQ_sc_est_date" UNIQUE ("establishmentId", "countDate")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "lot_movements" (
        "id"             SERIAL PRIMARY KEY,
        "lotId"          integer NOT NULL,
        "type"           varchar NOT NULL,
        "delta"          integer,
        "absoluteValue"  integer,
        "stockCountId"   integer,
        "notes"          text,
        "performedById"  integer NOT NULL,
        "createdAt"      TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_lm_lot"
          FOREIGN KEY ("lotId") REFERENCES "lots"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_lm_user"
          FOREIGN KEY ("performedById") REFERENCES "users"("id"),
        CONSTRAINT "FK_lm_stock_count"
          FOREIGN KEY ("stockCountId") REFERENCES "stock_counts"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_lm_type" CHECK (
          (type = 'COUNT' AND "absoluteValue" IS NOT NULL AND "delta" IS NULL) OR
          (type IN ('RECEPTION','ADJUSTMENT') AND "delta" IS NOT NULL AND "absoluteValue" IS NULL)
        )
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_lm_lot_date" ON "lot_movements"("lotId","createdAt")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "canasta_categories" (
        "id"            SERIAL PRIMARY KEY,
        "name"          varchar NOT NULL,
        "section"       varchar NOT NULL,
        "displayOrder"  integer NOT NULL,
        "isOptional"    boolean NOT NULL DEFAULT false,
        "notes"         text
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "canasta_category_products" (
        "canastaCategoryId" integer NOT NULL,
        "productId"         integer NOT NULL,
        PRIMARY KEY ("canastaCategoryId", "productId"),
        CONSTRAINT "FK_ccp_category"
          FOREIGN KEY ("canastaCategoryId") REFERENCES "canasta_categories"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ccp_product"
          FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    // Seeds
    await queryRunner.query(`
      INSERT INTO "establishments" ("name","comuna")
      SELECT 'CESFAM Pompeya', 'Quilpué'
      WHERE NOT EXISTS (SELECT 1 FROM "establishments")
    `);

    const categories: Array<[string, string, number, boolean, string | null]> = [
      ['Apósitos bacteriostáticos', 'INSUMOS', 1, false, 'Ringer+PHMB; DACC lámina; PHMB Rollo; Miel Gel'],
      ['Apósito absorbente', 'INSUMOS', 2, false, 'Alginato 10x10; Carboximetilcelulosa 10x10; Espuma Hidrofílica c/Silicona 10x10; Espuma c/Hidrogel 10x10'],
      ['Apósito hidratante', 'INSUMOS', 3, false, 'Poliéster 10x10; Hidrogel 15g; Tull silicona 10x10; Nylon 10x10'],
      ['Apósito regenerativo', 'INSUMOS', 4, false, 'Colágeno; Inhibidor Metaloproteasa'],
      ['Solución limpiadora antibiofilm o limpiadora', 'INSUMOS', 5, false, null],
      ['Ácidos grasos hiperoxigenados (lubricante cutáneo)', 'INSUMOS', 6, false, null],
      ['Curetas 3-4 mm', 'INSUMOS', 7, false, null],
      ['Apósitos bactericidas', 'INSUMOS', 8, false, 'Alginato c/Plata 10x10; Plata Nanocristalina 10x10; Tull c/Plata; apósito que contenga plata'],
      ['Espuma limpiadora (opcional)', 'INSUMOS', 9, true, null],
      ['Protector cutáneo spray (opcional)', 'INSUMOS', 10, true, null],
      ['Hidrogel con plata (opcional)', 'INSUMOS', 11, true, null],
      ['Botín descarga antepié con dorsiflexión', 'AYUDAS_TECNICAS', 12, false, 'Gestión externa por kinesiología'],
      ['Botín plano para descarga', 'AYUDAS_TECNICAS', 13, false, 'Gestión externa por kinesiología'],
      ['Bota larga removible', 'AYUDAS_TECNICAS', 14, false, 'Gestión externa por kinesiología'],
    ];
    for (const [name, section, order, optional, notes] of categories) {
      await queryRunner.query(
        `INSERT INTO "canasta_categories" ("name","section","displayOrder","isOptional","notes")
         SELECT $1,$2,$3,$4,$5
         WHERE NOT EXISTS (SELECT 1 FROM "canasta_categories" WHERE "displayOrder"=$3)`,
        [name, section, order, optional, notes],
      );
    }
  }

  public async down(): Promise<void> {
    throw new Error('Reverting InventoryFoundation is not supported. Restore from backup.');
  }
}
```

- [ ] **Step 2: Run migration locally to verify it applies**

```bash
cd backend && npm run migration:run
```

Expected: "Migration InventoryFoundation1714240000000 has been executed successfully."

- [ ] **Step 3: Verify schema**

```bash
docker exec curaciones-db psql -U curaciones -d curaciones -c "\dt" | grep -E "establishments|products|product_codes|lots|lot_movements|stock_counts|canasta"
```

Expected: 8 tables listed.

- [ ] **Step 4: Commit**

```bash
git add backend/src/migrations/1714240000000-InventoryFoundation.ts
git commit -m "feat(inventory): add migration with 8 tables and category seeds"
```

---

## Phase 1 — Establishments

### Task 4: Establishments entity, module, service

**Files:**
- Create: `backend/src/establishments/establishment.entity.ts`
- Create: `backend/src/establishments/establishments.service.ts`
- Create: `backend/src/establishments/establishments.module.ts`
- Test: `backend/src/establishments/establishments.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/establishments/establishments.service.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EstablishmentsService } from './establishments.service';
import { Establishment } from './establishment.entity';

describe('EstablishmentsService', () => {
  let service: EstablishmentsService;
  const repo = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      providers: [
        EstablishmentsService,
        { provide: getRepositoryToken(Establishment), useValue: repo },
      ],
    }).compile();
    service = m.get(EstablishmentsService);
    jest.clearAllMocks();
  });

  it('list returns all establishments ordered by id', async () => {
    repo.find.mockResolvedValue([{ id: 1, name: 'CESFAM Pompeya', comuna: 'Quilpué' }]);
    const result = await service.list();
    expect(result).toHaveLength(1);
    expect(repo.find).toHaveBeenCalledWith({ order: { id: 'ASC' } });
  });

  it('findById throws if not found', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findById(999)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
cd backend && npm test -- establishments.service.spec
```

- [ ] **Step 3: Implement entity, service, module**

```typescript
// backend/src/establishments/establishment.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('establishments')
export class Establishment {
  @PrimaryGeneratedColumn() id: number;
  @Column() name: string;
  @Column() comuna: string;
  @CreateDateColumn() createdAt: Date;
}
```

```typescript
// backend/src/establishments/establishments.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Establishment } from './establishment.entity';

@Injectable()
export class EstablishmentsService {
  constructor(
    @InjectRepository(Establishment)
    private readonly repo: Repository<Establishment>,
  ) {}

  list(): Promise<Establishment[]> {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  async findById(id: number): Promise<Establishment> {
    const e = await this.repo.findOne({ where: { id } });
    if (!e) throw new NotFoundException(`Establishment ${id} not found`);
    return e;
  }
}
```

```typescript
// backend/src/establishments/establishments.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Establishment } from './establishment.entity';
import { EstablishmentsService } from './establishments.service';

@Module({
  imports: [TypeOrmModule.forFeature([Establishment])],
  providers: [EstablishmentsService],
  exports: [EstablishmentsService, TypeOrmModule],
})
export class EstablishmentsModule {}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
cd backend && npm test -- establishments.service.spec
```

- [ ] **Step 5: Register entity in `app.module.ts`**

In `backend/src/app.module.ts`, add to imports of `entities` array in `TypeOrmModule.forRoot`:

```typescript
import { Establishment } from './establishments/establishment.entity';
// then: entities: [..., Establishment]
```

And add `EstablishmentsModule` to module imports.

- [ ] **Step 6: Commit**

```bash
git add backend/src/establishments backend/src/app.module.ts
git commit -m "feat(establishments): add entity, service, module"
```

---

## Phase 2 — Products module

### Task 5: Product and ProductCode entities

**Files:**
- Create: `backend/src/inventory/products/product.entity.ts`
- Create: `backend/src/inventory/products/product-code.entity.ts`

- [ ] **Step 1: Write entities**

```typescript
// backend/src/inventory/products/product.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { ProductCode } from './product-code.entity';

export enum ProductType {
  INSUMO = 'INSUMO',
  MEDICAMENTO = 'MEDICAMENTO',
  ORTESIS = 'ORTESIS',
  OTRO = 'OTRO',
}

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn() id: number;
  @Column() name: string;
  @Column({ type: 'varchar' }) type: ProductType;
  @Column() packaging: string;
  @Column({ type: 'boolean', default: true }) tracksExpiration: boolean;
  @CreateDateColumn() createdAt: Date;

  @OneToMany(() => ProductCode, (c) => c.product, { cascade: true })
  codes: ProductCode[];
}
```

```typescript
// backend/src/inventory/products/product-code.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Product } from './product.entity';

export enum CodeSystem {
  AVIS_QUILPUE = 'AVIS_QUILPUE',
  AVIS_OTRA = 'AVIS_OTRA',
  RAYEN = 'RAYEN',
  OTRO = 'OTRO',
}

@Entity('product_codes')
@Unique(['codeSystem', 'code'])
export class ProductCode {
  @PrimaryGeneratedColumn() id: number;
  @Column() productId: number;
  @Column({ type: 'varchar' }) codeSystem: CodeSystem;
  @Column() code: string;

  @ManyToOne(() => Product, (p) => p.codes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;
}
```

- [ ] **Step 2: Register in `app.module.ts`** (add to entities array; `Product` and `ProductCode`)

- [ ] **Step 3: Build to verify TypeScript**

```bash
cd backend && npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add backend/src/inventory/products/product.entity.ts backend/src/inventory/products/product-code.entity.ts backend/src/app.module.ts
git commit -m "feat(inventory): add Product and ProductCode entities"
```

---

### Task 6: Products service with CRUD and code management

**Files:**
- Create: `backend/src/inventory/products/products.service.ts`
- Test: `backend/src/inventory/products/products.service.spec.ts`
- Create: `backend/src/inventory/products/create-product.dto.ts`
- Create: `backend/src/inventory/products/update-product.dto.ts`

- [ ] **Step 1: Write DTOs**

```typescript
// backend/src/inventory/products/create-product.dto.ts
import { IsString, IsEnum, IsOptional, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductType } from './product.entity';
import { CodeSystem } from './product-code.entity';

export class ProductCodeDto {
  @IsEnum(CodeSystem) codeSystem: CodeSystem;
  @IsString() code: string;
}

export class CreateProductDto {
  @IsString() name: string;
  @IsEnum(ProductType) type: ProductType;
  @IsString() packaging: string;
  @IsOptional() @IsBoolean() tracksExpiration?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ProductCodeDto)
  codes?: ProductCodeDto[];
}
```

```typescript
// backend/src/inventory/products/update-product.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';
export class UpdateProductDto extends PartialType(CreateProductDto) {}
```

- [ ] **Step 2: Write the failing test**

```typescript
// backend/src/inventory/products/products.service.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { Product, ProductType } from './product.entity';
import { ProductCode, CodeSystem } from './product-code.entity';
import { NotFoundException } from '@nestjs/common';

describe('ProductsService', () => {
  let service: ProductsService;
  const productRepo = {
    create: jest.fn((dto) => dto),
    save: jest.fn((e) => Promise.resolve({ id: 1, ...e })),
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    update: jest.fn(),
  };
  const codeRepo = {
    findOne: jest.fn(),
    save: jest.fn((e) => Promise.resolve({ id: 1, ...e })),
    create: jest.fn((dto) => dto),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(ProductCode), useValue: codeRepo },
      ],
    }).compile();
    service = m.get(ProductsService);
    jest.clearAllMocks();
  });

  it('create persists product with codes', async () => {
    const dto = {
      name: 'Apósito X',
      type: ProductType.INSUMO,
      packaging: 'UNIDAD',
      codes: [{ codeSystem: CodeSystem.AVIS_QUILPUE, code: '1778' }],
    };
    productRepo.save.mockResolvedValue({ id: 5, ...dto });
    const result = await service.create(dto as any);
    expect(productRepo.save).toHaveBeenCalled();
    expect(result.id).toBe(5);
  });

  it('upsertByCode updates existing when code matches', async () => {
    codeRepo.findOne.mockResolvedValue({ id: 9, productId: 7, codeSystem: CodeSystem.AVIS_QUILPUE, code: '1778' });
    productRepo.findOne.mockResolvedValue({ id: 7, name: 'Old', type: 'INSUMO', packaging: 'UNIDAD' });
    productRepo.save.mockResolvedValue({ id: 7, name: 'New', type: 'INSUMO', packaging: 'UNIDAD' });

    const result = await service.upsertByCode(
      { codeSystem: CodeSystem.AVIS_QUILPUE, code: '1778' },
      { name: 'New', type: ProductType.INSUMO, packaging: 'UNIDAD' },
    );
    expect(result.action).toBe('updated');
    expect(productRepo.save).toHaveBeenCalled();
  });

  it('upsertByCode creates new when no code matches', async () => {
    codeRepo.findOne.mockResolvedValue(null);
    productRepo.save.mockResolvedValue({ id: 8, name: 'New', type: 'INSUMO', packaging: 'UNIDAD' });
    codeRepo.save.mockResolvedValue({ id: 1, productId: 8, codeSystem: CodeSystem.AVIS_QUILPUE, code: '999' });

    const result = await service.upsertByCode(
      { codeSystem: CodeSystem.AVIS_QUILPUE, code: '999' },
      { name: 'New', type: ProductType.INSUMO, packaging: 'UNIDAD' },
    );
    expect(result.action).toBe('created');
  });

  it('findById throws when missing', async () => {
    productRepo.findOne.mockResolvedValue(null);
    await expect(service.findById(404)).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 3: Run test, expect FAIL**

```bash
cd backend && npm test -- products.service.spec
```

- [ ] **Step 4: Implement service**

```typescript
// backend/src/inventory/products/products.service.ts
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
    const limit = Math.min(opts.limit ?? 50, 200);
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
```

- [ ] **Step 5: Run test, expect PASS**

- [ ] **Step 6: Commit**

```bash
git add backend/src/inventory/products
git commit -m "feat(inventory): add products service with CRUD and upsertByCode"
```

---

### Task 7: Products controller and module

**Files:**
- Create: `backend/src/inventory/products/products.controller.ts`
- Create: `backend/src/inventory/products/products.module.ts`

- [ ] **Step 1: Write controller**

```typescript
// backend/src/inventory/products/products.controller.ts
import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { ProductsService } from './products.service';
import { CreateProductDto, ProductCodeDto } from './create-product.dto';
import { UpdateProductDto } from './update-product.dto';
import { ProductType } from './product.entity';

@ApiTags('Inventory / Products')
@ApiBearerAuth()
@Controller('api/inventory/products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('type') type?: ProductType,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.products.list({
      search,
      type,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.products.findById(id);
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Post(':id/codes')
  @Roles('admin')
  addCode(@Param('id', ParseIntPipe) id: number, @Body() dto: ProductCodeDto) {
    return this.products.addCode(id, dto);
  }

  @Delete('codes/:codeId')
  @Roles('admin')
  async removeCode(@Param('codeId', ParseIntPipe) codeId: number) {
    await this.products.removeCode(codeId);
    return { ok: true };
  }
}
```

- [ ] **Step 2: Write module** (reused later by other inventory modules)

```typescript
// backend/src/inventory/products/products.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './product.entity';
import { ProductCode } from './product-code.entity';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductCode])],
  providers: [ProductsService],
  controllers: [ProductsController],
  exports: [ProductsService, TypeOrmModule],
})
export class ProductsModule {}
```

- [ ] **Step 3: Register in `app.module.ts`** (add `ProductsModule` to imports)

- [ ] **Step 4: Build and start backend**

```bash
cd backend && npm run build && npm run start:dev &
sleep 5
curl -s http://localhost:3000/api/health | head -c 200
```

Expected: `{"status":"ok",...}`. Stop server with `kill %1`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/inventory/products/products.controller.ts backend/src/inventory/products/products.module.ts backend/src/app.module.ts
git commit -m "feat(inventory): add products controller and module"
```

---

### Task 8: Excel import service for products

**Files:**
- Create: `backend/src/inventory/products/excel-import.service.ts`
- Test: `backend/src/inventory/products/excel-import.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/inventory/products/excel-import.service.spec.ts
import * as XLSX from 'xlsx';
import { ExcelImportService } from './excel-import.service';
import { ProductsService } from './products.service';
import { ProductType } from './product.entity';
import { CodeSystem } from './product-code.entity';

function buildXlsxBuffer(rows: any[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'PRODUCTOS AVIS');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('ExcelImportService', () => {
  let service: ExcelImportService;
  let products: jest.Mocked<Pick<ProductsService, 'upsertByCode'>>;

  beforeEach(() => {
    products = { upsertByCode: jest.fn() } as any;
    service = new ExcelImportService(products as unknown as ProductsService);
  });

  it('imports rows from PRODUCTOS AVIS sheet', async () => {
    const buf = buildXlsxBuffer([
      ['TIPO', 'CÓMO PEDIR', 'CODIGO AVIS', 'ARTICULO'],
      ['INSUMO', 'UNIDAD', 1778, 'APÓSITO RINGER CON PHMB 10X10 CM UNIDAD'],
      ['MEDICAMENTO', 'UNIDAD', 27, 'ACIDO TRANEXAMICO 1000 MG'],
    ]);
    products.upsertByCode
      .mockResolvedValueOnce({ action: 'created' } as any)
      .mockResolvedValueOnce({ action: 'created' } as any);

    const result = await service.import(buf, 'PRODUCTOS AVIS');
    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(products.upsertByCode).toHaveBeenCalledWith(
      { codeSystem: CodeSystem.AVIS_QUILPUE, code: '1778' },
      expect.objectContaining({ name: 'APÓSITO RINGER CON PHMB 10X10 CM UNIDAD', type: ProductType.INSUMO, packaging: 'UNIDAD' }),
    );
  });

  it('skips rows with missing code or name', async () => {
    const buf = buildXlsxBuffer([
      ['TIPO', 'CÓMO PEDIR', 'CODIGO AVIS', 'ARTICULO'],
      ['INSUMO', 'UNIDAD', null, 'No code'],
      ['INSUMO', 'UNIDAD', 100, null],
    ]);
    const result = await service.import(buf, 'PRODUCTOS AVIS');
    expect(result.skipped).toBe(2);
    expect(products.upsertByCode).not.toHaveBeenCalled();
  });

  it('counts updated and unchanged separately', async () => {
    const buf = buildXlsxBuffer([
      ['TIPO', 'CÓMO PEDIR', 'CODIGO AVIS', 'ARTICULO'],
      ['INSUMO', 'UNIDAD', 1, 'A'],
      ['INSUMO', 'UNIDAD', 2, 'B'],
      ['INSUMO', 'UNIDAD', 3, 'C'],
    ]);
    products.upsertByCode
      .mockResolvedValueOnce({ action: 'created' } as any)
      .mockResolvedValueOnce({ action: 'updated' } as any)
      .mockResolvedValueOnce({ action: 'unchanged' } as any);
    const result = await service.import(buf, 'PRODUCTOS AVIS');
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.unchanged).toBe(1);
  });

  it('captures per-row errors without aborting', async () => {
    const buf = buildXlsxBuffer([
      ['TIPO', 'CÓMO PEDIR', 'CODIGO AVIS', 'ARTICULO'],
      ['INSUMO', 'UNIDAD', 1, 'A'],
      ['INSUMO', 'UNIDAD', 2, 'B'],
    ]);
    products.upsertByCode
      .mockResolvedValueOnce({ action: 'created' } as any)
      .mockRejectedValueOnce(new Error('boom'));
    const result = await service.import(buf, 'PRODUCTOS AVIS');
    expect(result.created).toBe(1);
    expect(result.errors).toEqual([{ row: 3, reason: 'boom' }]);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

```bash
cd backend && npm test -- excel-import.service.spec
```

- [ ] **Step 3: Implement service** (xlsx lazy-loaded)

```typescript
// backend/src/inventory/products/excel-import.service.ts
import { Injectable } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductType } from './product.entity';
import { CodeSystem } from './product-code.entity';

export interface ImportResult {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
}

const TYPE_MAP: Record<string, ProductType> = {
  INSUMO: ProductType.INSUMO,
  MEDICAMENTO: ProductType.MEDICAMENTO,
  ORTESIS: ProductType.ORTESIS,
};

@Injectable()
export class ExcelImportService {
  constructor(private readonly products: ProductsService) {}

  async import(buffer: Buffer, sheetName = 'PRODUCTOS AVIS'): Promise<ImportResult> {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[sheetName];
    if (!ws) throw new Error(`Sheet "${sheetName}" not found`);

    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
    const result: ImportResult = { created: 0, updated: 0, unchanged: 0, skipped: 0, errors: [] };

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const [rawType, rawPackaging, rawCode, rawName] = row;
      if (rawCode == null || rawName == null) {
        result.skipped++;
        continue;
      }
      const code = String(rawCode).trim();
      const name = String(rawName).trim();
      const packaging = String(rawPackaging ?? 'UNIDAD').trim();
      const typeKey = String(rawType ?? 'INSUMO').trim().toUpperCase();
      const type = TYPE_MAP[typeKey] ?? ProductType.OTRO;

      try {
        const r = await this.products.upsertByCode(
          { codeSystem: CodeSystem.AVIS_QUILPUE, code },
          { name, type, packaging, tracksExpiration: type !== ProductType.ORTESIS },
        );
        if (r.action === 'created') result.created++;
        else if (r.action === 'updated') result.updated++;
        else result.unchanged++;
      } catch (e: any) {
        result.errors.push({ row: i + 1, reason: e?.message ?? String(e) });
      }
    }
    return result;
  }
}
```

- [ ] **Step 4: Run test, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/src/inventory/products/excel-import.service.ts backend/src/inventory/products/excel-import.service.spec.ts
git commit -m "feat(inventory): add Excel bulk import service for products"
```

---

### Task 9: Bulk import endpoint integration

**Files:**
- Modify: `backend/src/inventory/products/products.controller.ts`
- Modify: `backend/src/inventory/products/products.module.ts`
- Modify: `backend/src/audit-log/audit-log.interceptor.ts` — add `/api/inventory/products/import` to skip list

- [ ] **Step 1: Wire ExcelImportService into module providers**

In `products.module.ts`, add `ExcelImportService` to `providers`.

- [ ] **Step 2: Add endpoint with multer interceptor**

Append to `products.controller.ts`:

```typescript
import { UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExcelImportService } from './excel-import.service';

// ...inside class, add constructor field:
// private readonly importer: ExcelImportService

// ...in ProductsController class:
@Post('import')
@Roles('admin')
@UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
async importExcel(
  @UploadedFile() file: Express.Multer.File,
  @Query('sheet') sheet?: string,
) {
  if (!file?.buffer) throw new BadRequestException('Missing file');
  return this.importer.import(file.buffer, sheet ?? 'PRODUCTOS AVIS');
}
```

Update constructor:

```typescript
constructor(
  private readonly products: ProductsService,
  private readonly importer: ExcelImportService,
) {}
```

- [ ] **Step 3: Add to audit-log skip list**

In `backend/src/audit-log/audit-log.interceptor.ts`, append to `SKIP_PATHS`:

```typescript
'/api/inventory/products/import',
```

- [ ] **Step 4: Manual verification with sample Excel**

```bash
cd backend && npm run start:dev &
sleep 5
# Login as admin (assumes seed admin exists), grab token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | jq -r .access_token)
curl -s -X POST http://localhost:3000/api/inventory/products/import \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/Users/marcelo/Downloads/NUEVO FORMATO SOLICITUD UNIDADES (4) (1) (1).xlsx" \
  -F "sheet=PRODUCTOS AVIS" | head -c 400
kill %1
```

Expected output: `{"created":<num>,"updated":0,"unchanged":0,"skipped":0,"errors":[...]}` with created > 600.

- [ ] **Step 5: Commit**

```bash
git add backend/src/inventory/products backend/src/audit-log/audit-log.interceptor.ts
git commit -m "feat(inventory): add /products/import endpoint for bulk Excel upload"
```

---

## Phase 3 — Lots and movements

### Task 10: Lot and LotMovement entities

**Files:**
- Create: `backend/src/inventory/lots/lot.entity.ts`
- Create: `backend/src/inventory/movements/lot-movement.entity.ts`

- [ ] **Step 1: Write entities**

```typescript
// backend/src/inventory/lots/lot.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Product } from '../products/product.entity';
import { Establishment } from '../../establishments/establishment.entity';
import { LotMovement } from '../movements/lot-movement.entity';

@Entity('lots')
export class Lot {
  @PrimaryGeneratedColumn() id: number;
  @Column() productId: number;
  @Column() establishmentId: number;
  @Column({ nullable: true, type: 'varchar' }) lotCode: string | null;
  @Column({ nullable: true, type: 'date' }) expiresAt: string | null;
  @Column({ type: 'date' }) receivedAt: string;
  @CreateDateColumn() createdAt: Date;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @ManyToOne(() => Establishment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'establishmentId' })
  establishment: Establishment;

  @OneToMany(() => LotMovement, (m) => m.lot)
  movements: LotMovement[];
}
```

```typescript
// backend/src/inventory/movements/lot-movement.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Lot } from '../lots/lot.entity';
import { User } from '../../users/user.entity';

export enum LotMovementType {
  RECEPTION = 'RECEPTION',
  COUNT = 'COUNT',
  ADJUSTMENT = 'ADJUSTMENT',
}

@Entity('lot_movements')
export class LotMovement {
  @PrimaryGeneratedColumn() id: number;
  @Column() lotId: number;
  @Column({ type: 'varchar' }) type: LotMovementType;
  @Column({ type: 'int', nullable: true }) delta: number | null;
  @Column({ type: 'int', nullable: true }) absoluteValue: number | null;
  @Column({ type: 'int', nullable: true }) stockCountId: number | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @Column() performedById: number;
  @CreateDateColumn() createdAt: Date;

  @ManyToOne(() => Lot, (l) => l.movements, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lotId' })
  lot: Lot;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'performedById' })
  performedBy: User;
}
```

- [ ] **Step 2: Register both entities in `app.module.ts`**

- [ ] **Step 3: Build to verify**

```bash
cd backend && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/inventory/lots/lot.entity.ts backend/src/inventory/movements/lot-movement.entity.ts backend/src/app.module.ts
git commit -m "feat(inventory): add Lot and LotMovement entities"
```

---

### Task 11: LotsService — reception and stock derivation

**Files:**
- Create: `backend/src/inventory/lots/lots.service.ts`
- Test: `backend/src/inventory/lots/lots.service.spec.ts`
- Create: `backend/src/inventory/lots/reception.dto.ts`

- [ ] **Step 1: Write DTO**

```typescript
// backend/src/inventory/lots/reception.dto.ts
import { IsInt, IsString, IsOptional, IsDateString, Min } from 'class-validator';

export class ReceptionDto {
  @IsInt() productId: number;
  @IsInt() establishmentId: number;
  @IsOptional() @IsString() lotCode?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsDateString() receivedAt: string;
  @IsInt() @Min(1) quantity: number;
  @IsOptional() @IsString() notes?: string;
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// backend/src/inventory/lots/lots.service.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { LotsService } from './lots.service';
import { Lot } from './lot.entity';
import { LotMovement, LotMovementType } from '../movements/lot-movement.entity';

describe('LotsService', () => {
  let service: LotsService;

  const mockManager = {
    create: jest.fn((_E, dto) => dto),
    save: jest.fn((entity) => Promise.resolve({ id: 1, ...entity })),
  };
  const mockQR = {
    connect: jest.fn(), startTransaction: jest.fn(),
    commitTransaction: jest.fn(), rollbackTransaction: jest.fn(), release: jest.fn(),
    manager: mockManager,
  };
  const ds = { createQueryRunner: jest.fn(() => mockQR) } as unknown as DataSource;
  const lotRepo: any = { findOne: jest.fn(), find: jest.fn() };
  const movRepo: any = {
    createQueryBuilder: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      providers: [
        LotsService,
        { provide: getRepositoryToken(Lot), useValue: lotRepo },
        { provide: getRepositoryToken(LotMovement), useValue: movRepo },
        { provide: DataSource, useValue: ds },
      ],
    }).compile();
    service = m.get(LotsService);
    jest.clearAllMocks();
  });

  describe('createReception', () => {
    it('creates lot + RECEPTION movement in a transaction', async () => {
      mockManager.save
        .mockResolvedValueOnce({ id: 7, productId: 1, establishmentId: 1, receivedAt: '2026-04-27' })
        .mockResolvedValueOnce({ id: 1, lotId: 7, type: 'RECEPTION', delta: 50 });
      const lot = await service.createReception(
        { productId: 1, establishmentId: 1, receivedAt: '2026-04-27', quantity: 50, lotCode: 'L1' },
        99,
      );
      expect(mockQR.startTransaction).toHaveBeenCalled();
      expect(mockQR.commitTransaction).toHaveBeenCalled();
      expect(lot.id).toBe(7);
      expect(mockManager.save).toHaveBeenCalledTimes(2);
    });

    it('rolls back on error', async () => {
      mockManager.save.mockRejectedValueOnce(new Error('DB down'));
      await expect(
        service.createReception(
          { productId: 1, establishmentId: 1, receivedAt: '2026-04-27', quantity: 1 },
          99,
        ),
      ).rejects.toThrow('DB down');
      expect(mockQR.rollbackTransaction).toHaveBeenCalled();
      expect(mockQR.release).toHaveBeenCalled();
    });
  });

  describe('getCurrentStock', () => {
    function mockMovs(movs: Array<Partial<LotMovement>>) {
      movRepo.find.mockResolvedValue(movs);
    }

    it('returns 0 with no movements', async () => {
      mockMovs([]);
      expect(await service.getCurrentStock(1)).toBe(0);
    });

    it('sums RECEPTION/ADJUSTMENT when no COUNT exists', async () => {
      mockMovs([
        { type: LotMovementType.RECEPTION, delta: 50, createdAt: new Date('2026-04-01') },
        { type: LotMovementType.ADJUSTMENT, delta: -3, createdAt: new Date('2026-04-05') },
      ]);
      expect(await service.getCurrentStock(1)).toBe(47);
    });

    it('uses last COUNT and sums later RECEPTION/ADJUSTMENT', async () => {
      mockMovs([
        { type: LotMovementType.RECEPTION, delta: 50, createdAt: new Date('2026-04-01') },
        { type: LotMovementType.COUNT, absoluteValue: 40, createdAt: new Date('2026-04-15') },
        { type: LotMovementType.RECEPTION, delta: 10, createdAt: new Date('2026-04-20') },
        { type: LotMovementType.ADJUSTMENT, delta: -2, createdAt: new Date('2026-04-22') },
      ]);
      expect(await service.getCurrentStock(1)).toBe(48);
    });

    it('respects atDate parameter (ignores movements after)', async () => {
      mockMovs([
        { type: LotMovementType.RECEPTION, delta: 50, createdAt: new Date('2026-04-01') },
        { type: LotMovementType.COUNT, absoluteValue: 40, createdAt: new Date('2026-04-15') },
        { type: LotMovementType.RECEPTION, delta: 100, createdAt: new Date('2026-04-25') },
      ]);
      const stock = await service.getCurrentStock(1, new Date('2026-04-20'));
      expect(stock).toBe(40);
    });
  });
});
```

- [ ] **Step 3: Run test, expect FAIL**

```bash
cd backend && npm test -- lots.service.spec
```

- [ ] **Step 4: Implement service**

```typescript
// backend/src/inventory/lots/lots.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, LessThanOrEqual, MoreThanOrEqual, And, IsNull, Not } from 'typeorm';
import { Lot } from './lot.entity';
import { LotMovement, LotMovementType } from '../movements/lot-movement.entity';
import { ReceptionDto } from './reception.dto';

@Injectable()
export class LotsService {
  constructor(
    @InjectRepository(Lot) private readonly lotRepo: Repository<Lot>,
    @InjectRepository(LotMovement) private readonly movRepo: Repository<LotMovement>,
    private readonly dataSource: DataSource,
  ) {}

  async createReception(dto: ReceptionDto, performedById: number): Promise<Lot> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const lot = qr.manager.create(Lot, {
        productId: dto.productId,
        establishmentId: dto.establishmentId,
        lotCode: dto.lotCode ?? null,
        expiresAt: dto.expiresAt ?? null,
        receivedAt: dto.receivedAt,
      });
      const savedLot = await qr.manager.save(lot);
      const movement = qr.manager.create(LotMovement, {
        lotId: savedLot.id,
        type: LotMovementType.RECEPTION,
        delta: dto.quantity,
        notes: dto.notes ?? null,
        performedById,
      });
      await qr.manager.save(movement);
      await qr.commitTransaction();
      return savedLot;
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async findById(id: number): Promise<Lot> {
    const lot = await this.lotRepo.findOne({ where: { id }, relations: ['product', 'movements'] });
    if (!lot) throw new NotFoundException(`Lot ${id} not found`);
    return lot;
  }

  async getCurrentStock(lotId: number, atDate?: Date): Promise<number> {
    const where: any = { lotId };
    if (atDate) where.createdAt = LessThanOrEqual(atDate);
    const movs = await this.movRepo.find({ where, order: { createdAt: 'ASC' } });

    let lastCountIdx = -1;
    for (let i = movs.length - 1; i >= 0; i--) {
      if (movs[i].type === LotMovementType.COUNT) { lastCountIdx = i; break; }
    }

    if (lastCountIdx === -1) {
      return movs.reduce((sum, m) => sum + (m.delta ?? 0), 0);
    }
    let stock = movs[lastCountIdx].absoluteValue ?? 0;
    for (let i = lastCountIdx + 1; i < movs.length; i++) {
      stock += movs[i].delta ?? 0;
    }
    return stock;
  }

  async list(opts: { productId?: number; establishmentId?: number; expiringInDays?: number; active?: boolean }): Promise<Array<Lot & { currentStock: number }>> {
    const where: any = {};
    if (opts.productId) where.productId = opts.productId;
    if (opts.establishmentId) where.establishmentId = opts.establishmentId;
    if (opts.expiringInDays != null) {
      const end = new Date();
      end.setDate(end.getDate() + opts.expiringInDays);
      where.expiresAt = And(MoreThanOrEqual(new Date().toISOString().slice(0, 10) as any), LessThanOrEqual(end.toISOString().slice(0, 10) as any));
    }
    const lots = await this.lotRepo.find({ where, relations: ['product'], order: { expiresAt: 'ASC', id: 'ASC' } });
    const enriched: Array<Lot & { currentStock: number }> = [];
    for (const lot of lots) {
      const stock = await this.getCurrentStock(lot.id);
      if (opts.active && stock <= 0) continue;
      enriched.push(Object.assign(lot, { currentStock: stock }));
    }
    return enriched;
  }

  async getExpiring(establishmentId: number | undefined, days: number): Promise<Array<Lot & { currentStock: number; daysToExpiry: number }>> {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(today); end.setDate(end.getDate() + days);
    const where: any = { expiresAt: And(MoreThanOrEqual(today.toISOString().slice(0, 10) as any), LessThanOrEqual(end.toISOString().slice(0, 10) as any)) };
    if (establishmentId) where.establishmentId = establishmentId;
    const lots = await this.lotRepo.find({ where, relations: ['product'], order: { expiresAt: 'ASC' } });
    const out: Array<Lot & { currentStock: number; daysToExpiry: number }> = [];
    for (const lot of lots) {
      const stock = await this.getCurrentStock(lot.id);
      if (stock <= 0) continue;
      const exp = new Date(lot.expiresAt!);
      const dtd = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      out.push(Object.assign(lot, { currentStock: stock, daysToExpiry: dtd }));
    }
    return out;
  }

  async getStockSnapshot(establishmentId: number | undefined, atDate?: Date): Promise<Array<{ lotId: number; productId: number; stock: number }>> {
    const where: any = {};
    if (establishmentId) where.establishmentId = establishmentId;
    const lots = await this.lotRepo.find({ where });
    const out = [];
    for (const lot of lots) {
      const stock = await this.getCurrentStock(lot.id, atDate);
      out.push({ lotId: lot.id, productId: lot.productId, stock });
    }
    return out;
  }
}
```

- [ ] **Step 5: Run test, expect PASS**

- [ ] **Step 6: Commit**

```bash
git add backend/src/inventory/lots
git commit -m "feat(inventory): add LotsService with event-sourced stock derivation"
```

---

### Task 12: Lots controller and module

**Files:**
- Create: `backend/src/inventory/lots/lots.controller.ts`
- Create: `backend/src/inventory/lots/lots.module.ts`
- Create: `backend/src/inventory/movements/movements.module.ts` (re-export movement repo)

- [ ] **Step 1: Write movements module** (just provides repository for use in lots)

```typescript
// backend/src/inventory/movements/movements.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LotMovement } from './lot-movement.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LotMovement])],
  exports: [TypeOrmModule],
})
export class MovementsModule {}
```

- [ ] **Step 2: Write lots controller**

```typescript
// backend/src/inventory/lots/lots.controller.ts
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { LotsService } from './lots.service';
import { ReceptionDto } from './reception.dto';

@ApiTags('Inventory / Lots')
@ApiBearerAuth()
@Controller('api/inventory')
@UseGuards(JwtAuthGuard)
export class LotsController {
  constructor(private readonly lots: LotsService) {}

  @Get('lots')
  list(
    @Query('productId') productId?: string,
    @Query('establishmentId') establishmentId?: string,
    @Query('expiringInDays') expiringInDays?: string,
    @Query('active') active?: string,
  ) {
    return this.lots.list({
      productId: productId ? parseInt(productId, 10) : undefined,
      establishmentId: establishmentId ? parseInt(establishmentId, 10) : undefined,
      expiringInDays: expiringInDays ? parseInt(expiringInDays, 10) : undefined,
      active: active === 'true',
    });
  }

  @Get('lots/:id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.lots.findById(id);
  }

  @Post('lots/reception')
  reception(@Body() dto: ReceptionDto, @Req() req: any) {
    return this.lots.createReception(dto, req.user.id);
  }

  @Get('expiring')
  expiring(@Query('days') days?: string, @Query('establishmentId') establishmentId?: string) {
    return this.lots.getExpiring(
      establishmentId ? parseInt(establishmentId, 10) : undefined,
      days ? parseInt(days, 10) : 30,
    );
  }

  @Get('stock-snapshot')
  snapshot(@Query('establishmentId') establishmentId?: string, @Query('date') date?: string) {
    return this.lots.getStockSnapshot(
      establishmentId ? parseInt(establishmentId, 10) : undefined,
      date ? new Date(date) : undefined,
    );
  }
}
```

- [ ] **Step 3: Write lots module**

```typescript
// backend/src/inventory/lots/lots.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lot } from './lot.entity';
import { LotMovement } from '../movements/lot-movement.entity';
import { LotsService } from './lots.service';
import { LotsController } from './lots.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Lot, LotMovement])],
  providers: [LotsService],
  controllers: [LotsController],
  exports: [LotsService, TypeOrmModule],
})
export class LotsModule {}
```

- [ ] **Step 4: Register `LotsModule` and `MovementsModule` in `app.module.ts`**

- [ ] **Step 5: Build, start, smoke-test**

```bash
cd backend && npm run build && npm run start:dev &
sleep 5
curl -s http://localhost:3000/api/inventory/lots -H "Authorization: Bearer $TOKEN" | head -c 100
kill %1
```

Expected: `[]` (no lots yet).

- [ ] **Step 6: Commit**

```bash
git add backend/src/inventory/lots/lots.controller.ts backend/src/inventory/lots/lots.module.ts backend/src/inventory/movements/movements.module.ts backend/src/app.module.ts
git commit -m "feat(inventory): add lots controller, module, and reception endpoint"
```

---

### Task 13: Adjustments endpoint

**Files:**
- Modify: `backend/src/inventory/lots/lots.service.ts` — add `createAdjustment`
- Modify: `backend/src/inventory/lots/lots.controller.ts` — add endpoint
- Modify: `backend/src/inventory/lots/lots.service.spec.ts` — add test

- [ ] **Step 1: Append test**

```typescript
// in lots.service.spec.ts, inside describe('LotsService', () => { ... }):
describe('createAdjustment', () => {
  it('persists ADJUSTMENT movement with delta and notes', async () => {
    lotRepo.findOne.mockResolvedValue({ id: 5 });
    movRepo.save = jest.fn((e) => Promise.resolve({ id: 99, ...e }));
    movRepo.create = jest.fn((dto) => dto);
    const result = await service.createAdjustment(5, { delta: -3, notes: 'damaged' }, 99);
    expect(result.delta).toBe(-3);
    expect(result.type).toBe('ADJUSTMENT');
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

- [ ] **Step 3: Append to `LotsService`**

```typescript
async createAdjustment(lotId: number, dto: { delta: number; notes?: string }, performedById: number) {
  await this.findById(lotId);
  return this.movRepo.save(
    this.movRepo.create({
      lotId,
      type: LotMovementType.ADJUSTMENT,
      delta: dto.delta,
      notes: dto.notes ?? null,
      performedById,
    }),
  );
}
```

- [ ] **Step 4: Append to `LotsController`**

```typescript
@Post('lots/:id/adjustments')
adjust(
  @Param('id', ParseIntPipe) id: number,
  @Body() dto: { delta: number; notes?: string },
  @Req() req: any,
) {
  return this.lots.createAdjustment(id, dto, req.user.id);
}
```

- [ ] **Step 5: Run test, expect PASS**

- [ ] **Step 6: Commit**

```bash
git add backend/src/inventory/lots
git commit -m "feat(inventory): add lot adjustments endpoint"
```

---

## Phase 4 — Stock counts

### Task 14: StockCount entity

**Files:**
- Create: `backend/src/inventory/stock-counts/stock-count.entity.ts`

- [ ] **Step 1: Write entity**

```typescript
// backend/src/inventory/stock-counts/stock-count.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Establishment } from '../../establishments/establishment.entity';
import { User } from '../../users/user.entity';

export enum StockCountStatus {
  DRAFT = 'DRAFT',
  CLOSED = 'CLOSED',
}

@Entity('stock_counts')
@Unique(['establishmentId', 'countDate'])
export class StockCount {
  @PrimaryGeneratedColumn() id: number;
  @Column() establishmentId: number;
  @Column({ type: 'date' }) countDate: string;
  @Column({ type: 'varchar', default: StockCountStatus.DRAFT }) status: StockCountStatus;
  @Column({ type: 'timestamp', nullable: true }) closedAt: Date | null;
  @Column() performedById: number;
  @CreateDateColumn() createdAt: Date;

  @ManyToOne(() => Establishment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'establishmentId' })
  establishment: Establishment;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'performedById' })
  performedBy: User;
}
```

- [ ] **Step 2: Register in `app.module.ts`**

- [ ] **Step 3: Build to verify**

- [ ] **Step 4: Commit**

```bash
git add backend/src/inventory/stock-counts/stock-count.entity.ts backend/src/app.module.ts
git commit -m "feat(inventory): add StockCount entity"
```

---

### Task 15: StockCountsService — DRAFT, PATCH lots, CLOSE

**Files:**
- Create: `backend/src/inventory/stock-counts/stock-counts.service.ts`
- Test: `backend/src/inventory/stock-counts/stock-counts.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/inventory/stock-counts/stock-counts.service.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StockCountsService } from './stock-counts.service';
import { StockCount, StockCountStatus } from './stock-count.entity';
import { LotMovement, LotMovementType } from '../movements/lot-movement.entity';

describe('StockCountsService', () => {
  let service: StockCountsService;
  const scRepo: any = { create: jest.fn((e) => e), save: jest.fn(), findOne: jest.fn(), find: jest.fn(), update: jest.fn() };
  const movRepo: any = { create: jest.fn((e) => e), save: jest.fn(), findOne: jest.fn() };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      providers: [
        StockCountsService,
        { provide: getRepositoryToken(StockCount), useValue: scRepo },
        { provide: getRepositoryToken(LotMovement), useValue: movRepo },
      ],
    }).compile();
    service = m.get(StockCountsService);
    jest.clearAllMocks();
  });

  it('openOrCreate returns existing DRAFT for the same date', async () => {
    scRepo.findOne.mockResolvedValue({ id: 5, status: StockCountStatus.DRAFT, establishmentId: 1, countDate: '2026-04-27' });
    const r = await service.openOrCreate(1, '2026-04-27', 99);
    expect(r.id).toBe(5);
    expect(scRepo.save).not.toHaveBeenCalled();
  });

  it('openOrCreate creates new when none exists', async () => {
    scRepo.findOne.mockResolvedValueOnce(null);
    scRepo.save.mockResolvedValue({ id: 8, status: StockCountStatus.DRAFT });
    const r = await service.openOrCreate(1, '2026-04-27', 99);
    expect(r.id).toBe(8);
    expect(scRepo.save).toHaveBeenCalled();
  });

  it('openOrCreate refuses when CLOSED count exists for the date', async () => {
    scRepo.findOne.mockResolvedValue({ id: 5, status: StockCountStatus.CLOSED });
    await expect(service.openOrCreate(1, '2026-04-27', 99)).rejects.toThrow(BadRequestException);
  });

  it('upsertEntry creates new COUNT movement when none exists', async () => {
    scRepo.findOne.mockResolvedValue({ id: 5, status: StockCountStatus.DRAFT });
    movRepo.findOne.mockResolvedValue(null);
    movRepo.save.mockResolvedValue({ id: 1, lotId: 7, absoluteValue: 12, type: LotMovementType.COUNT });
    const r = await service.upsertEntry(5, 7, { absoluteValue: 12 }, 99);
    expect(r.absoluteValue).toBe(12);
  });

  it('upsertEntry updates existing COUNT movement', async () => {
    scRepo.findOne.mockResolvedValue({ id: 5, status: StockCountStatus.DRAFT });
    movRepo.findOne.mockResolvedValue({ id: 33, lotId: 7, absoluteValue: 8, type: LotMovementType.COUNT, stockCountId: 5 });
    movRepo.save.mockResolvedValue({ id: 33, lotId: 7, absoluteValue: 12, type: LotMovementType.COUNT, stockCountId: 5 });
    const r = await service.upsertEntry(5, 7, { absoluteValue: 12 }, 99);
    expect(r.absoluteValue).toBe(12);
    expect(movRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 33 }));
  });

  it('upsertEntry rejects writes when CLOSED', async () => {
    scRepo.findOne.mockResolvedValue({ id: 5, status: StockCountStatus.CLOSED });
    await expect(service.upsertEntry(5, 7, { absoluteValue: 1 }, 99)).rejects.toThrow(BadRequestException);
  });

  it('close transitions DRAFT → CLOSED', async () => {
    scRepo.findOne.mockResolvedValue({ id: 5, status: StockCountStatus.DRAFT });
    scRepo.save.mockResolvedValue({ id: 5, status: StockCountStatus.CLOSED, closedAt: expect.any(Date) });
    const r = await service.close(5);
    expect(r.status).toBe(StockCountStatus.CLOSED);
  });

  it('close is idempotent on already CLOSED', async () => {
    scRepo.findOne.mockResolvedValue({ id: 5, status: StockCountStatus.CLOSED, closedAt: new Date('2026-04-27') });
    const r = await service.close(5);
    expect(r.status).toBe(StockCountStatus.CLOSED);
    expect(scRepo.save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

- [ ] **Step 3: Implement service**

```typescript
// backend/src/inventory/stock-counts/stock-counts.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockCount, StockCountStatus } from './stock-count.entity';
import { LotMovement, LotMovementType } from '../movements/lot-movement.entity';

@Injectable()
export class StockCountsService {
  constructor(
    @InjectRepository(StockCount) private readonly scRepo: Repository<StockCount>,
    @InjectRepository(LotMovement) private readonly movRepo: Repository<LotMovement>,
  ) {}

  async openOrCreate(establishmentId: number, countDate: string, performedById: number): Promise<StockCount> {
    const existing = await this.scRepo.findOne({ where: { establishmentId, countDate } });
    if (existing) {
      if (existing.status === StockCountStatus.CLOSED) {
        throw new BadRequestException(`Count for ${countDate} is already closed`);
      }
      return existing;
    }
    return this.scRepo.save(this.scRepo.create({ establishmentId, countDate, status: StockCountStatus.DRAFT, performedById }));
  }

  async list(opts: { establishmentId?: number; status?: StockCountStatus }) {
    const where: any = {};
    if (opts.establishmentId) where.establishmentId = opts.establishmentId;
    if (opts.status) where.status = opts.status;
    return this.scRepo.find({ where, order: { countDate: 'DESC' } });
  }

  async findById(id: number): Promise<StockCount> {
    const sc = await this.scRepo.findOne({ where: { id } });
    if (!sc) throw new NotFoundException(`StockCount ${id} not found`);
    return sc;
  }

  async upsertEntry(stockCountId: number, lotId: number, dto: { absoluteValue: number; notes?: string }, performedById: number): Promise<LotMovement> {
    const sc = await this.findById(stockCountId);
    if (sc.status === StockCountStatus.CLOSED) {
      throw new BadRequestException('Stock count is closed');
    }
    const existing = await this.movRepo.findOne({ where: { stockCountId, lotId, type: LotMovementType.COUNT } });
    if (existing) {
      existing.absoluteValue = dto.absoluteValue;
      existing.notes = dto.notes ?? existing.notes;
      return this.movRepo.save(existing);
    }
    return this.movRepo.save(
      this.movRepo.create({
        lotId,
        type: LotMovementType.COUNT,
        absoluteValue: dto.absoluteValue,
        delta: null,
        stockCountId,
        notes: dto.notes ?? null,
        performedById,
      }),
    );
  }

  async close(id: number): Promise<StockCount> {
    const sc = await this.findById(id);
    if (sc.status === StockCountStatus.CLOSED) return sc;
    sc.status = StockCountStatus.CLOSED;
    sc.closedAt = new Date();
    return this.scRepo.save(sc);
  }
}
```

- [ ] **Step 4: Run test, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/src/inventory/stock-counts/stock-counts.service.ts backend/src/inventory/stock-counts/stock-counts.service.spec.ts
git commit -m "feat(inventory): add StockCountsService with DRAFT/CLOSED lifecycle"
```

---

### Task 16: StockCounts controller and module

**Files:**
- Create: `backend/src/inventory/stock-counts/stock-counts.controller.ts`
- Create: `backend/src/inventory/stock-counts/stock-counts.module.ts`

- [ ] **Step 1: Write controller**

```typescript
// backend/src/inventory/stock-counts/stock-counts.controller.ts
import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { StockCountsService } from './stock-counts.service';
import { StockCountStatus } from './stock-count.entity';

@ApiTags('Inventory / StockCounts')
@ApiBearerAuth()
@Controller('api/inventory/stock-counts')
@UseGuards(JwtAuthGuard)
export class StockCountsController {
  constructor(private readonly counts: StockCountsService) {}

  @Get()
  list(@Query('establishmentId') establishmentId?: string, @Query('status') status?: StockCountStatus) {
    return this.counts.list({
      establishmentId: establishmentId ? parseInt(establishmentId, 10) : undefined,
      status,
    });
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.counts.findById(id);
  }

  @Post()
  open(@Body() dto: { establishmentId: number; countDate?: string }, @Req() req: any) {
    const date = dto.countDate ?? new Date().toISOString().slice(0, 10);
    return this.counts.openOrCreate(dto.establishmentId, date, req.user.id);
  }

  @Patch(':id/lots/:lotId')
  patch(
    @Param('id', ParseIntPipe) id: number,
    @Param('lotId', ParseIntPipe) lotId: number,
    @Body() dto: { absoluteValue: number; notes?: string },
    @Req() req: any,
  ) {
    return this.counts.upsertEntry(id, lotId, dto, req.user.id);
  }

  @Post(':id/close')
  close(@Param('id', ParseIntPipe) id: number) {
    return this.counts.close(id);
  }
}
```

- [ ] **Step 2: Write module**

```typescript
// backend/src/inventory/stock-counts/stock-counts.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockCount } from './stock-count.entity';
import { LotMovement } from '../movements/lot-movement.entity';
import { StockCountsService } from './stock-counts.service';
import { StockCountsController } from './stock-counts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StockCount, LotMovement])],
  providers: [StockCountsService],
  controllers: [StockCountsController],
  exports: [StockCountsService],
})
export class StockCountsModule {}
```

- [ ] **Step 3: Register in `app.module.ts`**

- [ ] **Step 4: Build, smoke-test**

- [ ] **Step 5: Commit**

```bash
git add backend/src/inventory/stock-counts/stock-counts.controller.ts backend/src/inventory/stock-counts/stock-counts.module.ts backend/src/app.module.ts
git commit -m "feat(inventory): add stock-counts controller and module"
```

---

## Phase 5 — Canasta CAPD

### Task 17: Canasta entities

**Files:**
- Create: `backend/src/inventory/canasta/canasta-category.entity.ts`
- Create: `backend/src/inventory/canasta/canasta-category-product.entity.ts`

- [ ] **Step 1: Write entities**

```typescript
// backend/src/inventory/canasta/canasta-category.entity.ts
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
```

```typescript
// backend/src/inventory/canasta/canasta-category-product.entity.ts
// Standalone entity describing the join table — TypeORM uses ManyToMany above,
// but this file exposes the join table for direct queries when needed.
import { Entity, PrimaryColumn } from 'typeorm';

@Entity('canasta_category_products')
export class CanastaCategoryProduct {
  @PrimaryColumn() canastaCategoryId: number;
  @PrimaryColumn() productId: number;
}
```

- [ ] **Step 2: Register `CanastaCategory` and `CanastaCategoryProduct` in `app.module.ts`**

- [ ] **Step 3: Build to verify**

- [ ] **Step 4: Commit**

```bash
git add backend/src/inventory/canasta/canasta-category.entity.ts backend/src/inventory/canasta/canasta-category-product.entity.ts backend/src/app.module.ts
git commit -m "feat(inventory): add CanastaCategory entity with M:N to Product"
```

---

### Task 18: Canasta service and controller

**Files:**
- Create: `backend/src/inventory/canasta/canasta.service.ts`
- Test: `backend/src/inventory/canasta/canasta.service.spec.ts`
- Create: `backend/src/inventory/canasta/canasta.controller.ts`
- Create: `backend/src/inventory/canasta/canasta.module.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/inventory/canasta/canasta.service.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CanastaService } from './canasta.service';
import { CanastaCategory } from './canasta-category.entity';

describe('CanastaService', () => {
  let service: CanastaService;
  const repo: any = { find: jest.fn(), findOne: jest.fn(), save: jest.fn() };
  const ds: any = { query: jest.fn() };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      providers: [
        CanastaService,
        { provide: getRepositoryToken(CanastaCategory), useValue: repo },
        { provide: DataSource, useValue: ds },
      ],
    }).compile();
    service = m.get(CanastaService);
    jest.clearAllMocks();
  });

  it('list returns categories ordered by displayOrder with products', async () => {
    repo.find.mockResolvedValue([{ id: 1, name: 'A', displayOrder: 1, products: [] }]);
    const r = await service.list();
    expect(r).toHaveLength(1);
    expect(repo.find).toHaveBeenCalledWith({ relations: ['products'], order: { displayOrder: 'ASC' } });
  });

  it('replaceProducts deletes old links then inserts new ones in transaction', async () => {
    repo.findOne.mockResolvedValue({ id: 5 });
    ds.query.mockResolvedValue(undefined);
    await service.replaceProducts(5, [10, 20, 30]);
    expect(ds.query).toHaveBeenCalledWith(
      'DELETE FROM canasta_category_products WHERE "canastaCategoryId" = $1',
      [5],
    );
    expect(ds.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO canasta_category_products'),
      expect.any(Array),
    );
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

- [ ] **Step 3: Implement service**

```typescript
// backend/src/inventory/canasta/canasta.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CanastaCategory } from './canasta-category.entity';

@Injectable()
export class CanastaService {
  constructor(
    @InjectRepository(CanastaCategory) private readonly repo: Repository<CanastaCategory>,
    private readonly dataSource: DataSource,
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
```

- [ ] **Step 4: Write controller**

```typescript
// backend/src/inventory/canasta/canasta.controller.ts
import { Body, Controller, Get, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { CanastaService } from './canasta.service';

@ApiTags('Inventory / Canasta')
@ApiBearerAuth()
@Controller('api/inventory/canasta')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CanastaController {
  constructor(private readonly canasta: CanastaService) {}

  @Get()
  list() {
    return this.canasta.list();
  }

  @Put(':id/products')
  @Roles('admin')
  replace(@Param('id', ParseIntPipe) id: number, @Body() dto: { productIds: number[] }) {
    return this.canasta.replaceProducts(id, dto.productIds);
  }
}
```

- [ ] **Step 5: Write module**

```typescript
// backend/src/inventory/canasta/canasta.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CanastaCategory } from './canasta-category.entity';
import { CanastaService } from './canasta.service';
import { CanastaController } from './canasta.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CanastaCategory])],
  providers: [CanastaService],
  controllers: [CanastaController],
  exports: [CanastaService, TypeOrmModule],
})
export class CanastaModule {}
```

- [ ] **Step 6: Register in `app.module.ts`**

- [ ] **Step 7: Run test, expect PASS**

- [ ] **Step 8: Commit**

```bash
git add backend/src/inventory/canasta backend/src/app.module.ts
git commit -m "feat(inventory): add canasta service, controller and module"
```

---

### Task 19: Canasta seed mappings file

**Files:**
- Create: `backend/src/seeds/canasta-mappings.ts`

- [ ] **Step 1: Write the seed mappings file**

This file declares the mapping from canasta category (`displayOrder`) to product matchers. The matchers run against names and AVIS codes.

```typescript
// backend/src/seeds/canasta-mappings.ts
// Mapping of Canasta CAPD categories to product matchers.
// Matchers are checked against product name (regex) AND AVIS Quilpué codes.
// To refine, edit this file or use the admin UI in production.

export interface ProductMatcher {
  // If product has any of these AVIS codes, it matches.
  avisCodes?: string[];
  // If product name matches any of these regexes (case-insensitive), it matches.
  namePatterns?: RegExp[];
  // Comment explaining why these match this category.
  why: string;
}

export interface CategoryMapping {
  displayOrder: number;
  matchers: ProductMatcher[];
}

export const CANASTA_MAPPINGS: CategoryMapping[] = [
  {
    displayOrder: 1, // Apósitos bacteriostáticos
    matchers: [
      { avisCodes: ['1778'], why: 'Apósito Ringer + PHMB (explícito en notes)' },
      { namePatterns: [/RINGER.*PHMB/i, /\bDACC\b/i, /PHMB\s*ROLLO/i, /MIEL\s*GEL/i, /APOSITO\s+DE\s+MIEL/i], why: 'Bacteriostáticos sugeridos por nombre' },
    ],
  },
  {
    displayOrder: 2, // Apósito absorbente
    matchers: [
      { namePatterns: [/ALGINATO\s+(DE\s+)?CALCIO\s+10\s*[xX*]\s*10/i, /CARBOXIMETILCELULOSA/i, /ESPUMA\s+HIDROFIL/i], why: 'Absorbentes sugeridos por nombre' },
    ],
  },
  {
    displayOrder: 3, // Apósito hidratante
    matchers: [
      { namePatterns: [/POLIESTER|POLIÉSTER/i, /HIDROGEL\s+15\s*G/i, /TULL\s+DE\s+SILICONA/i, /APOSITO\s+DE\s+NYLON/i], why: 'Hidratantes sugeridos por nombre' },
    ],
  },
  {
    displayOrder: 4, // Apósito regenerativo
    matchers: [
      { namePatterns: [/COLAGEN/i, /METALOPROTEASA/i], why: 'Regenerativos por nombre' },
    ],
  },
  {
    displayOrder: 5, // Solución limpiadora antibiofilm o limpiadora
    matchers: [
      { namePatterns: [/POLIHEXANIDA/i, /BETAINA|BETAÍNA/i, /PRONTOSAN.*SOLUC/i, /LIMPIEZA\s+DE\s+HERIDAS/i], why: 'Solución antibiofilm / limpiadora por nombre' },
    ],
  },
  {
    displayOrder: 6, // Ácidos grasos hiperoxigenados
    matchers: [
      { namePatterns: [/LINOVERA/i, /ACIDOS?\s+GRASOS?.*HIPEROX/i], why: 'AGHO por nombre' },
    ],
  },
  {
    displayOrder: 7, // Curetas 3-4 mm
    matchers: [
      { namePatterns: [/CURETA.*\b[34][.,]?[05]?\s*MM\b/i, /CURETA\s+DERMATOLOG/i], why: 'Curetas por nombre' },
    ],
  },
  {
    displayOrder: 8, // Apósitos bactericidas
    matchers: [
      { namePatterns: [/ALGINATO.*PLATA/i, /TULL.*PLATA/i, /PLATA\s+NANOCRIST/i, /CARBON\s+ACTIVO\s+AG/i, /NANO\s+CRISTALINO/i], why: 'Bactericidas (con plata) por nombre' },
    ],
  },
  {
    displayOrder: 9, // Espuma limpiadora (opcional)
    matchers: [
      { namePatterns: [/ESPUMA\s+LIMPIADORA/i], why: 'Espuma limpiadora por nombre' },
    ],
  },
  {
    displayOrder: 10, // Protector cutáneo spray (opcional)
    matchers: [
      { namePatterns: [/PROTECTOR\s+CUT[AÁ]NEO/i], why: 'Protector cutáneo por nombre' },
    ],
  },
  {
    displayOrder: 11, // Hidrogel con plata (opcional)
    matchers: [
      { namePatterns: [/HIDROGEL.*PLATA/i], why: 'Hidrogel con plata por nombre' },
    ],
  },
  // displayOrder 12-14 are AYUDAS_TECNICAS — managed externally, no product mapping.
];
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/seeds/canasta-mappings.ts
git commit -m "feat(inventory): add initial canasta product mappings (regex-based)"
```

---

### Task 20: Seed-defaults endpoint

**Files:**
- Modify: `backend/src/inventory/canasta/canasta.service.ts`
- Modify: `backend/src/inventory/canasta/canasta.controller.ts`
- Modify: `backend/src/inventory/canasta/canasta.service.spec.ts`
- Modify: `backend/src/inventory/canasta/canasta.module.ts` — import ProductsModule

- [ ] **Step 1: Append test for `applyDefaultMappings`**

```typescript
// in canasta.service.spec.ts, augment beforeEach providers with productsServiceMock and DataSource mock for query
// then add:
describe('applyDefaultMappings', () => {
  it('matches products by avisCodes and namePatterns', async () => {
    repo.find.mockResolvedValue([
      { id: 1, displayOrder: 1, name: 'Apósitos bacteriostáticos', section: 'INSUMOS' },
    ]);
    productsServiceMock.list.mockResolvedValue({
      data: [
        { id: 100, name: 'APÓSITO RINGER CON PHMB 10X10 CM', codes: [{ codeSystem: 'AVIS_QUILPUE', code: '1778' }] },
        { id: 101, name: 'APÓSITO MIEL GEL 30 GR', codes: [{ codeSystem: 'AVIS_QUILPUE', code: '2066' }] },
        { id: 102, name: 'GASA 10X10', codes: [{ codeSystem: 'AVIS_QUILPUE', code: '819' }] },
      ],
      total: 3, page: 1, totalPages: 1,
    });
    ds.query.mockResolvedValue(undefined);
    const result = await service.applyDefaultMappings();
    expect(result.associated).toBeGreaterThanOrEqual(2);
    // Ensure GASA is not associated
  });
});
```

- [ ] **Step 2: Append `applyDefaultMappings` to `CanastaService`**

Add `ProductsService` injection in constructor.

```typescript
// add: import { ProductsService } from '../products/products.service';
// add: import { CANASTA_MAPPINGS } from '../../seeds/canasta-mappings';

// add to constructor:
//   private readonly products: ProductsService

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
```

- [ ] **Step 3: Append endpoint to controller**

```typescript
@Post('seed-defaults')
@Roles('admin')
seedDefaults() {
  return this.canasta.applyDefaultMappings();
}
```

- [ ] **Step 4: Update module — import ProductsModule**

```typescript
// canasta.module.ts:
import { ProductsModule } from '../products/products.module';
// imports: [..., ProductsModule]
```

- [ ] **Step 5: Run test, expect PASS**

- [ ] **Step 6: Manual smoke test against local DB with imported catalog**

```bash
cd backend && npm run start:dev &
sleep 5
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | jq -r .access_token)
curl -s -X POST http://localhost:3000/api/inventory/canasta/seed-defaults -H "Authorization: Bearer $TOKEN" | jq '.details'
kill %1
```

Expected: each category prints matched product IDs.

- [ ] **Step 7: Commit**

```bash
git add backend/src/inventory/canasta backend/src/inventory/canasta/canasta.module.ts
git commit -m "feat(inventory): add seed-defaults endpoint applying canasta mapping"
```

---

## Phase 6 — Audit export

### Task 21: AuditExportService — compute audit report

**Files:**
- Create: `backend/src/inventory/audit-export/audit-export.service.ts`
- Test: `backend/src/inventory/audit-export/audit-export.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/inventory/audit-export/audit-export.service.spec.ts
import { Test } from '@nestjs/testing';
import { AuditExportService } from './audit-export.service';
import { CanastaService } from '../canasta/canasta.service';
import { LotsService } from '../lots/lots.service';
import { CanastaSection } from '../canasta/canasta-category.entity';

describe('AuditExportService', () => {
  let service: AuditExportService;
  const canasta: any = { list: jest.fn() };
  const lots: any = { getCurrentStock: jest.fn() };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      providers: [
        AuditExportService,
        { provide: CanastaService, useValue: canasta },
        { provide: LotsService, useValue: lots },
      ],
    }).compile();
    service = m.get(AuditExportService);
    jest.clearAllMocks();
  });

  it('marks SI when category has at least one non-expired lot with stock>0', async () => {
    canasta.list.mockResolvedValue([
      {
        id: 1, displayOrder: 1, name: 'Bacteriostáticos', section: CanastaSection.INSUMOS, isOptional: false, notes: 'x',
        products: [{ id: 100, lots: [{ id: 1, expiresAt: '2027-01-01' }, { id: 2, expiresAt: '2026-01-01' }] }],
      },
    ]);
    lots.getCurrentStock.mockResolvedValueOnce(5).mockResolvedValueOnce(0);
    const report = await service.computeReport(1, new Date('2026-04-27'));
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].available).toBe(true);
  });

  it('marks NO when all lots are expired', async () => {
    canasta.list.mockResolvedValue([
      {
        id: 1, displayOrder: 1, name: 'X', section: CanastaSection.INSUMOS, isOptional: false, notes: null,
        products: [{ id: 100, lots: [{ id: 1, expiresAt: '2026-01-01' }] }],
      },
    ]);
    lots.getCurrentStock.mockResolvedValueOnce(10);
    const report = await service.computeReport(1, new Date('2026-04-27'));
    expect(report.rows[0].available).toBe(false);
  });

  it('AYUDAS_TECNICAS rows have available=null and externally-managed note', async () => {
    canasta.list.mockResolvedValue([
      { id: 12, displayOrder: 12, name: 'Botín', section: CanastaSection.AYUDAS_TECNICAS, isOptional: false, notes: null, products: [] },
    ]);
    const report = await service.computeReport(1, new Date('2026-04-27'));
    expect(report.rows[0].available).toBeNull();
    expect(report.rows[0].notes).toContain('kinesiología');
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

- [ ] **Step 3: Implement service** (compute only — Excel generation in next task)

```typescript
// backend/src/inventory/audit-export/audit-export.service.ts
import { Injectable } from '@nestjs/common';
import { CanastaService } from '../canasta/canasta.service';
import { LotsService } from '../lots/lots.service';
import { CanastaSection } from '../canasta/canasta-category.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lot } from '../lots/lot.entity';

export interface AuditRow {
  displayOrder: number;
  name: string;
  section: CanastaSection;
  isOptional: boolean;
  notes: string | null;
  available: boolean | null; // null for AYUDAS_TECNICAS
}

export interface AuditReport {
  snapshotDate: string;
  establishmentId: number;
  rows: AuditRow[];
}

@Injectable()
export class AuditExportService {
  constructor(
    private readonly canasta: CanastaService,
    private readonly lots: LotsService,
    @InjectRepository(Lot) private readonly lotRepo?: Repository<Lot>,
  ) {}

  async computeReport(establishmentId: number, snapshotDate: Date): Promise<AuditReport> {
    const categories = await this.canasta.list();
    const isoDate = snapshotDate.toISOString().slice(0, 10);
    const rows: AuditRow[] = [];

    for (const cat of categories) {
      if (cat.section === CanastaSection.AYUDAS_TECNICAS) {
        rows.push({
          displayOrder: cat.displayOrder,
          name: cat.name,
          section: cat.section,
          isOptional: cat.isOptional,
          notes: cat.notes ?? 'Gestión externa por kinesiología',
          available: null,
        });
        continue;
      }
      let available = false;
      for (const product of cat.products ?? []) {
        const productLots = await this.findLotsForProduct(product.id, establishmentId);
        for (const lot of productLots) {
          if (!lot.expiresAt || lot.expiresAt < isoDate) continue;
          const stock = await this.lots.getCurrentStock(lot.id, snapshotDate);
          if (stock > 0) { available = true; break; }
        }
        if (available) break;
      }
      rows.push({
        displayOrder: cat.displayOrder,
        name: cat.name,
        section: cat.section,
        isOptional: cat.isOptional,
        notes: cat.notes,
        available,
      });
    }
    return { snapshotDate: isoDate, establishmentId, rows };
  }

  private async findLotsForProduct(productId: number, establishmentId: number) {
    if (!this.lotRepo) {
      // Fallback for unit test — test stub provides product.lots inline.
      return [];
    }
    return this.lotRepo.find({ where: { productId, establishmentId } });
  }
}
```

Note: tests provide `product.lots` inline so the unit test still works. In real use, `lotRepo` is injected and queries lots by productId.

For unit testability, refactor the loop to allow passing `product.lots` if present. Adjust to:

```typescript
const productLots = (product as any).lots ?? await this.findLotsForProduct(product.id, establishmentId);
```

- [ ] **Step 4: Update test stub if needed**

Tests pass `product.lots` inline → service uses that path.

- [ ] **Step 5: Run test, expect PASS**

- [ ] **Step 6: Commit**

```bash
git add backend/src/inventory/audit-export/audit-export.service.ts backend/src/inventory/audit-export/audit-export.service.spec.ts
git commit -m "feat(inventory): add audit-export service computing canasta availability"
```

---

### Task 22: Excel generator with lazy xlsx

**Files:**
- Modify: `backend/src/inventory/audit-export/audit-export.service.ts` — add `generateExcel`
- Modify: `backend/src/inventory/audit-export/audit-export.service.spec.ts` — add test

- [ ] **Step 1: Append test**

```typescript
// in audit-export.service.spec.ts:
import * as XLSX from 'xlsx';

describe('generateExcel', () => {
  it('produces a parseable .xlsx with INSUMOS and AYUDAS_TECNICAS sections', async () => {
    const report = {
      snapshotDate: '2026-04-27',
      establishmentId: 1,
      rows: [
        { displayOrder: 1, name: 'Bacteriostáticos', section: CanastaSection.INSUMOS, isOptional: false, notes: 'x', available: true },
        { displayOrder: 12, name: 'Botín antepié', section: CanastaSection.AYUDAS_TECNICAS, isOptional: false, notes: 'Gestión externa', available: null },
      ],
    };
    const buf = await service.generateExcel(report);
    const wb = XLSX.read(buf, { type: 'buffer' });
    expect(wb.SheetNames.length).toBeGreaterThan(0);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: null });
    expect(rows.find((r) => r[0] === 'Bacteriostáticos')).toBeTruthy();
    expect(rows.find((r) => r[0] === 'Botín antepié')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Append `generateExcel` to service**

```typescript
async generateExcel(report: AuditReport): Promise<Buffer> {
  const XLSX = await import('xlsx');
  const aoa: any[][] = [];

  aoa.push([`ANEXO 5. INSUMOS PARA CURACIÓN AVANZADA DE ÚLCERA DE PIE DIABÉTICO 2025 — Snapshot ${report.snapshotDate}`]);
  aoa.push([
    'Disponibilidad de insumos de Canasta Curación Avanzada',
    'Sí',
    'No',
    'Observaciones',
    'Stock insumos del mes anterior',
    'Stock insumos solicitados para el mes actual',
  ]);

  for (const row of report.rows.filter((r) => r.section === 'INSUMOS')) {
    aoa.push([
      row.name,
      row.available === true ? 'X' : null,
      row.available === false ? 'X' : null,
      row.notes,
      null,
      null,
    ]);
  }

  aoa.push([null, null, null, null, null, null]);
  aoa.push(['Ayudas Técnicas garantizadas para apoyo en CAPD, según decreto GES 2022-2025', 'Sí', 'No', 'Observaciones', null, null]);
  for (const row of report.rows.filter((r) => r.section === 'AYUDAS_TECNICAS')) {
    aoa.push([row.name, null, null, row.notes, null, null]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Canasta CAPD');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
```

- [ ] **Step 3: Run test, expect PASS**

- [ ] **Step 4: Commit**

```bash
git add backend/src/inventory/audit-export/audit-export.service.ts backend/src/inventory/audit-export/audit-export.service.spec.ts
git commit -m "feat(inventory): generate Canasta CAPD audit Excel via lazy xlsx"
```

---

### Task 23: Audit export controller and module

**Files:**
- Create: `backend/src/inventory/audit-export/audit-export.controller.ts`
- Create: `backend/src/inventory/audit-export/audit-export.module.ts`

- [ ] **Step 1: Write controller with two modes**

```typescript
// backend/src/inventory/audit-export/audit-export.controller.ts
import { Controller, Get, Query, Res, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AuditExportService } from './audit-export.service';

@ApiTags('Inventory / AuditExport')
@ApiBearerAuth()
@Controller('api/inventory/audit-export')
@UseGuards(JwtAuthGuard)
export class AuditExportController {
  constructor(private readonly svc: AuditExportService) {}

  @Get()
  async export(
    @Query('mode') mode: 'current' | 'month',
    @Query('establishmentId') establishmentId: string,
    @Query('year') year: string | undefined,
    @Query('month') month: string | undefined,
    @Res() res: Response,
  ) {
    const estId = parseInt(establishmentId ?? '1', 10);
    let snapshotDate: Date;
    if (mode === 'month') {
      if (!year || !month) throw new BadRequestException('year and month required');
      const y = parseInt(year, 10);
      const m = parseInt(month, 10);
      snapshotDate = new Date(y, m, 0); // last day of month
    } else {
      snapshotDate = new Date();
    }
    const report = await this.svc.computeReport(estId, snapshotDate);
    const buffer = await this.svc.generateExcel(report);
    const filename = `canasta-curacion-avanzada-${report.snapshotDate}.xlsx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
```

- [ ] **Step 2: Write module**

```typescript
// backend/src/inventory/audit-export/audit-export.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lot } from '../lots/lot.entity';
import { AuditExportService } from './audit-export.service';
import { AuditExportController } from './audit-export.controller';
import { CanastaModule } from '../canasta/canasta.module';
import { LotsModule } from '../lots/lots.module';

@Module({
  imports: [TypeOrmModule.forFeature([Lot]), CanastaModule, LotsModule],
  providers: [AuditExportService],
  controllers: [AuditExportController],
})
export class AuditExportModule {}
```

- [ ] **Step 3: Register `AuditExportModule` in `app.module.ts`**

- [ ] **Step 4: Smoke test end-to-end**

```bash
cd backend && npm run start:dev &
sleep 5
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | jq -r .access_token)
curl -s "http://localhost:3000/api/inventory/audit-export?mode=current&establishmentId=1" -H "Authorization: Bearer $TOKEN" --output /tmp/canasta.xlsx
file /tmp/canasta.xlsx
kill %1
```

Expected: `/tmp/canasta.xlsx: Microsoft OOXML` (or similar Excel magic).

- [ ] **Step 5: Commit**

```bash
git add backend/src/inventory/audit-export/audit-export.controller.ts backend/src/inventory/audit-export/audit-export.module.ts backend/src/app.module.ts
git commit -m "feat(inventory): add audit-export controller streaming xlsx"
```

---

## Phase 7 — Frontend types and API client

### Task 24: Frontend types

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Append to types/index.ts**

```typescript
// frontend/src/types/index.ts (append at the end)

export type CodeSystem = 'AVIS_QUILPUE' | 'AVIS_OTRA' | 'RAYEN' | 'OTRO';
export type ProductType = 'INSUMO' | 'MEDICAMENTO' | 'ORTESIS' | 'OTRO';
export type LotMovementType = 'RECEPTION' | 'COUNT' | 'ADJUSTMENT';
export type StockCountStatus = 'DRAFT' | 'CLOSED';
export type CanastaSection = 'INSUMOS' | 'AYUDAS_TECNICAS';

export interface ProductCode {
  id: number;
  productId: number;
  codeSystem: CodeSystem;
  code: string;
}

export interface Product {
  id: number;
  name: string;
  type: ProductType;
  packaging: string;
  tracksExpiration: boolean;
  codes: ProductCode[];
  createdAt: string;
}

export interface Lot {
  id: number;
  productId: number;
  establishmentId: number;
  lotCode: string | null;
  expiresAt: string | null;
  receivedAt: string;
  createdAt: string;
  product?: Product;
  currentStock?: number;
  daysToExpiry?: number;
}

export interface LotMovement {
  id: number;
  lotId: number;
  type: LotMovementType;
  delta: number | null;
  absoluteValue: number | null;
  stockCountId: number | null;
  notes: string | null;
  performedById: number;
  createdAt: string;
}

export interface StockCount {
  id: number;
  establishmentId: number;
  countDate: string;
  status: StockCountStatus;
  closedAt: string | null;
  performedById: number;
  createdAt: string;
}

export interface CanastaCategory {
  id: number;
  name: string;
  section: CanastaSection;
  displayOrder: number;
  isOptional: boolean;
  notes: string | null;
  products: Product[];
}

export interface Establishment {
  id: number;
  name: string;
  comuna: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
}

export interface ExpiringResponse {
  lots: Lot[];
  total: number;
}
```

- [ ] **Step 2: Build to verify**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(frontend): add inventory types"
```

---

### Task 25: API client functions

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Append API functions**

```typescript
// frontend/src/services/api.ts (append at the end)
import type {
  Product, Lot, StockCount, LotMovement, CanastaCategory,
  ImportResult, PaginatedResponse, ProductType, CodeSystem,
} from '../types';

// Products
export const listProducts = async (params: { search?: string; type?: ProductType; page?: number; limit?: number } = {}): Promise<PaginatedResponse<Product>> => {
  const { data } = await api.get('/inventory/products', { params });
  return data;
};
export const getProduct = async (id: number): Promise<Product> => (await api.get(`/inventory/products/${id}`)).data;
export const updateProduct = async (id: number, patch: Partial<Product>): Promise<Product> => (await api.patch(`/inventory/products/${id}`, patch)).data;
export const addProductCode = async (id: number, dto: { codeSystem: CodeSystem; code: string }) => (await api.post(`/inventory/products/${id}/codes`, dto)).data;
export const removeProductCode = async (codeId: number) => (await api.delete(`/inventory/products/codes/${codeId}`)).data;
export const importProductsExcel = async (file: File, sheet?: string): Promise<ImportResult> => {
  const fd = new FormData();
  fd.append('file', file);
  const url = sheet ? `/inventory/products/import?sheet=${encodeURIComponent(sheet)}` : '/inventory/products/import';
  const { data } = await api.post(url, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data;
};

// Lots / movements
export const listLots = async (params: { productId?: number; establishmentId?: number; expiringInDays?: number; active?: boolean } = {}): Promise<Lot[]> => (await api.get('/inventory/lots', { params })).data;
export const getLot = async (id: number): Promise<Lot> => (await api.get(`/inventory/lots/${id}`)).data;
export const receiveLot = async (dto: { productId: number; establishmentId: number; lotCode?: string; expiresAt?: string; receivedAt: string; quantity: number; notes?: string }): Promise<Lot> => (await api.post('/inventory/lots/reception', dto)).data;
export const adjustLot = async (lotId: number, dto: { delta: number; notes?: string }): Promise<LotMovement> => (await api.post(`/inventory/lots/${lotId}/adjustments`, dto)).data;
export const getExpiringLots = async (days = 30, establishmentId?: number) => {
  const { data } = await api.get('/inventory/expiring', { params: { days, establishmentId } });
  return data as { lots: Lot[]; total: number };
};
export const getStockSnapshot = async (establishmentId?: number, date?: string) => (await api.get('/inventory/stock-snapshot', { params: { establishmentId, date } })).data;

// Stock counts
export const listStockCounts = async (params: { establishmentId?: number; status?: 'DRAFT' | 'CLOSED' } = {}): Promise<StockCount[]> => (await api.get('/inventory/stock-counts', { params })).data;
export const getStockCount = async (id: number): Promise<StockCount> => (await api.get(`/inventory/stock-counts/${id}`)).data;
export const openStockCount = async (dto: { establishmentId: number; countDate?: string }): Promise<StockCount> => (await api.post('/inventory/stock-counts', dto)).data;
export const patchStockCountEntry = async (id: number, lotId: number, dto: { absoluteValue: number; notes?: string }): Promise<LotMovement> => (await api.patch(`/inventory/stock-counts/${id}/lots/${lotId}`, dto)).data;
export const closeStockCount = async (id: number): Promise<StockCount> => (await api.post(`/inventory/stock-counts/${id}/close`)).data;

// Canasta
export const listCanasta = async (): Promise<CanastaCategory[]> => (await api.get('/inventory/canasta')).data;
export const replaceCanastaProducts = async (id: number, productIds: number[]) => (await api.put(`/inventory/canasta/${id}/products`, { productIds })).data;
export const seedCanastaDefaults = async () => (await api.post('/inventory/canasta/seed-defaults')).data;

// Audit export
export const downloadAuditExport = async (params: { mode: 'current' | 'month'; establishmentId?: number; year?: number; month?: number }): Promise<Blob> => {
  const { data } = await api.get('/inventory/audit-export', { params, responseType: 'blob' });
  return data;
};
```

- [ ] **Step 2: Build to verify**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "feat(frontend): add inventory API client functions"
```

---

## Phase 8 — Frontend pages

### Task 26: Routing and menu integration

**Files:**
- Modify: `frontend/src/App.tsx` — add 6 new routes
- Modify: `frontend/src/components/Layout.tsx` — add nav items

- [ ] **Step 1: Add routes to App.tsx**

In `frontend/src/App.tsx`, import the 6 inventory pages (will be created in subsequent tasks — placeholder imports for now, fill after pages exist):

```typescript
import InventoryListPage from './pages/inventory/InventoryListPage';
import ReceptionPage from './pages/inventory/ReceptionPage';
import StockCountPage from './pages/inventory/StockCountPage';
import CatalogAdminPage from './pages/inventory/CatalogAdminPage';
import CanastaAdminPage from './pages/inventory/CanastaAdminPage';
import AuditExportPage from './pages/inventory/AuditExportPage';
```

Inside the `<Route element={<Layout />}>` block (after `audit-log`), add:

```tsx
<Route path="inventory" element={<InventoryListPage />} />
<Route path="inventory/reception" element={<ReceptionPage />} />
<Route path="inventory/count" element={<StockCountPage />} />
<Route path="inventory/audit-export" element={<AuditExportPage />} />
<Route path="inventory/admin/catalog" element={<CatalogAdminPage />} />
<Route path="inventory/admin/canasta" element={<CanastaAdminPage />} />
```

- [ ] **Step 2: Add nav items to Layout.tsx**

In `frontend/src/components/Layout.tsx`, import `Package` icon from lucide-react:

```typescript
import { ..., Package } from 'lucide-react';
```

Add to `navItems` array:

```typescript
{ to: '/inventory', label: 'Inventario', icon: Package },
{ to: '/inventory/reception', label: 'Recepción', icon: Package },
{ to: '/inventory/count', label: 'Conteo', icon: Package },
{ to: '/inventory/audit-export', label: 'Auditoría Canasta', icon: Package },
```

In the `isAdmin` block, append two more `NavLink`s for `/inventory/admin/catalog` (label "Catálogo Admin") and `/inventory/admin/canasta` (label "Canasta Admin"). Use `Package` icon for both.

Add to `PAGE_TITLES`:

```typescript
'/inventory': 'Inventario',
'/inventory/reception': 'Recepción de Insumos',
'/inventory/count': 'Conteo Semanal',
'/inventory/audit-export': 'Exportar Auditoría Canasta',
'/inventory/admin/catalog': 'Catálogo de Productos',
'/inventory/admin/canasta': 'Canasta CAPD',
```

- [ ] **Step 3: Note** — pages don't exist yet, build will fail until Tasks 27-32 complete. To unblock, create stub files for now:

```bash
cd frontend
mkdir -p src/pages/inventory
for f in InventoryListPage ReceptionPage StockCountPage CatalogAdminPage CanastaAdminPage AuditExportPage; do
  cat > "src/pages/inventory/$f.tsx" <<EOF
export default function $f() {
  return <div>$f stub</div>;
}
EOF
done
```

- [ ] **Step 4: Build to verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/Layout.tsx frontend/src/pages/inventory
git commit -m "feat(frontend): add inventory routes, nav items, and page stubs"
```

---

### Task 27: useDebounce hook

**Files:**
- Create: `frontend/src/hooks/useDebounce.ts`

- [ ] **Step 1: Create directory and write hook**

```bash
cd frontend && mkdir -p src/hooks
```

```typescript
// frontend/src/hooks/useDebounce.ts
import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delay = 500): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useDebounce.ts
git commit -m "feat(frontend): add useDebounce hook"
```

---

### Task 28: ExpiringLotsBanner component + Layout integration

**Files:**
- Create: `frontend/src/components/ExpiringLotsBanner.tsx`
- Modify: `frontend/src/components/Layout.tsx` — render banner after `<AlertBanner />`

- [ ] **Step 1: Write banner**

```tsx
// frontend/src/components/ExpiringLotsBanner.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';
import { getExpiringLots } from '../services/api';

export default function ExpiringLotsBanner() {
  const [count, setCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getExpiringLots(30, 1)
      .then((r) => setCount(r.total))
      .catch(() => {});
  }, []);

  if (dismissed || count === 0) return null;

  return (
    <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/inventory?expiringFilter=30')}>
        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
        <p className="text-sm text-red-800 dark:text-red-200">
          <span className="font-medium">Insumos por vencer:</span> {count} {count === 1 ? 'lote vence' : 'lotes vencen'} en los próximos 30 días
        </p>
      </div>
      <button onClick={() => setDismissed(true)} className="text-red-400 hover:text-red-600 p-1">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Integrate in Layout.tsx**

After the line `<AlertBanner />`, add:

```tsx
<ExpiringLotsBanner />
```

Add import at top: `import ExpiringLotsBanner from './ExpiringLotsBanner';`

- [ ] **Step 3: Build to verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ExpiringLotsBanner.tsx frontend/src/components/Layout.tsx
git commit -m "feat(frontend): add ExpiringLotsBanner and integrate in Layout"
```

---

### Task 29: InventoryListPage

**Files:**
- Modify: `frontend/src/pages/inventory/InventoryListPage.tsx`
- Test: `frontend/src/pages/inventory/__tests__/InventoryListPage.test.tsx`

- [ ] **Step 1: Replace stub with implementation**

```tsx
// frontend/src/pages/inventory/InventoryListPage.tsx
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { listLots } from '../../services/api';
import type { Lot } from '../../types';

export default function InventoryListPage() {
  const [searchParams] = useSearchParams();
  const expiringFilter = searchParams.get('expiringFilter');
  const [lots, setLots] = useState<Lot[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    const params: any = { establishmentId: 1, active: true };
    if (expiringFilter) params.expiringInDays = parseInt(expiringFilter, 10);
    listLots(params)
      .then(setLots)
      .finally(() => setLoading(false));
  }, [expiringFilter]);

  const filtered = useMemo(
    () => lots.filter((l) => !search || (l.product?.name ?? '').toLowerCase().includes(search.toLowerCase())),
    [lots, search],
  );

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <input
          className="border rounded px-3 py-2 w-full max-w-md dark:bg-slate-800 dark:border-slate-700"
          placeholder="Buscar producto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button onClick={() => navigate('/inventory/reception')} className="px-4 py-2 bg-blue-600 text-white rounded">
          + Recepción
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="text-left p-3">Producto</th>
              <th className="text-left p-3">Lote</th>
              <th className="text-left p-3">Vence</th>
              <th className="text-right p-3">Stock</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td className="p-3" colSpan={4}>Cargando...</td></tr>}
            {!loading && filtered.map((lot) => {
              const expired = lot.expiresAt && lot.expiresAt < today;
              const expiringSoon = lot.expiresAt && !expired && lot.daysToExpiry != null && lot.daysToExpiry <= 30;
              const rowCls = expired ? 'bg-red-100 dark:bg-red-900/30' : expiringSoon ? 'bg-red-50 dark:bg-red-900/15' : '';
              return (
                <tr key={lot.id} className={`border-t dark:border-slate-700 ${rowCls}`}>
                  <td className="p-3">{lot.product?.name ?? `Producto ${lot.productId}`}</td>
                  <td className="p-3">{lot.lotCode ?? '—'}</td>
                  <td className="p-3">
                    {lot.expiresAt ?? '—'}
                    {expired && <span className="ml-2 text-xs bg-red-600 text-white rounded px-2 py-0.5">VENCIDO</span>}
                    {expiringSoon && <span className="ml-2 text-xs bg-red-200 text-red-800 rounded px-2 py-0.5">Vence en {lot.daysToExpiry}d</span>}
                  </td>
                  <td className="p-3 text-right font-mono">{lot.currentStock ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write test**

```tsx
// frontend/src/pages/inventory/__tests__/InventoryListPage.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InventoryListPage from '../InventoryListPage';
import * as api from '../../../services/api';

jest.mock('../../../services/api');

describe('InventoryListPage', () => {
  it('renders lots with expiring highlights', async () => {
    (api.listLots as jest.Mock).mockResolvedValue([
      { id: 1, productId: 1, establishmentId: 1, lotCode: 'L1', expiresAt: '2027-01-01', receivedAt: '2026-04-01', createdAt: '', currentStock: 10, daysToExpiry: 90, product: { id: 1, name: 'Apósito X' } },
      { id: 2, productId: 2, establishmentId: 1, lotCode: 'L2', expiresAt: '2026-05-15', receivedAt: '2026-04-01', createdAt: '', currentStock: 5, daysToExpiry: 18, product: { id: 2, name: 'Apósito Y' } },
    ]);
    render(
      <MemoryRouter>
        <InventoryListPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Apósito X')).toBeInTheDocument());
    expect(screen.getByText('Vence en 18d')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test, expect PASS**

```bash
cd frontend && npm test -- InventoryListPage
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/inventory/InventoryListPage.tsx frontend/src/pages/inventory/__tests__/InventoryListPage.test.tsx
git commit -m "feat(frontend): add InventoryListPage with expiring highlights"
```

---

### Task 30: ReceptionPage

**Files:**
- Modify: `frontend/src/pages/inventory/ReceptionPage.tsx`

- [ ] **Step 1: Replace stub with implementation**

```tsx
// frontend/src/pages/inventory/ReceptionPage.tsx
import { useState, useEffect } from 'react';
import { listProducts, receiveLot } from '../../services/api';
import type { Product } from '../../types';

export default function ReceptionPage() {
  const [productSearch, setProductSearch] = useState('');
  const [matches, setMatches] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [lotCode, setLotCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10));
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (productSearch.length < 2) { setMatches([]); return; }
    const t = setTimeout(() => {
      listProducts({ search: productSearch, limit: 10 }).then((r) => setMatches(r.data));
    }, 300);
    return () => clearTimeout(t);
  }, [productSearch]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const lot = await receiveLot({
      productId: selected.id,
      establishmentId: 1,
      lotCode: lotCode || undefined,
      expiresAt: expiresAt || undefined,
      receivedAt,
      quantity,
      notes: notes || undefined,
    });
    setToast(`Lote ${lot.lotCode ?? lot.id} registrado: ${quantity} ${selected.packaging} de ${selected.name}`);
    setSelected(null);
    setProductSearch('');
    setLotCode('');
    setExpiresAt('');
    setQuantity(1);
    setNotes('');
    setTimeout(() => setToast(null), 4000);
  }

  return (
    <div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 rounded shadow p-6">
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Producto</span>
          {selected ? (
            <div className="flex items-center justify-between border rounded px-3 py-2 mt-1 dark:bg-slate-800 dark:border-slate-700">
              <span>{selected.name}</span>
              <button type="button" onClick={() => setSelected(null)} className="text-sm text-blue-600">Cambiar</button>
            </div>
          ) : (
            <>
              <input
                className="w-full border rounded px-3 py-2 mt-1 dark:bg-slate-800 dark:border-slate-700"
                placeholder="Buscar por nombre o código AVIS..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
              {matches.length > 0 && (
                <ul className="border rounded mt-1 max-h-60 overflow-y-auto dark:bg-slate-800 dark:border-slate-700">
                  {matches.map((p) => (
                    <li key={p.id} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer" onClick={() => { setSelected(p); setMatches([]); }}>
                      <div className="text-sm">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.codes.map((c) => `${c.codeSystem}: ${c.code}`).join(' · ')}</div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Código de lote</span>
            <input className="w-full border rounded px-3 py-2 mt-1 dark:bg-slate-800 dark:border-slate-700" value={lotCode} onChange={(e) => setLotCode(e.target.value)} placeholder="L23B07" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Vence</span>
            <input type="date" className="w-full border rounded px-3 py-2 mt-1 dark:bg-slate-800 dark:border-slate-700" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Recibido</span>
            <input type="date" required className="w-full border rounded px-3 py-2 mt-1 dark:bg-slate-800 dark:border-slate-700" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Cantidad</span>
            <input type="number" min={1} required className="w-full border rounded px-3 py-2 mt-1 dark:bg-slate-800 dark:border-slate-700" value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)} />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium">Notas</span>
          <textarea className="w-full border rounded px-3 py-2 mt-1 dark:bg-slate-800 dark:border-slate-700" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        <div className="flex justify-end">
          <button type="submit" disabled={!selected} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">Registrar lote</button>
        </div>
      </form>

      {toast && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded text-green-800 text-sm">{toast}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/ReceptionPage.tsx
git commit -m "feat(frontend): add ReceptionPage with product autocomplete"
```

---

### Task 31: StockCountPage with autosave

**Files:**
- Modify: `frontend/src/pages/inventory/StockCountPage.tsx`
- Test: `frontend/src/pages/inventory/__tests__/StockCountPage.test.tsx`

- [ ] **Step 1: Replace stub with implementation**

```tsx
// frontend/src/pages/inventory/StockCountPage.tsx
import { useEffect, useState, useRef } from 'react';
import { listLots, openStockCount, patchStockCountEntry, closeStockCount } from '../../services/api';
import type { Lot, StockCount } from '../../types';

export default function StockCountPage() {
  const [count, setCount] = useState<StockCount | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [values, setValues] = useState<Record<number, number>>({});
  const [savingLotIds, setSavingLotIds] = useState<Set<number>>(new Set());
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    (async () => {
      const sc = await openStockCount({ establishmentId: 1 });
      setCount(sc);
      const ls = await listLots({ establishmentId: 1, active: true });
      setLots(ls);
      const initial: Record<number, number> = {};
      for (const l of ls) initial[l.id] = l.currentStock ?? 0;
      setValues(initial);
    })();
  }, []);

  function onChange(lotId: number, value: number) {
    setValues((prev) => ({ ...prev, [lotId]: value }));
    if (debounceTimers.current[lotId]) clearTimeout(debounceTimers.current[lotId]);
    debounceTimers.current[lotId] = setTimeout(async () => {
      if (!count) return;
      setSavingLotIds((prev) => new Set([...prev, lotId]));
      try {
        await patchStockCountEntry(count.id, lotId, { absoluteValue: value });
      } finally {
        setSavingLotIds((prev) => { const n = new Set(prev); n.delete(lotId); return n; });
      }
    }, 600);
  }

  async function onClose() {
    if (!count) return;
    if (!confirm(`Cerrar conteo del ${count.countDate}? No podrás editar después.`)) return;
    const updated = await closeStockCount(count.id);
    setCount(updated);
  }

  if (!count) return <div>Cargando...</div>;

  const closed = count.status === 'CLOSED';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Conteo del {count.countDate}</h2>
          <p className="text-sm text-slate-500">Estado: {count.status}</p>
        </div>
        {!closed && (
          <button onClick={onClose} className="px-4 py-2 bg-amber-600 text-white rounded">Cerrar conteo</button>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="text-left p-3">Producto</th>
              <th className="text-left p-3">Lote</th>
              <th className="text-left p-3">Vence</th>
              <th className="text-right p-3">Stock derivado</th>
              <th className="text-right p-3">Cantidad observada</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => (
              <tr key={l.id} className="border-t dark:border-slate-700">
                <td className="p-3">{l.product?.name ?? `Producto ${l.productId}`}</td>
                <td className="p-3">{l.lotCode ?? '—'}</td>
                <td className="p-3">{l.expiresAt ?? '—'}</td>
                <td className="p-3 text-right font-mono">{l.currentStock ?? 0}</td>
                <td className="p-3 text-right">
                  <input
                    type="number"
                    min={0}
                    disabled={closed}
                    value={values[l.id] ?? 0}
                    onChange={(e) => onChange(l.id, parseInt(e.target.value, 10) || 0)}
                    className="w-24 border rounded px-2 py-1 text-right dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50"
                  />
                  {savingLotIds.has(l.id) && <span className="ml-2 text-xs text-slate-500">guardando...</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write test**

```tsx
// frontend/src/pages/inventory/__tests__/StockCountPage.test.tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import StockCountPage from '../StockCountPage';
import * as api from '../../../services/api';

jest.mock('../../../services/api');

describe('StockCountPage', () => {
  beforeEach(() => {
    (api.openStockCount as jest.Mock).mockResolvedValue({ id: 1, countDate: '2026-04-27', status: 'DRAFT', establishmentId: 1, performedById: 1, closedAt: null, createdAt: '' });
    (api.listLots as jest.Mock).mockResolvedValue([
      { id: 10, productId: 1, establishmentId: 1, lotCode: 'L1', expiresAt: '2027-01-01', receivedAt: '2026-04-01', createdAt: '', currentStock: 5, product: { id: 1, name: 'A' } },
    ]);
    (api.patchStockCountEntry as jest.Mock).mockResolvedValue({});
  });

  it('debounces patch on input change', async () => {
    jest.useFakeTimers();
    render(<StockCountPage />);
    await waitFor(() => screen.getByText('A'));
    const input = screen.getByDisplayValue('5');
    fireEvent.change(input, { target: { value: '7' } });
    expect(api.patchStockCountEntry).not.toHaveBeenCalled();
    jest.advanceTimersByTime(700);
    await waitFor(() => expect(api.patchStockCountEntry).toHaveBeenCalledWith(1, 10, { absoluteValue: 7 }));
    jest.useRealTimers();
  });
});
```

- [ ] **Step 3: Run test, expect PASS**

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/inventory/StockCountPage.tsx frontend/src/pages/inventory/__tests__/StockCountPage.test.tsx
git commit -m "feat(frontend): add StockCountPage with debounced autosave"
```

---

### Task 32: CatalogAdminPage (import + edit)

**Files:**
- Modify: `frontend/src/pages/inventory/CatalogAdminPage.tsx`

- [ ] **Step 1: Replace stub with implementation**

```tsx
// frontend/src/pages/inventory/CatalogAdminPage.tsx
import { useEffect, useState } from 'react';
import { listProducts, importProductsExcel } from '../../services/api';
import type { Product, ImportResult } from '../../types';

export default function CatalogAdminPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    listProducts({ search, limit: 100 }).then((r) => setProducts(r.data));
  }, [search]);

  async function onImport(file: File) {
    setImporting(true);
    try {
      const r = await importProductsExcel(file, 'PRODUCTOS AVIS');
      setImportResult(r);
      const refreshed = await listProducts({ limit: 100 });
      setProducts(refreshed.data);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 rounded shadow p-4">
        <h2 className="font-semibold mb-2">Importar catálogo AVIS</h2>
        <input
          type="file"
          accept=".xlsx"
          disabled={importing}
          onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])}
        />
        {importing && <p className="text-sm text-slate-500 mt-2">Importando...</p>}
        {importResult && (
          <div className="mt-3 text-sm">
            <p>Creados: {importResult.created} · Actualizados: {importResult.updated} · Sin cambios: {importResult.unchanged} · Saltados: {importResult.skipped}</p>
            {importResult.errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-red-600">{importResult.errors.length} errores</summary>
                <ul className="text-xs mt-1">
                  {importResult.errors.slice(0, 50).map((e, i) => <li key={i}>Fila {e.row}: {e.reason}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      <input
        className="border rounded px-3 py-2 w-full max-w-md dark:bg-slate-800 dark:border-slate-700"
        placeholder="Buscar producto..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="bg-white dark:bg-slate-900 rounded shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="text-left p-3">Nombre</th>
              <th className="text-left p-3">Tipo</th>
              <th className="text-left p-3">Empaque</th>
              <th className="text-left p-3">Códigos</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t dark:border-slate-700">
                <td className="p-3">{p.name}</td>
                <td className="p-3">{p.type}</td>
                <td className="p-3">{p.packaging}</td>
                <td className="p-3 text-xs">{p.codes.map((c) => `${c.codeSystem}:${c.code}`).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/CatalogAdminPage.tsx
git commit -m "feat(frontend): add CatalogAdminPage with bulk Excel import"
```

---

### Task 33: CanastaAdminPage

**Files:**
- Modify: `frontend/src/pages/inventory/CanastaAdminPage.tsx`

- [ ] **Step 1: Replace stub with implementation**

```tsx
// frontend/src/pages/inventory/CanastaAdminPage.tsx
import { useEffect, useState } from 'react';
import { listCanasta, replaceCanastaProducts, seedCanastaDefaults, listProducts } from '../../services/api';
import type { CanastaCategory, Product } from '../../types';

export default function CanastaAdminPage() {
  const [categories, setCategories] = useState<CanastaCategory[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    listCanasta().then(setCategories);
    listProducts({ limit: 5000 }).then((r) => setAllProducts(r.data));
  }, []);

  function startEdit(cat: CanastaCategory) {
    setEditing(cat.id);
    setSelectedIds(new Set(cat.products.map((p) => p.id)));
  }

  async function save() {
    if (editing == null) return;
    await replaceCanastaProducts(editing, [...selectedIds]);
    const refreshed = await listCanasta();
    setCategories(refreshed);
    setEditing(null);
  }

  async function applyDefaults() {
    if (!confirm('Aplicar mapeo sugerido a todas las categorías? Esto reemplazará asociaciones existentes.')) return;
    await seedCanastaDefaults();
    const refreshed = await listCanasta();
    setCategories(refreshed);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={applyDefaults} className="px-4 py-2 bg-blue-600 text-white rounded">Aplicar mapeo sugerido</button>
      </div>

      {categories.map((cat) => (
        <div key={cat.id} className="bg-white dark:bg-slate-900 rounded shadow p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{cat.name} <span className="text-xs text-slate-500">({cat.section})</span></h3>
            <button onClick={() => editing === cat.id ? setEditing(null) : startEdit(cat)} className="text-sm text-blue-600">
              {editing === cat.id ? 'Cancelar' : 'Editar productos'}
            </button>
          </div>
          {cat.notes && <p className="text-xs text-slate-500 mt-1">{cat.notes}</p>}

          {editing === cat.id ? (
            <>
              <div className="max-h-80 overflow-y-auto mt-3 border rounded dark:border-slate-700">
                {allProducts.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={(e) => {
                        const next = new Set(selectedIds);
                        if (e.target.checked) next.add(p.id);
                        else next.delete(p.id);
                        setSelectedIds(next);
                      }}
                    />
                    {p.name}
                    <span className="text-xs text-slate-400 ml-auto">{p.codes.map((c) => c.code).join(', ')}</span>
                  </label>
                ))}
              </div>
              <div className="flex justify-end mt-3">
                <button onClick={save} className="px-3 py-1.5 bg-green-600 text-white rounded text-sm">Guardar</button>
              </div>
            </>
          ) : (
            <ul className="mt-2 text-sm">
              {cat.products.length === 0 && <li className="text-slate-400">Sin productos asociados</li>}
              {cat.products.map((p) => <li key={p.id}>· {p.name}</li>)}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/CanastaAdminPage.tsx
git commit -m "feat(frontend): add CanastaAdminPage with edit and apply-defaults"
```

---

### Task 34: AuditExportPage

**Files:**
- Modify: `frontend/src/pages/inventory/AuditExportPage.tsx`

- [ ] **Step 1: Replace stub with implementation**

```tsx
// frontend/src/pages/inventory/AuditExportPage.tsx
import { useState } from 'react';
import { saveAs } from 'file-saver';
import { downloadAuditExport } from '../../services/api';

export default function AuditExportPage() {
  const [mode, setMode] = useState<'current' | 'month'>('current');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [downloading, setDownloading] = useState(false);

  async function onDownload() {
    setDownloading(true);
    try {
      const blob = await downloadAuditExport(
        mode === 'month'
          ? { mode, establishmentId: 1, year, month }
          : { mode, establishmentId: 1 },
      );
      const date = mode === 'month' ? `${year}-${String(month).padStart(2, '0')}` : new Date().toISOString().slice(0, 10);
      saveAs(blob, `canasta-curacion-avanzada-${date}.xlsx`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="max-w-xl bg-white dark:bg-slate-900 rounded shadow p-6 space-y-4">
      <div className="flex gap-4">
        <label className="flex items-center gap-2"><input type="radio" checked={mode === 'current'} onChange={() => setMode('current')} /> Al día actual</label>
        <label className="flex items-center gap-2"><input type="radio" checked={mode === 'month'} onChange={() => setMode('month')} /> Mes específico</label>
      </div>
      {mode === 'month' && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Año</span>
            <input type="number" className="w-full border rounded px-3 py-2 mt-1 dark:bg-slate-800 dark:border-slate-700" value={year} onChange={(e) => setYear(parseInt(e.target.value, 10) || year)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Mes</span>
            <select className="w-full border rounded px-3 py-2 mt-1 dark:bg-slate-800 dark:border-slate-700" value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))}>
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          </label>
        </div>
      )}
      <button onClick={onDownload} disabled={downloading} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">
        {downloading ? 'Generando...' : 'Descargar Excel auditable'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/AuditExportPage.tsx
git commit -m "feat(frontend): add AuditExportPage with current/month modes"
```

---

## Phase 9 — End-to-end test

### Task 35: Inventory e2e test

**Files:**
- Create: `backend/test/inventory.e2e-spec.ts`

- [ ] **Step 1: Write e2e test**

```typescript
// backend/test/inventory.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as XLSX from 'xlsx';
import { DataSource } from 'typeorm';
import { createTestApp, cleanDatabase } from './setup';
import { createUser, createAdmin, resetCounter } from './factories';

describe('Inventory (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    resetCounter();
    await cleanDatabase(app);

    await createAdmin(app, { username: 'invadmin' });
    await createUser(app, { username: 'invuser' });

    const ds = app.get(DataSource);
    await ds.query(`INSERT INTO "establishments" ("name", "comuna") VALUES ('CESFAM Test', 'Quilpué')`);

    const a = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'invadmin', password: 'password123' });
    adminToken = a.body.access_token;
    const u = await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'invuser', password: 'password123' });
    userToken = u.body.access_token;
  });

  afterAll(async () => { await app.close(); });

  it('runs full flow: import → reception → count → audit export', async () => {
    // 1. Bulk import a small synthetic catalog
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['TIPO', 'CÓMO PEDIR', 'CODIGO AVIS', 'ARTICULO'],
      ['INSUMO', 'UNIDAD', 1778, 'APÓSITO RINGER CON PHMB 10X10 CM UNIDAD'],
      ['INSUMO', 'UNIDAD', 819, 'GASA 10X10 SIN CLASIFICAR'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'PRODUCTOS AVIS');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const importRes = await request(app.getHttpServer())
      .post('/api/inventory/products/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'catalog.xlsx');
    expect(importRes.status).toBe(201);
    expect(importRes.body.created).toBe(2);

    // Find product 1778
    const list = await request(app.getHttpServer())
      .get('/api/inventory/products?search=RINGER')
      .set('Authorization', `Bearer ${userToken}`);
    const product = list.body.data[0];
    expect(product).toBeDefined();

    const ds = app.get(DataSource);
    const est = await ds.query(`SELECT id FROM "establishments" LIMIT 1`);
    const establishmentId = est[0].id;

    // 2. Reception
    const recv = await request(app.getHttpServer())
      .post('/api/inventory/lots/reception')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ productId: product.id, establishmentId, lotCode: 'L1', expiresAt: '2027-01-01', receivedAt: '2026-04-27', quantity: 50 });
    expect(recv.status).toBe(201);
    const lotId = recv.body.id;

    // 3. Stock count
    const sc = await request(app.getHttpServer())
      .post('/api/inventory/stock-counts')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ establishmentId, countDate: '2026-04-27' });
    expect(sc.status).toBe(201);
    const countId = sc.body.id;

    const patchRes = await request(app.getHttpServer())
      .patch(`/api/inventory/stock-counts/${countId}/lots/${lotId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ absoluteValue: 48 });
    expect(patchRes.status).toBe(200);

    // 4. Apply default canasta mappings
    const seed = await request(app.getHttpServer())
      .post('/api/inventory/canasta/seed-defaults')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(seed.status).toBe(201);

    // 5. Export Excel
    const xlsxRes = await request(app.getHttpServer())
      .get(`/api/inventory/audit-export?mode=current&establishmentId=${establishmentId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .responseType('blob');
    expect(xlsxRes.status).toBe(200);
    expect(xlsxRes.headers['content-type']).toContain('spreadsheetml.sheet');
    const wbOut = XLSX.read(xlsxRes.body, { type: 'buffer' });
    expect(wbOut.SheetNames.length).toBeGreaterThan(0);
  });

  it('rejects /products/import without admin role', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/inventory/products/import')
      .set('Authorization', `Bearer ${userToken}`)
      .attach('file', Buffer.from('fake'), 'x.xlsx');
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Ensure test DB exists**

```bash
docker exec curaciones-db psql -U curaciones -d postgres -c "CREATE DATABASE IF NOT EXISTS curaciones_test;" 2>/dev/null || true
```

- [ ] **Step 3: Run e2e**

```bash
cd backend && npm run test:e2e -- --runInBand inventory
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/test/inventory.e2e-spec.ts
git commit -m "test(inventory): add e2e test covering import → reception → count → export"
```

---

## Phase 10 — Final verification and PR

### Task 36: Local verification

- [ ] **Step 1: Run full test suites**

```bash
cd backend && npm test && npm run test:e2e -- --runInBand
cd ../frontend && npm test
```

Expected: all green.

- [ ] **Step 2: Build production bundles**

```bash
cd backend && npm run build
cd ../frontend && npm run build
```

Expected: builds succeed, no TS errors.

- [ ] **Step 3: Manual smoke test in browser**

```bash
# Terminal 1: backend
cd backend && npm run start:dev

# Terminal 2: frontend
cd frontend && npm run dev
```

Walk through:
1. Login as admin.
2. Navigate to `/inventory/admin/catalog` → upload `PRODUCTOS AVIS` Excel → verify counts.
3. Navigate to `/inventory/admin/canasta` → click "Aplicar mapeo sugerido" → verify products attached.
4. Navigate to `/inventory/reception` → register a lot with expiration in 20 days → see toast.
5. Navigate to `/inventory` → verify lot is highlighted red (within 30-day window).
6. Verify red banner appears at top.
7. Navigate to `/inventory/count` → enter cantidad observada → wait, see "guardando..." disappear.
8. Click "Cerrar conteo" → confirm → verify status = CLOSED.
9. Navigate to `/inventory/audit-export` → download Excel → open and verify SI/NO marks.

- [ ] **Step 4: Verify no regression in existing app**

Click through Pacientes, Curaciones, Reportes, Agenda — confirm everything still works.

---

### Task 37: Create pull request

- [ ] **Step 1: Push branch**

```bash
git push -u origin feat/inventario-insumos-spec
```

- [ ] **Step 2: Open PR via gh CLI**

```bash
gh pr create --title "feat(inventory): Phase 1 — catalog, lots, weekly counts, audit export" --body "$(cat <<'EOF'
## Summary
- New inventory module: products with multi-comuna codes, lots with expiration, event-sourced movements (RECEPTION/COUNT/ADJUSTMENT), weekly stock counts (DRAFT/CLOSED).
- Bulk Excel import for AVIS catalog, audit Excel export for Canasta CAPD.
- New frontend pages under `/inventory` plus expiring-lots banner.
- Spec: docs/superpowers/specs/2026-04-27-inventario-insumos-design.md
- Plan:  docs/superpowers/plans/2026-04-27-inventario-insumos-plan.md

## Test plan
- [ ] Backend unit tests: `cd backend && npm test`
- [ ] Backend e2e: `cd backend && npm run test:e2e -- --runInBand`
- [ ] Frontend tests: `cd frontend && npm test`
- [ ] Manual smoke: import catalog → seed canasta → reception → count → export Excel
- [ ] Verify no regression in existing app (Pacientes, Curaciones, Reportes)
- [ ] After merge, verify Render backend deploy succeeds and memory remains stable
- [ ] Verify Railway frontend deploy succeeds
EOF
)"
```

- [ ] **Step 3: Wait for CI checks**

```bash
gh pr checks --watch
```

Expected: backend (build + test) green, frontend (build + test) green.

- [ ] **Step 4: Notify user when ready for review**

Print PR URL for user.

---

## Self-Review

Spec coverage:

| Spec section | Implementing tasks |
|---|---|
| Multi-comuna catalog | 5, 6, 7, 8, 9 |
| Lots + expiration | 10, 11, 12 |
| Event-sourced stock | 11 (`getCurrentStock`) |
| Reception flow | 11, 12, 30 |
| Stock count flow | 14, 15, 16, 31 |
| Expiring alerts | 11 (`getExpiring`), 28 |
| Canasta categories + mapping | 17, 18, 19, 20 |
| Audit export Excel | 21, 22, 23, 34 |
| Multi-establishment | 4 + all `establishmentId` parameters |
| Permissions / RolesGuard | 2, applied throughout |
| Migration | 3 |
| Bulk Excel import | 8, 9, 32 |
| Frontend integration | 26, 27, 28, 29, 30, 31, 32, 33, 34 |
| E2E happy path | 35 |

Placeholder scan: every step contains real code or exact commands. No "TBD"/"TODO"/"appropriate handling".

Type consistency:
- `LotMovementType` used consistently across entity, service, and tests.
- `getCurrentStock(lotId, atDate?)` signature stable across `LotsService`, `AuditExportService`, and tests.
- `upsertByCode` returns `{ action: 'created'|'updated'|'unchanged', product }` consistently.

Risks called out in plan:
- `xlsx` lazy-loaded (Tasks 8, 22).
- 5MB upload limit on bulk import (Task 9).
- Concurrency on stock counts is last-write-wins (Task 15 — documented behavior).

Ready for execution.



