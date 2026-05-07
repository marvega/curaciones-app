import { describe, it, expect, vi } from 'vitest';
import { updatePatientHandler } from './update-patient.js';
import type { BackendClient } from '../../http/backend-client.js';

const mockToken = { sub: '1', scope: 'patients:write', org_id: '1', exp: 9999999999 };

describe('update_patient', () => {
  it('elicits and puts patient update', async () => {
    const elicit = vi.fn().mockResolvedValue({
      firstName: 'Juan Carlos',
      phone: '+56912345678',
    });
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 200, contentType: 'application/json', body: { id: 42, firstName: 'Juan Carlos' } }),
      requestBinary: vi.fn(),
    };
    const r = await updatePatientHandler({ id: 42 }, {
      token: mockToken, bearer: 't', correlationId: 'c', backend, elicit,
    });
    expect(r.isError).toBeFalsy();
    expect(backend.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'PUT', path: '/api/patients/42',
    }));
    const body = (backend.request as any).mock.calls[0][0].body;
    expect(body.firstName).toBe('Juan Carlos');
    expect(body.phone).toBe('+56912345678');
  });

  it('returns fallback when no elicit capability', async () => {
    const backend: BackendClient = {
      request: vi.fn(),
      requestBinary: vi.fn(),
    };
    const r = await updatePatientHandler({ id: 42 }, {
      token: mockToken, bearer: 't', correlationId: 'c', backend, elicit: undefined,
    });
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toMatch(/Necesito más información/);
    expect(backend.request).not.toHaveBeenCalled();
  });

  it('returns 400 from backend as MCP error', async () => {
    const elicit = vi.fn().mockResolvedValue({ firstName: 'Juan' });
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 400, contentType: 'application/json', body: { message: 'Datos inválidos' } }),
      requestBinary: vi.fn(),
    };
    const r = await updatePatientHandler({ id: 42 }, {
      token: mockToken, bearer: 't', correlationId: 'c', backend, elicit,
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/Datos inválidos/);
  });
});
