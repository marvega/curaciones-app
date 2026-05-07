import type { ToolContext, ToolResult } from '../catalog.js';
import { mapHttpToMcp } from '../../errors/http-to-mcp-error.js';

export interface DischargePatientInput {
  id: number;
  cancelAppointment?: boolean;
}

export async function dischargePatientHandler(input: DischargePatientInput, ctx: ToolContext): Promise<ToolResult> {
  const r = await ctx.backend.request({
    method: 'POST',
    path: `/api/patients/${input.id}/discharge`,
    bearer: ctx.bearer,
    correlationId: ctx.correlationId,
    body: { cancelAppointment: input.cancelAppointment ?? false },
  });
  if (r.status >= 400) {
    const err = mapHttpToMcp({ status: r.status, body: r.body });
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }
  return { content: [{ type: 'text', text: JSON.stringify(r.body) }] };
}
