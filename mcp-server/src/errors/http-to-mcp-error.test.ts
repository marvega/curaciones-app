import { describe, it, expect } from 'vitest';
import { mapHttpToMcp } from './http-to-mcp-error.js';

describe('mapHttpToMcp', () => {
  it('maps 400 to invalid params', () => {
    const r = mapHttpToMcp({ status: 400, body: { message: 'Bad RUT' } });
    expect(r.code).toBe(-32602);
    expect(r.message).toContain('Bad RUT');
  });

  it('maps 401 to invalid_token', () => {
    const r = mapHttpToMcp({ status: 401, body: {} });
    expect(r.code).toBe(-32600);
    expect(r.data?.error).toBe('invalid_token');
  });

  it('maps 403 to forbidden', () => {
    const r = mapHttpToMcp({ status: 403, body: { message: 'No permission' } });
    expect(r.code).toBe(-32600);
    expect(r.data?.error).toBe('forbidden');
  });

  it('maps 404 to not_found', () => {
    const r = mapHttpToMcp({ status: 404, body: {} });
    expect(r.code).toBe(-32602);
    expect(r.data?.error).toBe('not_found');
  });

  it('maps 409 to conflict', () => {
    const r = mapHttpToMcp({ status: 409, body: { message: 'RUT exists' } });
    expect(r.code).toBe(-32602);
    expect(r.message).toContain('RUT exists');
  });

  it('maps 429 with retry-after', () => {
    const r = mapHttpToMcp({ status: 429, body: {}, retryAfter: '30' });
    expect(r.code).toBe(-32603);
    expect(r.data?.retryAfter).toBe('30');
  });

  it('maps 500 to internal, hides backend message', () => {
    const r = mapHttpToMcp({ status: 500, body: { message: 'DB connection lost' } });
    expect(r.code).toBe(-32603);
    expect(r.message).toBe('Internal server error');
    expect(JSON.stringify(r)).not.toContain('DB connection lost');
  });
});
