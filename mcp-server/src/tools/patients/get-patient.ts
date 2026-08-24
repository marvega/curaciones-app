import type { ToolContext, ToolResult } from '../catalog.js';
import { mapHttpToMcp } from '../../errors/http-to-mcp-error.js';

export interface GetPatientInput {
  id: number;
}

export async function getPatientHandler(input: GetPatientInput, ctx: ToolContext): Promise<ToolResult> {
  const r = await ctx.backend.request({
    method: 'GET',
    path: `/api/patients/${input.id}`,
    bearer: ctx.bearer,
    correlationId: ctx.correlationId,
  });

  if (r.status >= 400) {
    const err = mapHttpToMcp({ status: r.status, body: r.body });
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(r.body) }],
  };
}
