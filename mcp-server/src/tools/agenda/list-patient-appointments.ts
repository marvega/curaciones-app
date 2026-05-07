import type { ToolContext, ToolResult } from '../catalog.js';
import { mapHttpToMcp } from '../../errors/http-to-mcp-error.js';

export interface ListPatientAppointmentsInput {
  patientId: number;
}

export async function listPatientAppointmentsHandler(input: ListPatientAppointmentsInput, ctx: ToolContext): Promise<ToolResult> {
  const r = await ctx.backend.request({
    method: 'GET',
    path: `/api/appointments/patient/${input.patientId}`,
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
