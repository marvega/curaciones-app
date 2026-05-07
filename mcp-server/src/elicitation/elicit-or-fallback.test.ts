import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { elicitOrFallback } from './elicit-or-fallback.js';

describe('elicitOrFallback', () => {
  const schema = z.object({
    rut: z.string().regex(/^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/),
    firstName: z.string().min(1),
  });

  it('uses elicit fn when capability is available', async () => {
    const elicit = vi.fn().mockResolvedValue({ rut: '12.345.678-5', firstName: 'Juan' });
    const result = await elicitOrFallback({
      capable: true,
      schema,
      prompt: 'Datos del paciente',
      partial: {},
      elicit,
    });
    expect(result.kind).toBe('value');
    if (result.kind === 'value') expect(result.value.firstName).toBe('Juan');
  });

  it('returns fallback message when capability missing', async () => {
    const result = await elicitOrFallback({
      capable: false,
      schema,
      prompt: 'Datos del paciente',
      partial: {},
      elicit: vi.fn(),
    });
    expect(result.kind).toBe('fallback');
    if (result.kind === 'fallback') {
      expect(result.text).toMatch(/Necesito más información/);
      expect(result.text).toMatch(/rut/);
      expect(result.text).toMatch(/firstName/);
    }
  });

  it('validates elicit response and re-throws on schema error', async () => {
    const elicit = vi.fn().mockResolvedValue({ rut: 'invalid', firstName: 'Juan' });
    await expect(elicitOrFallback({
      capable: true,
      schema,
      prompt: 'Datos del paciente',
      partial: {},
      elicit,
    })).rejects.toThrow(/rut/);
  });

  it('merges partial with elicited fields', async () => {
    const elicit = vi.fn().mockResolvedValue({ firstName: 'Juan' });
    const result = await elicitOrFallback({
      capable: true,
      schema,
      prompt: 'Falta firstName',
      partial: { rut: '12.345.678-5' },
      elicit,
    });
    expect(result.kind).toBe('value');
    if (result.kind === 'value') {
      expect(result.value.rut).toBe('12.345.678-5');
      expect(result.value.firstName).toBe('Juan');
    }
  });
});
