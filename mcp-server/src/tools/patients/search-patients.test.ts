import { describe, it, expect, vi } from 'vitest';
import { searchPatientsHandler } from './search-patients.js';
import type { BackendClient } from '../../http/backend-client.js';

const mockToken = { sub: '1', scope: 'patients:read', org_id: '1', exp: 9999999999 };

function mockBackend(response: any): BackendClient {
  return {
    request: vi.fn().mockResolvedValue(response),
    requestBinary: vi.fn(),
  };
}

describe('search_patients', () => {
  it('returns patients with nextCursor', async () => {
    const backend = mockBackend({
      status: 200,
      contentType: 'application/json',
      body: { items: [{ id: 1, firstName: 'Juan', lastName: 'Pérez' }], nextCursor: 'abc' },
    });
    const result = await searchPatientsHandler({ q: 'Juan' }, {
      token: mockToken,
      bearer: 'tok',
      correlationId: 'cid',
      backend,
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text!;
    expect(text).toContain('Juan');
    expect(text).toContain('nextCursor');
    expect(backend.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      path: '/api/patients',
      query: expect.objectContaining({ q: 'Juan' }),
    }));
  });

  it('maps 401 to invalid_token error', async () => {
    const backend = mockBackend({ status: 401, contentType: 'application/json', body: {} });
    const result = await searchPatientsHandler({}, {
      token: mockToken,
      bearer: 'tok',
      correlationId: 'cid',
      backend,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/re-authorize/i);
  });
});
