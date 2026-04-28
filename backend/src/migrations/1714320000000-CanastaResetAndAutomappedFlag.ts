import { MigrationInterface, QueryRunner } from 'typeorm';

export class CanastaResetAndAutomappedFlag1714320000000 implements MigrationInterface {
  name = 'CanastaResetAndAutomappedFlag1714320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add new columns to canasta_category_products
    await queryRunner.query(`ALTER TABLE canasta_category_products ADD COLUMN "auto_mapped" BOOLEAN NOT NULL DEFAULT FALSE`);
    // 2. Add new columns to canasta_categories
    await queryRunner.query(`ALTER TABLE canasta_categories ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT FALSE`);
    await queryRunner.query(`ALTER TABLE canasta_categories ADD COLUMN "source_key" VARCHAR(120) NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_canasta_categories_source_key" ON canasta_categories ("source_key")`);
    // 3. Drop UNIQUE constraint on display_order if it exists (we want categories to be reorderable freely)
    // Use IF EXISTS via DO block since constraint name varies; fall through gracefully if absent.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'canasta_categories' AND constraint_type = 'UNIQUE' AND constraint_name = 'UQ_canasta_categories_display_order'
        ) THEN
          ALTER TABLE canasta_categories DROP CONSTRAINT "UQ_canasta_categories_display_order";
        END IF;
      END $$;
    `);
    // 4. Wipe existing seed data — fresh start, app waits for archivo guía upload
    await queryRunner.query(`DELETE FROM canasta_category_products`);
    await queryRunner.query(`DELETE FROM canasta_categories`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Schema rollback only — restore data from backup if needed
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_canasta_categories_source_key"`);
    await queryRunner.query(`ALTER TABLE canasta_categories DROP COLUMN "source_key"`);
    await queryRunner.query(`ALTER TABLE canasta_categories DROP COLUMN "archived"`);
    await queryRunner.query(`ALTER TABLE canasta_category_products DROP COLUMN "auto_mapped"`);
  }
}
