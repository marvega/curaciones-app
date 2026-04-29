import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase } from '../setup';
import { createOrgWithUser } from './helpers';

describe('Patient org isolation', () => {
  let app: INestApplication;

  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await cleanDatabase(app); });

  it('user A cannot list patients of user B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');

    await request(app.getHttpServer())
      .post('/api/patients')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ rut: '11111111-1', firstName: 'B', lastName: 'B', birthDate: '1980-01-01', gender: 'M' });

    const res = await request(app.getHttpServer())
      .get('/api/patients')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(200);

    expect(res.body.data ?? res.body).toEqual([]);
  });

  it('user A gets 404 fetching patient of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const created = await request(app.getHttpServer())
      .post('/api/patients')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ rut: '11111111-1', firstName: 'B', lastName: 'B', birthDate: '1980-01-01', gender: 'M' });
    await request(app.getHttpServer())
      .get(`/api/patients/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(404);
  });

  it('user A gets 404 updating patient of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const created = await request(app.getHttpServer())
      .post('/api/patients')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ rut: '11111111-1', firstName: 'B', lastName: 'B', birthDate: '1980-01-01', gender: 'M' });
    await request(app.getHttpServer())
      .put(`/api/patients/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ firstName: 'X' })
      .expect(404);
  });

  it('user A gets 404 deleting patient of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const created = await request(app.getHttpServer())
      .post('/api/patients')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ rut: '11111111-1', firstName: 'B', lastName: 'B', birthDate: '1980-01-01', gender: 'M' });
    await request(app.getHttpServer())
      .delete(`/api/patients/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(404);
  });
});
