import { useState, useEffect } from 'react';
import { listProducts, receiveLot } from '../../services/api';
import type { Product } from '../../types';

export default function ReceptionPage() {
  const [productSearch, setProductSearch] = useState('');
  const [matches, setMatches] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [lotCode, setLotCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10));
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (productSearch.length < 2) { setMatches([]); return; }
    const t = setTimeout(() => {
      listProducts({ search: productSearch, limit: 10 }).then((r) => setMatches(r.data));
    }, 300);
    return () => clearTimeout(t);
  }, [productSearch]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const lot = await receiveLot({
      productId: selected.id,
      establishmentId: 1,
      lotCode: lotCode || undefined,
      expiresAt: expiresAt || undefined,
      receivedAt,
      quantity,
      notes: notes || undefined,
    });
    setToast(`Lote ${lot.lotCode ?? lot.id} registrado: ${quantity} ${selected.packaging} de ${selected.name}`);
    setSelected(null);
    setProductSearch('');
    setLotCode('');
    setExpiresAt('');
    setQuantity(1);
    setNotes('');
    setTimeout(() => setToast(null), 4000);
  }

  return (
    <div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 rounded shadow p-6">
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Producto</span>
          {selected ? (
            <div className="flex items-center justify-between border rounded px-3 py-2 mt-1 dark:bg-slate-800 dark:border-slate-700">
              <span>{selected.name}</span>
              <button type="button" onClick={() => setSelected(null)} className="text-sm text-blue-600">Cambiar</button>
            </div>
          ) : (
            <>
              <input
                className="w-full border rounded px-3 py-2 mt-1 dark:bg-slate-800 dark:border-slate-700"
                placeholder="Buscar por nombre o código AVIS..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
              {matches.length > 0 && (
                <ul className="border rounded mt-1 max-h-60 overflow-y-auto dark:bg-slate-800 dark:border-slate-700">
                  {matches.map((p) => (
                    <li key={p.id} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer" onClick={() => { setSelected(p); setMatches([]); }}>
                      <div className="text-sm">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.codes.map((c) => `${c.codeSystem}: ${c.code}`).join(' · ')}</div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Código de lote</span>
            <input className="w-full border rounded px-3 py-2 mt-1 dark:bg-slate-800 dark:border-slate-700" value={lotCode} onChange={(e) => setLotCode(e.target.value)} placeholder="L23B07" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Vence</span>
            <input type="date" className="w-full border rounded px-3 py-2 mt-1 dark:bg-slate-800 dark:border-slate-700" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Recibido</span>
            <input type="date" required className="w-full border rounded px-3 py-2 mt-1 dark:bg-slate-800 dark:border-slate-700" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Cantidad</span>
            <input type="number" min={1} required className="w-full border rounded px-3 py-2 mt-1 dark:bg-slate-800 dark:border-slate-700" value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)} />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium">Notas</span>
          <textarea className="w-full border rounded px-3 py-2 mt-1 dark:bg-slate-800 dark:border-slate-700" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        <div className="flex justify-end">
          <button type="submit" disabled={!selected} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">Registrar lote</button>
        </div>
      </form>

      {toast && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded text-green-800 text-sm">{toast}</div>
      )}
    </div>
  );
}
