import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';
import { KmsService } from './kms.service';
import { EncryptedField } from './encrypted-field';

/**
 * Local KMS: derives per-org DEK deterministically from KMS_LOCAL_MASTER_KEY
 * via HKDF-SHA256, so DEKs survive process restarts. Falls back to ephemeral
 * random keys (test-only) when the env var is absent.
 */
@Injectable()
export class InMemoryKmsService implements KmsService {
  private readonly dekByOrg = new Map<string, Buffer>();
  private readonly fakeKekArn = 'arn:aws:kms:test:fake-cmk';
  private readonly masterKey: Buffer | null;

  constructor() {
    const raw = process.env.KMS_LOCAL_MASTER_KEY;
    this.masterKey = raw ? Buffer.from(raw, 'hex') : null;
    if (this.masterKey && this.masterKey.length < 32) {
      throw new Error('KMS_LOCAL_MASTER_KEY must be at least 32 bytes (64 hex chars)');
    }
  }

  private getDek(orgId: string): Buffer {
    let dek = this.dekByOrg.get(orgId);
    if (!dek) {
      if (this.masterKey) {
        dek = Buffer.from(
          hkdfSync('sha256', this.masterKey, Buffer.from(orgId, 'utf8'), 'curaciones-dek/v1', 32),
        );
      } else {
        dek = randomBytes(32);
      }
      this.dekByOrg.set(orgId, dek);
    }
    return dek;
  }

  async encrypt(plaintext: string, aad: string, organizationId: string): Promise<EncryptedField> {
    const dek = this.getDek(organizationId);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', dek, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      v: 1,
      k: Buffer.from(`fake:${organizationId}`).toString('base64'),
      iv: iv.toString('base64'),
      c: ct.toString('base64'),
      t: tag.toString('base64'),
      aad,
    };
  }

  async decrypt(field: EncryptedField, aad: string, organizationId: string): Promise<string> {
    if (field.aad !== aad) throw new Error('AAD mismatch');
    const dek = this.getDek(organizationId);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      dek,
      Buffer.from(field.iv, 'base64'),
    );
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(Buffer.from(field.t, 'base64'));
    const pt = Buffer.concat([
      decipher.update(Buffer.from(field.c, 'base64')),
      decipher.final(),
    ]);
    return pt.toString('utf8');
  }

  async rotateDek(organizationId: string): Promise<void> {
    this.dekByOrg.delete(organizationId);
  }
}
