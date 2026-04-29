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

  describe('POST /api/auth/logout', () => {
    it.skip('logs out current refresh token', async () => {
      const login = await loginAs(app, 'logoutuser');
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({ refreshToken: login.body.refreshToken })
        .expect(204);
      // reusing same refresh now fails
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: login.body.refreshToken })
        .expect(401);
    });
  });

  describe('POST /api/auth/logout-all', () => {
    it.skip('revokes all sessions and bumps passwordChangedAt', async () => {
      const a = await loginAs(app, 'logoutall');
      const b = await loginAs(app, 'logoutall'); // second device
      await request(app.getHttpServer())
        .post('/api/auth/logout-all')
        .set('Authorization', `Bearer ${a.body.accessToken}`)
        .expect(204);
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: b.body.refreshToken })
        .expect(401);
    });
  });

  describe('GET /api/auth/sessions', () => {
    it.skip('lists active sessions with current flag', async () => {
      const a = await loginAs(app, 'sessionsuser');
      const res = await request(app.getHttpServer())
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${a.body.accessToken}`)
        .expect(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.find((s: any) => s.current)).toBeDefined();
    });
  });

  describe('DELETE /api/auth/sessions/:jti', () => {
    it.skip('revokes specific session', async () => {
      const a = await loginAs(app, 'revokeuser');
      const list = await request(app.getHttpServer())
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${a.body.accessToken}`);
      const otherJti = list.body[0].jti; // current
      await request(app.getHttpServer())
        .delete(`/api/auth/sessions/${otherJti}`)
        .set('Authorization', `Bearer ${a.body.accessToken}`)
        .expect(204);
    });
  });

  describe('POST /api/auth/switch-org', () => {
    it.skip('issues new access token for different org', async () => {
      const a = await loginAs(app, 'switcher', { secondOrg: true });
      const res = await request(app.getHttpServer())
        .post('/api/auth/switch-org')
        .set('Authorization', `Bearer ${a.body.accessToken}`)
        .send({ organizationId: a.body.organizations[1].id })
        .expect(201);
      expect(res.body.accessToken).toBeDefined();
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it.skip('always returns 204 (anti-enumeration)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/forgot-password')
        .send({ email: 'unknown@test.cl' })
        .expect(204);
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
