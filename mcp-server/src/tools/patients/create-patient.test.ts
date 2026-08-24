import { describe, it, expect, vi } from 'vitest';
import { createPatientHandler } from './create-patient.js';
import type { BackendClient } from '../../http/backend-client.js';

const mockToken = { sub: '1', scope: 'patients:write', org_id: '1', exp: 9999999999 };

describe('create_patient', () => {
  it('elicits and posts patient', async () => {
    const elicit = vi.fn().mockResolvedValue({
      rut: '12.345.678-5',
      firstName: 'Juan', lastName: 'Pérez',
      birthDate: '1990-01-01', gender: 'male',
    });
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 201, contentType: 'application/json', body: { id: 42 } }),
      requestBinary: vi.fn(),
    };
    const r = await createPatientHandler({}, {
      token: mockToken, bearer: 't', correlationId: 'c', backend, elicit,
    });
    expect(r.isError).toBeFalsy();
    expect(backend.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST', path: '/api/patients',
    }));
    const body = (backend.request as any).mock.calls[0][0].body;
    expect(body.firstName).toBe('Juan');
  });

  it('returns fallback when no elicit capability', async () => {
    const backend: BackendClient = {
      request: vi.fn(),
      requestBinary: vi.fn(),
    };
    const r = await createPatientHandler({}, {
      token: mockToken, bearer: 't', correlationId: 'c', backend, elicit: undefined,
    });
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toMatch(/Necesito más información/);
    expect(backend.request).not.toHaveBeenCalled();
  });

  it('returns 400 from backend as MCP error', async () => {
    const elicit = vi.fn().mockResolvedValue({
      rut: '12.345.678-5', firstName: 'Juan', lastName: 'Pérez',
      birthDate: '1990-01-01', gender: 'male',
    });
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 400, contentType: 'application/json', body: { message: 'RUT inválido' } }),
      requestBinary: vi.fn(),
    };
    const r = await createPatientHandler({}, {
      token: mockToken, bearer: 't', correlationId: 'c', backend, elicit,
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/RUT inválido/);
  });
});
