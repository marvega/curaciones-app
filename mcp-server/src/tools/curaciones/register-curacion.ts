import { z } from 'zod';
import type { ToolContext, ToolResult } from '../catalog.js';
import { mapHttpToMcp } from '../../errors/http-to-mcp-error.js';
import { elicitOrFallback } from '../../elicitation/elicit-or-fallback.js';

const CuracionFormSchema = z.object({
  patientId: z.number().int(),
  location: z.string().min(1),
  woundType: z.string().min(1),
  observations: z.string().optional(),
  careApplied: z.string().optional(),
});

type CuracionForm = z.infer<typeof CuracionFormSchema>;

export async function registerCuracionHandler(_input: unknown, ctx: ToolContext): Promise<ToolResult> {
  const elicited = await elicitOrFallback<CuracionForm>({
    capable: typeof ctx.elicit === 'function',
    schema: CuracionFormSchema,
    prompt: 'Datos de la curación (paciente, localización, tipo de herida, observaciones, cuidados aplicados)',
    partial: {},
    elicit: ctx.elicit ?? (async () => ({})),
  });

  if (elicited.kind === 'fallback') {
    return { content: [{ type: 'text', text: elicited.text }] };
  }

  const r = await ctx.backend.request({
    method: 'POST',
    path: '/api/curaciones',
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
