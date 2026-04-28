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
