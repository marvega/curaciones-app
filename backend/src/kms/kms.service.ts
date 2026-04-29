import { EncryptedField } from './encrypted-field';

export const KMS_SERVICE = Symbol('KMS_SERVICE');

export interface KmsService {
  encrypt(plaintext: string, aad: string, organizationId: string): Promise<EncryptedField>;
  decrypt(field: EncryptedField, aad: string, organizationId: string): Promise<string>;
  rotateDek(organizationId: string): Promise<void>;
}
