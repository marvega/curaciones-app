import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, cleanDatabase } from './setup';
import { createUser, createAdmin, resetCounter } from './factories';

describe('UsersController (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    resetCounter();
    await cleanDatabase(app);

    await createAdmin(app, { username: 'usradmin' });
    await createUser(app, { username: 'usrregular' });

    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'usradmin', password: 'password123' });
    adminToken = adminLogin.body.access_token;

    const userLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'usrregular', password: 'password123' });
    userToken = userLogin.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/users', () => {
    it('should allow admin to list users', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
      // Should have the expected fields
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('username');
      expect(res.body[0]).toHaveProperty('role');
      // Should NOT expose password
      expect(res.body[0]).not.toHaveProperty('passwordHash');
    });

    it('should return 403 for non-admin user', async () => {
      await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  describe('POST /api/users', () => {
    it('should allow admin to create a user', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'newuser',
          password: 'pass123456',
          role: 'user',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        username: 'newuser',
        role: 'user',
      });
      expect(res.body).toHaveProperty('id');
    });

    it('should return 409 for duplicate username', async () => {
      // First create
      await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'dupuser',
          password: 'pass123456',
        });

      // Try duplicate
      await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          username: 'dupuser',
          password: 'pass123456',
        })
        .expect(409);
    });
  });
});
