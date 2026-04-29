import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { generateKeyPairSync } from 'crypto';
import { OAuthSigningKey } from '../entities/oauth-signing-key.entity';
import { KMS_SERVICE } from '../../kms/kms.service';
import { InMemoryKmsService } from '../../kms/in-memory-kms.service';
import { OAuthSigningKeyService } from './oauth-signing-key.service';
import { OAUTH_KMS_ORG_ID, signingKeyAad } from './oauth-bootstrap.service';

/**
 * Uses the real InMemoryKmsService to exercise the full encrypt/decrypt path.
 * The mock here only stubs the repository — KMS round-trips actual AES-GCM,
 * which is the realistic behavior in dev/CI.
 */
describe('OAuthSigningKeyService', () => {
  let service: OAuthSigningKeyService;
  let repo: jest.Mocked<Repository<OAuthSigningKey>>;
  let kms: InMemoryKmsService;
  let activeRow: OAuthSigningKey;
  let retiredRow: OAuthSigningKey;
  let activePubPem: string;
  let activePrivPem: string;

  beforeEach(async () => {
    // Stable master key for deterministic per-process DEKs
    process.env.KMS_LOCAL_MASTER_KEY = 'a'.repeat(64);
    kms = new InMemoryKmsService();

    const buildRow = async (kid: string, status: 'active' | 'retired') => {
      const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
      const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      const enc = await kms.encrypt(privPem, signingKeyAad(kid), OAUTH_KMS_ORG_ID);
      return {
        row: {
          id: kid,
          algorithm: 'RS256',
          publicKeyPem: pubPem,
          privateKeyEncrypted: Buffer.from(JSON.stringify(enc), 'utf8'),
          status,
          activatedAt: new Date(),
          retiredAt: null,
          revokedAt: null,
          retireScheduledAt: null,
          createdAt: new Date(),
        } as OAuthSigningKey,
        pubPem,
        privPem,
      };
    };

    const active = await buildRow('kid-active', 'active');
    const retired = await buildRow('kid-retired', 'retired');
    activeRow = active.row;
    retiredRow = retired.row;
    activePubPem = active.pubPem;
    activePrivPem = active.privPem;

    repo = {
      findOne: jest.fn().mockResolvedValue(activeRow),
      find: jest.fn().mockResolvedValue([activeRow, retiredRow]),
    } as unknown as jest.Mocked<Repository<OAuthSigningKey>>;

    const moduleRef = await Test.createTestingModule({
      providers: [
        OAuthSigningKeyService,
        { provide: getRepositoryToken(OAuthSigningKey), useValue: repo },
        { provide: KMS_SERVICE, useValue: kms },
      ],
    }).compile();

    service = moduleRef.get(OAuthSigningKeyService);
  });

  afterEach(() => {
    delete process.env.KMS_LOCAL_MASTER_KEY;
  });

  it('returns kid, valid PEM, and JWK with alg/use/kid populated', async () => {
    const k = await service.getActiveKey();
    expect(k.kid).toBe('kid-active');
    expect(k.algorithm).toBe('RS256');
    expect(k.publicKeyPem).toBe(activePubPem);
    expect(k.privateKeyPem).toBe(activePrivPem);
    expect(k.publicJwk.alg).toBe('RS256');
    expect(k.publicJwk.use).toBe('sig');
    expect(k.publicJwk.kid).toBe('kid-active');
    expect(k.publicJwk.kty).toBe('RSA');
    expect(typeof k.publicJwk.n).toBe('string');
    expect(typeof k.publicJwk.e).toBe('string');
  });

  it('caches getActiveKey() — second call does not re-query repo', async () => {
    await service.getActiveKey();
    await service.getActiveKey();
    expect(repo.findOne).toHaveBeenCalledTimes(1);
  });

  it('invalidate() forces re-fetch', async () => {
    await service.getActiveKey();
    service.invalidate();
    await service.getActiveKey();
    expect(repo.findOne).toHaveBeenCalledTimes(2);
  });

  it('getAllPublishableKeys() returns active + retired', async () => {
    const all = await service.getAllPublishableKeys();
    expect(all).toHaveLength(2);
    const kids = all.map((k) => k.kid).sort();
    expect(kids).toEqual(['kid-active', 'kid-retired']);
    for (const k of all) {
      expect(k.publicJwk.use).toBe('sig');
      expect(k.publicJwk.alg).toBe('RS256');
    }
  });

  it('getAllPublishableKeys() is cached', async () => {
    await service.getAllPublishableKeys();
    await service.getAllPublishableKeys();
    expect(repo.find).toHaveBeenCalledTimes(1);
  });

  it('throws when no active key exists', async () => {
    repo.findOne.mockResolvedValueOnce(null);
    service.invalidate();
    await expect(service.getActiveKey()).rejects.toThrow(/No active OAuth signing key/);
  });
});
