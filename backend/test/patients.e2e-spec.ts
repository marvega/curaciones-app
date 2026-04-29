import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, cleanDatabase } from './setup';
import { createUser, createPatient, resetCounter } from './factories';

describe('PatientsController (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let userId: number;

  beforeAll(async () => {
    app = await createTestApp();

    // Clean everything once, then create a persistent user for all tests
    resetCounter();
    await cleanDatabase(app);

    const user = await createUser(app, { username: 'testuser' });
    userId = user.id;

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'password123' });
    token = loginRes.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Only clean patient-related tables to preserve the auth user
    const ds = app.get(DataSource);
    await ds.query('TRUNCATE TABLE "patient_status_changes" CASCADE');
    await ds.query('TRUNCATE TABLE "patients" CASCADE');
    resetCounter();
  });

  describe('POST /api/patients', () => {
    it('should create a patient and return 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/patients')
        .set('Authorization', `Bearer ${token}`)
        .send({
          rut: '12345678-9',
          firstName: 'Juan',
          lastName: 'Perez',
          birthDate: '1990-05-20',
          gender: 'Masculino',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        rut: '12345678-9',
        firstName: 'Juan',
        lastName: 'Perez',
        gender: 'Masculino',
      });
      expect(res.body).toHaveProperty('id');
    });

    it('should return 409 for duplicate RUT', async () => {
      // TODO(phase-13.3): factory should accept plaintext RUT and encrypt
      // via KMS. For now, the rut field is a fixture-only EncryptedField and
      // the duplicate check runs against rutHash (set by the factory).
      await createPatient(app, { rut: '12345678-9' } as any);

      await request(app.getHttpServer())
        .post('/api/patients')
        .set('Authorization', `Bearer ${token}`)
        .send({
          rut: '12345678-9',
          firstName: 'Otro',
          lastName: 'Paciente',
          birthDate: '1985-01-01',
          gender: 'Femenino',
        })
        .expect(409);
    });
  });

  describe('GET /api/patients', () => {
    it('should return paginated list', async () => {
      for (let i = 0; i < 7; i++) {
        await createPatient(app);
      }

      const res = await request(app.getHttpServer())
        .get('/api/patients?page=1&limit=5')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.data).toHaveLength(5);
      expect(res.body.total).toBe(7);
      expect(res.body.page).toBe(1);
      expect(res.body.totalPages).toBe(2);
    });

    it('should search by RUT', async () => {
      // TODO(phase-13.3): factory should accept plaintext RUT and encrypt.
      const patient = await createPatient(app, { rut: '99999999-K' } as any);

      const res = await request(app.getHttpServer())
        .get('/api/patients?rut=99999999-K')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.rut).toBe('99999999-K');
      expect(res.body.id).toBe(patient.id);
    });
  });

  describe('GET /api/patients/:id', () => {
    it('should return a single patient', async () => {
      // TODO(phase-13.3): factory should accept plaintext RUT and encrypt.
      const patient = await createPatient(app, {
        rut: '11111111-1',
        firstName: 'Ana',
        lastName: 'Garcia',
      } as any);

      const res = await request(app.getHttpServer())
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: patient.id,
        rut: '11111111-1',
        firstName: 'Ana',
        lastName: 'Garcia',
      });
    });

    it('should return 404 for non-existent patient', async () => {
      await request(app.getHttpServer())
        .get('/api/patients/99999')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('PUT /api/patients/:id', () => {
    it('should update a patient', async () => {
      const patient = await createPatient(app);

      const res = await request(app.getHttpServer())
        .put(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Updated', phone: '+56999888777' })
        .expect(200);

      expect(res.body.firstName).toBe('Updated');
      expect(res.body.phone).toBe('+56999888777');
    });
  });

  describe('DELETE /api/patients/:id', () => {
    it('should delete a patient', async () => {
      const patient = await createPatient(app);

      await request(app.getHttpServer())
        .delete(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/patients/${patient.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('POST /api/patients/:id/discharge', () => {
    it('should discharge an active patient', async () => {
      const patient = await createPatient(app);

      const res = await request(app.getHttpServer())
        .post(`/api/patients/${patient.id}/discharge`)
        .set('Authorization', `Bearer ${token}`)
        .send({ cancelAppointment: false })
        .expect(201);

      expect(res.body.status).toBe('discharged');
    });

    it('should return 400 for already discharged patient', async () => {
      const patient = await createPatient(app);

      // Discharge first
      await request(app.getHttpServer())
        .post(`/api/patients/${patient.id}/discharge`)
        .set('Authorization', `Bearer ${token}`)
        .send({ cancelAppointment: false })
        .expect(201);

      // Try to discharge again
      await request(app.getHttpServer())
        .post(`/api/patients/${patient.id}/discharge`)
        .set('Authorization', `Bearer ${token}`)
        .send({ cancelAppointment: false })
        .expect(400);
    });
  });

  describe('POST /api/patients/:id/readmit', () => {
    it('should readmit a discharged patient', async () => {
      const patient = await createPatient(app);

      // Discharge first
      await request(app.getHttpServer())
        .post(`/api/patients/${patient.id}/discharge`)
        .set('Authorization', `Bearer ${token}`)
        .send({ cancelAppointment: false })
        .expect(201);

      // Readmit
      const res = await request(app.getHttpServer())
        .post(`/api/patients/${patient.id}/readmit`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect(res.body.status).toBe('active');
    });
  });

  describe('GET /api/patients/:id/status-history', () => {
    it('should return status change history', async () => {
      const patient = await createPatient(app);

      // Discharge
      await request(app.getHttpServer())
        .post(`/api/patients/${patient.id}/discharge`)
        .set('Authorization', `Bearer ${token}`)
        .send({ cancelAppointment: false })
        .expect(201);

      // Readmit
      await request(app.getHttpServer())
        .post(`/api/patients/${patient.id}/readmit`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/patients/${patient.id}/status-history`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toHaveLength(2);
      // Ordered by createdAt DESC, so readmission first
      expect(res.body[0].type).toBe('readmission');
      expect(res.body[1].type).toBe('discharge');
      expect(res.body[0].performedBy).toMatchObject({ id: userId });
    });
  });
});
