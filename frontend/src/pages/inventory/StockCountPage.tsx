import { useEffect, useState, useRef } from 'react';
import { listLots, openStockCount, patchStockCountEntry, closeStockCount } from '../../services/api';
import type { Lot, StockCount } from '../../types';
import { useConfirm } from '../../contexts/ConfirmContext';
import {
  Button,
  Card,
  CodePill,
  DataTable,
  PageHeader,
  Tag,
} from '../../components/ui';
import { formatCode, toSentenceCase } from '../../formatters/text';

function primaryCode(p: { codes?: { code: string }[] } | undefined): string {
  if (!p || !p.codes || p.codes.length === 0) return '—';
  return formatCode(p.codes[0].code);
}

interface ObservedInputProps {
  lotId: number;
  value: number;
  saving: boolean;
  disabled: boolean;
  onChange: (value: number) => void;
}

function ObservedInput({ value, saving, disabled, onChange }: ObservedInputProps) {
  return (
    <span className="inline-flex items-center gap-2 justify-end">
      <input
        type="number"
        min={0}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        aria-label="Cantidad observada"
        className="w-24 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 disabled:opacity-50"
      />
      {saving && <span className="text-xs text-slate-500">guardando…</span>}
    </span>
  );
}

export default function StockCountPage() {
  const confirm = useConfirm();
  const [count, setCount] = useState<StockCount | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [values, setValues] = useState<Record<number, number>>({});
  const [savingLotIds, setSavingLotIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    (async () => {
      try {
        const sc = await openStockCount({ establishmentId: 1 });
        setCount(sc);
        const ls = await listLots({ establishmentId: 1, active: true });
        setLots(ls);
        const initial: Record<number, number> = {};
        for (const l of ls) initial[l.id] = l.currentStock ?? 0;
        setValues(initial);
      } finally {
        setLoading(false);
      }
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

  if (loading || !count) {
    return (
      <div className="space-y-6">
        <PageHeader title="Conteo de inventario" subtitle="Cargando…" />
      </div>
    );
  }

  const closed = count.status === 'CLOSED';

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Conteo del ${count.countDate}`}
        subtitle={
          <span className="inline-flex items-center gap-2">
            Estado:{' '}
            <Tag variant={closed ? 'gray' : 'blue'}>
              {closed ? 'Cerrado' : 'Borrador'}
            </Tag>
          </span>
        }
        actions={
          !closed ? (
            <Button variant="secondary" onClick={onClose}>
              Cerrar conteo
            </Button>
          ) : undefined
        }
      />

      <Card padding="none">
        <DataTable<Lot>
          columns={[
            {
              key: 'product',
              label: 'Producto',
              render: (l) => (
                <div className="flex items-center gap-2">
                  <CodePill>{primaryCode(l.product)}</CodePill>
                  <span>
                    {l.product?.name ? toSentenceCase(l.product.name) : `Producto ${l.productId}`}
                  </span>
                </div>
              ),
            },
            {
              key: 'lot',
              label: 'Lote',
              width: 140,
              render: (l) => l.lotCode ?? '—',
            },
            {
              key: 'expires',
              label: 'Vence',
              width: 130,
              render: (l) => l.expiresAt ?? '—',
            },
            {
              key: 'derived',
              label: 'Stock derivado',
              width: 130,
              align: 'right',
              render: (l) => (
                <span className="font-mono">{l.currentStock ?? 0}</span>
              ),
            },
            {
              key: 'observed',
              label: 'Cantidad observada',
              width: 200,
              align: 'right',
              render: (l) => (
                <ObservedInput
                  lotId={l.id}
                  value={values[l.id] ?? 0}
                  saving={savingLotIds.has(l.id)}
                  disabled={closed}
                  onChange={(v) => onChange(l.id, v)}
                />
              ),
            },
          ]}
          data={lots}
          keyExtractor={(l) => l.id}
        />
      </Card>
    </div>
  );
}
