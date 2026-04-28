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
  ['acetilsalicilico', 'acetilsalicílico'],
  ['folico', 'fólico'],
  ['folica', 'fólica'],
  ['lamina', 'lámina'],
  ['laminas', 'láminas'],
  ['hidrofila', 'hidrófila'],
]);

interface CaseState {
  firstCapitalized: boolean;
}

function processToken(token: string, state: CaseState): string {
  // Sub-split: tight digit+letters (e.g., '500MG' -> '500 MG')
  const tightMatch = token.match(/^(\d+(?:[.,]\d+)?)([A-Za-z]+)$/);
  if (tightMatch) {
    const numPart = tightMatch[1];
    const letterPart = processToken(tightMatch[2], state);
    return `${numPart} ${letterPart}`;
  }

  // Sub-split: letter/letter via slash (e.g., 'MG/ML' -> 'mg/ml')
  if (/^[A-Za-z]+(\/[A-Za-z]+)+$/.test(token)) {
    return token.split('/').map((s) => processToken(s, state)).join('/');
  }

  const upper = token.toUpperCase();
  const lower = token.toLowerCase();

  if (PRESERVE_UPPER.has(upper)) {
    state.firstCapitalized = true; // I-5: acronym counts as first capitalization
    return upper;
  }

  if (PRESERVE_LOWER.has(lower)) {
    return lower;
  }

  if (ACCENT_RECOVERY.has(lower)) {
    const recovered = ACCENT_RECOVERY.get(lower)!;
    if (!state.firstCapitalized) {
      state.firstCapitalized = true;
      return recovered.charAt(0).toUpperCase() + recovered.slice(1);
    }
    return recovered;
  }

  if (/^[0-9]/.test(token) || /^[%/×]/.test(token)) {
    return token;
  }

  if (!state.firstCapitalized) {
    state.firstCapitalized = true;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return lower;
}

export function toSentenceCase(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (!trimmed) return '';

  // Pre-process whole input: collapse '\d X \d', '\dX\d', '\d  X  \d' into '\d×\d'
  const xReplaced = trimmed.replace(/(\d)\s*[xX]\s*(\d)/g, '$1×$2');

  const state: CaseState = { firstCapitalized: false };
  const parts = xReplaced.split(/(\s+)/);

  return parts
    .map((part) => (/^\s+$/.test(part) ? ' ' : processToken(part, state)))
    .join('')
    .replace(/\s+/g, ' ');
}

export function formatCode(code: string): string {
  if (!code) return '';
  const colonIdx = code.indexOf(':');
  return colonIdx >= 0 ? code.substring(colonIdx + 1) : code;
}
