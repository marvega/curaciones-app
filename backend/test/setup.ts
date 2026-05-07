import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

// Note: EMAIL_BACKEND=noop is set in test/jest-env.ts (Jest `setupFiles`),
// which runs before this file is imported.

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  return app;
}

export async function cleanDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);
  const entities = dataSource.entityMetadatas;
  const tables = entities.map((e) => `"${e.tableName}"`).join(', ');
  // Single TRUNCATE statement covering every entity table; this avoids
  // deadlocks caused by issuing one CASCADE TRUNCATE per table while FKs are
  // still being recomputed between statements. Brief retry handles the
  // occasional cross-suite deadlock when previous BootstrapService inserts
  // are still flushing on the connection pool.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await dataSource.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
      return;
    } catch (err: any) {
      if (attempt === 2 || !/deadlock detected/i.test(err?.message ?? '')) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}
