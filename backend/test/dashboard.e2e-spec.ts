import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, cleanDatabase } from './setup';
import {
  createUser,
  createPatient,
  createCuracion,
  createAppointment,
  resetCounter,
} from './factories';

describe('DashboardController (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    resetCounter();
    await cleanDatabase(app);

    await createUser(app, { username: 'dashuser' });

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'dashuser', password: 'password123' });
    token = loginRes.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const ds = app.get(DataSource);
    await ds.query('TRUNCATE TABLE "curacion_edits" CASCADE');
    await ds.query('TRUNCATE TABLE "appointments" CASCADE');
    await ds.query('TRUNCATE TABLE "curaciones" CASCADE');
    await ds.query('TRUNCATE TABLE "patient_status_changes" CASCADE');
    await ds.query('TRUNCATE TABLE "patients" CASCADE');
  });

  describe('GET /api/dashboard/today', () => {
    it('should return 200 with array', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/today')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should return today appointments when they exist', async () => {
      const today = new Date().toISOString().split('T')[0];
      const patient = await createPatient(app);
      await createAppointment(app, patient.id, {
        date: today,
        time: '13:00',
      });

      const res = await request(app.getHttpServer())
        .get('/api/dashboard/today')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        date: today,
        time: '13:00',
        patient: {
          id: patient.id,
          firstName: patient.firstName,
          lastName: patient.lastName,
        },
      });
    });

    it('should return 401 without auth', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/today')
        .expect(401);
    });
  });

  describe('GET /api/dashboard/no-appointment', () => {
    it('should return patients without future appointments', async () => {
      // Patient with no appointments at all
      const patient1 = await createPatient(app, {
        firstName: 'NoAppt',
        lastName: 'Patient',
      });

      // Patient with a future appointment (should NOT appear)
      const patient2 = await createPatient(app, {
        firstName: 'HasAppt',
        lastName: 'Patient',
      });
      await createAppointment(app, patient2.id, {
        date: '2027-01-01',
        time: '13:00',
      });

      const res = await request(app.getHttpServer())
        .get('/api/dashboard/no-appointment')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const ids = res.body.map((p: any) => p.id);
      expect(ids).toContain(patient1.id);
      expect(ids).not.toContain(patient2.id);
    });

    it('should include last curacion data for patients', async () => {
      const patient = await createPatient(app);
      await createCuracion(app, patient.id, {
        date: '2026-03-01',
        type: 'avanzada' as any,
      });

      const res = await request(app.getHttpServer())
        .get('/api/dashboard/no-appointment')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const found = res.body.find((p: any) => p.id === patient.id);
      expect(found).toBeDefined();
      expect(found.lastCuracion).toMatchObject({
        date: '2026-03-01',
        type: 'avanzada',
      });
      expect(found.daysSinceLastCuracion).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /api/dashboard/inactive', () => {
    it('should return 200 with array for valid days param', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/inactive?days=14')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should return patients with old curaciones', async () => {
      // Patient with old curacion (30 days ago)
      const patient = await createPatient(app);
      await createCuracion(app, patient.id, {
        date: '2026-02-15',
        type: 'avanzada' as any,
      });

      const res = await request(app.getHttpServer())
        .get('/api/dashboard/inactive?days=14')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const found = res.body.find((p: any) => p.id === patient.id);
      expect(found).toBeDefined();
      expect(found.lastCuracionDate).toBe('2026-02-15');
      expect(found.lastCuracionType).toBe('avanzada');
      expect(found.daysSinceLastCuracion).toBeGreaterThanOrEqual(30);
    });

    it('should return more patients with a lower threshold', async () => {
      // Patient with curacion 5 days ago
      const patient1 = await createPatient(app);
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      await createCuracion(app, patient1.id, {
        date: fiveDaysAgo,
        type: 'avanzada' as any,
      });

      // Patient with curacion 20 days ago
      const patient2 = await createPatient(app);
      await createCuracion(app, patient2.id, {
        date: '2026-02-28',
        type: 'pie_diabetico' as any,
      });

      const res14 = await request(app.getHttpServer())
        .get('/api/dashboard/inactive?days=14')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const res1 = await request(app.getHttpServer())
        .get('/api/dashboard/inactive?days=1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res1.body.length).toBeGreaterThanOrEqual(res14.body.length);
    });

    it('should return 400 without days param', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/inactive')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });
});
