// backend/src/seeds/canasta-mappings.ts
// Mapping of Canasta CAPD categories to product matchers.
// Matchers are checked against product name (regex) AND AVIS Quilpué codes.
// To refine, edit this file or use the admin UI in production.

export interface ProductMatcher {
  // If product has any of these AVIS codes, it matches.
  avisCodes?: string[];
  // If product name matches any of these regexes (case-insensitive), it matches.
  namePatterns?: RegExp[];
  // Comment explaining why these match this category.
  why: string;
}

export interface CategoryMapping {
  displayOrder: number;
  matchers: ProductMatcher[];
}

export const CANASTA_MAPPINGS: CategoryMapping[] = [
  {
    displayOrder: 1, // Apósitos bacteriostáticos
    matchers: [
      { avisCodes: ['1778'], why: 'Apósito Ringer + PHMB (explícito en notes)' },
      { namePatterns: [/RINGER.*PHMB/i, /\bDACC\b/i, /PHMB\s*ROLLO/i, /MIEL\s*GEL/i, /APOSITO\s+DE\s+MIEL/i], why: 'Bacteriostáticos sugeridos por nombre' },
    ],
  },
  {
    displayOrder: 2, // Apósito absorbente
    matchers: [
      { namePatterns: [/ALGINATO\s+(DE\s+)?CALCIO\s+10\s*[xX*]\s*10/i, /CARBOXIMETILCELULOSA/i, /ESPUMA\s+HIDROFIL/i], why: 'Absorbentes sugeridos por nombre' },
    ],
  },
  {
    displayOrder: 3, // Apósito hidratante
    matchers: [
      { namePatterns: [/POLIESTER|POLIÉSTER/i, /HIDROGEL\s+15\s*G/i, /TULL\s+DE\s+SILICONA/i, /APOSITO\s+DE\s+NYLON/i], why: 'Hidratantes sugeridos por nombre' },
    ],
  },
  {
    displayOrder: 4, // Apósito regenerativo
    matchers: [
      { namePatterns: [/COLAGEN/i, /METALOPROTEASA/i], why: 'Regenerativos por nombre' },
    ],
  },
  {
    displayOrder: 5, // Solución limpiadora antibiofilm o limpiadora
    matchers: [
      { namePatterns: [/POLIHEXANIDA/i, /BETAINA|BETAÍNA/i, /PRONTOSAN.*SOLUC/i, /LIMPIEZA\s+DE\s+HERIDAS/i], why: 'Solución antibiofilm / limpiadora por nombre' },
    ],
  },
  {
    displayOrder: 6, // Ácidos grasos hiperoxigenados
    matchers: [
      { namePatterns: [/LINOVERA/i, /ACIDOS?\s+GRASOS?.*HIPEROX/i], why: 'AGHO por nombre' },
    ],
  },
  {
    displayOrder: 7, // Curetas 3-4 mm
    matchers: [
      { namePatterns: [/CURETA.*\b[34][.,]?[05]?\s*MM\b/i, /CURETA\s+DERMATOLOG/i], why: 'Curetas por nombre' },
    ],
  },
  {
    displayOrder: 8, // Apósitos bactericidas
    matchers: [
      { namePatterns: [/ALGINATO.*PLATA/i, /TULL.*PLATA/i, /PLATA\s+NANOCRIST/i, /CARBON\s+ACTIVO\s+AG/i, /NANO\s+CRISTALINO/i], why: 'Bactericidas (con plata) por nombre' },
    ],
  },
  {
    displayOrder: 9, // Espuma limpiadora (opcional)
    matchers: [
      { namePatterns: [/ESPUMA\s+LIMPIADORA/i], why: 'Espuma limpiadora por nombre' },
    ],
  },
  {
    displayOrder: 10, // Protector cutáneo spray (opcional)
    matchers: [
      { namePatterns: [/PROTECTOR\s+CUT[AÁ]NEO/i], why: 'Protector cutáneo por nombre' },
    ],
  },
  {
    displayOrder: 11, // Hidrogel con plata (opcional)
    matchers: [
      { namePatterns: [/HIDROGEL.*PLATA/i], why: 'Hidrogel con plata por nombre' },
    ],
  },
  // displayOrder 12-14 are AYUDAS_TECNICAS — managed externally, no product mapping.
];
