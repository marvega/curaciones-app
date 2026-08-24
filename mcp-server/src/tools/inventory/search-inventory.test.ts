import { describe, it, expect, vi } from 'vitest';
import { searchInventoryHandler } from './search-inventory.js';
import type { BackendClient } from '../../http/backend-client.js';

const mockToken = { sub: '1', scope: 'inventory:read', org_id: '1', exp: 9999999999 };

function mockBackend(response: any): BackendClient {
  return {
    request: vi.fn().mockResolvedValue(response),
    requestBinary: vi.fn(),
  };
}

describe('search_inventory', () => {
  it('returns inventory products matching query', async () => {
    const backend = mockBackend({
      status: 200,
      contentType: 'application/json',
      body: { items: [{ id: 100, name: 'Apósito hidrocoloide', code: 'APO-001' }], nextCursor: 'next' },
    });
    const result = await searchInventoryHandler({ q: 'apósito', cursor: 'abc', limit: 25 }, {
      token: mockToken,
      bearer: 'tok',
      correlationId: 'cid',
      backend,
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text!;
    expect(text).toContain('Apósito hidrocoloide');
    expect(text).toContain('nextCursor');
    expect(backend.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      path: '/api/inventory/products',
      query: expect.objectContaining({ q: 'apósito', cursor: 'abc', limit: '25' }),
    }));
  });

  it('maps 401 to invalid_token error', async () => {
    const backend = mockBackend({ status: 401, contentType: 'application/json', body: {} });
    const result = await searchInventoryHandler({}, {
      token: mockToken,
      bearer: 'tok',
      correlationId: 'cid',
      backend,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/re-authorize/i);
  });
});
