import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase } from '../setup';
import { createOrgWithUser } from './helpers';

describe('MonthlyCycle org isolation', () => {
  let app: INestApplication;

  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await cleanDatabase(app); });

  it('user A cannot list cycles of user B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');

    await request(app.getHttpServer())
      .post('/api/cycles')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ year: 2099, month: 1, startDate: '2099-01-01', endDate: '2099-01-31' });

    const res = await request(app.getHttpServer())
      .get('/api/cycles')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(200);

    expect(res.body.data ?? res.body).toEqual([]);
  });

  it('user A gets 404 fetching cycle of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const created = await request(app.getHttpServer())
      .post('/api/cycles')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ year: 2099, month: 1, startDate: '2099-01-01', endDate: '2099-01-31' });
    await request(app.getHttpServer())
      .get(`/api/cycles/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(404);
  });

  it('user A gets 404 updating cycle of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const created = await request(app.getHttpServer())
      .post('/api/cycles')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ year: 2099, month: 1, startDate: '2099-01-01', endDate: '2099-01-31' });
    await request(app.getHttpServer())
      .put(`/api/cycles/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ endDate: '2099-02-01' })
      .expect(404);
  });

  it('user A gets 404 deleting cycle of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const created = await request(app.getHttpServer())
      .post('/api/cycles')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ year: 2099, month: 1, startDate: '2099-01-01', endDate: '2099-01-31' });
    await request(app.getHttpServer())
      .delete(`/api/cycles/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(404);
  });
});
