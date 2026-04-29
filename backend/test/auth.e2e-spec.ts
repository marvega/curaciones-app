import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase } from './setup';
import { createUser, resetCounter } from './factories';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    resetCounter();
    await cleanDatabase(app);
  });

  describe('POST /api/auth/login', () => {
    it.skip('returns accessToken, refreshToken, user, organizations', async () => {
      await createUser(app, { username: 'loginuser' });
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ usernameOrEmail: 'loginuser', password: 'password123' })
        .expect(201);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user).toMatchObject({ username: 'loginuser' });
      expect(Array.isArray(res.body.organizations)).toBe(true);
    });

    it.skip('returns 401 for invalid password', async () => {
      await createUser(app, { username: 'loginuser' });
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ usernameOrEmail: 'loginuser', password: 'wrong' })
        .expect(401);
    });
  });

  describe('Protected endpoints', () => {
    it('should return 401 without token', async () => {
      await request(app.getHttpServer())
        .get('/api/patients')
        .expect(401);
    });

    it('should allow access with valid token', async () => {
      await createUser(app, { username: 'authuser' });

      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: 'authuser', password: 'password123' });

      const token = loginRes.body.access_token;

      await request(app.getHttpServer())
        .get('/api/patients')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });
});
