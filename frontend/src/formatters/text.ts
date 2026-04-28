const PRESERVE_LOWER = new Set([
  'mg', 'ml', 'cm', 'mm', 'g', 'kg', 'l', 'µg', 'mcg', 'iu',
]);

const PRESERVE_UPPER = new Set([
  'UD', 'PZA', 'KIT', 'AVIS', 'RAYEN', 'PHMB', 'DACC', 'AGHO', 'CAPD',
]);

const ACCENT_RECOVERY = new Map<string, string>([
  ['acido', 'ácido'],
  ['acidos', 'ácidos'],
  ['aposito', 'apósito'],
  ['apositos', 'apósitos'],
  ['unguento', 'ungüento'],
  ['oftalmico', 'oftálmico'],
  ['oftalmica', 'oftálmica'],
  ['topica', 'tópica'],
  ['topico', 'tópico'],
  ['solucion', 'solución'],
  ['inyeccion', 'inyección'],
  ['inyectable', 'inyectable'],
  ['acetilsalicilico', 'acetilsalicílico'],
  ['folico', 'fólico'],
  ['folica', 'fólica'],
  ['lamina', 'lámina'],
  ['laminas', 'láminas'],
  ['polietilenglicol', 'polietilenglicol'],
  ['polihexanida', 'polihexanida'],
  ['hidrofila', 'hidrófila'],
  ['hidrogel', 'hidrogel'],
  ['carboximetilcelulosa', 'carboximetilcelulosa'],
  ['proteasa', 'proteasa'],
  ['metaloproteasa', 'metaloproteasa'],
  ['nylon', 'nylon'],
]);

const TOKEN_RE = /([0-9]+(?:[.,][0-9]+)?|[a-záéíóúñü]+|%|\/|×|x(?=\d)|[^\sa-z0-9])/giu;

export function toSentenceCase(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (!trimmed) return '';

  const tokens: string[] = [];
  let firstWordCapitalized = false;

  // Split preserving whitespace as single spaces
  const parts = trimmed.split(/(\s+)/);

  for (const part of parts) {
    if (/^\s+$/.test(part)) {
      tokens.push(' ');
      continue;
    }

    // Replace digits×digits (case insensitive) — handle 10X10, 5x5
    const xReplaced = part.replace(/(\d)[xX](\d)/g, '$1×$2');

    // Sub-token logic for things like "5%" or "10×10"
    const upper = xReplaced.toUpperCase();
    const lower = xReplaced.toLowerCase();

    if (PRESERVE_UPPER.has(upper)) {
      tokens.push(upper);
    } else if (PRESERVE_LOWER.has(lower)) {
      tokens.push(lower);
    } else if (ACCENT_RECOVERY.has(lower)) {
      const recovered = ACCENT_RECOVERY.get(lower)!;
      if (!firstWordCapitalized) {
        tokens.push(recovered.charAt(0).toUpperCase() + recovered.slice(1));
        firstWordCapitalized = true;
      } else {
        tokens.push(recovered);
      }
    } else if (/^[0-9]/.test(xReplaced) || /^[%\/×]/.test(xReplaced)) {
      tokens.push(xReplaced);
    } else {
      const cased = !firstWordCapitalized
        ? lower.charAt(0).toUpperCase() + lower.slice(1)
        : lower;
      if (/[a-záéíóúñü]/.test(cased)) firstWordCapitalized = true;
      tokens.push(cased);
    }
  }

  return tokens.join('').replace(/\s+/g, ' ');
}

export function formatCode(code: string): string {
  if (!code) return '';
  const colonIdx = code.indexOf(':');
  return colonIdx >= 0 ? code.substring(colonIdx + 1) : code;
}

// Note: TOKEN_RE is reserved for future granular tokenization needs.
void TOKEN_RE;
