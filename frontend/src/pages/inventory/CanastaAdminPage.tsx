import { useEffect, useMemo, useState } from 'react';
import { Plus, FolderOpen } from 'lucide-react';
import {
  listCanasta,
  replaceCanastaProducts,
  listProducts,
  importCanastaGuide,
  createCanastaCategory,
  updateCanastaCategory,
  deleteCanastaCategory,
} from '../../services/api';
import type {
  CanastaCategory,
  CanastaImportResult,
  CanastaSection,
  Product,
} from '../../types';
import {
  Button,
  Card,
  Checkbox,
  CodePill,
  DataTable,
  Drawer,
  EmptyState,
  FileUpload,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Tag,
  Textarea,
} from '../../components/ui';
import { formatCode, toSentenceCase } from '../../formatters/text';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';

function primaryCode(p: Product): string {
  if (!p.codes || p.codes.length === 0) return '—';
  return formatCode(p.codes[0].code);
}

interface CategoryFormState {
  id: number | null;
  name: string;
  section: CanastaSection;
  displayOrder: string;
  isOptional: boolean;
  notes: string;
}

const EMPTY_FORM: CategoryFormState = {
  id: null,
  name: '',
  section: 'INSUMOS',
  displayOrder: '0',
  isOptional: false,
  notes: '',
};

const SECTION_OPTIONS = [
  { value: 'INSUMOS', label: 'Insumos' },
  { value: 'AYUDAS_TECNICAS', label: 'Ayudas técnicas' },
];

export default function CanastaAdminPage() {
  const { showSuccess, showError } = useToast();
  const confirm = useConfirm();

  const [categories, setCategories] = useState<CanastaCategory[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [importResult, setImportResult] = useState<CanastaImportResult | null>(null);

  // Drawer (edit products)
  const [editingProductsCat, setEditingProductsCat] = useState<CanastaCategory | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [drawerSearch, setDrawerSearch] = useState('');
  const [savingProducts, setSavingProducts] = useState(false);

  // Modal (edit category fields)
  const [categoryForm, setCategoryForm] = useState<CategoryFormState | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const list = await listCanasta();
      setCategories(list);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    listProducts({ limit: 5000 }).then((r) => setAllProducts(r.data));
  }, []);

  async function onImportGuide(file: File) {
    try {
      const res = await importCanastaGuide(file);
      setImportResult(res);
      await refresh();
      showSuccess(
        `Categorías: ${res.categoriesCreated} creadas, ${res.categoriesUpdated} actualizadas, ` +
          `${res.categoriesArchived} archivadas. Productos auto-asociados: ${res.productsAutoMatched}.`,
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Error al importar archivo guía');
      throw err;
    }
  }

  // -- Drawer (products) --
  function openProductsDrawer(cat: CanastaCategory) {
    setEditingProductsCat(cat);
    setSelectedIds(new Set(cat.products.map((p) => p.id)));
    setDrawerSearch('');
  }
  function closeProductsDrawer() {
    setEditingProductsCat(null);
    setSelectedIds(new Set());
    setDrawerSearch('');
  }
  async function saveProducts() {
    if (!editingProductsCat) return;
    setSavingProducts(true);
    try {
      await replaceCanastaProducts(editingProductsCat.id, [...selectedIds]);
      await refresh();
      showSuccess('Productos actualizados');
      closeProductsDrawer();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Error al guardar productos');
    } finally {
      setSavingProducts(false);
    }
  }

  const filteredDrawerProducts = useMemo(() => {
    if (!drawerSearch.trim()) return allProducts;
    const q = drawerSearch.trim().toLowerCase();
    return allProducts.filter((p) => {
      const name = toSentenceCase(p.name).toLowerCase();
      const codes = p.codes.map((c) => c.code.toLowerCase()).join(' ');
      return name.includes(q) || codes.includes(q);
    });
  }, [allProducts, drawerSearch]);

  // -- Modal (category form) --
  function openNewCategory() {
    setCategoryForm({ ...EMPTY_FORM });
  }
  function openEditCategory(cat: CanastaCategory) {
    setCategoryForm({
      id: cat.id,
      name: cat.name,
      section: cat.section,
      displayOrder: String(cat.displayOrder),
      isOptional: cat.isOptional,
      notes: cat.notes ?? '',
    });
  }
  function closeCategoryModal() {
    setCategoryForm(null);
  }
  async function saveCategory() {
    if (!categoryForm) return;
    if (!categoryForm.name.trim()) {
      showError('El nombre de la categoría es obligatorio');
      return;
    }
    setSavingCategory(true);
    try {
      const payload = {
        name: categoryForm.name.trim(),
        section: categoryForm.section,
        displayOrder: parseInt(categoryForm.displayOrder, 10) || 0,
        isOptional: categoryForm.isOptional,
        notes: categoryForm.notes.trim() || null,
      };
      if (categoryForm.id == null) {
        await createCanastaCategory({
          name: payload.name,
          section: payload.section,
          displayOrder: payload.displayOrder,
          isOptional: payload.isOptional,
          notes: payload.notes ?? undefined,
        });
        showSuccess('Categoría creada');
      } else {
        await updateCanastaCategory(categoryForm.id, payload);
        showSuccess('Categoría actualizada');
      }
      await refresh();
      closeCategoryModal();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Error al guardar categoría');
    } finally {
      setSavingCategory(false);
    }
  }

  async function onDeleteCategory(cat: CanastaCategory) {
    const ok = await confirm({
      title: 'Eliminar categoría',
      message: `¿Eliminar "${cat.name}"? Se quitarán también todas sus asociaciones.`,
      confirmText: 'Eliminar',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await deleteCanastaCategory(cat.id);
      await refresh();
      showSuccess('Categoría eliminada');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Error al eliminar categoría');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Canasta CAPD"
        subtitle={`${categories.length} categoría${categories.length === 1 ? '' : 's'}`}
        actions={
          <Button onClick={openNewCategory} leftIcon={<Plus className="w-4 h-4" />}>
            Nueva categoría
          </Button>
        }
      />

      <Card>
        <FileUpload
          accept=".xlsx"
          label="Importar archivo guía de auditoría"
          helperText="Excel .xlsx con las categorías y observaciones de la auditoría"
          onUpload={onImportGuide}
        />
        {importResult && (
          <div
            className={`mt-3 rounded-lg border px-4 py-3 text-sm ${
              importResult.errors.length > 0
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            <div className="font-medium">
              {importResult.errors.length > 0
                ? 'Importación completada con avisos'
                : 'Importación exitosa'}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="px-2 py-0.5 bg-white rounded text-xs font-medium">
                ✓ {importResult.categoriesCreated} creadas
              </span>
              <span className="px-2 py-0.5 bg-white rounded text-xs font-medium">
                ↻ {importResult.categoriesUpdated} actualizadas
              </span>
              <span className="px-2 py-0.5 bg-white rounded text-xs font-medium">
                ⊘ {importResult.categoriesArchived} archivadas
              </span>
              <span className="px-2 py-0.5 bg-white rounded text-xs font-medium">
                ⊕ {importResult.productsAutoMatched} auto-asociados
              </span>
              <span className="px-2 py-0.5 bg-white rounded text-xs font-medium">
                = {importResult.productsManualPreserved} manuales preservados
              </span>
            </div>
            {importResult.errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium underline">
                  {importResult.errors.length} errores — ver detalle
                </summary>
                <ul className="mt-2 text-xs space-y-0.5">
                  {importResult.errors.slice(0, 50).map((err, i) => (
                    <li key={i}>
                      Fila {err.row}: {err.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </Card>

      <Card padding="none">
        <DataTable<CanastaCategory>
          columns={[
            {
              key: 'displayOrder',
              label: '#',
              width: 50,
              render: (c) => <span className="text-slate-500">{c.displayOrder}</span>,
            },
            {
              key: 'name',
              label: 'Categoría',
              render: (c) => (
                <span className="font-medium text-slate-800 dark:text-slate-200">{c.name}</span>
              ),
            },
            {
              key: 'section',
              label: 'Sección',
              width: 140,
              render: (c) => (
                <Tag>{c.section === 'INSUMOS' ? 'Insumos' : 'Ayudas técnicas'}</Tag>
              ),
            },
            {
              key: 'products',
              label: 'Productos',
              width: 100,
              render: (c) => `${c.products.length}`,
            },
            {
              key: 'notes',
              label: 'Observaciones',
              render: (c) => (
                <span className="text-slate-500 text-xs">{c.notes ?? '—'}</span>
              ),
            },
            {
              key: 'actions',
              label: '',
              width: 320,
              align: 'right',
              render: (c) => (
                <div className="flex gap-1.5 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openProductsDrawer(c)}
                  >
                    Editar productos
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditCategory(c)}
                  >
                    Editar categoría
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteCategory(c)}
                  >
                    Eliminar
                  </Button>
                </div>
              ),
            },
          ]}
          data={categories}
          loading={loading}
          emptyState={
            <EmptyState
              icon={FolderOpen}
              title="Sin categorías"
              description="Sube el archivo guía de auditoría o crea categorías manualmente"
            />
          }
          keyExtractor={(c) => c.id}
        />
      </Card>

      {/* Drawer: editar productos */}
      <Drawer
        open={editingProductsCat !== null}
        onClose={closeProductsDrawer}
        title={editingProductsCat?.name}
        subtitle="Editar productos asociados"
        width={520}
        footer={
          <>
            <Button variant="secondary" onClick={closeProductsDrawer} disabled={savingProducts}>
              Cancelar
            </Button>
            <Button onClick={saveProducts} loading={savingProducts}>
              Guardar cambios
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <SearchInput
            value={drawerSearch}
            onChange={setDrawerSearch}
            placeholder="Buscar producto…"
            aria-label="Buscar producto"
          />
          <div className="text-xs text-slate-500">
            {selectedIds.size} de {filteredDrawerProducts.length} seleccionados
          </div>
          <ul className="space-y-1">
            {filteredDrawerProducts.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Checkbox
                  checked={selectedIds.has(p.id)}
                  onChange={(e) => {
                    const next = new Set(selectedIds);
                    if (e.target.checked) next.add(p.id);
                    else next.delete(p.id);
                    setSelectedIds(next);
                  }}
                  label={toSentenceCase(p.name)}
                  extra={<CodePill>{primaryCode(p)}</CodePill>}
                />
              </li>
            ))}
            {filteredDrawerProducts.length === 0 && (
              <li className="text-sm text-slate-400 py-6 text-center">
                Sin coincidencias
              </li>
            )}
          </ul>
        </div>
      </Drawer>

      {/* Modal: nueva / editar categoría */}
      <Modal
        open={categoryForm !== null}
        onClose={closeCategoryModal}
        title={categoryForm?.id == null ? 'Nueva categoría' : 'Editar categoría'}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={closeCategoryModal} disabled={savingCategory}>
              Cancelar
            </Button>
            <Button onClick={saveCategory} loading={savingCategory}>
              Guardar
            </Button>
          </>
        }
      >
        {categoryForm && (
          <div className="space-y-4">
            <Input
              label="Nombre"
              value={categoryForm.name}
              onChange={(e) =>
                setCategoryForm((prev) => (prev ? { ...prev, name: e.target.value } : prev))
              }
              placeholder="Apósitos bacteriostáticos"
              autoFocus
            />
            <Select
              label="Sección"
              options={SECTION_OPTIONS}
              value={categoryForm.section}
              onChange={(v) =>
                setCategoryForm((prev) =>
                  prev ? { ...prev, section: v as CanastaSection } : prev,
                )
              }
            />
            <Input
              label="Orden"
              type="number"
              value={categoryForm.displayOrder}
              onChange={(e) =>
                setCategoryForm((prev) =>
                  prev ? { ...prev, displayOrder: e.target.value } : prev,
                )
              }
            />
            <Checkbox
              checked={categoryForm.isOptional}
              onChange={(e) =>
                setCategoryForm((prev) =>
                  prev ? { ...prev, isOptional: e.target.checked } : prev,
                )
              }
              label="Es opcional (no parte del mínimo obligatorio)"
            />
            <Textarea
              label="Observaciones"
              value={categoryForm.notes}
              onChange={(e) =>
                setCategoryForm((prev) =>
                  prev ? { ...prev, notes: e.target.value } : prev,
                )
              }
              placeholder="Pistas o códigos AVIS para auto-mapear"
              rows={3}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
