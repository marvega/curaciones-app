import { describe, it, expect, vi } from 'vitest';
import { monthlyReportHandler } from './monthly-report.js';
import type { BackendClient } from '../../http/backend-client.js';

const mockToken = { sub: '1', scope: 'reports:read', org_id: '1', exp: 9999999999 };

function mockBackend(response: any): BackendClient {
  return {
    request: vi.fn().mockResolvedValue(response),
    requestBinary: vi.fn(),
  };
}

describe('monthly_report', () => {
  it('returns monthly report data and passes month query param', async () => {
    const backend = mockBackend({
      status: 200,
      contentType: 'application/json',
      body: { month: '2026-05', totalCuraciones: 42, byType: { foo: 10 } },
    });
    const result = await monthlyReportHandler({ month: '2026-05' }, {
      token: mockToken,
      bearer: 'tok',
      correlationId: 'cid',
      backend,
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text!;
    expect(text).toContain('2026-05');
    expect(text).toContain('totalCuraciones');
    expect(backend.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      path: '/api/reports/monthly',
      query: { month: '2026-05' },
    }));
  });

  it('maps 401 to invalid_token error', async () => {
    const backend = mockBackend({ status: 401, contentType: 'application/json', body: {} });
    const result = await monthlyReportHandler({ month: '2026-05' }, {
      token: mockToken,
      bearer: 'tok',
      correlationId: 'cid',
      backend,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/re-authorize/i);
  });
});
