/**
 * One-shot batch: walks tenanted entities and encrypts the v1 sensitive fields.
 * Idempotent: rows already in EncryptedField shape (`v: 1`) are skipped.
 *
 * Usage: `npm run encryption:backfill`
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { KMS_SERVICE, KmsService } from './kms.service';
import { isEncryptedField } from './encrypted-field';
import { runWithBypass } from '../common/org-context';
import { createHash } from 'crypto';

const CHUNK = 500;

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  const ds = app.get(DataSource);
  const kms = app.get<KmsService>(KMS_SERVICE);

  await runWithBypass(async () => {
    await encryptColumn(ds, kms, 'patients', 'rut', 'Patient.rut', { hashCol: 'rutHash' });
    await encryptColumn(ds, kms, 'patients', 'phone', 'Patient.phone');
    await encryptColumn(ds, kms, 'patients', 'address', 'Patient.address');
    await encryptColumn(ds, kms, 'curaciones', 'observations', 'Curacion.observations');
    await encryptColumn(ds, kms, 'wound_notes', 'notes', 'WoundNote.notes');
    await encryptColumn(ds, kms, 'users', 'email', 'User.email', { hashCol: 'emailHash', lowerHash: true });
  });

  await app.close();
}

async function encryptColumn(
  ds: DataSource,
  kms: KmsService,
  table: string,
  column: string,
  aadPrefix: string,
  opts: { hashCol?: string; lowerHash?: boolean } = {},
) {
  // Some tenanted entities have an `organizationId` column; global tables (e.g. users)
  // do not. We detect once per table and select NULL when absent so the loop body
  // can rely on `r.organizationId ?? '1'` consistently.
  const orgColExists = await tableHasColumn(ds, table, 'organizationId');
  const orgSelect = orgColExists ? '"organizationId"' : 'NULL::bigint AS "organizationId"';

  let offset = 0;
  while (true) {
    const rows = await ds.query(
      `SELECT id, ${orgSelect}, "${column}" AS val FROM "${table}" ORDER BY id LIMIT $1 OFFSET $2`,
      [CHUNK, offset],
    );
    if (rows.length === 0) break;
    for (const r of rows) {
      if (r.val === null) continue;
      if (isEncryptedField(r.val)) continue; // already encrypted
      const plaintext = typeof r.val === 'object' && r.val.plaintext ? r.val.plaintext : r.val;
      if (typeof plaintext !== 'string') continue;
      const aad = `${aadPrefix}:${r.id}`;
      const encrypted = await kms.encrypt(plaintext, aad, String(r.organizationId ?? '1'));
      const params: any[] = [encrypted, r.id];
      let setHash = '';
      if (opts.hashCol) {
        const h = createHash('sha256').update(opts.lowerHash ? plaintext.toLowerCase() : plaintext).digest('hex');
        params.splice(1, 0, h);
        setHash = `, "${opts.hashCol}" = $2`;
      }
      await ds.query(
        `UPDATE "${table}" SET "${column}" = $1${setHash} WHERE id = $${params.length}`,
        params,
      );
    }
    offset += rows.length;
    console.log(`[enc] ${table}.${column}: ${offset} processed`);
  }
}

async function tableHasColumn(ds: DataSource, table: string, column: string): Promise<boolean> {
  const rows = await ds.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2 LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
