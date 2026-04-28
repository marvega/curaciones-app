import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as XLSX from 'xlsx';
import { CanastaImportService, CanastaImportResult } from './canasta-import.service';
import { CanastaCategory, CanastaSection } from './canasta-category.entity';
import { Product } from '../products/product.entity';

interface FakeProduct {
  id: number;
  name: string;
  codes: { code: string }[];
}

interface FakeCategory {
  id: number;
  name: string;
  section: CanastaSection;
  displayOrder: number;
  isOptional: boolean;
  notes: string | null;
  archived: boolean;
  sourceKey: string | null;
}

function buildFixtureBuffer(): Buffer {
  // Mirrors the real CURACIONES.xlsx structure observed in production.
  // Row 0: ANEXO section title (INSUMOS section header)
  // Row 1: Column-header row (Si / No / Observaciones / ...)
  // Rows 2..: real category rows
  // Then AYUDAS_TECNICAS divider + more category rows.
  const rows: unknown[][] = [
    ['ANEXO 5. INSUMOS PARA CURACIÓN AVANZADA', null, null, null, null, null],
    [
      'Disponibilidad de insumos de Canasta Curación Avanzada',
      'Si ',
      'No',
      'Observaciones ',
      'Stock insumos del mes anterior',
      'Stock insunos solicitados para el mes actual ',
    ],
    ['Apósitos bacteriostáticos', null, null, 'Ejemplos apósitos bacteriostáticos: Apósito de Ringer + PHMB; DACC lámina; PHMB Rollo; Apósito Miel Gel.', null, null],
    ['Apósitos absorbentes', null, null, 'Ejemplos: Alginato de calcio; Carboximetilcelulosa; Espuma poliuretano.', null, null],
    ['Apósitos de contacto', null, null, 'Ejemplos: Silicona; Petrolato.', null, null],
    ['Apósitos de hidrogel', null, null, 'Hidrogel amorfo o lámina.', null, null],
    ['Apósito transparente', null, null, 'Película transparente.', null, null],
    ['Vendaje compresivo', null, null, 'Vendaje elástico cohesivo o adhesivo.', null, null],
    ['Vendaje no compresivo', null, null, 'Tubular o gasa.', null, null],
    ['Tela adhesiva', null, null, 'Tela adhesiva hipoalergénica.', null, null],
    ['Suero fisiológico', null, null, 'Suero fisiológico 0.9%.', null, null],
    ['Guantes de procedimiento', null, null, 'Guantes nitrilo o látex.', null, null],
    ['Mascarilla quirúrgica (opcional)', null, null, 'Mascarilla desechable.', null, null],
    // Section divider: real CURACIONES.xlsx carries Si/No/Observaciones headers in
    // adjacent cells alongside the section title. The parser must detect the section
    // BEFORE the column-header skip kicks in.
    [
      'Ayudas Técnicas garantizadas para apoyo en CAPD, según decreto GES 2022-2025',
      'Si ',
      'No',
      'Observaciones ',
      null,
      null,
    ],
    ['Cojín antiescaras', null, null, 'Cojín de aire o viscoelástico.', null, null],
    ['Colchón antiescaras', null, null, 'Colchón de aire alternante.', null, null],
    ['Silla de ruedas', null, null, 'Silla estándar.', null, null],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CURACIONES');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('CanastaImportService', () => {
  let service: CanastaImportService;

  // Fake product catalog — names mirror real AVIS catalog entries containing keywords.
  const fakeProducts: FakeProduct[] = [
    { id: 1, name: 'APOSITO RINGER CON PHMB 10X10 CM UD', codes: [{ code: '101' }] },
    { id: 2, name: 'APOSITO PHMB ROLLO 10CM X 1M UD', codes: [{ code: '102' }] },
    { id: 3, name: 'LAMINA DACC 10X10 CM UD', codes: [{ code: '103' }] },
    { id: 4, name: 'APOSITO MIEL GEL 15G UD', codes: [{ code: '104' }] },
    { id: 5, name: 'ALGINATO DE CALCIO 10X10 CM UD', codes: [{ code: '105' }] },
    { id: 6, name: 'CARBOXIMETILCELULOSA 10X10 CM UD', codes: [{ code: '106' }] },
    { id: 7, name: 'ESPUMA POLIURETANO 10X10 CM UD', codes: [{ code: '107' }] },
    { id: 8, name: 'APOSITO SILICONA 10X10 CM UD', codes: [{ code: '108' }] },
    { id: 9, name: 'PETROLATO GASA 10X10 CM UD', codes: [{ code: '109' }] },
    { id: 10, name: 'HIDROGEL AMORFO 15G UD', codes: [{ code: '110' }] },
    { id: 11, name: 'PELICULA TRANSPARENTE 10X12 CM UD', codes: [{ code: '111' }] },
    { id: 12, name: 'VENDAJE ELASTICO COHESIVO 10CM UD', codes: [{ code: '112' }] },
    { id: 13, name: 'VENDAJE TUBULAR 10CM UD', codes: [{ code: '113' }] },
    { id: 14, name: 'TELA ADHESIVA HIPOALERGENICA UD', codes: [{ code: '114' }] },
    { id: 15, name: 'SUERO FISIOLOGICO 100ML UD', codes: [{ code: '115' }] },
    { id: 16, name: 'GUANTES NITRILO TALLA M CAJA', codes: [{ code: '116' }] },
    { id: 17, name: 'MASCARILLA QUIRURGICA DESECHABLE CAJA', codes: [{ code: '117' }] },
    { id: 18, name: 'COJIN VISCOELASTICO ANTIESCARAS UD', codes: [{ code: '118' }] },
    { id: 19, name: 'COLCHON AIRE ALTERNANTE UD', codes: [{ code: '119' }] },
    { id: 20, name: 'SILLA RUEDAS ESTANDAR UD', codes: [{ code: '120' }] },
  ];

  // In-memory category store — mimics TypeORM repo behavior used by the importer.
  const categoryStore: FakeCategory[] = [];
  let nextCategoryId = 1;

  const categoriesRepo: any = {
    find: jest.fn(async () => categoryStore.slice()),
    create: jest.fn((data: Partial<FakeCategory>) => ({ ...data })),
    save: jest.fn(async (entity: FakeCategory) => {
      if (!entity.id) {
        entity.id = nextCategoryId++;
        categoryStore.push(entity);
      } else {
        const idx = categoryStore.findIndex((c) => c.id === entity.id);
        if (idx >= 0) categoryStore[idx] = entity;
        else categoryStore.push(entity);
      }
      return entity;
    }),
  };

  const productsRepo: any = {
    find: jest.fn(async () => fakeProducts as unknown as Product[]),
  };

  // Track inserted associations for verification.
  const insertedAssociations: { canastaCategoryId: number; productId: number }[] = [];

  const dataSource: any = {
    transaction: jest.fn(async (cb: (mgr: any) => Promise<unknown>) => {
      const manager = {
        getRepository: (target: unknown) => {
          if (target === CanastaCategory) return categoriesRepo;
          if (target === Product) return productsRepo;
          throw new Error('Unknown repo target');
        },
        query: jest.fn(async (sql: string, params: unknown[]) => {
          if (/^SELECT/i.test(sql)) return [];
          if (/^DELETE/i.test(sql)) return undefined;
          if (/^INSERT INTO canasta_category_products/i.test(sql)) {
            // params = [canastaCategoryId, productId1, productId2, ...]
            const [catId, ...productIds] = params as number[];
            for (const pid of productIds) insertedAssociations.push({ canastaCategoryId: catId, productId: pid });
            return undefined;
          }
          return undefined;
        }),
      };
      return cb(manager);
    }),
  };

  beforeEach(async () => {
    categoryStore.length = 0;
    insertedAssociations.length = 0;
    nextCategoryId = 1;
    jest.clearAllMocks();

    const m = await Test.createTestingModule({
      providers: [
        CanastaImportService,
        { provide: getRepositoryToken(CanastaCategory), useValue: categoriesRepo },
        { provide: getRepositoryToken(Product), useValue: productsRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = m.get(CanastaImportService);
  });

  it('skips column-header row and parses 14 categories (11 INSUMOS + 3 AYUDAS_TECNICAS)', async () => {
    const buffer = buildFixtureBuffer();
    const result: CanastaImportResult = await service.importFromXlsx(buffer);

    // No "Disponibilidad..." spurious category should exist.
    const names = categoryStore.map((c) => c.name);
    expect(names.some((n) => /^Disponibilidad/i.test(n))).toBe(false);

    expect(result.categoriesCreated).toBe(14);
    expect(categoryStore).toHaveLength(14);

    const insumos = categoryStore.filter((c) => c.section === CanastaSection.INSUMOS);
    const ayudas = categoryStore.filter((c) => c.section === CanastaSection.AYUDAS_TECNICAS);
    expect(insumos).toHaveLength(11);
    expect(ayudas).toHaveLength(3);

    // Strips "(opcional)" marker into isOptional flag.
    const mascarilla = categoryStore.find((c) => c.name === 'Mascarilla quirúrgica');
    expect(mascarilla).toBeDefined();
    expect(mascarilla!.isOptional).toBe(true);
  });

  it('auto-matches multiple products per category via tokenized keyword match', async () => {
    const buffer = buildFixtureBuffer();
    const result: CanastaImportResult = await service.importFromXlsx(buffer);

    // Significant improvement over previous behaviour (was 2 in production).
    expect(result.productsAutoMatched).toBeGreaterThan(5);

    // For "Apósitos bacteriostáticos" — keywords ringer, phmb, dacc, lamina, miel, gel
    // should hit products 1 (RINGER+PHMB), 2 (PHMB ROLLO), 3 (LAMINA DACC), 4 (MIEL GEL).
    const bact = categoryStore.find((c) => c.name === 'Apósitos bacteriostáticos');
    expect(bact).toBeDefined();
    const bactMatches = insertedAssociations
      .filter((a) => a.canastaCategoryId === bact!.id)
      .map((a) => a.productId)
      .sort((a, b) => a - b);
    expect(bactMatches).toEqual(expect.arrayContaining([1, 2, 3, 4]));

    // For "Apósitos absorbentes" — keywords alginato, calcio, carboximetilcelulosa, espuma, poliuretano.
    const abs = categoryStore.find((c) => c.name === 'Apósitos absorbentes');
    expect(abs).toBeDefined();
    const absMatches = insertedAssociations
      .filter((a) => a.canastaCategoryId === abs!.id)
      .map((a) => a.productId);
    expect(absMatches).toEqual(expect.arrayContaining([5, 6, 7]));
  });
});
