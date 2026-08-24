import type { ToolContext, ToolResult } from '../catalog.js';
import { mapHttpToMcp } from '../../errors/http-to-mcp-error.js';

export interface ListLotsExpiringInput {
  days?: number;
}

export async function listLotsExpiringHandler(input: ListLotsExpiringInput, ctx: ToolContext): Promise<ToolResult> {
  const r = await ctx.backend.request({
    method: 'GET',
    path: '/api/inventory/expiring',
    bearer: ctx.bearer,
    correlationId: ctx.correlationId,
    query: {
      days: input.days?.toString(),
    },
  });

  if (r.status >= 400) {
    const err = mapHttpToMcp({ status: r.status, body: r.body });
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(r.body) }],
  };
}
