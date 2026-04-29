import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { KmsService } from './kms.service';
import { EncryptedField } from './encrypted-field';

@Injectable()
export class InMemoryKmsService implements KmsService {
  private readonly dekByOrg = new Map<string, Buffer>();
  private readonly fakeKekArn = 'arn:aws:kms:test:fake-cmk';

  private getDek(orgId: string): Buffer {
    let dek = this.dekByOrg.get(orgId);
    if (!dek) {
      dek = randomBytes(32);
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
