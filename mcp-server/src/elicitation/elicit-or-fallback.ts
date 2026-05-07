import { z, type ZodTypeAny, type ZodObject, type ZodRawShape } from 'zod';

export type ElicitResult<T> =
  | { kind: 'value'; value: T }
  | { kind: 'fallback'; text: string };

export interface ElicitOrFallbackArgs<T> {
  capable: boolean;
  schema: ZodTypeAny;
  prompt: string;
  partial: Record<string, unknown>;
  elicit: (schema: ZodTypeAny, prompt: string) => Promise<unknown>;
}

function describeRequiredFields(schema: ZodTypeAny, partial: Record<string, unknown>): string[] {
  if (schema instanceof z.ZodObject) {
    const shape = (schema as ZodObject<ZodRawShape>).shape;
    return Object.keys(shape).filter((k) => !(k in partial));
  }
  return [];
}

export async function elicitOrFallback<T>(args: ElicitOrFallbackArgs<T>): Promise<ElicitResult<T>> {
  if (!args.capable) {
    const fields = describeRequiredFields(args.schema, args.partial);
    return {
      kind: 'fallback',
      text: `Necesito más información: ${fields.join(', ')}. Por favor llamame de nuevo con estos datos: ${args.prompt}`,
    };
  }
  const elicited = await args.elicit(args.schema, args.prompt);
  const merged = { ...args.partial, ...(elicited as Record<string, unknown>) };
  const parsed = args.schema.safeParse(merged);
  if (!parsed.success) {
    const msgs = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Validation failed: ${msgs}`);
  }
  return { kind: 'value', value: parsed.data as T };
}
