import { describe, it, expect, vi } from 'vitest';
import { listCuracionesHandler } from './list-curaciones.js';
import type { BackendClient } from '../../http/backend-client.js';

const mockToken = { sub: '1', scope: 'clinical:read', org_id: '1', exp: 9999999999 };

function mockBackend(response: any): BackendClient {
  return {
    request: vi.fn().mockResolvedValue(response),
    requestBinary: vi.fn(),
  };
}

describe('list_curaciones', () => {
  it('returns curaciones for a patient with cursor', async () => {
    const backend = mockBackend({
      status: 200,
      contentType: 'application/json',
      body: { items: [{ id: 22, patientId: 5, woundType: 'diabetic' }], nextCursor: 'xyz' },
    });
    const result = await listCuracionesHandler({ patientId: 5, cursor: 'abc', limit: 10 }, {
      token: mockToken,
      bearer: 'tok',
      correlationId: 'cid',
      backend,
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text!;
    expect(text).toContain('diabetic');
    expect(text).toContain('nextCursor');
    expect(backend.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      path: '/api/curaciones/patient/5',
      query: expect.objectContaining({ cursor: 'abc', limit: '10' }),
    }));
  });

  it('maps 404 to not_found error', async () => {
    const backend = mockBackend({ status: 404, contentType: 'application/json', body: {} });
    const result = await listCuracionesHandler({ patientId: 999 }, {
      token: mockToken,
      bearer: 'tok',
      correlationId: 'cid',
      backend,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/i);
  });
});
