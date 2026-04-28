import { useEffect, useState } from 'react';
import { listProducts, importProductsExcel } from '../../services/api';
import type { Product, ImportResult } from '../../types';

export default function CatalogAdminPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    listProducts({ search, limit: 100 }).then((r) => setProducts(r.data));
  }, [search]);

  async function onImport(file: File) {
    setImporting(true);
    try {
      const r = await importProductsExcel(file, 'PRODUCTOS AVIS');
      setImportResult(r);
      const refreshed = await listProducts({ limit: 100 });
      setProducts(refreshed.data);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 rounded shadow p-4">
        <h2 className="font-semibold mb-2">Importar catálogo AVIS</h2>
        <input
          type="file"
          accept=".xlsx"
          disabled={importing}
          onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])}
        />
        {importing && <p className="text-sm text-slate-500 mt-2">Importando...</p>}
        {importResult && (
          <div className="mt-3 text-sm">
            <p>Creados: {importResult.created} · Actualizados: {importResult.updated} · Sin cambios: {importResult.unchanged} · Saltados: {importResult.skipped}</p>
            {importResult.errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-red-600">{importResult.errors.length} errores</summary>
                <ul className="text-xs mt-1">
                  {importResult.errors.slice(0, 50).map((e, i) => <li key={i}>Fila {e.row}: {e.reason}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      <input
        className="border rounded px-3 py-2 w-full max-w-md dark:bg-slate-800 dark:border-slate-700"
        placeholder="Buscar producto..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="bg-white dark:bg-slate-900 rounded shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="text-left p-3">Nombre</th>
              <th className="text-left p-3">Tipo</th>
              <th className="text-left p-3">Empaque</th>
              <th className="text-left p-3">Códigos</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t dark:border-slate-700">
                <td className="p-3">{p.name}</td>
                <td className="p-3">{p.type}</td>
                <td className="p-3">{p.packaging}</td>
                <td className="p-3 text-xs">{p.codes.map((c) => `${c.codeSystem}:${c.code}`).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
