import * as XLSX from 'xlsx';
import { ExcelImportService } from './excel-import.service';
import { ProductsService } from './products.service';
import { ProductType } from './product.entity';
import { CodeSystem } from './product-code.entity';

function buildXlsxBuffer(rows: any[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'PRODUCTOS AVIS');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('ExcelImportService', () => {
  let service: ExcelImportService;
  let products: jest.Mocked<Pick<ProductsService, 'upsertByCode'>>;

  beforeEach(() => {
    products = { upsertByCode: jest.fn() } as any;
    service = new ExcelImportService(products as unknown as ProductsService);
  });

  it('imports rows from PRODUCTOS AVIS sheet', async () => {
    const buf = buildXlsxBuffer([
      ['TIPO', 'CÓMO PEDIR', 'CODIGO AVIS', 'ARTICULO'],
      ['INSUMO', 'UNIDAD', 1778, 'APÓSITO RINGER CON PHMB 10X10 CM UNIDAD'],
      ['MEDICAMENTO', 'UNIDAD', 27, 'ACIDO TRANEXAMICO 1000 MG'],
    ]);
    products.upsertByCode
      .mockResolvedValueOnce({ action: 'created' } as any)
      .mockResolvedValueOnce({ action: 'created' } as any);

    const result = await service.import(buf, 'PRODUCTOS AVIS');
    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(products.upsertByCode).toHaveBeenCalledWith(
      { codeSystem: CodeSystem.AVIS_QUILPUE, code: '1778' },
      expect.objectContaining({ name: 'APÓSITO RINGER CON PHMB 10X10 CM UNIDAD', type: ProductType.INSUMO, packaging: 'UNIDAD' }),
    );
  });

  it('skips rows with missing code or name', async () => {
    const buf = buildXlsxBuffer([
      ['TIPO', 'CÓMO PEDIR', 'CODIGO AVIS', 'ARTICULO'],
      ['INSUMO', 'UNIDAD', null, 'No code'],
      ['INSUMO', 'UNIDAD', 100, null],
    ]);
    const result = await service.import(buf, 'PRODUCTOS AVIS');
    expect(result.skipped).toBe(2);
    expect(products.upsertByCode).not.toHaveBeenCalled();
  });

  it('counts updated and unchanged separately', async () => {
    const buf = buildXlsxBuffer([
      ['TIPO', 'CÓMO PEDIR', 'CODIGO AVIS', 'ARTICULO'],
      ['INSUMO', 'UNIDAD', 1, 'A'],
      ['INSUMO', 'UNIDAD', 2, 'B'],
      ['INSUMO', 'UNIDAD', 3, 'C'],
    ]);
    products.upsertByCode
      .mockResolvedValueOnce({ action: 'created' } as any)
      .mockResolvedValueOnce({ action: 'updated' } as any)
      .mockResolvedValueOnce({ action: 'unchanged' } as any);
    const result = await service.import(buf, 'PRODUCTOS AVIS');
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.unchanged).toBe(1);
  });

  it('captures per-row errors without aborting', async () => {
    const buf = buildXlsxBuffer([
      ['TIPO', 'CÓMO PEDIR', 'CODIGO AVIS', 'ARTICULO'],
      ['INSUMO', 'UNIDAD', 1, 'A'],
      ['INSUMO', 'UNIDAD', 2, 'B'],
    ]);
    products.upsertByCode
      .mockResolvedValueOnce({ action: 'created' } as any)
      .mockRejectedValueOnce(new Error('boom'));
    const result = await service.import(buf, 'PRODUCTOS AVIS');
    expect(result.created).toBe(1);
    expect(result.errors).toEqual([{ row: 3, reason: 'boom' }]);
  });
});
