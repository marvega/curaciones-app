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

  describe('KMS_LOCAL_MASTER_KEY', () => {
    const originalKey = process.env.KMS_LOCAL_MASTER_KEY;
    afterEach(() => {
      if (originalKey === undefined) delete process.env.KMS_LOCAL_MASTER_KEY;
      else process.env.KMS_LOCAL_MASTER_KEY = originalKey;
    });

    it('derives the same DEK across process restarts when seed is set', async () => {
      process.env.KMS_LOCAL_MASTER_KEY = 'a'.repeat(64);
      const enc = await new InMemoryKmsService().encrypt('hola', 'Patient.rut:1', '7');
      const dec = await new InMemoryKmsService().decrypt(enc, 'Patient.rut:1', '7');
      expect(dec).toBe('hola');
    });

    it('rejects a master key shorter than 32 bytes', () => {
      process.env.KMS_LOCAL_MASTER_KEY = 'ab';
      expect(() => new InMemoryKmsService()).toThrow(/at least 32 bytes/);
    });

    it('isolates DEKs per organization even with the same seed', async () => {
      process.env.KMS_LOCAL_MASTER_KEY = 'b'.repeat(64);
      const enc = await new InMemoryKmsService().encrypt('secret', 'Patient.rut:1', '1');
      await expect(
        new InMemoryKmsService().decrypt(enc, 'Patient.rut:1', '2'),
      ).rejects.toThrow();
    });
  });
});
