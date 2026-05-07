import { describe, it, expect, vi } from 'vitest';
import { dischargePatientHandler } from './discharge-patient.js';
import type { BackendClient } from '../../http/backend-client.js';

const mockToken = { sub: '1', scope: 'patients:write', org_id: '1', exp: 9999999999 };

describe('discharge_patient', () => {
  it('posts to /discharge with cancelAppointment flag', async () => {
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 200, contentType: 'application/json', body: { id: 5, status: 'discharged' } }),
      requestBinary: vi.fn(),
    };
    await dischargePatientHandler({ id: 5, cancelAppointment: true }, {
      token: mockToken, bearer: 't', correlationId: 'c', backend,
    });
    expect(backend.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      path: '/api/patients/5/discharge',
      body: { cancelAppointment: true },
    }));
  });

  it('forwards 403 forbidden as MCP error', async () => {
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 403, contentType: 'application/json', body: { message: 'No permission' } }),
      requestBinary: vi.fn(),
    };
    const r = await dischargePatientHandler({ id: 5 }, {
      token: mockToken, bearer: 't', correlationId: 'c', backend,
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/no permission/i);
  });
});
