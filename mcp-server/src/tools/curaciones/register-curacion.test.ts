import { describe, it, expect, vi } from 'vitest';
import { registerCuracionHandler } from './register-curacion.js';
import type { BackendClient } from '../../http/backend-client.js';

const mockToken = { sub: '1', scope: 'clinical:write', org_id: '1', exp: 9999999999 };

describe('register_curacion', () => {
  it('elicits and posts curacion', async () => {
    const elicit = vi.fn().mockResolvedValue({
      patientId: 7,
      location: 'Pierna izquierda',
      woundType: 'Úlcera venosa',
      observations: 'Exudado moderado',
      careApplied: 'Apósito hidrocoloide',
    });
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 201, contentType: 'application/json', body: { id: 99 } }),
      requestBinary: vi.fn(),
    };
    const r = await registerCuracionHandler({}, {
      token: mockToken, bearer: 't', correlationId: 'c', backend, elicit,
    });
    expect(r.isError).toBeFalsy();
    expect(backend.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST', path: '/api/curaciones',
    }));
    const body = (backend.request as any).mock.calls[0][0].body;
    expect(body.patientId).toBe(7);
    expect(body.location).toBe('Pierna izquierda');
    expect(body.woundType).toBe('Úlcera venosa');
  });

  it('returns fallback when no elicit capability', async () => {
    const backend: BackendClient = {
      request: vi.fn(),
      requestBinary: vi.fn(),
    };
    const r = await registerCuracionHandler({}, {
      token: mockToken, bearer: 't', correlationId: 'c', backend, elicit: undefined,
    });
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toMatch(/Necesito más información/);
    expect(backend.request).not.toHaveBeenCalled();
  });

  it('returns 400 from backend as MCP error', async () => {
    const elicit = vi.fn().mockResolvedValue({
      patientId: 7,
      location: 'Pierna izquierda',
      woundType: 'Úlcera venosa',
    });
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 400, contentType: 'application/json', body: { message: 'Paciente no existe' } }),
      requestBinary: vi.fn(),
    };
    const r = await registerCuracionHandler({}, {
      token: mockToken, bearer: 't', correlationId: 'c', backend, elicit,
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/Paciente no existe/);
  });
});
