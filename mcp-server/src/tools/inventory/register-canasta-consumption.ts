import { z } from 'zod';
import type { ToolContext, ToolResult } from '../catalog.js';
import { mapHttpToMcp } from '../../errors/http-to-mcp-error.js';
import { elicitOrFallback } from '../../elicitation/elicit-or-fallback.js';

const CanastaFormSchema = z.object({
  curacionId: z.number().int(),
  items: z.array(z.object({
    productId: z.number().int(),
    quantity: z.number().min(0.01),
  })).min(1),
});

type CanastaForm = z.infer<typeof CanastaFormSchema>;

export async function registerCanastaConsumptionHandler(_input: unknown, ctx: ToolContext): Promise<ToolResult> {
  const elicited = await elicitOrFallback<CanastaForm>({
    capable: typeof ctx.elicit === 'function',
    schema: CanastaFormSchema,
    prompt: 'Consumo de canasta (id de curación e items: productos y cantidades)',
    partial: {},
    elicit: ctx.elicit ?? (async () => ({})),
  });

  if (elicited.kind === 'fallback') {
    return { content: [{ type: 'text', text: elicited.text }] };
  }

  const r = await ctx.backend.request({
    method: 'POST',
    path: '/api/inventory/canasta',
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
