import { describe, it, expect, vi } from 'vitest';
import { registerTools } from './register.js';
import { TOOLS } from './catalog.js';

describe('registerTools', () => {
  it('registers all 20 tools on the MCP server', () => {
    const server: any = { tool: vi.fn() };
    registerTools({ server, getContext: () => null as any });
    expect(server.tool).toHaveBeenCalledTimes(TOOLS.length);
    const names = (server.tool as any).mock.calls.map((c: any) => c[0]);
    expect(new Set(names).size).toBe(TOOLS.length);
  });

  it('wraps handler with scope check (returns insufficient_scope error)', async () => {
    const handlers: Record<string, any> = {};
    const server: any = {
      tool: (name: string, _meta: any, handler: any) => { handlers[name] = handler; },
    };
    const ctx = {
      token: { sub: '1', scope: 'patients:read', org_id: '1', exp: 999 } as any,
      bearer: 't', correlationId: 'c', backend: {} as any,
    };
    registerTools({ server, getContext: () => ctx });
    // create_patient requires patients:write but token only has patients:read
    const result = await handlers.create_patient({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/insufficient_scope|patients:write/);
  });
});
