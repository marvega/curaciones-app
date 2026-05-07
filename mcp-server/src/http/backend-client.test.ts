import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBackendClient } from './backend-client.js';

describe('BackendClient', () => {
  let fetchMock: any;
  beforeEach(() => { fetchMock = vi.fn(); });

  it('forwards bearer + correlation-id, returns parsed JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ id: 1, name: 'test' }),
      text: async () => '',
    });
    const client = createBackendClient({ backendUrl: 'http://api.test', fetch: fetchMock });
    const r = await client.request({
      method: 'GET',
      path: '/api/patients/1',
      bearer: 'tok',
      correlationId: 'cid-1',
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: 1, name: 'test' });

    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('http://api.test/api/patients/1');
    expect(call[1].headers['authorization']).toBe('Bearer tok');
    expect(call[1].headers['x-request-id']).toBe('cid-1');
  });

  it('returns non-2xx as error response (not throw)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ message: 'Not found' }),
      text: async () => '',
    });
    const client = createBackendClient({ backendUrl: 'http://api.test', fetch: fetchMock });
    const r = await client.request({ method: 'GET', path: '/x', bearer: 't', correlationId: 'c' });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ message: 'Not found' });
  });

  it('serializes JSON body for POST', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({}),
      text: async () => '',
    });
    const client = createBackendClient({ backendUrl: 'http://api.test', fetch: fetchMock });
    await client.request({
      method: 'POST',
      path: '/api/patients',
      bearer: 't',
      correlationId: 'c',
      body: { firstName: 'Juan' },
    });
    const call = fetchMock.mock.calls[0];
    expect(call[1].body).toBe(JSON.stringify({ firstName: 'Juan' }));
    expect(call[1].headers['content-type']).toBe('application/json');
  });
});
