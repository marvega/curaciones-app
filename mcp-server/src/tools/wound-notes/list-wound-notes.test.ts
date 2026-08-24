import { describe, it, expect, vi } from 'vitest';
import { listWoundNotesHandler } from './list-wound-notes.js';
import type { BackendClient } from '../../http/backend-client.js';

const mockToken = { sub: '1', scope: 'clinical:read', org_id: '1', exp: 9999999999 };

function mockBackend(response: any): BackendClient {
  return {
    request: vi.fn().mockResolvedValue(response),
    requestBinary: vi.fn(),
  };
}

describe('list_wound_notes', () => {
  it('returns wound notes for a patient with cursor', async () => {
    const backend = mockBackend({
      status: 200,
      contentType: 'application/json',
      body: { items: [{ id: 33, patientId: 5, content: 'evolución favorable' }], nextCursor: 'def' },
    });
    const result = await listWoundNotesHandler({ patientId: 5, cursor: 'abc', limit: 10 }, {
      token: mockToken,
      bearer: 'tok',
      correlationId: 'cid',
      backend,
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text!;
    expect(text).toContain('evolución favorable');
    expect(text).toContain('nextCursor');
    expect(backend.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      path: '/api/wound-notes/patient/5',
      query: expect.objectContaining({ cursor: 'abc', limit: '10' }),
    }));
  });

  it('maps 404 to not_found error', async () => {
    const backend = mockBackend({ status: 404, contentType: 'application/json', body: {} });
    const result = await listWoundNotesHandler({ patientId: 999 }, {
      token: mockToken,
      bearer: 'tok',
      correlationId: 'cid',
      backend,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/i);
  });
});
