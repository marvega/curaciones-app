import { describe, it, expect, vi } from 'vitest';
import { addWoundNoteHandler } from './add-wound-note.js';
import type { BackendClient } from '../../http/backend-client.js';

const mockToken = { sub: '1', scope: 'clinical:write', org_id: '1', exp: 9999999999 };

describe('add_wound_note', () => {
  it('posts to /api/wound-notes with full body', async () => {
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 201, contentType: 'application/json', body: { id: 42, content: 'Note text' } }),
      requestBinary: vi.fn(),
    };
    await addWoundNoteHandler({ patientId: 5, curacionId: 11, content: 'Note text' }, {
      token: mockToken, bearer: 't', correlationId: 'c', backend,
    });
    expect(backend.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      path: '/api/wound-notes',
      body: { patientId: 5, curacionId: 11, content: 'Note text' },
    }));
  });

  it('forwards 403 forbidden as MCP error', async () => {
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 403, contentType: 'application/json', body: { message: 'No permission' } }),
      requestBinary: vi.fn(),
    };
    const r = await addWoundNoteHandler({ content: 'Note text' }, {
      token: mockToken, bearer: 't', correlationId: 'c', backend,
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/no permission/i);
  });
});
