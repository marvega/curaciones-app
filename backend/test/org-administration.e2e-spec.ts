import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { v4 as uuid } from 'uuid';
import request from 'supertest';
import { createTestApp, cleanDatabase } from './setup';
import { KMS_SERVICE } from 'src/kms/kms.service';

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

  describe('PATCH /api/org/settings', () => {
    it('updates name and rut', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/org/settings')
        .set('Authorization', `Bearer ${fx.adminToken}`)
        .send({ name: 'New Name', rut: '99.999.999-9' })
        .expect(200);
      expect(res.body).toEqual({ name: 'New Name', rut: '99.999.999-9' });

      const verify = await request(app.getHttpServer())
        .get('/api/org/settings')
        .set('Authorization', `Bearer ${fx.adminToken}`)
        .expect(200);
      expect(verify.body).toEqual({ name: 'New Name', rut: '99.999.999-9' });
    });

    it('rejects clinician role with 403', async () => {
      await request(app.getHttpServer())
        .patch('/api/org/settings')
        .set('Authorization', `Bearer ${fx.clinicianToken}`)
        .send({ name: 'Whatever' })
        .expect(403);
    });

    it('rejects empty name with 400', async () => {
      await request(app.getHttpServer())
        .patch('/api/org/settings')
        .set('Authorization', `Bearer ${fx.adminToken}`)
        .send({ name: '' })
        .expect(400);
    });

    it('clears rut when omitted', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/org/settings')
        .set('Authorization', `Bearer ${fx.adminToken}`)
        .send({ name: 'No Rut' })
        .expect(200);
      expect(res.body).toEqual({ name: 'No Rut', rut: null });
    });
  });

  describe('GET /api/org/members', () => {
    it('returns active members of the org with username and role', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/org/members')
        .set('Authorization', `Bearer ${fx.adminToken}`)
        .expect(200);
      expect(res.body).toHaveLength(3);
      const usernames = res.body.map((m: { username: string }) => m.username).sort();
      expect(usernames[0]).toMatch(/^admin_/);
      expect(usernames[1]).toMatch(/^clin_/);
      expect(usernames[2]).toMatch(/^owner_/);
      const roles = res.body.map((m: { role: string }) => m.role).sort();
      expect(roles).toEqual(['admin', 'clinician', 'owner']);
      for (const m of res.body) {
        expect(m).toEqual(
          expect.objectContaining({
            userId: expect.any(Number),
            role: expect.stringMatching(/^(owner|admin|clinician|receptionist)$/),
            status: 'active',
          }),
        );
      }
    });

    it('rejects clinician with 403', async () => {
      await request(app.getHttpServer())
        .get('/api/org/members')
        .set('Authorization', `Bearer ${fx.clinicianToken}`)
        .expect(403);
    });

    it('rejects without a JWT', async () => {
      await request(app.getHttpServer()).get('/api/org/members').expect(401);
    });

    it('decrypts member emails when present', async () => {
      const ds = app.get(DataSource);
      const kms = app.get<{
        encrypt: (plain: string, aad: string, orgId: string) => Promise<unknown>;
      }>(KMS_SERVICE);
      const encrypted = await kms.encrypt(
        'owner@org.cl',
        `User.email:${fx.ownerId}`,
        fx.orgId,
      );
      await ds.query(
        `UPDATE "users" SET "email" = $1 WHERE id = $2`,
        [JSON.stringify(encrypted), fx.ownerId],
      );

      const res = await request(app.getHttpServer())
        .get('/api/org/members')
        .set('Authorization', `Bearer ${fx.adminToken}`)
        .expect(200);
      const owner = res.body.find((m: { userId: number }) => m.userId === fx.ownerId);
      expect(owner.email).toBe('owner@org.cl');
    });
  });

  describe('PATCH /api/org/members/:userId', () => {
    it('demotes the admin to clinician', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/org/members/${fx.adminId}`)
        .set('Authorization', `Bearer ${fx.ownerToken}`)
        .send({ role: 'clinician' })
        .expect(200);
      expect(res.body).toEqual(expect.objectContaining({ userId: fx.adminId, role: 'clinician' }));
    });

    it('rejects role=owner with 400', async () => {
      await request(app.getHttpServer())
        .patch(`/api/org/members/${fx.adminId}`)
        .set('Authorization', `Bearer ${fx.ownerToken}`)
        .send({ role: 'owner' })
        .expect(400);
    });

    it('refuses to demote the last owner with 409', async () => {
      await request(app.getHttpServer())
        .patch(`/api/org/members/${fx.ownerId}`)
        .set('Authorization', `Bearer ${fx.ownerToken}`)
        .send({ role: 'admin' })
        .expect(409);
    });

    it('rejects clinician role with 403', async () => {
      await request(app.getHttpServer())
        .patch(`/api/org/members/${fx.adminId}`)
        .set('Authorization', `Bearer ${fx.clinicianToken}`)
        .send({ role: 'clinician' })
        .expect(403);
    });

    it('rejects without a JWT', async () => {
      await request(app.getHttpServer())
        .patch(`/api/org/members/${fx.adminId}`)
        .send({ role: 'clinician' })
        .expect(401);
    });

    it('returns 404 when target userId is not a member of the caller’s org', async () => {
      await request(app.getHttpServer())
        .patch(`/api/org/members/999999`)
        .set('Authorization', `Bearer ${fx.ownerToken}`)
        .send({ role: 'clinician' })
        .expect(404);
    });
  });

  describe('DELETE /api/org/members/:userId', () => {
    it('revokes another active member with 204', async () => {
      await request(app.getHttpServer())
        .delete(`/api/org/members/${fx.adminId}`)
        .set('Authorization', `Bearer ${fx.ownerToken}`)
        .expect(204);

      const list = await request(app.getHttpServer())
        .get('/api/org/members')
        .set('Authorization', `Bearer ${fx.ownerToken}`)
        .expect(200);
      expect(list.body.find((m: { userId: number }) => m.userId === fx.adminId)).toBeUndefined();
    });

    it('rejects revoking yourself with 409', async () => {
      await request(app.getHttpServer())
        .delete(`/api/org/members/${fx.ownerId}`)
        .set('Authorization', `Bearer ${fx.ownerToken}`)
        .expect(409);
    });

    it('rejects revoking the last owner with 409', async () => {
      await request(app.getHttpServer())
        .delete(`/api/org/members/${fx.ownerId}`)
        .set('Authorization', `Bearer ${fx.adminToken}`)
        .expect(409);
    });

    it('rejects clinician role with 403', async () => {
      await request(app.getHttpServer())
        .delete(`/api/org/members/${fx.adminId}`)
        .set('Authorization', `Bearer ${fx.clinicianToken}`)
        .expect(403);
    });

    it('rejects without a JWT', async () => {
      await request(app.getHttpServer())
        .delete(`/api/org/members/${fx.adminId}`)
        .expect(401);
    });

    it('returns 404 when target userId is not a member of the caller’s org', async () => {
      await request(app.getHttpServer())
        .delete(`/api/org/members/999999`)
        .set('Authorization', `Bearer ${fx.ownerToken}`)
        .expect(404);
    });
  });

  describe('GET /api/org/invitations', () => {
    it('returns only pending invitations', async () => {
      const ds = app.get(DataSource);
      const tokenHash = createHash('sha256').update('xxx').digest('hex').slice(0, 63);
      const futureExp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const pastExp = new Date(Date.now() - 1000);

      await ds.query(
        `INSERT INTO "invitations"("organizationId","email","role","invitedById","tokenHash","expiresAt")
         VALUES ($1,$2,'admin',$3,$4,$5)`,
        [fx.orgId, 'pending@test.cl', fx.ownerId, tokenHash + '1', futureExp],
      );
      await ds.query(
        `INSERT INTO "invitations"("organizationId","email","role","invitedById","tokenHash","expiresAt","acceptedAt")
         VALUES ($1,$2,'admin',$3,$4,$5,now())`,
        [fx.orgId, 'accepted@test.cl', fx.ownerId, tokenHash + '2', futureExp],
      );
      await ds.query(
        `INSERT INTO "invitations"("organizationId","email","role","invitedById","tokenHash","expiresAt")
         VALUES ($1,$2,'admin',$3,$4,$5)`,
        [fx.orgId, 'expired@test.cl', fx.ownerId, tokenHash + '3', pastExp],
      );

      const res = await request(app.getHttpServer())
        .get('/api/org/invitations')
        .set('Authorization', `Bearer ${fx.adminToken}`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toEqual(
        expect.objectContaining({
          email: 'pending@test.cl',
          role: 'admin',
          id: expect.any(String),
        }),
      );
    });

    it('rejects clinician with 403', async () => {
      await request(app.getHttpServer())
        .get('/api/org/invitations')
        .set('Authorization', `Bearer ${fx.clinicianToken}`)
        .expect(403);
    });

    it('rejects without a JWT', async () => {
      await request(app.getHttpServer()).get('/api/org/invitations').expect(401);
    });
  });

  describe('POST /api/org/invitations', () => {
    it('creates an invitation and returns its id', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/org/invitations')
        .set('Authorization', `Bearer ${fx.adminToken}`)
        .send({ email: 'newperson@test.cl', role: 'clinician' })
        .expect(201);
      expect(res.body).toEqual({ id: expect.any(String) });

      const list = await request(app.getHttpServer())
        .get('/api/org/invitations')
        .set('Authorization', `Bearer ${fx.adminToken}`)
        .expect(200);
      expect(list.body).toContainEqual(
        expect.objectContaining({ email: 'newperson@test.cl', role: 'clinician' }),
      );
    });

    it('rejects when inviting an existing active member with 409', async () => {
      const ds = app.get(DataSource);
      const dupEmail = 'dup@test.cl';
      await ds.query(
        `UPDATE "users" SET "emailHash"=$1 WHERE id=$2`,
        [createHash('sha256').update(dupEmail.toLowerCase()).digest('hex'), fx.adminId],
      );
      await request(app.getHttpServer())
        .post('/api/org/invitations')
        .set('Authorization', `Bearer ${fx.ownerToken}`)
        .send({ email: dupEmail, role: 'clinician' })
        .expect(409);
    });

    it('rejects role=owner with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/org/invitations')
        .set('Authorization', `Bearer ${fx.ownerToken}`)
        .send({ email: 'someone@test.cl', role: 'owner' })
        .expect(400);
    });

    it('rejects invalid email with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/org/invitations')
        .set('Authorization', `Bearer ${fx.ownerToken}`)
        .send({ email: 'not-an-email', role: 'clinician' })
        .expect(400);
    });

    it('rejects clinician role with 403', async () => {
      await request(app.getHttpServer())
        .post('/api/org/invitations')
        .set('Authorization', `Bearer ${fx.clinicianToken}`)
        .send({ email: 'x@test.cl', role: 'clinician' })
        .expect(403);
    });

    it('rejects without a JWT', async () => {
      await request(app.getHttpServer())
        .post('/api/org/invitations')
        .send({ email: 'x@test.cl', role: 'clinician' })
        .expect(401);
    });
  });

  describe('GET /api/org/establishments', () => {
    it('returns establishments for the org', async () => {
      const ds = app.get(DataSource);
      await ds.query(
        `INSERT INTO "establishments"("name","comuna","organizationId") VALUES ($1,$2,$3)`,
        ['CESFAM Test', 'Quilpué', fx.orgId],
      );
      const res = await request(app.getHttpServer())
        .get('/api/org/establishments')
        .set('Authorization', `Bearer ${fx.adminToken}`)
        .expect(200);
      expect(res.body).toContainEqual(
        expect.objectContaining({ name: 'CESFAM Test', comuna: 'Quilpué' }),
      );
    });

    it('rejects clinician with 403', async () => {
      await request(app.getHttpServer())
        .get('/api/org/establishments')
        .set('Authorization', `Bearer ${fx.clinicianToken}`)
        .expect(403);
    });

    it('rejects without a JWT', async () => {
      await request(app.getHttpServer()).get('/api/org/establishments').expect(401);
    });
  });
});
