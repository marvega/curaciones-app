import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CanastaCategory, CanastaSection } from './canasta-category.entity';
import { Product } from '../products/product.entity';

export interface CanastaImportResult {
  categoriesCreated: number;
  categoriesUpdated: number;
  categoriesArchived: number;
  productsAutoMatched: number;
  productsManualPreserved: number;
  errors: { row: number; reason: string }[];
}

interface ParsedCategory {
  rowIndex: number;
  name: string;
  section: CanastaSection;
  displayOrder: number;
  isOptional: boolean;
  notes: string | null;
}

const SECTION_HEADER_INSUMOS = /insumos/i;
const SECTION_HEADER_AYUDAS = /ayudas\s*t[eé]cnicas/i;

const COLUMN_HEADER_TOKENS = new Set(['si', 'sí', 'no', 'observaciones', 'observacion', 'observación']);

const KEYWORD_STOPWORDS = new Set([
  'ejemplo','ejemplos','listado','referencia','indicaci','indicacion','indicación',
  'aposito','apositos','apósito','apósitos',
  'de','del','con','para','por','los','las','la','el','un','una','y','o','en','que',
  'segun','según','criterios','medico','médico','administrativos',
]);

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizeKey(name: string): string {
  return stripAccents(name.toLowerCase())
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isColumnHeaderRow(row: unknown[]): boolean {
  for (let idx = 1; idx <= 3; idx++) {
    const v = row[idx];
    if (v === null || v === undefined) continue;
    const token = String(v).trim().toLowerCase();
    if (COLUMN_HEADER_TOKENS.has(token)) return true;
  }
  return false;
}

function extractKeywords(notes: string): string[] {
  return stripAccents(notes.toLowerCase())
    .split(/[\s;,|/.()+:]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4 && !KEYWORD_STOPWORDS.has(s) && !/^\d+$/.test(s));
}

@Injectable()
export class CanastaImportService {
  constructor(
    @InjectRepository(CanastaCategory) private readonly categoriesRepo: Repository<CanastaCategory>,
    @InjectRepository(Product) private readonly productsRepo: Repository<Product>,
    private readonly dataSource: DataSource,
  ) {}

  async importFromXlsx(buffer: Buffer, sheetName = 'CURACIONES'): Promise<CanastaImportResult> {
    // Lazy import to avoid bundle bloat at startup
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[sheetName] ?? wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new BadRequestException(`Sheet "${sheetName}" not found in workbook`);

    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    const parsed: ParsedCategory[] = [];
    const errors: { row: number; reason: string }[] = [];
    let currentSection: CanastaSection = CanastaSection.INSUMOS;
    let displayOrder = 1;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const colA = String(row[0] ?? '').trim();
      if (!colA) continue;

      // Skip column-header rows (cols B/C/D contain literal Si/Sí/No/Observaciones)
      if (isColumnHeaderRow(row)) continue;

      // Section detection
      if (SECTION_HEADER_AYUDAS.test(colA)) {
        currentSection = CanastaSection.AYUDAS_TECNICAS;
        continue;
      }
      if (SECTION_HEADER_INSUMOS.test(colA)) {
        currentSection = CanastaSection.INSUMOS;
        continue;
      }

      // Skip header-like rows that look like ANEXO titles or column headers
      if (/anexo|categoría|item|cantidad|s[ií]\b/i.test(colA) && colA.length < 50 && !/^[A-Za-zÁÉÍÓÚÑáéíóúñ]+\s+(de|para|con)/i.test(colA)) {
        continue;
      }

      const isOptional = /\(opcional\)/i.test(colA);
      const cleanName = colA.replace(/\s*\(opcional\)\s*/gi, '').trim();
      if (!cleanName) {
        errors.push({ row: i + 1, reason: 'Empty category name after cleanup' });
        continue;
      }

      const notes = String(row[3] ?? '').trim() || null;

      parsed.push({
        rowIndex: i + 1,
        name: cleanName,
        section: currentSection,
        displayOrder,
        isOptional,
        notes,
      });
      displayOrder++;
    }

    if (parsed.length === 0) {
      throw new BadRequestException('No category rows parsed from sheet');
    }

    return this.dataSource.transaction(async (manager) => {
      const categoriesRepo = manager.getRepository(CanastaCategory);
      const productsRepo = manager.getRepository(Product);

      // Load all current categories (active or archived)
      const existing = await categoriesRepo.find();
      const byKey = new Map(existing.filter((c) => c.sourceKey).map((c) => [c.sourceKey!, c]));
      const byNormalizedName = new Map(
        existing.filter((c) => !c.sourceKey).map((c) => [normalizeKey(c.name), c]),
      );

      let categoriesCreated = 0;
      let categoriesUpdated = 0;
      let productsAutoMatched = 0;
      let productsManualPreserved = 0;

      const seenIds = new Set<number>();

      for (const p of parsed) {
        const key = normalizeKey(p.name);
        let entity = byKey.get(key) ?? byNormalizedName.get(key) ?? null;

        if (entity) {
          entity.notes = p.notes;
          entity.displayOrder = p.displayOrder;
          entity.isOptional = p.isOptional;
          entity.section = p.section;
          entity.archived = false;
          if (!entity.sourceKey) entity.sourceKey = key;
          await categoriesRepo.save(entity);
          categoriesUpdated++;
        } else {
          entity = categoriesRepo.create({
            name: p.name,
            section: p.section,
            displayOrder: p.displayOrder,
            isOptional: p.isOptional,
            notes: p.notes,
            archived: false,
            sourceKey: key,
          });
          await categoriesRepo.save(entity);
          categoriesCreated++;
        }

        seenIds.add(entity.id);

        // Auto-mapping by category notes
        if (p.notes) {
          const products = await productsRepo.find({ relations: ['codes'] });
          const matchedIds = new Set<number>();

          // Extract AVIS code candidates from notes (digits 2-5)
          const codeMatches = (p.notes.match(/\b\d{2,5}\b/g) ?? []);
          // Tokenize on whitespace + punctuation, drop stopwords + pure-digit tokens, strip accents
          const keywords = extractKeywords(p.notes);

          for (const product of products) {
            const codes = (product.codes ?? []).map((c: { code: string }) => c.code);
            if (codeMatches.some((m) => codes.includes(m))) {
              matchedIds.add(product.id);
              continue;
            }
            const productNameLower = stripAccents(product.name.toLowerCase());
            if (keywords.some((kw) => productNameLower.includes(kw))) {
              matchedIds.add(product.id);
            }
          }

          // Preserve manual associations
          const existingAssocs: { productId: number; auto_mapped: boolean }[] = await manager.query(
            `SELECT "productId", "auto_mapped" FROM canasta_category_products WHERE "canastaCategoryId" = $1`,
            [entity.id],
          );
          const manualIds = new Set(existingAssocs.filter((a) => !a.auto_mapped).map((a) => a.productId));

          // Remove all current auto_mapped ones
          await manager.query(
            `DELETE FROM canasta_category_products WHERE "canastaCategoryId" = $1 AND "auto_mapped" = TRUE`,
            [entity.id],
          );

          // Insert new auto_mapped (those not already manual)
          const newAuto = [...matchedIds].filter((id) => !manualIds.has(id));
          if (newAuto.length) {
            const placeholders = newAuto.map((_, idx) => `($1, $${idx + 2}, TRUE)`).join(', ');
            await manager.query(
              `INSERT INTO canasta_category_products ("canastaCategoryId", "productId", "auto_mapped") VALUES ${placeholders}
               ON CONFLICT ("canastaCategoryId", "productId") DO NOTHING`,
              [entity.id, ...newAuto],
            );
            productsAutoMatched += newAuto.length;
          }
          productsManualPreserved += manualIds.size;
        }
      }

      // Archive categories with sourceKey not in current import (only if they were source-imported)
      const toArchive = existing.filter(
        (c) => c.sourceKey && !seenIds.has(c.id) && !c.archived,
      );
      for (const c of toArchive) {
        c.archived = true;
        await categoriesRepo.save(c);
      }

      return {
        categoriesCreated,
        categoriesUpdated,
        categoriesArchived: toArchive.length,
        productsAutoMatched,
        productsManualPreserved,
        errors,
      };
    });
  }
}
