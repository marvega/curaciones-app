import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase } from '../setup';
import { createOrgWithUser } from './helpers';

describe('CanastaCategory org isolation', () => {
  let app: INestApplication;

  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await cleanDatabase(app); });

  it('user A cannot list canasta categories of user B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');

    await request(app.getHttpServer())
      .post('/api/inventory/canasta')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ name: 'X', section: 'INSUMOS', displayOrder: 1 });

    const res = await request(app.getHttpServer())
      .get('/api/inventory/canasta')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(200);

    expect(res.body.data ?? res.body).toEqual([]);
  });

  it('user A gets 404 fetching canasta category of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const created = await request(app.getHttpServer())
      .post('/api/inventory/canasta')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ name: 'X', section: 'INSUMOS', displayOrder: 1 });
    await request(app.getHttpServer())
      .get(`/api/inventory/canasta/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(404);
  });

  it('user A gets 404 updating canasta category of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const created = await request(app.getHttpServer())
      .post('/api/inventory/canasta')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ name: 'X', section: 'INSUMOS', displayOrder: 1 });
    await request(app.getHttpServer())
      .put(`/api/inventory/canasta/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ name: 'Y' })
      .expect(404);
  });

  it('user A gets 404 deleting canasta category of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const created = await request(app.getHttpServer())
      .post('/api/inventory/canasta')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ name: 'X', section: 'INSUMOS', displayOrder: 1 });
    await request(app.getHttpServer())
      .delete(`/api/inventory/canasta/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(404);
  });
});
