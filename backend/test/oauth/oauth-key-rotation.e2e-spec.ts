/* eslint-disable @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-argument,
                  @typescript-eslint/no-unsafe-call */
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { createHash, randomBytes, generateKeyPairSync, randomUUID } from 'crypto';
import { v4 as uuid } from 'uuid';
import request from 'supertest';
import { createTestApp, cleanDatabase } from '../setup';
import { OAuthSigningKeyService } from '../../src/oauth/services/oauth-signing-key.service';
import { OAuthJwtStrategy } from '../../src/oauth/strategies/oauth-jwt.strategy';
import { OAuthSigningKey } from '../../src/oauth/entities/oauth-signing-key.entity';
import { KMS_SERVICE } from '../../src/kms/kms.service';
import type { KmsService } from '../../src/kms/kms.service';
import { signingKeyAad, OAUTH_KMS_ORG_ID } from '../../src/oauth/services/oauth-bootstrap.service';

interface Fixtures {
  userId: number;
  orgId: string;
}

async function createFixtures(app: INestApplication): Promise<Fixtures> {
  const ds = app.get(DataSource);
  const username = `keyrot_${randomBytes(4).toString('hex')}`;
  const email = `${username}@test.cl`;
  const orgRes = await ds.query(
    `INSERT INTO "organizations"("name") VALUES ($1) RETURNING id`,
    [`Key Rotation Org ${username}`],
  );
  const orgId = String(orgRes[0].id);
  const passwordHash = await bcrypt.hash('p4ssword', 10);
  const emailHash = createHash('sha256').update(email.toLowerCase()).digest('hex');
  const userRes = await ds.query(
    `INSERT INTO "users"("username","passwordHash","email","emailHash","emailVerifiedAt","passwordChangedAt")
     VALUES ($1,$2,$3,$4,now(),now()) RETURNING id`,
    [username, passwordHash, JSON.stringify({ plaintext: email }), emailHash],
  );
  const userId: number = userRes[0].id;
  await ds.query(
    `INSERT INTO "organization_memberships"("userId","organizationId","role","status","acceptedAt")
     VALUES ($1,$2,'admin','active',now())`,
    [userId, orgId],
  );
  return { userId, orgId };
}

function makeOAuthJwt(
  privateKeyPem: string,
  kid: string,
  userId: number,
  orgId: string,
  issuer: string,
): string {
  return jwt.sign(
    {
      sub: String(userId),
      org_id: orgId,
      scope: 'patients:read',
      org_name: 'Test Org',
      role: 'admin',
      jti: uuid(),
    },
    privateKeyPem,
    {
      algorithm: 'RS256',
      issuer,
      audience: issuer,
      expiresIn: '1h',
      header: { alg: 'RS256', typ: 'JWT', kid },
    },
  );
}

async function createSigningKey(
  app: INestApplication,
  status: 'active' | 'retired' = 'active',
): Promise<{ kid: string; privateKeyPem: string }> {
  const ds = app.get(DataSource);
  const kms = app.get<KmsService>(KMS_SERVICE);

  const kid = randomUUID();
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const encrypted = await kms.encrypt(privateKeyPem, signingKeyAad(kid), OAUTH_KMS_ORG_ID);
  const privateKeyEncrypted = Buffer.from(JSON.stringify(encrypted), 'utf8');

  await ds.getRepository(OAuthSigningKey).save({
    id: kid,
    algorithm: 'RS256',
    publicKeyPem,
    privateKeyEncrypted,
    status,
    activatedAt: new Date(),
  } as Partial<OAuthSigningKey>);

  return { kid, privateKeyPem };
}

describe('OAuth key rotation lifecycle (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    // Stale caches from app init must be cleared after truncating oauth_signing_key.
    app.get(OAuthSigningKeyService).invalidate();
    app.get(OAuthJwtStrategy).invalidate();
  });

  it('K1-signed AT is valid while K1 is retired; rejected after K1 is revoked', async () => {
    const issuer = process.env.OAUTH_ISSUER || 'http://localhost:3000';
    const ds = app.get(DataSource);
    const signingKeyService = app.get(OAuthSigningKeyService);
    const jwtStrategy = app.get(OAuthJwtStrategy);
    const kms = app.get<KmsService>(KMS_SERVICE);

    // 1. Seed user, org, membership.
    const { userId, orgId } = await createFixtures(app);

    // 2. Create K1 in DB; sign a JWT with its private key.
    const k1 = await createSigningKey(app);
    const k1At = makeOAuthJwt(k1.privateKeyPem, k1.kid, userId, orgId, issuer);

    // 3. K1-signed AT validates against the protected endpoint.
    await request(app.getHttpServer())
      .get('/api/patients')
      .set('Authorization', `Bearer ${k1At}`)
      .expect(200);

    // 4. Rotate: retire K1, activate K2.
    const k2Kid = randomUUID();
    await ds.transaction(async (m) => {
      const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
      const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      const encrypted = await kms.encrypt(privateKeyPem, signingKeyAad(k2Kid), OAUTH_KMS_ORG_ID);
      const privateKeyEncrypted = Buffer.from(JSON.stringify(encrypted), 'utf8');

      await m.getRepository(OAuthSigningKey).save({
        id: k2Kid,
        algorithm: 'RS256',
        publicKeyPem,
        privateKeyEncrypted,
        status: 'active',
        activatedAt: new Date(),
      } as Partial<OAuthSigningKey>);

      await m.getRepository(OAuthSigningKey).update(k1.kid, {
        status: 'retired',
        retiredAt: new Date(),
        retireScheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
    });
    signingKeyService.invalidate();
    jwtStrategy.invalidate();

    // 5. Service layer: getActiveKey() returns K2.
    const active = await signingKeyService.getActiveKey();
    expect(active.kid).toBe(k2Kid);

    // 6. K1-signed AT is still valid because OAuthJwtStrategy includes retired keys.
    await request(app.getHttpServer())
      .get('/api/patients')
      .set('Authorization', `Bearer ${k1At}`)
      .expect(200);

    // 7. Revoke K1.
    await ds.getRepository(OAuthSigningKey).update(k1.kid, {
      status: 'revoked',
      revokedAt: new Date(),
    });
    signingKeyService.invalidate();
    jwtStrategy.invalidate();

    // 8. K1-signed AT is now rejected: revoked keys are excluded from JWKS.
    await request(app.getHttpServer())
      .get('/api/patients')
      .set('Authorization', `Bearer ${k1At}`)
      .expect(401);
  });

  it('dry-run: getActiveKey() returns the only active key after clean state', async () => {
    const signingKeyService = app.get(OAuthSigningKeyService);

    // After cleanDatabase + invalidate, creating one key makes it the active key.
    const k = await createSigningKey(app);
    const active = await signingKeyService.getActiveKey();
    expect(active.kid).toBe(k.kid);
  });
});
