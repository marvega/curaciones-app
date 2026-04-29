import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';

export async function createOrgWithUser(
  app: INestApplication,
  orgName: string,
  username: string,
  email: string,
): Promise<{ orgId: string; userId: number; accessToken: string; refreshToken: string }> {
  const ds = app.get(DataSource);
  const orgRes = await ds.query(
    `INSERT INTO "organizations"("name") VALUES ($1) RETURNING id`,
    [orgName],
  );
  const orgId = String(orgRes[0].id);
  const passwordHash = await bcrypt.hash('password123', 10);
  const emailHash = createHash('sha256').update(email.toLowerCase()).digest('hex');
  const userRes = await ds.query(
    `INSERT INTO "users"("username","passwordHash","email","emailHash","emailVerifiedAt","passwordChangedAt")
     VALUES ($1,$2,$3,$4,now(),now()) RETURNING id`,
    [username, passwordHash, JSON.stringify({ plaintext: email }), emailHash],
  );
  const userId = userRes[0].id;
  await ds.query(
    `INSERT INTO "organization_memberships"("userId","organizationId","role","status","acceptedAt")
     VALUES ($1,$2,'owner','active',now())`,
    [userId, orgId],
  );
  await ds.query(
    `INSERT INTO "establishments"("name","comuna","organizationId") VALUES ($1,$2,$3)`,
    [`Sede ${orgName}`, 'Test', orgId],
  );
  const login = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ usernameOrEmail: username, password: 'password123' });
  return { orgId, userId, accessToken: login.body.accessToken, refreshToken: login.body.refreshToken };
}
