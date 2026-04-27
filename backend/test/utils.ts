import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createUser, createAdmin } from './factories';

export async function loginAsUser(app: INestApplication): Promise<string> {
  const user = await createUser(app, { username: 'e2euser' });
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: 'e2euser', password: 'password123' });
  return res.body.access_token;
}

export async function loginAsAdmin(app: INestApplication): Promise<string> {
  const admin = await createAdmin(app, { username: 'e2eadmin' });
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: 'e2eadmin', password: 'password123' });
  return res.body.access_token;
}
