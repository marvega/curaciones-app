import { useEffect, useState } from 'react';
import { listProducts, receiveLot } from '../../services/api';
import type { Product } from '../../types';
import {
  Button,
  Card,
  CodePill,
  Input,
  PageHeader,
  Textarea,
} from '../../components/ui';
import { formatCode, toSentenceCase } from '../../formatters/text';
import { useToast } from '../../contexts/ToastContext';

function primaryCode(p: Product): string {
  if (!p.codes || p.codes.length === 0) return '—';
  return formatCode(p.codes[0].code);
}

export default function ReceptionPage() {
  const { showSuccess, showError } = useToast();
  const [productSearch, setProductSearch] = useState('');
  const [matches, setMatches] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [lotCode, setLotCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10));
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (productSearch.length < 2) {
      setMatches([]);
      return;
    }
    const t = setTimeout(() => {
      listProducts({ search: productSearch, limit: 10 }).then((r) => setMatches(r.data));
    }, 300);
    return () => clearTimeout(t);
  }, [productSearch]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    try {
      const lot = await receiveLot({
        productId: selected.id,
        establishmentId: 1,
        lotCode: lotCode || undefined,
        expiresAt: expiresAt || undefined,
        receivedAt,
        quantity,
        notes: notes || undefined,
      });
      showSuccess(
        `Lote ${lot.lotCode ?? lot.id} registrado: ${quantity} ${selected.packaging} de ${toSentenceCase(selected.name)}`,
      );
      setSelected(null);
      setProductSearch('');
      setLotCode('');
      setExpiresAt('');
      setQuantity(1);
      setNotes('');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Error al registrar lote');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader title="Recepción de lotes" subtitle="Registra la entrada de productos al inventario" />

      <Card>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Producto
            </label>
            {selected ? (
              <div className="flex items-center justify-between border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 bg-white dark:bg-slate-800">
                <div className="flex items-center gap-2">
                  <CodePill>{primaryCode(selected)}</CodePill>
                  <span className="text-sm text-slate-800 dark:text-slate-200">
                    {toSentenceCase(selected.name)}
                  </span>
                </div>
                <Button type="button" variant="link" size="sm" onClick={() => setSelected(null)}>
                  Cambiar
                </Button>
              </div>
            ) : (
              <>
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Buscar por nombre o código AVIS…"
                  aria-label="Buscar producto"
                />
                {matches.length > 0 && (
                  <ul className="border border-slate-200 dark:border-slate-700 rounded-lg mt-1 max-h-60 overflow-y-auto bg-white dark:bg-slate-800">
                    {matches.map((p) => (
                      <li
                        key={p.id}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                        onClick={() => {
                          setSelected(p);
                          setMatches([]);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <CodePill>{primaryCode(p)}</CodePill>
                          <span className="text-sm text-slate-800 dark:text-slate-200">
                            {toSentenceCase(p.name)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Código de lote"
              value={lotCode}
              onChange={(e) => setLotCode(e.target.value)}
              placeholder="L23B07"
            />
            <Input
              label="Vence"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <Input
              label="Recibido"
              type="date"
              required
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
            />
            <Input
              label="Cantidad"
              type="number"
              min={1}
              required
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
            />
          </div>

          <Textarea
            label="Notas"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />

          <div className="flex justify-end">
            <Button type="submit" disabled={!selected} loading={submitting}>
              Registrar lote
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
