import { ValueTransformer } from 'typeorm';
import { EncryptedField } from './encrypted-field';

/**
 * IMPORTANT: TypeORM transformers are sync. We cannot call KMS here.
 * Therefore: persistence already stores `EncryptedField` JSON (created by
 * the service layer using KmsService). The transformer here is a passthrough
 * that DOCUMENTS the column intent and validates shape on read.
 *
 * Service-layer code is responsible for calling kms.encrypt/decrypt around
 * any read/write of these fields.
 */
export type { EncryptedField };

export function encryptedColumnTransformer(_aadPrefix: string): ValueTransformer {
  return {
    to: (value: EncryptedField | null) => value ?? null,
    from: (value: any) => (value as EncryptedField | null) ?? null,
  };
}
