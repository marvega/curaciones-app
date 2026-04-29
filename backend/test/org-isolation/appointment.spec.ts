import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase } from '../setup';
import { createOrgWithUser } from './helpers';

describe('Appointment org isolation', () => {
  let app: INestApplication;

  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await cleanDatabase(app); });

  async function createPatientAsB(token: string): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/api/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({ rut: '11111111-1', firstName: 'B', lastName: 'B', birthDate: '1980-01-01', gender: 'M' });
    return res.body.id;
  }

  it('user A cannot list appointments of user B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const patientId = await createPatientAsB(b.accessToken);

    await request(app.getHttpServer())
      .post('/api/appointments')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ patientId, date: '2099-12-01', time: '13:00' });

    const res = await request(app.getHttpServer())
      .get('/api/appointments')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(200);

    expect(res.body.data ?? res.body).toEqual([]);
  });

  it('user A gets 404 fetching appointment of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const patientId = await createPatientAsB(b.accessToken);
    const created = await request(app.getHttpServer())
      .post('/api/appointments')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ patientId, date: '2099-12-01', time: '13:00' });
    await request(app.getHttpServer())
      .get(`/api/appointments/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(404);
  });

  it('user A gets 404 updating appointment of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const patientId = await createPatientAsB(b.accessToken);
    const created = await request(app.getHttpServer())
      .post('/api/appointments')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ patientId, date: '2099-12-01', time: '13:00' });
    await request(app.getHttpServer())
      .put(`/api/appointments/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ time: '14:00' })
      .expect(404);
  });

  it('user A gets 404 deleting appointment of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const patientId = await createPatientAsB(b.accessToken);
    const created = await request(app.getHttpServer())
      .post('/api/appointments')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ patientId, date: '2099-12-01', time: '13:00' });
    await request(app.getHttpServer())
      .delete(`/api/appointments/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(404);
  });
});
