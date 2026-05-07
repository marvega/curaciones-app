import type { ToolContext, ToolResult } from '../catalog.js';

export async function whoamiHandler(_input: unknown, ctx: ToolContext): Promise<ToolResult> {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        userId: ctx.token.sub,
        username: ctx.token.username ?? null,
        organizationId: ctx.token.org_id,
        organizationName: ctx.token.org_name ?? null,
        role: ctx.token.role ?? null,
      }),
    }],
  };
}
