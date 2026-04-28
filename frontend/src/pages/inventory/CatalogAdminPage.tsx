import { useEffect, useMemo, useState } from 'react';
import { Package } from 'lucide-react';
import { listProducts, importProductsExcel } from '../../services/api';
import type { Product, ImportResult } from '../../types';
import {
  Card,
  CodePill,
  DataTable,
  EmptyState,
  FileUpload,
  PageHeader,
  SearchInput,
  Tag,
} from '../../components/ui';
import { formatCode, toSentenceCase } from '../../formatters/text';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

function primaryCode(p: Product): string {
  if (!p.codes || p.codes.length === 0) return '—';
  return formatCode(p.codes[0].code);
}

export default function CatalogAdminPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [search, setSearch] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    setLoading(true);
    listProducts({ search: debouncedSearch, limit: 100 })
      .then((r) => {
        setProducts(r.data);
        setTotal(r.total);
      })
      .finally(() => setLoading(false));
  }, [debouncedSearch]);

  async function onImport(file: File) {
    const r = await importProductsExcel(file, 'PRODUCTOS AVIS');
    setImportResult(r);
    const refreshed = await listProducts({ limit: 100 });
    setProducts(refreshed.data);
    setTotal(refreshed.total);
  }

  const subtitle = useMemo(
    () => (total > 0 ? `${total} producto${total === 1 ? '' : 's'}` : 'Sin productos'),
    [total],
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Catálogo de productos" subtitle={subtitle} />

      <Card>
        <FileUpload
          accept=".xlsx"
          label="Importar catálogo AVIS"
          helperText='Excel .xlsx, hoja "PRODUCTOS AVIS"'
          onUpload={onImport}
          result={importResult ?? undefined}
        />
      </Card>

      <Card padding="none">
        <div className="p-5 pb-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar producto por nombre o código…"
            aria-label="Buscar producto"
          />
        </div>
        <DataTable<Product>
          columns={[
            {
              key: 'code',
              label: 'Código',
              width: 100,
              render: (p) => <CodePill>{primaryCode(p)}</CodePill>,
            },
            {
              key: 'name',
              label: 'Nombre',
              render: (p) => toSentenceCase(p.name),
            },
            {
              key: 'type',
              label: 'Tipo',
              width: 140,
              render: (p) => <Tag>{toSentenceCase(p.type)}</Tag>,
            },
            {
              key: 'packaging',
              label: 'Empaque',
              width: 120,
              render: (p) => <Tag>{toSentenceCase(p.packaging)}</Tag>,
            },
          ]}
          data={products}
          loading={loading}
          emptyState={
            <EmptyState
              icon={Package}
              title="Sin productos"
              description="Sube el catálogo AVIS para empezar"
            />
          }
          keyExtractor={(p) => p.id}
        />
      </Card>
    </div>
  );
}
