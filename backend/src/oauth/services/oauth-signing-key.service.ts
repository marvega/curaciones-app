import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { createPublicKey } from 'crypto';
import { OAuthSigningKey } from '../entities/oauth-signing-key.entity';
import { KMS_SERVICE } from '../../kms/kms.service';
import type { KmsService } from '../../kms/kms.service';
import type { EncryptedField } from '../../kms/encrypted-field';
import { OAUTH_KMS_ORG_ID, signingKeyAad } from './oauth-bootstrap.service';

export interface ResolvedSigningKey {
  kid: string;
  algorithm: string;
  privateKeyPem: string;
  publicKeyPem: string;
  publicJwk: Record<string, unknown>;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class OAuthSigningKeyService {
  private activeCache: { value: ResolvedSigningKey; expiresAt: number } | null = null;
  private allCache: { value: ResolvedSigningKey[]; expiresAt: number } | null = null;

  constructor(
    @InjectRepository(OAuthSigningKey) private readonly repo: Repository<OAuthSigningKey>,
    @Inject(KMS_SERVICE) private readonly kms: KmsService,
  ) {}

  invalidate(): void {
    this.activeCache = null;
    this.allCache = null;
  }

  async getActiveKey(): Promise<ResolvedSigningKey> {
    if (this.activeCache && this.activeCache.expiresAt > Date.now()) {
      return this.activeCache.value;
    }
    const row = await this.repo.findOne({ where: { status: 'active' } });
    if (!row) throw new Error('No active OAuth signing key');
    const resolved = await this.resolve(row);
    this.activeCache = { value: resolved, expiresAt: Date.now() + CACHE_TTL_MS };
    return resolved;
  }

  async getAllPublishableKeys(): Promise<ResolvedSigningKey[]> {
    if (this.allCache && this.allCache.expiresAt > Date.now()) {
      return this.allCache.value;
    }
    const rows = await this.repo.find({ where: { status: In(['active', 'retired']) } });
    const resolved = await Promise.all(rows.map((r) => this.resolve(r)));
    this.allCache = { value: resolved, expiresAt: Date.now() + CACHE_TTL_MS };
    return resolved;
  }

  private async resolve(row: OAuthSigningKey): Promise<ResolvedSigningKey> {
    const field = JSON.parse(row.privateKeyEncrypted.toString('utf8')) as EncryptedField;
    const privateKeyPem = await this.kms.decrypt(field, signingKeyAad(row.id), OAUTH_KMS_ORG_ID);
    const publicKey = createPublicKey(row.publicKeyPem);
    const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
    return {
      kid: row.id,
      algorithm: row.algorithm,
      privateKeyPem,
      publicKeyPem: row.publicKeyPem,
      publicJwk: { ...jwk, alg: row.algorithm, use: 'sig', kid: row.id },
    };
  }
}
