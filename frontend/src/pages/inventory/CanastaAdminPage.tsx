import { useEffect, useState } from 'react';
import { listCanasta, replaceCanastaProducts, listProducts } from '../../services/api';
import type { CanastaCategory, Product } from '../../types';

export default function CanastaAdminPage() {
  const [categories, setCategories] = useState<CanastaCategory[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    listCanasta().then(setCategories);
    listProducts({ limit: 5000 }).then((r) => setAllProducts(r.data));
  }, []);

  function startEdit(cat: CanastaCategory) {
    setEditing(cat.id);
    setSelectedIds(new Set(cat.products.map((p) => p.id)));
  }

  async function save() {
    if (editing == null) return;
    await replaceCanastaProducts(editing, [...selectedIds]);
    const refreshed = await listCanasta();
    setCategories(refreshed);
    setEditing(null);
  }

  return (
    <div className="space-y-4">
      {/* Replaced by import flow in Plan C */}

      {categories.map((cat) => (
        <div key={cat.id} className="bg-white dark:bg-slate-900 rounded shadow p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{cat.name} <span className="text-xs text-slate-500">({cat.section})</span></h3>
            <button onClick={() => editing === cat.id ? setEditing(null) : startEdit(cat)} className="text-sm text-blue-600">
              {editing === cat.id ? 'Cancelar' : 'Editar productos'}
            </button>
          </div>
          {cat.notes && <p className="text-xs text-slate-500 mt-1">{cat.notes}</p>}

          {editing === cat.id ? (
            <>
              <div className="max-h-80 overflow-y-auto mt-3 border rounded dark:border-slate-700">
                {allProducts.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={(e) => {
                        const next = new Set(selectedIds);
                        if (e.target.checked) next.add(p.id);
                        else next.delete(p.id);
                        setSelectedIds(next);
                      }}
                    />
                    {p.name}
                    <span className="text-xs text-slate-400 ml-auto">{p.codes.map((c) => c.code).join(', ')}</span>
                  </label>
                ))}
              </div>
              <div className="flex justify-end mt-3">
                <button onClick={save} className="px-3 py-1.5 bg-green-600 text-white rounded text-sm">Guardar</button>
              </div>
            </>
          ) : (
            <ul className="mt-2 text-sm">
              {cat.products.length === 0 && <li className="text-slate-400">Sin productos asociados</li>}
              {cat.products.map((p) => <li key={p.id}>· {p.name}</li>)}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
