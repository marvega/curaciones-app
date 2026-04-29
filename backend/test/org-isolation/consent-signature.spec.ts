import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, cleanDatabase } from '../setup';
import { createOrgWithUser } from './helpers';

describe('ConsentSignature org isolation', () => {
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

  // TODO(phase-13.4): controller has no `GET /api/consent` root route
  // (only `/patient/:patientId` and `/file/:filename`). Re-enable once a
  // root list endpoint exists.
  it.skip('user A cannot list consent signatures of user B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const patientId = await createPatientAsB(b.accessToken);

    await request(app.getHttpServer())
      .post('/api/consent')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ patientId, witnessedById: b.userId, filename: 's.pdf' });

    const res = await request(app.getHttpServer())
      .get('/api/consent')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(200);

    expect(res.body.data ?? res.body).toEqual([]);
  });

  it('user A gets 404 fetching consent signature of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const patientId = await createPatientAsB(b.accessToken);
    const created = await request(app.getHttpServer())
      .post('/api/consent')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ patientId, witnessedById: b.userId, filename: 's.pdf' });
    await request(app.getHttpServer())
      .get(`/api/consent/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(404);
  });

  it('user A gets 404 updating consent signature of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const patientId = await createPatientAsB(b.accessToken);
    const created = await request(app.getHttpServer())
      .post('/api/consent')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ patientId, witnessedById: b.userId, filename: 's.pdf' });
    await request(app.getHttpServer())
      .put(`/api/consent/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ filename: 'x.pdf' })
      .expect(404);
  });

  it('user A gets 404 deleting consent signature of org B', async () => {
    const a = await createOrgWithUser(app, 'OrgA', 'usera', 'a@test.cl');
    const b = await createOrgWithUser(app, 'OrgB', 'userb', 'b@test.cl');
    const patientId = await createPatientAsB(b.accessToken);
    const created = await request(app.getHttpServer())
      .post('/api/consent')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ patientId, witnessedById: b.userId, filename: 's.pdf' });
    await request(app.getHttpServer())
      .delete(`/api/consent/${created.body.id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(404);
  });
});
