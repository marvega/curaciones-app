import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase } from '../setup';
import { createOrgWithUser } from './helpers';

describe('Lot org isolation', () => {
  let app: INestApplication;

  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await cleanDatabase(app); });

  async function createProductAsB(token: string): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/api/inventory/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', type: 'INSUMO', packaging: 'unit' });
    return res.body.id;
  }

  it('user A cannot list lots of user B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const productId = await createProductAsB(b.accessToken);

    await request(app.getHttpServer())
      .post('/api/inventory/lots')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ productId, code: 'L1', quantity: 10 });

    const res = await request(app.getHttpServer())
      .get('/api/inventory/lots')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(200);

    expect(res.body.data ?? res.body).toEqual([]);
  });

  it('user A gets 404 fetching lot of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const productId = await createProductAsB(b.accessToken);
    const created = await request(app.getHttpServer())
      .post('/api/inventory/lots')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ productId, code: 'L1', quantity: 10 });
    await request(app.getHttpServer())
      .get(`/api/inventory/lots/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(404);
  });

  it('user A gets 404 updating lot of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const productId = await createProductAsB(b.accessToken);
    const created = await request(app.getHttpServer())
      .post('/api/inventory/lots')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ productId, code: 'L1', quantity: 10 });
    await request(app.getHttpServer())
      .put(`/api/inventory/lots/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ quantity: 20 })
      .expect(404);
  });

  it('user A gets 404 deleting lot of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const productId = await createProductAsB(b.accessToken);
    const created = await request(app.getHttpServer())
      .post('/api/inventory/lots')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ productId, code: 'L1', quantity: 10 });
    await request(app.getHttpServer())
      .delete(`/api/inventory/lots/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(404);
  });
});
