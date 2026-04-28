import { Injectable } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductType } from './product.entity';
import { CodeSystem } from './product-code.entity';

export interface ImportResult {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
}

const TYPE_MAP: Record<string, ProductType> = {
  INSUMO: ProductType.INSUMO,
  MEDICAMENTO: ProductType.MEDICAMENTO,
  ORTESIS: ProductType.ORTESIS,
};

@Injectable()
export class ExcelImportService {
  constructor(private readonly products: ProductsService) {}

  async import(buffer: Buffer, sheetName = 'PRODUCTOS AVIS'): Promise<ImportResult> {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[sheetName];
    if (!ws) throw new Error(`Sheet "${sheetName}" not found`);

    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null });
    const result: ImportResult = { created: 0, updated: 0, unchanged: 0, skipped: 0, errors: [] };

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const [rawType, rawPackaging, rawCode, rawName] = row;
      if (rawCode == null || rawName == null) {
        result.skipped++;
        continue;
      }
      const code = String(rawCode).trim();
      const name = String(rawName).trim();
      const packaging = String(rawPackaging ?? 'UNIDAD').trim();
      const typeKey = String(rawType ?? 'INSUMO').trim().toUpperCase();
      const type = TYPE_MAP[typeKey] ?? ProductType.OTRO;

      try {
        const r = await this.products.upsertByCode(
          { codeSystem: CodeSystem.AVIS_QUILPUE, code },
          { name, type, packaging, tracksExpiration: type !== ProductType.ORTESIS },
        );
        if (r.action === 'created') result.created++;
        else if (r.action === 'updated') result.updated++;
        else result.unchanged++;
      } catch (e: any) {
        result.errors.push({ row: i + 1, reason: e?.message ?? String(e) });
      }
    }
    return result;
  }
}
