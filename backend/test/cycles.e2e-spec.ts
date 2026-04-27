import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, cleanDatabase } from './setup';
import { createUser, resetCounter } from './factories';

describe('CyclesController (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    resetCounter();
    await cleanDatabase(app);

    const user = await createUser(app, { username: 'cycleuser' });

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'cycleuser', password: 'password123' });
    token = loginRes.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const ds = app.get(DataSource);
    await ds.query('TRUNCATE TABLE "monthly_cycles" CASCADE');
  });

  describe('GET /api/cycles', () => {
    it('should return empty array when no cycles exist', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/cycles?year=2026')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('POST /api/cycles', () => {
    it('should upsert a cycle', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/cycles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          year: 2026,
          month: 3,
          startDate: '2026-03-01',
          endDate: '2026-03-31',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        year: 2026,
        month: 3,
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      });
      expect(res.body).toHaveProperty('id');

      // Verify it shows up in list
      const listRes = await request(app.getHttpServer())
        .get('/api/cycles?year=2026')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(listRes.body).toHaveLength(1);
    });
  });

  describe('GET /api/cycles/effective', () => {
    it('should return effective dates for a month', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/cycles/effective?year=2026&month=3')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('startDate');
      expect(res.body).toHaveProperty('endDate');
    });

    it('should use configured cycle dates when available', async () => {
      // Create a custom cycle
      await request(app.getHttpServer())
        .post('/api/cycles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          year: 2026,
          month: 4,
          startDate: '2026-03-25',
          endDate: '2026-04-24',
        });

      const res = await request(app.getHttpServer())
        .get('/api/cycles/effective?year=2026&month=4')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({
        startDate: '2026-03-25',
        endDate: '2026-04-24',
      });
    });
  });
});
