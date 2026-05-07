import 'reflect-metadata';
import { Command } from 'commander';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { DataSource } from 'typeorm';
import { randomUUID, generateKeyPairSync } from 'crypto';
import { OAuthSigningKey } from '../entities/oauth-signing-key.entity';
import { OAuthSigningKeyService } from '../services/oauth-signing-key.service';
import { KMS_SERVICE } from '../../kms/kms.service';
import type { KmsService } from '../../kms/kms.service';
import { signingKeyAad, OAUTH_KMS_ORG_ID } from '../services/oauth-bootstrap.service';

async function main(): Promise<void> {
  const program = new Command();
  program
    .option('--force', 'apply changes (no confirmation)')
    .option('--dry-run', 'show actions without writing')
    .option('--retire-after-days <n>', 'days before retired key is revoked', '7')
    .option('--reason <text>', 'reason for rotation', 'scheduled rotation');
  program.parse();
  const opts = program.opts<{
    force: boolean;
    dryRun: boolean;
    retireAfterDays: string;
    reason: string;
  }>();
  const retireDays = parseInt(opts.retireAfterDays, 10);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });
  const logger = new Logger('oauth:rotate-keys');

  try {
    const ds = app.get(DataSource);
    const kms = app.get<KmsService>(KMS_SERVICE);
    const signingKeyService = app.get(OAuthSigningKeyService);

    const repo = ds.getRepository(OAuthSigningKey);
    const current = await repo.findOne({ where: { status: 'active' } });
    logger.log(`Current active key: ${current?.id ?? '<none>'}`);

    if (opts.dryRun) {
      logger.log(
        `DRY-RUN: would generate new RS256 key, retire ${current?.id ?? '<none>'} for ${retireDays}d. Reason: "${opts.reason}"`,
      );
      return;
    }

    await ds.transaction(async (m) => {
      const kid = randomUUID();
      const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
      const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

      const encrypted = await kms.encrypt(privateKeyPem, signingKeyAad(kid), OAUTH_KMS_ORG_ID);
      const privateKeyEncrypted = Buffer.from(JSON.stringify(encrypted), 'utf8');

      await m.getRepository(OAuthSigningKey).save({
        id: kid,
        algorithm: 'RS256',
        publicKeyPem,
        privateKeyEncrypted,
        status: 'active',
        activatedAt: new Date(),
      } as Partial<OAuthSigningKey>);

      if (current) {
        const retireScheduledAt = new Date(Date.now() + retireDays * 24 * 60 * 60 * 1000);
        await m.getRepository(OAuthSigningKey).update(current.id, {
          status: 'retired',
          retiredAt: new Date(),
          retireScheduledAt,
        });
        logger.log(`Retired old key kid=${current.id} (revoke scheduled in ${retireDays}d)`);
      }

      logger.log(`Rotated. New active kid=${kid}. Reason: "${opts.reason}"`);
    });

    signingKeyService.invalidate();
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
