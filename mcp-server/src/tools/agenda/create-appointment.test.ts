import { describe, it, expect, vi } from 'vitest';
import { createAppointmentHandler } from './create-appointment.js';
import type { BackendClient } from '../../http/backend-client.js';

const mockToken = { sub: '1', scope: 'agenda:write', org_id: '1', exp: 9999999999 };

describe('create_appointment', () => {
  it('elicits and posts appointment', async () => {
    const elicit = vi.fn().mockResolvedValue({
      patientId: 7,
      date: '2026-06-15T10:30',
      notes: 'Control mensual',
    });
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 201, contentType: 'application/json', body: { id: 33 } }),
      requestBinary: vi.fn(),
    };
    const r = await createAppointmentHandler({}, {
      token: mockToken, bearer: 't', correlationId: 'c', backend, elicit,
    });
    expect(r.isError).toBeFalsy();
    expect(backend.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST', path: '/api/appointments',
    }));
    const body = (backend.request as any).mock.calls[0][0].body;
    expect(body.patientId).toBe(7);
    expect(body.date).toBe('2026-06-15T10:30');
    expect(body.notes).toBe('Control mensual');
  });

  it('returns fallback when no elicit capability', async () => {
    const backend: BackendClient = {
      request: vi.fn(),
      requestBinary: vi.fn(),
    };
    const r = await createAppointmentHandler({}, {
      token: mockToken, bearer: 't', correlationId: 'c', backend, elicit: undefined,
    });
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toMatch(/Necesito más información/);
    expect(backend.request).not.toHaveBeenCalled();
  });

  it('returns 400 from backend as MCP error', async () => {
    const elicit = vi.fn().mockResolvedValue({
      patientId: 7,
      date: '2026-06-15T10:30',
    });
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 400, contentType: 'application/json', body: { message: 'Cita superpuesta' } }),
      requestBinary: vi.fn(),
    };
    const r = await createAppointmentHandler({}, {
      token: mockToken, bearer: 't', correlationId: 'c', backend, elicit,
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/Cita superpuesta/);
  });
});
