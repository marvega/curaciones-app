/**
 * Usage: npm run audit:verify -- --org 7
 */
import 'reflect-metadata';
import { Command } from 'commander';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { AuditChainService } from '../audit-log/audit-chain.service';

async function main() {
  const program = new Command();
  program.requiredOption('--org <organizationId>');
  program.parse(process.argv);
  const opts = program.opts();

  const app = await NestFactory.createApplicationContext(AppModule);
  const ds = app.get(DataSource);
  const chain = app.get(AuditChainService);

  const rows = await ds.query(
    `SELECT id, "userId", "organizationId", action, entity, "entityId",
            "beforeJson", "afterJson", "createdAt", "requestId",
            "payloadHash", "prevHash", "chainHash"
     FROM "audit_logs" WHERE "organizationId" = $1 ORDER BY id ASC`,
    [opts.org],
  );

  let prev: string | null = null;
  let ok = 0;
  for (const r of rows) {
    const payloadHash = chain.computePayloadHash(r);
    const chainHash = chain.computeChainHash(prev, payloadHash);
    if (payloadHash !== r.payloadHash || chainHash !== r.chainHash || prev !== r.prevHash) {
      console.error(`[audit:verify] MISMATCH at row id=${r.id}`);
      process.exit(2);
    }
    prev = chainHash;
    ok++;
  }
  console.log(`[audit:verify] OK — ${ok} rows verified for org ${opts.org}`);
  await app.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
