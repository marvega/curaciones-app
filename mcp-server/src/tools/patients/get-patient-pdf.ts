import type { ToolContext, ToolResult } from '../catalog.js';
import { mapHttpToMcp } from '../../errors/http-to-mcp-error.js';

export interface GetPatientPdfInput {
  id: number;
}

export async function getPatientPdfHandler(input: GetPatientPdfInput, ctx: ToolContext): Promise<ToolResult> {
  const r = await ctx.backend.requestBinary({
    method: 'GET',
    path: `/api/patients/${input.id}/pdf`,
    bearer: ctx.bearer,
    correlationId: ctx.correlationId,
  });

  if (r.status >= 400) {
    const err = mapHttpToMcp({ status: r.status, body: {} });
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }

  const base64 = Buffer.from(r.data).toString('base64');
  return {
    content: [{
      type: 'resource',
      mimeType: 'application/pdf',
      data: base64,
    }],
  };
}
