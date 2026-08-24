import type { ToolContext, ToolResult } from '../catalog.js';
import { mapHttpToMcp } from '../../errors/http-to-mcp-error.js';

export interface AddWoundNoteInput {
  patientId?: number;
  curacionId?: number;
  content: string;
}

export async function addWoundNoteHandler(input: AddWoundNoteInput, ctx: ToolContext): Promise<ToolResult> {
  const r = await ctx.backend.request({
    method: 'POST',
    path: '/api/wound-notes',
    bearer: ctx.bearer,
    correlationId: ctx.correlationId,
    body: { patientId: input.patientId, curacionId: input.curacionId, content: input.content },
  });
  if (r.status >= 400) {
    const err = mapHttpToMcp({ status: r.status, body: r.body });
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }
  return { content: [{ type: 'text', text: JSON.stringify(r.body) }] };
}
