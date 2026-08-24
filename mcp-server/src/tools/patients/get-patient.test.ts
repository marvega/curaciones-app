import { describe, it, expect, vi } from 'vitest';
import { getPatientHandler } from './get-patient.js';
import type { BackendClient } from '../../http/backend-client.js';

const mockToken = { sub: '1', scope: 'patients:read', org_id: '1', exp: 9999999999 };

function mockBackend(response: any): BackendClient {
  return {
    request: vi.fn().mockResolvedValue(response),
    requestBinary: vi.fn(),
  };
}

describe('get_patient', () => {
  it('returns patient demographics by id', async () => {
    const backend = mockBackend({
      status: 200,
      contentType: 'application/json',
      body: { id: 42, firstName: 'María', lastName: 'González' },
    });
    const result = await getPatientHandler({ id: 42 }, {
      token: mockToken,
      bearer: 'tok',
      correlationId: 'cid',
      backend,
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text!;
    expect(text).toContain('María');
    expect(text).toContain('González');
    expect(backend.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      path: '/api/patients/42',
    }));
  });

  it('maps 404 to not_found error', async () => {
    const backend = mockBackend({ status: 404, contentType: 'application/json', body: {} });
    const result = await getPatientHandler({ id: 999 }, {
      token: mockToken,
      bearer: 'tok',
      correlationId: 'cid',
      backend,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/i);
  });
});
