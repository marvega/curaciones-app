import { useEffect, useState, useRef } from 'react';
import { listLots, openStockCount, patchStockCountEntry, closeStockCount } from '../../services/api';
import type { Lot, StockCount } from '../../types';
import { useConfirm } from '../../contexts/ConfirmContext';

export default function StockCountPage() {
  const confirm = useConfirm();
  const [count, setCount] = useState<StockCount | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [values, setValues] = useState<Record<number, number>>({});
  const [savingLotIds, setSavingLotIds] = useState<Set<number>>(new Set());
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    (async () => {
      const sc = await openStockCount({ establishmentId: 1 });
      setCount(sc);
      const ls = await listLots({ establishmentId: 1, active: true });
      setLots(ls);
      const initial: Record<number, number> = {};
      for (const l of ls) initial[l.id] = l.currentStock ?? 0;
      setValues(initial);
    })();
  }, []);

  function onChange(lotId: number, value: number) {
    setValues((prev) => ({ ...prev, [lotId]: value }));
    if (debounceTimers.current[lotId]) clearTimeout(debounceTimers.current[lotId]);
    debounceTimers.current[lotId] = setTimeout(async () => {
      if (!count) return;
      setSavingLotIds((prev) => new Set([...prev, lotId]));
      try {
        await patchStockCountEntry(count.id, lotId, { absoluteValue: value });
      } finally {
        setSavingLotIds((prev) => {
          const n = new Set(prev);
          n.delete(lotId);
          return n;
        });
      }
    }, 600);
  }

  async function onClose() {
    if (!count) return;
    const ok = await confirm({
      title: 'Cerrar conteo',
      message: `Vas a cerrar el conteo del ${count.countDate}. Después no podrás editar las cantidades.`,
      confirmText: 'Cerrar conteo',
      variant: 'warning',
    });
    if (!ok) return;
    const updated = await closeStockCount(count.id);
    setCount(updated);
  }

  if (!count) return <div>Cargando...</div>;

  const closed = count.status === 'CLOSED';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Conteo del {count.countDate}</h2>
          <p className="text-sm text-slate-500">Estado: {count.status}</p>
        </div>
        {!closed && (
          <button onClick={onClose} className="px-4 py-2 bg-amber-600 text-white rounded">
            Cerrar conteo
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="text-left p-3">Producto</th>
              <th className="text-left p-3">Lote</th>
              <th className="text-left p-3">Vence</th>
              <th className="text-right p-3">Stock derivado</th>
              <th className="text-right p-3">Cantidad observada</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((l) => (
              <tr key={l.id} className="border-t dark:border-slate-700">
                <td className="p-3">{l.product?.name ?? `Producto ${l.productId}`}</td>
                <td className="p-3">{l.lotCode ?? '—'}</td>
                <td className="p-3">{l.expiresAt ?? '—'}</td>
                <td className="p-3 text-right font-mono">{l.currentStock ?? 0}</td>
                <td className="p-3 text-right">
                  <input
                    type="number"
                    min={0}
                    disabled={closed}
                    value={values[l.id] ?? 0}
                    onChange={(e) => onChange(l.id, parseInt(e.target.value, 10) || 0)}
                    className="w-24 border rounded px-2 py-1 text-right dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50"
                  />
                  {savingLotIds.has(l.id) && <span className="ml-2 text-xs text-slate-500">guardando...</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
