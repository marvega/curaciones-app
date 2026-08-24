import type { ToolContext, ToolResult } from '../catalog.js';
import { mapHttpToMcp } from '../../errors/http-to-mcp-error.js';

export interface ReadmitPatientInput {
  id: number;
}

export async function readmitPatientHandler(input: ReadmitPatientInput, ctx: ToolContext): Promise<ToolResult> {
  const r = await ctx.backend.request({
    method: 'POST',
    path: `/api/patients/${input.id}/readmit`,
    bearer: ctx.bearer,
    correlationId: ctx.correlationId,
    // no body for this endpoint
  });
  if (r.status >= 400) {
    const err = mapHttpToMcp({ status: r.status, body: r.body });
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }
  return { content: [{ type: 'text', text: JSON.stringify(r.body) }] };
}
