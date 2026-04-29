import { EncryptedField } from '../kms/encrypted-field';
import { KmsService } from '../kms/kms.service';

/**
 * Helper for projections that include patient PII (rut/phone/address) without
 * going through PatientsService. The schema stores these columns as jsonb
 * EncryptedField; raw query builders and `findScoped` return the field
 * unchanged. Without a decrypt step the API leaks ciphertext to the
 * frontend, which then crashes on render with "Objects are not valid as a
 * React child."
 */
export async function decryptPatientPii(
  p: {
    id: number;
    rut: EncryptedField;
    phone?: EncryptedField | null;
    address?: EncryptedField | null;
  },
  kms: KmsService,
  orgId: string,
): Promise<{ rut: string; phone: string | null; address: string | null }> {
  const [rut, phone, address] = await Promise.all([
    kms.decrypt(p.rut, `Patient.rut:${p.id}`, orgId),
    p.phone ? kms.decrypt(p.phone, `Patient.phone:${p.id}`, orgId) : Promise.resolve(null),
    p.address ? kms.decrypt(p.address, `Patient.address:${p.id}`, orgId) : Promise.resolve(null),
  ]);
  return { rut, phone, address };
}
