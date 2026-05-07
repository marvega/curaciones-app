import { z } from 'zod';
import type { ToolContext, ToolResult } from '../catalog.js';
import { mapHttpToMcp } from '../../errors/http-to-mcp-error.js';
import { elicitOrFallback } from '../../elicitation/elicit-or-fallback.js';

const PatientFormSchema = z.object({
  rut: z.string().regex(/^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/, 'RUT con formato XX.XXX.XXX-Y'),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  gender: z.enum(['male', 'female', 'other']),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
});

type PatientForm = z.infer<typeof PatientFormSchema>;

export async function createPatientHandler(_input: unknown, ctx: ToolContext): Promise<ToolResult> {
  const elicited = await elicitOrFallback<PatientForm>({
    capable: typeof ctx.elicit === 'function',
    schema: PatientFormSchema,
    prompt: 'Datos del paciente nuevo (RUT, nombre, fecha de nacimiento, etc.)',
    partial: {},
    elicit: ctx.elicit ?? (async () => ({})),
  });

  if (elicited.kind === 'fallback') {
    return { content: [{ type: 'text', text: elicited.text }] };
  }

  const r = await ctx.backend.request({
    method: 'POST',
    path: '/api/patients',
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
