import { Injectable, Logger } from '@nestjs/common';
import {
  KMSClient,
  GenerateDataKeyCommand,
  DecryptCommand,
} from '@aws-sdk/client-kms';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { KmsService } from './kms.service';
import { EncryptedField } from './encrypted-field';

interface CachedDek {
  plaintext: Buffer;
  ciphertext: Buffer;
  expiresAt: number;
}

@Injectable()
export class AwsKmsService implements KmsService {
  private readonly logger = new Logger(AwsKmsService.name);
  private readonly client: KMSClient;
  private readonly cmkArn: string;
  private readonly cache = new Map<string, CachedDek>();
  private readonly ttlMs = 60 * 60 * 1000;

  constructor() {
    this.client = new KMSClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.cmkArn = process.env.KMS_CMK_ARN!;
    if (!this.cmkArn) throw new Error('KMS_CMK_ARN not configured');
  }

  private async getDek(orgId: string): Promise<CachedDek> {
    const now = Date.now();
    const cached = this.cache.get(orgId);
    if (cached && cached.expiresAt > now) return cached;
    const res = await this.client.send(
      new GenerateDataKeyCommand({
        KeyId: this.cmkArn,
        KeySpec: 'AES_256',
        EncryptionContext: { organizationId: orgId },
      }),
    );
    const fresh: CachedDek = {
      plaintext: Buffer.from(res.Plaintext as Uint8Array),
      ciphertext: Buffer.from(res.CiphertextBlob as Uint8Array),
      expiresAt: now + this.ttlMs,
    };
    this.cache.set(orgId, fresh);
    return fresh;
  }

  private async decryptDek(ciphertext: string, orgId: string): Promise<Buffer> {
    const res = await this.client.send(
      new DecryptCommand({
        CiphertextBlob: Buffer.from(ciphertext, 'base64'),
        EncryptionContext: { organizationId: orgId },
      }),
    );
    return Buffer.from(res.Plaintext as Uint8Array);
  }

  async encrypt(plaintext: string, aad: string, organizationId: string): Promise<EncryptedField> {
    const dek = await this.getDek(organizationId);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', dek.plaintext, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      v: 1,
      k: dek.ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      c: ct.toString('base64'),
      t: tag.toString('base64'),
      aad,
    };
  }

  async decrypt(field: EncryptedField, aad: string, organizationId: string): Promise<string> {
    if (field.aad !== aad) throw new Error('AAD mismatch');
    const dekPlaintext = await this.decryptDek(field.k, organizationId);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      dekPlaintext,
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
    this.cache.delete(organizationId);
  }
}
