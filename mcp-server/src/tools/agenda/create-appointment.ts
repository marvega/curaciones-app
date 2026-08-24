import { z } from 'zod';
import type { ToolContext, ToolResult } from '../catalog.js';
import { mapHttpToMcp } from '../../errors/http-to-mcp-error.js';
import { elicitOrFallback } from '../../elicitation/elicit-or-fallback.js';

const AppointmentFormSchema = z.object({
  patientId: z.number().int(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'Fecha ISO con hora YYYY-MM-DDTHH:mm'),
  notes: z.string().optional(),
});

type AppointmentForm = z.infer<typeof AppointmentFormSchema>;

export async function createAppointmentHandler(_input: unknown, ctx: ToolContext): Promise<ToolResult> {
  const elicited = await elicitOrFallback<AppointmentForm>({
    capable: typeof ctx.elicit === 'function',
    schema: AppointmentFormSchema,
    prompt: 'Datos de la nueva cita (paciente, fecha YYYY-MM-DDTHH:mm, notas opcionales)',
    partial: {},
    elicit: ctx.elicit ?? (async () => ({})),
  });

  if (elicited.kind === 'fallback') {
    return { content: [{ type: 'text', text: elicited.text }] };
  }

  const r = await ctx.backend.request({
    method: 'POST',
    path: '/api/appointments',
    bearer: ctx.bearer,
    correlationId: ctx.correlationId,
    body: elicited.value,
  });

  if (r.status >= 400) {
    const err = mapHttpToMcp({ status: r.status, body: r.body });
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }
  return { content: [{ type: 'text', text: JSON.stringify(r.body) }] };
}
