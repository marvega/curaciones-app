import { describe, it, expect, vi } from 'vitest';
import { cancelAppointmentHandler } from './cancel-appointment.js';
import type { BackendClient } from '../../http/backend-client.js';

const mockToken = { sub: '1', scope: 'agenda:write', org_id: '1', exp: 9999999999 };

describe('cancel_appointment', () => {
  it('sends DELETE to /api/appointments/:id with no body', async () => {
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 200, contentType: 'application/json', body: { id: 7, deleted: true } }),
      requestBinary: vi.fn(),
    };
    await cancelAppointmentHandler({ id: 7 }, {
      token: mockToken, bearer: 't', correlationId: 'c', backend,
    });
    const call = (backend.request as any).mock.calls[0][0];
    expect(call.method).toBe('DELETE');
    expect(call.path).toBe('/api/appointments/7');
    expect(call.body).toBeUndefined();
  });

  it('forwards 404 not found as MCP error', async () => {
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 404, contentType: 'application/json', body: { message: 'Appointment not found' } }),
      requestBinary: vi.fn(),
    };
    const r = await cancelAppointmentHandler({ id: 999 }, {
      token: mockToken, bearer: 't', correlationId: 'c', backend,
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/not found/i);
  });
});
