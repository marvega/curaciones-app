import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase } from '../setup';
import { createOrgWithUser } from './helpers';

describe('WoundNote org isolation', () => {
  let app: INestApplication;

  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await cleanDatabase(app); });

  async function createCuracionAsB(token: string): Promise<number> {
    const patientRes = await request(app.getHttpServer())
      .post('/api/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({ rut: '11111111-1', firstName: 'B', lastName: 'B', birthDate: '1980-01-01', gender: 'M' });
    const curRes = await request(app.getHttpServer())
      .post('/api/curaciones')
      .set('Authorization', `Bearer ${token}`)
      .send({ patientId: patientRes.body.id, type: 'avanzada', date: '2026-04-28', quantity: 1 });
    return curRes.body.id;
  }

  // TODO(phase-13.4): controller has no `GET /api/wound-notes` root route
  // (only `/curacion/:curacionId`, `/patient/:patientId`, `/evolution/:patientId`).
  // Re-enable once a root list endpoint exists.
  it.skip('user A cannot list wound notes of user B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const curacionId = await createCuracionAsB(b.accessToken);

    await request(app.getHttpServer())
      .post('/api/wound-notes')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ curacionId, recordedById: b.userId });

    const res = await request(app.getHttpServer())
      .get('/api/wound-notes')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(200);

    expect(res.body.data ?? res.body).toEqual([]);
  });

  it('user A gets 404 fetching wound note of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const curacionId = await createCuracionAsB(b.accessToken);
    const created = await request(app.getHttpServer())
      .post('/api/wound-notes')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ curacionId, recordedById: b.userId });
    await request(app.getHttpServer())
      .get(`/api/wound-notes/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(404);
  });

  it('user A gets 404 updating wound note of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const curacionId = await createCuracionAsB(b.accessToken);
    const created = await request(app.getHttpServer())
      .post('/api/wound-notes')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ curacionId, recordedById: b.userId });
    await request(app.getHttpServer())
      .put(`/api/wound-notes/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ recordedById: a.userId })
      .expect(404);
  });

  it('user A gets 404 deleting wound note of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const curacionId = await createCuracionAsB(b.accessToken);
    const created = await request(app.getHttpServer())
      .post('/api/wound-notes')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ curacionId, recordedById: b.userId });
    await request(app.getHttpServer())
      .delete(`/api/wound-notes/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(404);
  });
});
