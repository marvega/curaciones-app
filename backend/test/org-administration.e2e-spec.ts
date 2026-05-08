import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { v4 as uuid } from 'uuid';
import request from 'supertest';
import { createTestApp, cleanDatabase } from './setup';

interface OrgFixture {
  orgId: string;
  ownerId: number;
  ownerToken: string;
  adminId: number;
  adminToken: string;
  clinicianId: number;
  clinicianToken: string;
}

async function mintAccess(
  jwt: JwtService,
  userId: number,
  username: string,
  orgId: string,
  role: 'owner' | 'admin' | 'clinician' | 'receptionist',
): Promise<string> {
  return jwt.signAsync(
    {
      sub: userId,
      username,
      organizationId: orgId,
      organizationName: 'OrgFixture',
      role,
      establishmentIds: [],
      // Offset 1s into the future to remain ahead of the DB row's `passwordChangedAt`
      // which is set with Postgres `now()` at insertion. JwtStrategy rejects when
      // DB > token; equality is fine.
      passwordChangedAt: Date.now() + 1000,
      jti: uuid(),
    },
    { expiresIn: '15m' },
  );
}

async function seedOrgFixture(app: INestApplication): Promise<OrgFixture> {
  const ds = app.get(DataSource);
  const jwt = app.get(JwtService);
  const tag = randomBytes(4).toString('hex');

  const [org] = await ds.query(
    `INSERT INTO "organizations"("name","rut") VALUES ($1,$2) RETURNING id`,
    [`Org ${tag}`, '76.123.456-7'],
  );
  const orgId = String(org.id);
  const passwordHash = await bcrypt.hash('password123', 10);

  const insertUser = async (username: string) => {
    const [u] = await ds.query(
      `INSERT INTO "users"("username","passwordHash","emailHash","emailVerifiedAt","passwordChangedAt")
       VALUES ($1,$2,$3,now(),now()) RETURNING id`,
      [username, passwordHash, createHash('sha256').update(`${username}@test.cl`).digest('hex')],
    );
    return u.id as number;
  };

  const ownerId = await insertUser(`owner_${tag}`);
  const adminId = await insertUser(`admin_${tag}`);
  const clinicianId = await insertUser(`clin_${tag}`);

  for (const [uid, role] of [
    [ownerId, 'owner'],
    [adminId, 'admin'],
    [clinicianId, 'clinician'],
  ] as const) {
    await ds.query(
      `INSERT INTO "organization_memberships"("userId","organizationId","role","status","acceptedAt")
       VALUES ($1,$2,$3,'active',now())`,
      [uid, orgId, role],
    );
  }

  return {
    orgId,
    ownerId,
    ownerToken: await mintAccess(jwt, ownerId, `owner_${tag}`, orgId, 'owner'),
    adminId,
    adminToken: await mintAccess(jwt, adminId, `admin_${tag}`, orgId, 'admin'),
    clinicianId,
    clinicianToken: await mintAccess(jwt, clinicianId, `clin_${tag}`, orgId, 'clinician'),
  };
}

describe('Org administration (e2e)', () => {
  let app: INestApplication;
  let fx: OrgFixture;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(app);
    fx = await seedOrgFixture(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/org/settings', () => {
    it('returns name and rut for the caller’s org (admin)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/org/settings')
        .set('Authorization', `Bearer ${fx.adminToken}`)
        .expect(200);
      expect(res.body).toEqual({ name: expect.stringMatching(/^Org /), rut: '76.123.456-7' });
    });

    it('rejects without a JWT', async () => {
      await request(app.getHttpServer()).get('/api/org/settings').expect(401);
    });

    it('rejects clinician role with 403', async () => {
      await request(app.getHttpServer())
        .get('/api/org/settings')
        .set('Authorization', `Bearer ${fx.clinicianToken}`)
        .expect(403);
    });
  });
});
