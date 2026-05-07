import type { ToolContext, ToolResult } from '../catalog.js';
import { mapHttpToMcp } from '../../errors/http-to-mcp-error.js';

export interface SearchInventoryInput {
  q?: string;
  cursor?: string;
  limit?: number;
}

export async function searchInventoryHandler(input: SearchInventoryInput, ctx: ToolContext): Promise<ToolResult> {
  const r = await ctx.backend.request({
    method: 'GET',
    path: '/api/inventory/products',
    bearer: ctx.bearer,
    correlationId: ctx.correlationId,
    query: {
      q: input.q,
      cursor: input.cursor,
      limit: input.limit?.toString(),
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
