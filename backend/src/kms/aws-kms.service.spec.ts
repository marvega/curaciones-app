import { AwsKmsService } from './aws-kms.service';
import { InMemoryKmsService } from './in-memory-kms.service';

describe('KmsService roundtrip', () => {
  it('decrypts what it encrypts (in-memory)', async () => {
    const kms = new InMemoryKmsService();
    const enc = await kms.encrypt('hola', 'Patient.rut:1', '1');
    const dec = await kms.decrypt(enc, 'Patient.rut:1', '1');
    expect(dec).toBe('hola');
  });

  it('rejects on AAD mismatch', async () => {
    const kms = new InMemoryKmsService();
    const enc = await kms.encrypt('hola', 'Patient.rut:1', '1');
    await expect(kms.decrypt(enc, 'Patient.rut:2', '1')).rejects.toThrow();
  });
});
