import { z } from 'zod';
import type { ToolContext, ToolResult } from '../catalog.js';
import { mapHttpToMcp } from '../../errors/http-to-mcp-error.js';
import { elicitOrFallback } from '../../elicitation/elicit-or-fallback.js';

const UpdateFormSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
});

type UpdateForm = z.infer<typeof UpdateFormSchema>;

export interface UpdatePatientInput {
  id: number;
}

export async function updatePatientHandler(input: UpdatePatientInput, ctx: ToolContext): Promise<ToolResult> {
  const elicited = await elicitOrFallback<UpdateForm>({
    capable: typeof ctx.elicit === 'function',
    schema: UpdateFormSchema,
    prompt: 'Campos del paciente a actualizar (al menos uno: nombre, apellido, fecha de nacimiento, género, teléfono, email, dirección)',
    partial: {},
    elicit: ctx.elicit ?? (async () => ({})),
  });

  if (elicited.kind === 'fallback') {
    return { content: [{ type: 'text', text: elicited.text }] };
  }

  const r = await ctx.backend.request({
    method: 'PUT',
    path: `/api/patients/${input.id}`,
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
