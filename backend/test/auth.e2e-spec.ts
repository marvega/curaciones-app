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

  describe('POST /api/auth/refresh', () => {
    it.skip('rotates refresh token and rejects reuse', async () => {
      await createUser(app, { username: 'refreshuser' });
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ usernameOrEmail: 'refreshuser', password: 'password123' });
      const r1 = login.body.refreshToken;

      const refresh1 = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: r1 })
        .expect(201);
      expect(refresh1.body.refreshToken).toBeDefined();

      // Reuse old token: must 403 and revoke entire chain
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: r1 })
        .expect(403);
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
