import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from '../setup';

describe('OAuth DCR (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => { await app.close(); });

  it('POST /oauth/register with valid HTTPS redirect_uris returns 201 + client_id', async () => {
    const res = await request(app.getHttpServer())
      .post('/oauth/register')
      .send({
        client_name: 'Test Client',
        redirect_uris: ['https://test.example.com/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'client_secret_basic',
        application_type: 'web',
        scope: 'patients:read agenda:read',
      })
      .expect(201);
    expect(res.body.client_id).toMatch(/^[a-f0-9]{32}$/);
    expect(res.body.client_secret).toBeTruthy();
    expect(res.body.registration_access_token).toBeTruthy();
    expect(res.body.registration_client_uri).toMatch(/\/oauth\/register\//);
  });

  it('POST /oauth/register with HTTP non-localhost is rejected', async () => {
    await request(app.getHttpServer())
      .post('/oauth/register')
      .send({
        client_name: 'Bad',
        redirect_uris: ['http://evil.example.com/cb'],
      })
      .expect(400);
  });

  it('POST /oauth/register with HTTP localhost is accepted (dev)', async () => {
    await request(app.getHttpServer())
      .post('/oauth/register')
      .send({
        client_name: 'Local',
        redirect_uris: ['http://localhost:6274/callback'],
        token_endpoint_auth_method: 'none',
        application_type: 'native',
      })
      .expect(201);
  });

  it('GET /oauth/register/:client_id with registration_access_token returns client', async () => {
    const reg = await request(app.getHttpServer())
      .post('/oauth/register')
      .send({ client_name: 'Read me', redirect_uris: ['https://x.example/cb'] })
      .expect(201);
    const { client_id, registration_access_token } = reg.body;
    const res = await request(app.getHttpServer())
      .get(`/oauth/register/${client_id}`)
      .set('Authorization', `Bearer ${registration_access_token}`)
      .expect(200);
    expect(res.body.client_id).toBe(client_id);
  });

  it('DELETE /oauth/register/:client_id removes client', async () => {
    const reg = await request(app.getHttpServer())
      .post('/oauth/register')
      .send({ client_name: 'Del', redirect_uris: ['https://y.example/cb'] })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/oauth/register/${reg.body.client_id}`)
      .set('Authorization', `Bearer ${reg.body.registration_access_token}`)
      .expect(204);
  });
});

describe('OAuth DCR rate limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => { await app.close(); });

  it('rate limits DCR after 10 registrations from same IP/hour', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .post('/oauth/register')
        .send({ client_name: `c${i}`, redirect_uris: [`https://c${i}.example/cb`] })
        .expect(201);
    }
    await request(app.getHttpServer())
      .post('/oauth/register')
      .send({ client_name: 'overflow', redirect_uris: ['https://o.example/cb'] })
      .expect(429);
  });
});
