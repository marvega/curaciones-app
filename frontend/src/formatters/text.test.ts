import { describe, expect, it } from 'vitest';
import { formatCode, toSentenceCase } from './text';

describe('toSentenceCase', () => {
  it('lowercases input and capitalizes first letter', () => {
    expect(toSentenceCase('HELLO WORLD')).toBe('Hello world');
  });

  it('preserves units in lowercase (mg, ml, cm, g, kg, l, mm)', () => {
    expect(toSentenceCase('ACETAZOLAMIDA 250 MG COMPRIMIDO')).toBe('Acetazolamida 250 mg comprimido');
    expect(toSentenceCase('ACICLOVIR 200 MG/5 ML JARABE')).toBe('Aciclovir 200 mg/5 ml jarabe');
  });

  it('preserves known acronyms (UD, AVIS, PHMB, DACC, AGHO, CAPD)', () => {
    expect(toSentenceCase('APOSITO RINGER CON PHMB 10X10 CM UD')).toBe('Apósito ringer con PHMB 10×10 cm UD');
    expect(toSentenceCase('LAMINA DACC 7X9 CM')).toBe('Lámina DACC 7×9 cm');
  });

  it('recovers Spanish accents on common medical words', () => {
    expect(toSentenceCase('ACIDO FOLICO 1 MG')).toBe('Ácido fólico 1 mg');
    expect(toSentenceCase('CREMA TOPICA')).toBe('Crema tópica');
    expect(toSentenceCase('SOLUCION INYECTABLE')).toBe('Solución inyectable');
    expect(toSentenceCase('UNGUENTO OFTALMICO')).toBe('Ungüento oftálmico');
    expect(toSentenceCase('ACIDO ACETILSALICILICO')).toBe('Ácido acetilsalicílico');
  });

  it('replaces lowercase x between digits with × (multiplication sign)', () => {
    expect(toSentenceCase('GASA 10X10')).toBe('Gasa 10×10');
    expect(toSentenceCase('GASA 5X5 CM')).toBe('Gasa 5×5 cm');
  });

  it('handles percentages', () => {
    expect(toSentenceCase('ACICLOVIR 5 % CREMA TOPICA')).toBe('Aciclovir 5 % crema tópica');
  });

  it('returns empty string for empty input', () => {
    expect(toSentenceCase('')).toBe('');
    expect(toSentenceCase('   ')).toBe('');
  });

  it('handles already-cased input', () => {
    expect(toSentenceCase('Hello world')).toBe('Hello world');
  });
});

describe('formatCode', () => {
  it('strips system prefix (AVIS_QUILPUE:)', () => {
    expect(formatCode('AVIS_QUILPUE:1408')).toBe('1408');
  });

  it('returns input unchanged when no colon', () => {
    expect(formatCode('1408')).toBe('1408');
  });

  it('handles future RAYEN-style prefixes', () => {
    expect(formatCode('RAYEN_VINA:99')).toBe('99');
  });

  it('returns empty string for empty input', () => {
    expect(formatCode('')).toBe('');
  });
});
