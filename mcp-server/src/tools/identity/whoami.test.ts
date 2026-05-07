import { describe, it, expect, vi } from 'vitest';
import { whoamiHandler } from './whoami.js';

describe('whoami', () => {
  it('reads username, org, role from JWT claims (no backend call)', async () => {
    const backend = { request: vi.fn(), requestBinary: vi.fn() };
    const r = await whoamiHandler({}, {
      token: { sub: '42', scope: 'patients:read', org_id: '1', username: 'juan', org_name: 'CESFAM A', role: 'clinician', exp: 9999999999 },
      bearer: 't', correlationId: 'c', backend,
    });
    const parsed = JSON.parse(r.content[0].text!);
    expect(parsed.username).toBe('juan');
    expect(parsed.organizationName).toBe('CESFAM A');
    expect(parsed.role).toBe('clinician');
    expect(backend.request).not.toHaveBeenCalled();
  });
});
