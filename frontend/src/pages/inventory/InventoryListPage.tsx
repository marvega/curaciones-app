import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { listLots } from '../../services/api';
import type { Lot } from '../../types';

export default function InventoryListPage() {
  const [searchParams] = useSearchParams();
  const expiringFilter = searchParams.get('expiringFilter');
  const [lots, setLots] = useState<Lot[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    const params: { establishmentId: number; active: boolean; expiringInDays?: number } = { establishmentId: 1, active: true };
    if (expiringFilter) params.expiringInDays = parseInt(expiringFilter, 10);
    listLots(params)
      .then(setLots)
      .finally(() => setLoading(false));
  }, [expiringFilter]);

  const filtered = useMemo(
    () => lots.filter((l) => !search || (l.product?.name ?? '').toLowerCase().includes(search.toLowerCase())),
    [lots, search],
  );

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <input
          className="border rounded px-3 py-2 w-full max-w-md dark:bg-slate-800 dark:border-slate-700"
          placeholder="Buscar producto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button onClick={() => navigate('/inventory/reception')} className="px-4 py-2 bg-blue-600 text-white rounded">
          + Recepción
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="text-left p-3">Producto</th>
              <th className="text-left p-3">Lote</th>
              <th className="text-left p-3">Vence</th>
              <th className="text-right p-3">Stock</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td className="p-3" colSpan={4}>Cargando...</td></tr>}
            {!loading && filtered.map((lot) => {
              const expired = lot.expiresAt && lot.expiresAt < today;
              const expiringSoon = lot.expiresAt && !expired && lot.daysToExpiry != null && lot.daysToExpiry <= 30;
              const rowCls = expired ? 'bg-red-100 dark:bg-red-900/30' : expiringSoon ? 'bg-red-50 dark:bg-red-900/15' : '';
              return (
                <tr key={lot.id} className={`border-t dark:border-slate-700 ${rowCls}`}>
                  <td className="p-3">{lot.product?.name ?? `Producto ${lot.productId}`}</td>
                  <td className="p-3">{lot.lotCode ?? '—'}</td>
                  <td className="p-3">
                    {lot.expiresAt ?? '—'}
                    {expired && <span className="ml-2 text-xs bg-red-600 text-white rounded px-2 py-0.5">VENCIDO</span>}
                    {expiringSoon && <span className="ml-2 text-xs bg-red-200 text-red-800 rounded px-2 py-0.5">Vence en {lot.daysToExpiry}d</span>}
                  </td>
                  <td className="p-3 text-right font-mono">{lot.currentStock ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
