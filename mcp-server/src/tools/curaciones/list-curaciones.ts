import type { ToolContext, ToolResult } from '../catalog.js';
import { mapHttpToMcp } from '../../errors/http-to-mcp-error.js';

export interface ListCuracionesInput {
  patientId: number;
  cursor?: string;
  limit?: number;
}

export async function listCuracionesHandler(input: ListCuracionesInput, ctx: ToolContext): Promise<ToolResult> {
  const r = await ctx.backend.request({
    method: 'GET',
    path: `/api/curaciones/patient/${input.patientId}`,
    bearer: ctx.bearer,
    correlationId: ctx.correlationId,
    query: {
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
