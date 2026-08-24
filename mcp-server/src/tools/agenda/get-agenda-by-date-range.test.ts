import { describe, it, expect, vi } from 'vitest';
import { getAgendaByDateRangeHandler } from './get-agenda-by-date-range.js';
import type { BackendClient } from '../../http/backend-client.js';

const mockToken = { sub: '1', scope: 'clinical:read', org_id: '1', exp: 9999999999 };

function mockBackend(response: any): BackendClient {
  return {
    request: vi.fn().mockResolvedValue(response),
    requestBinary: vi.fn(),
  };
}

describe('get_agenda_by_date_range', () => {
  it('returns curaciones agenda for a date range', async () => {
    const backend = mockBackend({
      status: 200,
      contentType: 'application/json',
      body: { items: [{ date: '2026-05-08', patientId: 3 }] },
    });
    const result = await getAgendaByDateRangeHandler({ from: '2026-05-01', to: '2026-05-31' }, {
      token: mockToken,
      bearer: 'tok',
      correlationId: 'cid',
      backend,
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text!;
    expect(text).toContain('2026-05-08');
    expect(backend.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      path: '/api/curaciones/agenda',
      query: expect.objectContaining({ from: '2026-05-01', to: '2026-05-31' }),
    }));
  });

  it('maps 401 to invalid_token error', async () => {
    const backend = mockBackend({ status: 401, contentType: 'application/json', body: {} });
    const result = await getAgendaByDateRangeHandler({ from: '2026-05-01', to: '2026-05-31' }, {
      token: mockToken,
      bearer: 'tok',
      correlationId: 'cid',
      backend,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/re-authorize/i);
  });
});
