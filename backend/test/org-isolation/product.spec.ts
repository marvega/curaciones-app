import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase } from '../setup';
import { createOrgWithUser } from './helpers';

describe('Product org isolation', () => {
  let app: INestApplication;

  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await cleanDatabase(app); });

  it('user A cannot list products of user B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');

    await request(app.getHttpServer())
      .post('/api/inventory/products')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ name: 'X', type: 'INSUMO', packaging: 'unit' });

    const res = await request(app.getHttpServer())
      .get('/api/inventory/products')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(200);

    expect(res.body.data ?? res.body).toEqual([]);
  });

  it('user A gets 404 fetching product of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const created = await request(app.getHttpServer())
      .post('/api/inventory/products')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ name: 'X', type: 'INSUMO', packaging: 'unit' });
    await request(app.getHttpServer())
      .get(`/api/inventory/products/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(404);
  });

  it('user A gets 404 updating product of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const created = await request(app.getHttpServer())
      .post('/api/inventory/products')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ name: 'X', type: 'INSUMO', packaging: 'unit' });
    await request(app.getHttpServer())
      .put(`/api/inventory/products/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ name: 'Y' })
      .expect(404);
  });

  it('user A gets 404 deleting product of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const created = await request(app.getHttpServer())
      .post('/api/inventory/products')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ name: 'X', type: 'INSUMO', packaging: 'unit' });
    await request(app.getHttpServer())
      .delete(`/api/inventory/products/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(404);
  });
});
