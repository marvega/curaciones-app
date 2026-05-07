import { describe, it, expect, vi } from 'vitest';
import { readmitPatientHandler } from './readmit-patient.js';
import type { BackendClient } from '../../http/backend-client.js';

const mockToken = { sub: '1', scope: 'patients:write', org_id: '1', exp: 9999999999 };

describe('readmit_patient', () => {
  it('posts to /readmit without body', async () => {
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 200, contentType: 'application/json', body: { id: 5, status: 'active' } }),
      requestBinary: vi.fn(),
    };
    await readmitPatientHandler({ id: 5 }, {
      token: mockToken, bearer: 't', correlationId: 'c', backend,
    });
    const call = (backend.request as any).mock.calls[0][0];
    expect(call.method).toBe('POST');
    expect(call.path).toBe('/api/patients/5/readmit');
    expect(call.body).toBeUndefined();
  });

  it('forwards 403 forbidden as MCP error', async () => {
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 403, contentType: 'application/json', body: { message: 'No permission' } }),
      requestBinary: vi.fn(),
    };
    const r = await readmitPatientHandler({ id: 5 }, {
      token: mockToken, bearer: 't', correlationId: 'c', backend,
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/no permission/i);
  });
});
