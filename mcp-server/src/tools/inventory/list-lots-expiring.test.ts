import { describe, it, expect, vi } from 'vitest';
import { listLotsExpiringHandler } from './list-lots-expiring.js';
import type { BackendClient } from '../../http/backend-client.js';

const mockToken = { sub: '1', scope: 'inventory:read', org_id: '1', exp: 9999999999 };

function mockBackend(response: any): BackendClient {
  return {
    request: vi.fn().mockResolvedValue(response),
    requestBinary: vi.fn(),
  };
}

describe('list_lots_expiring', () => {
  it('returns expiring lots with explicit days param', async () => {
    const backend = mockBackend({
      status: 200,
      contentType: 'application/json',
      body: { items: [{ id: 7, productId: 100, expiresAt: '2026-06-01' }] },
    });
    const result = await listLotsExpiringHandler({ days: 60 }, {
      token: mockToken,
      bearer: 'tok',
      correlationId: 'cid',
      backend,
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text!;
    expect(text).toContain('2026-06-01');
    expect(backend.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      path: '/api/inventory/expiring',
      query: expect.objectContaining({ days: '60' }),
    }));
  });

  it('omits days when input.days is undefined (backend defaults)', async () => {
    const backend = mockBackend({
      status: 200,
      contentType: 'application/json',
      body: { items: [] },
    });
    await listLotsExpiringHandler({}, {
      token: mockToken,
      bearer: 'tok',
      correlationId: 'cid',
      backend,
    });
    expect(backend.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      path: '/api/inventory/expiring',
      query: { days: undefined },
    }));
  });

  it('maps 401 to invalid_token error', async () => {
    const backend = mockBackend({ status: 401, contentType: 'application/json', body: {} });
    const result = await listLotsExpiringHandler({}, {
      token: mockToken,
      bearer: 'tok',
      correlationId: 'cid',
      backend,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/re-authorize/i);
  });
});
