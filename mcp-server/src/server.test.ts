import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from './server.js';
import type { FastifyInstance } from 'fastify';

describe('server', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildServer({
      port: 0,
      backendUrl: 'http://localhost:3000',
      oauth: { issuer: 'http://localhost:3000', jwksUrl: 'http://localhost:3000/jwks.json', audience: 'http://localhost:3000' },
      logLevel: 'error',
      nodeEnv: 'test',
    });
  });
  afterAll(async () => { await app.close(); });

  it('GET /health returns ok', async () => {
    const r = await app.inject({ method: 'GET', url: '/health' });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBeTruthy();
    expect(typeof body.uptime).toBe('number');
  });
});
