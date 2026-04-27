import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, cleanDatabase } from './setup';
import { createUser, createPatient, resetCounter } from './factories';

describe('AppointmentsController (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let patientId: number;

  beforeAll(async () => {
    app = await createTestApp();
    resetCounter();
    await cleanDatabase(app);

    const user = await createUser(app, { username: 'aptuser' });
    const patient = await createPatient(app);
    patientId = patient.id;

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'aptuser', password: 'password123' });
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
  });

  describe('POST /api/appointments', () => {
    it('should create a standalone appointment', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          patientId,
          date: '2026-12-01',
          time: '13:00',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        patientId,
        date: '2026-12-01',
        time: '13:00',
      });
      expect(res.body).toHaveProperty('id');
    });

    it('should return 400 for invalid time slot', async () => {
      await request(app.getHttpServer())
        .post('/api/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          patientId,
          date: '2026-12-01',
          time: '07:00',
        })
        .expect(400);
    });

    it('should return 400 for double-booking', async () => {
      // Create first appointment
      await request(app.getHttpServer())
        .post('/api/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          patientId,
          date: '2026-12-01',
          time: '13:00',
        })
        .expect(201);

      // Try to book same slot
      await request(app.getHttpServer())
        .post('/api/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          patientId,
          date: '2026-12-01',
          time: '13:00',
        })
        .expect(400);
    });
  });

  describe('DELETE /api/appointments/:id', () => {
    it('should delete an appointment', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({
          patientId,
          date: '2026-12-01',
          time: '14:00',
        });

      const appointmentId = createRes.body.id;

      await request(app.getHttpServer())
        .delete(`/api/appointments/${appointmentId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Verify it's gone by listing
      const listRes = await request(app.getHttpServer())
        .get(`/api/appointments/patient/${patientId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(listRes.body).toHaveLength(0);
    });
  });

  describe('GET /api/appointments/patient/:patientId', () => {
    it('should list appointments by patient', async () => {
      await request(app.getHttpServer())
        .post('/api/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({ patientId, date: '2026-12-01', time: '13:00' });

      await request(app.getHttpServer())
        .post('/api/appointments')
        .set('Authorization', `Bearer ${token}`)
        .send({ patientId, date: '2026-12-01', time: '14:00' });

      const res = await request(app.getHttpServer())
        .get(`/api/appointments/patient/${patientId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveLength(2);
      // Ordered by date ASC, time ASC
      expect(res.body[0].time).toBe('13:00');
      expect(res.body[1].time).toBe('14:00');
    });
  });
});
