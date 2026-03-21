import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, cleanDatabase } from './setup';
import {
  createUser,
  createAdmin,
  createPatient,
  resetCounter,
} from './factories';

describe('CuracionesController (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let userToken: string;
  let patientId: number;

  beforeAll(async () => {
    app = await createTestApp();
    resetCounter();
    await cleanDatabase(app);

    // Create admin + regular user + patient once
    const admin = await createAdmin(app, { username: 'curadmin' });
    const user = await createUser(app, { username: 'curuser' });
    const patient = await createPatient(app);
    patientId = patient.id;

    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'curadmin', password: 'password123' });
    adminToken = adminLogin.body.access_token;

    const userLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'curuser', password: 'password123' });
    userToken = userLogin.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const ds = app.get(DataSource);
    await ds.query('TRUNCATE TABLE "curacion_edits" CASCADE');
    await ds.query('TRUNCATE TABLE "appointments" CASCADE');
    await ds.query('TRUNCATE TABLE "curaciones" CASCADE');
  });

  describe('POST /api/curaciones', () => {
    it('should create a curacion without appointment', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/curaciones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patientId,
          type: 'avanzada',
          date: '2026-03-20',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        patientId,
        type: 'avanzada',
        date: '2026-03-20',
      });
      expect(res.body).toHaveProperty('id');
      expect(res.body.appointment).toBeNull();
    });

    it('should create a curacion with linked appointment', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/curaciones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patientId,
          type: 'pie_diabetico',
          date: '2026-03-20',
          appointmentDate: '2026-12-01',
          appointmentTime: '13:00',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        patientId,
        type: 'pie_diabetico',
      });
      expect(res.body.appointment).toMatchObject({
        date: '2026-12-01',
        time: '13:00',
      });
    });
  });

  describe('GET /api/curaciones/patient/:patientId', () => {
    it('should list curaciones by patient', async () => {
      // Create two curaciones
      await request(app.getHttpServer())
        .post('/api/curaciones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ patientId, type: 'avanzada', date: '2026-03-18' });

      await request(app.getHttpServer())
        .post('/api/curaciones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ patientId, type: 'ulcera_venosa', date: '2026-03-19' });

      const res = await request(app.getHttpServer())
        .get(`/api/curaciones/patient/${patientId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveLength(2);
      // Ordered by date DESC
      expect(res.body[0].date).toBe('2026-03-19');
      expect(res.body[1].date).toBe('2026-03-18');
    });
  });

  describe('GET /api/curaciones/availability', () => {
    it('should return available slots for a date', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/curaciones/availability?date=2026-12-01')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('time');
      expect(res.body[0]).toHaveProperty('available');
    });
  });

  describe('PUT /api/curaciones/:id', () => {
    it('should allow admin to edit with reason', async () => {
      // Create a curacion first
      const createRes = await request(app.getHttpServer())
        .post('/api/curaciones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ patientId, type: 'avanzada', date: '2026-03-20' });

      const curacionId = createRes.body.id;

      const res = await request(app.getHttpServer())
        .put(`/api/curaciones/${curacionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'ulcera_venosa',
          reason: 'Correction of type',
        })
        .expect(200);

      expect(res.body.type).toBe('ulcera_venosa');
    });

    it('should return 403 for non-admin user', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/curaciones')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ patientId, type: 'avanzada', date: '2026-03-20' });

      const curacionId = createRes.body.id;

      await request(app.getHttpServer())
        .put(`/api/curaciones/${curacionId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          type: 'ulcera_venosa',
          reason: 'Correction',
        })
        .expect(403);
    });
  });

  describe('GET /api/curaciones/:id/edits', () => {
    it('should return edit history', async () => {
      // Create a curacion
      const createRes = await request(app.getHttpServer())
        .post('/api/curaciones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ patientId, type: 'avanzada', date: '2026-03-20' });

      const curacionId = createRes.body.id;

      // Edit it
      await request(app.getHttpServer())
        .put(`/api/curaciones/${curacionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'ulcera_venosa', reason: 'Wrong type' });

      const res = await request(app.getHttpServer())
        .get(`/api/curaciones/${curacionId}/edits`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        curacionId,
        reason: 'Wrong type',
      });
      expect(res.body[0]).toHaveProperty('editedBy');
    });
  });
});
