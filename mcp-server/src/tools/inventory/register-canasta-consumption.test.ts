import { describe, it, expect, vi } from 'vitest';
import { registerCanastaConsumptionHandler } from './register-canasta-consumption.js';
import type { BackendClient } from '../../http/backend-client.js';

const mockToken = { sub: '1', scope: 'inventory:write', org_id: '1', exp: 9999999999 };

describe('register_canasta_consumption', () => {
  it('elicits and posts canasta consumption', async () => {
    const elicit = vi.fn().mockResolvedValue({
      curacionId: 99,
      items: [
        { productId: 1, quantity: 2 },
        { productId: 5, quantity: 0.5 },
      ],
    });
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 201, contentType: 'application/json', body: { id: 7 } }),
      requestBinary: vi.fn(),
    };
    const r = await registerCanastaConsumptionHandler({}, {
      token: mockToken, bearer: 't', correlationId: 'c', backend, elicit,
    });
    expect(r.isError).toBeFalsy();
    expect(backend.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST', path: '/api/inventory/canasta',
    }));
    const body = (backend.request as any).mock.calls[0][0].body;
    expect(body.curacionId).toBe(99);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].productId).toBe(1);
    expect(body.items[0].quantity).toBe(2);
  });

  it('returns fallback when no elicit capability', async () => {
    const backend: BackendClient = {
      request: vi.fn(),
      requestBinary: vi.fn(),
    };
    const r = await registerCanastaConsumptionHandler({}, {
      token: mockToken, bearer: 't', correlationId: 'c', backend, elicit: undefined,
    });
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toMatch(/Necesito más información/);
    expect(backend.request).not.toHaveBeenCalled();
  });

  it('returns 400 from backend as MCP error', async () => {
    const elicit = vi.fn().mockResolvedValue({
      curacionId: 99,
      items: [{ productId: 1, quantity: 2 }],
    });
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 400, contentType: 'application/json', body: { message: 'Stock insuficiente' } }),
      requestBinary: vi.fn(),
    };
    const r = await registerCanastaConsumptionHandler({}, {
      token: mockToken, bearer: 't', correlationId: 'c', backend, elicit,
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/Stock insuficiente/);
  });
});
