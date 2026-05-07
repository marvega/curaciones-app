import { Injectable, Logger, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { generateKeyPairSync, randomUUID } from 'crypto';
import { OAuthSigningKey } from '../entities/oauth-signing-key.entity';
import { KMS_SERVICE } from '../../kms/kms.service';
import type { KmsService } from '../../kms/kms.service';

/**
 * Synthetic organization id for OAuth signing keys. The KMS contract requires
 * a per-org id, but signing keys for the Authorization Server are *global*
 * (not tenant-scoped) — they sign tokens issued to any organization. Using a
 * fixed id ensures HKDF derives a stable DEK across restarts in dev.
 */
export const OAUTH_KMS_ORG_ID = 'oauth-system';

/** AAD format binds the ciphertext to a specific signing key row. */
export function signingKeyAad(kid: string): string {
  return `OAuthSigningKey.privateKey:${kid}`;
}

@Injectable()
export class OAuthBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OAuthBootstrapService.name);

  constructor(
    @InjectRepository(OAuthSigningKey) private readonly keyRepo: Repository<OAuthSigningKey>,
    @Inject(KMS_SERVICE) private readonly kms: KmsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureActiveKey();
  }

  async ensureActiveKey(): Promise<void> {
    const existing = await this.keyRepo.findOne({ where: { status: 'active' } });
    if (existing) {
      this.logger.log(`Active OAuth signing key present (kid=${existing.id})`);
      return;
    }

    // Pre-allocate the kid so we can bind it as AAD before persisting.
    const kid = randomUUID();
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    const encrypted = await this.kms.encrypt(privateKeyPem, signingKeyAad(kid), OAUTH_KMS_ORG_ID);
    const privateKeyEncrypted = Buffer.from(JSON.stringify(encrypted), 'utf8');

    const saved = await this.keyRepo.save({
      id: kid,
      algorithm: 'RS256',
      publicKeyPem,
      privateKeyEncrypted,
      status: 'active',
      activatedAt: new Date(),
    } as Partial<OAuthSigningKey>);
    this.logger.log(`Generated initial OAuth signing key kid=${saved.id}`);
  }
}
