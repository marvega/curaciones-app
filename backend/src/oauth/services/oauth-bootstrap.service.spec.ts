import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OAuthSigningKey } from '../entities/oauth-signing-key.entity';
import { OAuthBootstrapService } from './oauth-bootstrap.service';
import { KMS_SERVICE, KmsService } from '../../kms/kms.service';
import type { EncryptedField } from '../../kms/encrypted-field';

/**
 * The real KMS contract is `encrypt(plaintext, aad, orgId) -> EncryptedField`,
 * not `encrypt(Buffer) -> Buffer`. The bootstrap service serializes the
 * EncryptedField as JSON and stores it in the `bytea` column.
 *
 * The mock here returns a deterministic EncryptedField that round-trips with
 * the decrypt mock used in oauth-signing-key.service.spec.ts.
 */
function mockEncryptedField(plaintext: string, aad: string): EncryptedField {
  return {
    v: 1,
    k: 'fake-key',
    iv: 'fake-iv',
    c: Buffer.from(plaintext, 'utf8').toString('base64'),
    t: 'fake-tag',
    aad,
  };
}

describe('OAuthBootstrapService', () => {
  let service: OAuthBootstrapService;
  let repo: jest.Mocked<Repository<OAuthSigningKey>>;
  let kms: jest.Mocked<KmsService>;

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<OAuthSigningKey>>;
    kms = {
      encrypt: jest.fn(async (pt: string, aad: string) => mockEncryptedField(pt, aad)),
      decrypt: jest.fn(),
      rotateDek: jest.fn(),
    } as unknown as jest.Mocked<KmsService>;

    const moduleRef = await Test.createTestingModule({
      providers: [
        OAuthBootstrapService,
        { provide: getRepositoryToken(OAuthSigningKey), useValue: repo },
        { provide: KMS_SERVICE, useValue: kms },
      ],
    }).compile();

    service = moduleRef.get(OAuthBootstrapService);
  });

  it('does nothing if active key exists', async () => {
    repo.findOne.mockResolvedValue({
      id: 'existing-kid',
      status: 'active',
    } as OAuthSigningKey);

    await service.ensureActiveKey();

    expect(repo.save).not.toHaveBeenCalled();
    expect(kms.encrypt).not.toHaveBeenCalled();
  });

  it('generates RSA 2048 + saves encrypted private key when none active', async () => {
    repo.findOne.mockResolvedValue(null);
    repo.save.mockImplementation(async (e: unknown) => {
      const entity = e as Partial<OAuthSigningKey>;
      return { ...entity } as OAuthSigningKey;
    });

    await service.ensureActiveKey();

    expect(kms.encrypt).toHaveBeenCalledTimes(1);
    // The first arg to encrypt is the private key PEM (string), not a Buffer
    // — that's what the real KMS contract expects.
    const [plaintext, aad, orgId] = kms.encrypt.mock.calls[0];
    expect(typeof plaintext).toBe('string');
    expect(plaintext).toMatch(/-----BEGIN PRIVATE KEY-----/);
    expect(typeof aad).toBe('string');
    expect(aad.length).toBeGreaterThan(0);
    expect(typeof orgId).toBe('string');

    expect(repo.save).toHaveBeenCalledTimes(1);
    const saved = repo.save.mock.calls[0][0] as Partial<OAuthSigningKey>;
    expect(saved.algorithm).toBe('RS256');
    expect(saved.status).toBe('active');
    expect(saved.publicKeyPem).toMatch(/-----BEGIN PUBLIC KEY-----/);
    expect(Buffer.isBuffer(saved.privateKeyEncrypted)).toBe(true);
    expect(saved.activatedAt).toBeInstanceOf(Date);

    // The Buffer must be a JSON-serialized EncryptedField (the storage shape).
    const roundTrip = JSON.parse(saved.privateKeyEncrypted!.toString('utf8'));
    expect(roundTrip.v).toBe(1);
    expect(typeof roundTrip.c).toBe('string');
    expect(typeof roundTrip.aad).toBe('string');
  });
});
