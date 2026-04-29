import { decryptPatientPii } from './patient-projection.util';
import { InMemoryKmsService } from '../kms/in-memory-kms.service';

describe('decryptPatientPii', () => {
  let kms: InMemoryKmsService;

  beforeEach(() => {
    kms = new InMemoryKmsService();
  });

  it('returns decrypted rut, phone, and address', async () => {
    const id = 7;
    const rut = await kms.encrypt('12345678-9', `Patient.rut:${id}`, '1');
    const phone = await kms.encrypt('+56912345678', `Patient.phone:${id}`, '1');
    const address = await kms.encrypt('Av. Principal 123', `Patient.address:${id}`, '1');

    const result = await decryptPatientPii({ id, rut, phone, address }, kms, '1');

    expect(result).toEqual({
      rut: '12345678-9',
      phone: '+56912345678',
      address: 'Av. Principal 123',
    });
  });

  it('returns nulls when phone/address absent', async () => {
    const id = 8;
    const rut = await kms.encrypt('98765432-1', `Patient.rut:${id}`, '1');
    const result = await decryptPatientPii({ id, rut, phone: null, address: null }, kms, '1');
    expect(result).toEqual({ rut: '98765432-1', phone: null, address: null });
  });

  it('rejects when AAD does not match the row id (tamper guard)', async () => {
    const rut = await kms.encrypt('12345678-9', 'Patient.rut:1', '1');
    await expect(decryptPatientPii({ id: 99, rut }, kms, '1')).rejects.toThrow();
  });
});
