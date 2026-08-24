import type { ToolContext, ToolResult } from '../catalog.js';
import { mapHttpToMcp } from '../../errors/http-to-mcp-error.js';

export interface GetAgendaByDateRangeInput {
  from: string;
  to: string;
}

export async function getAgendaByDateRangeHandler(input: GetAgendaByDateRangeInput, ctx: ToolContext): Promise<ToolResult> {
  const r = await ctx.backend.request({
    method: 'GET',
    path: '/api/curaciones/agenda',
    bearer: ctx.bearer,
    correlationId: ctx.correlationId,
    query: {
      from: input.from,
      to: input.to,
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
