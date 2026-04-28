import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Plus, Package } from 'lucide-react';
import { listLots } from '../../services/api';
import type { Lot } from '../../types';
import {
  Button,
  Card,
  CodePill,
  DataTable,
  EmptyState,
  PageHeader,
  SearchInput,
  Tag,
} from '../../components/ui';
import { formatCode, toSentenceCase } from '../../formatters/text';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

function primaryCode(p: { codes?: { code: string }[] } | undefined): string {
  if (!p || !p.codes || p.codes.length === 0) return '—';
  return formatCode(p.codes[0].code);
}

export default function InventoryListPage() {
  const [searchParams] = useSearchParams();
  const expiringFilter = searchParams.get('expiringFilter');
  const [lots, setLots] = useState<Lot[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    const params: { establishmentId: number; active: boolean; expiringInDays?: number } = {
      establishmentId: 1,
      active: true,
    };
    if (expiringFilter) params.expiringInDays = parseInt(expiringFilter, 10);
    listLots(params)
      .then(setLots)
      .finally(() => setLoading(false));
  }, [expiringFilter]);

  const filtered = useMemo(
    () =>
      lots.filter(
        (l) => !debouncedSearch || (l.product?.name ?? '').toLowerCase().includes(debouncedSearch.toLowerCase()),
      ),
    [lots, debouncedSearch],
  );

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventario"
        subtitle={
          expiringFilter
            ? `Lotes activos por vencer (≤ ${expiringFilter} días)`
            : `${lots.length} lote${lots.length === 1 ? '' : 's'} activos`
        }
        actions={
          <Button onClick={() => navigate('/inventory/reception')} leftIcon={<Plus className="w-4 h-4" />}>
            Recepción
          </Button>
        }
      />

      <Card padding="none">
        <div className="p-5 pb-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar producto…"
            aria-label="Buscar producto"
          />
        </div>
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
              width: 220,
              render: (l) => {
                const expired = l.expiresAt && l.expiresAt < today;
                const expiringSoon =
                  l.expiresAt && !expired && l.daysToExpiry != null && l.daysToExpiry <= 30;
                return (
                  <span className="inline-flex items-center gap-2">
                    <span>{l.expiresAt ?? '—'}</span>
                    {expired && <Tag variant="red">Vencido</Tag>}
                    {expiringSoon && (
                      <Tag variant="red">Vence en {l.daysToExpiry}d</Tag>
                    )}
                  </span>
                );
              },
            },
            {
              key: 'stock',
              label: 'Stock',
              width: 100,
              align: 'right',
              render: (l) => <span className="font-mono">{l.currentStock ?? 0}</span>,
            },
          ]}
          data={filtered}
          loading={loading}
          emptyState={
            <EmptyState
              icon={Package}
              title="Sin lotes activos"
              description={search ? 'No se encontraron coincidencias' : 'Registra una recepción para ver lotes aquí'}
            />
          }
          keyExtractor={(l) => l.id}
        />
      </Card>
    </div>
  );
}
