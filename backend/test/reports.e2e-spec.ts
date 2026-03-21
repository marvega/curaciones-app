import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, cleanDatabase } from './setup';
import {
  createUser,
  createPatient,
  createCuracion,
  resetCounter,
} from './factories';
import { CuracionType } from '../src/curaciones/curacion.entity';

describe('ReportsController (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    resetCounter();
    await cleanDatabase(app);

    const user = await createUser(app, { username: 'rptuser' });

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'rptuser', password: 'password123' });
    token = loginRes.body.access_token;

    // Seed data for reports
    const patient = await createPatient(app);
    await createCuracion(app, patient.id, {
      type: CuracionType.AVANZADA,
      date: '2026-03-10',
    });
    await createCuracion(app, patient.id, {
      type: CuracionType.AVANZADA,
      date: '2026-03-15',
    });
    await createCuracion(app, patient.id, {
      type: CuracionType.ULCERA_VENOSA,
      date: '2026-03-18',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/reports/monthly', () => {
    it('should return monthly report structure', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/monthly?year=2026&month=3')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({
        year: 2026,
        month: 3,
      });
      expect(res.body).toHaveProperty('startDate');
      expect(res.body).toHaveProperty('endDate');
      expect(res.body).toHaveProperty('avanzada');
      expect(res.body).toHaveProperty('pie_diabetico');
      expect(res.body).toHaveProperty('ulcera_venosa');
      expect(res.body).toHaveProperty('totalGeneral');
      expect(res.body.avanzada).toBe(2);
      expect(res.body.ulcera_venosa).toBe(1);
      expect(res.body.totalGeneral).toBe(3);
    });
  });

  describe('GET /api/reports/detailed', () => {
    it('should return detailed report structure', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/reports/detailed?year=2026&quarter=1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveProperty('filters');
      expect(res.body).toHaveProperty('summary');
      expect(res.body.summary).toHaveProperty('avanzada');
      expect(res.body.summary).toHaveProperty('ulcera_venosa');
      expect(res.body.summary.avanzada.total).toBe(2);
      expect(res.body.summary.ulcera_venosa.total).toBe(1);
    });
  });
});
