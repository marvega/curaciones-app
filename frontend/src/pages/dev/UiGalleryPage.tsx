import { Mail, Package, Plus, Save } from 'lucide-react';
import { useState } from 'react';
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
  Skeleton,
  Tag,
  Textarea,
} from '../../components/ui';
import { toSentenceCase } from '../../formatters/text';

interface ProductRow { id: number; code: string; name: string; type: string }
const SAMPLE_PRODUCTS: ProductRow[] = [
  { id: 1, code: '19', name: 'ACETAZOLAMIDA 250 MG COMPRIMIDO', type: 'MEDICAMENTO' },
  { id: 2, code: '1408', name: 'APOSITO ALGINATO DE CALCIO 10X10 CM UD', type: 'INSUMO' },
  { id: 3, code: '1778', name: 'APOSITO RINGER CON PHMB 10X10 CM UD', type: 'INSUMO' },
];

export default function UiGalleryPage() {
  const [search, setSearch] = useState('');
  const [textarea, setTextarea] = useState('');
  const [select, setSelect] = useState('');
  const [checked, setChecked] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="space-y-8 p-8 max-w-5xl mx-auto">
      <PageHeader
        title="UI Gallery"
        subtitle="Todos los primitivos en un solo lugar (solo dev)"
        actions={<Button leftIcon={<Plus className="w-4 h-4" />}>Acción</Button>}
      />

      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="success">Success</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="flex gap-2">
          <Button size="sm">Small</Button>
          <Button>Medium</Button>
          <Button size="lg">Large</Button>
          <Button loading leftIcon={<Save className="w-4 h-4" />}>Loading</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Inputs">
        <Input label="Nombre" placeholder="Juan Pérez" />
        <Input label="Email" leftIcon={<Mail className="w-4 h-4" />} />
        <Input label="Inválido" error="RUT inválido" value="123" readOnly />
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar producto…" />
        <Select
          label="Género"
          options={[
            { value: 'femenino', label: 'Femenino' },
            { value: 'masculino', label: 'Masculino' },
          ]}
          value={select}
          onChange={setSelect}
          placeholder="Todos"
        />
        <Textarea label="Notas" value={textarea} onChange={(e) => setTextarea(e.target.value)} />
        <Checkbox label="Acepto los términos" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
      </Section>

      <Section title="Tags & Pills">
        <div className="flex gap-2 flex-wrap">
          <Tag>Gray</Tag>
          <Tag variant="blue">Blue</Tag>
          <Tag variant="green">Green</Tag>
          <Tag variant="yellow">Yellow</Tag>
          <Tag variant="red">Red</Tag>
          <Tag uppercase>Uppercase</Tag>
        </div>
        <div className="flex gap-2 flex-wrap">
          <CodePill>19</CodePill>
          <CodePill>1408</CodePill>
          <CodePill>1778</CodePill>
        </div>
      </Section>

      <Section title="Skeleton">
        <div className="space-y-2 max-w-md">
          <Skeleton width="100%" height={16} />
          <Skeleton width="80%" height={14} />
          <Skeleton width={40} height={40} circle />
        </div>
      </Section>

      <Section title="EmptyState">
        <Card>
          <EmptyState
            icon={Package}
            title="Sin productos"
            description="Sube el catálogo AVIS para empezar"
            action={<Button leftIcon={<Plus className="w-4 h-4" />}>Subir archivo</Button>}
          />
        </Card>
      </Section>

      <Section title="DataTable">
        <Card padding="none">
          <DataTable<ProductRow>
            columns={[
              { key: 'code', label: 'Código', width: 100, render: (p) => <CodePill>{p.code}</CodePill> },
              { key: 'name', label: 'Nombre', render: (p) => toSentenceCase(p.name) },
              { key: 'type', label: 'Tipo', width: 140, render: (p) => <Tag>{toSentenceCase(p.type)}</Tag> },
            ]}
            data={SAMPLE_PRODUCTS}
            keyExtractor={(p) => p.id}
          />
        </Card>
      </Section>

      <Section title="FileUpload">
        <FileUpload
          label="Importar catálogo AVIS"
          helperText="Excel .xlsx, hoja PRODUCTOS AVIS"
          onUpload={async () => new Promise((r) => setTimeout(r, 600))}
          result={{ created: 612, updated: 48, unchanged: 0, skipped: 0, errors: [] }}
        />
      </Section>

      <Section title="Modal & Drawer">
        <div className="flex gap-2">
          <Button onClick={() => setModalOpen(true)}>Abrir Modal</Button>
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Abrir Drawer</Button>
        </div>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Confirmar"
          subtitle="Acción no reversible"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button onClick={() => setModalOpen(false)}>Confirmar</Button>
            </>
          }
        >
          <p>Cuerpo del modal.</p>
        </Modal>
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title="Apósitos bacteriostáticos"
          subtitle="Editar productos asociados"
          footer={
            <>
              <Button variant="secondary" onClick={() => setDrawerOpen(false)}>Cancelar</Button>
              <Button onClick={() => setDrawerOpen(false)}>Guardar</Button>
            </>
          }
        >
          <p className="text-sm text-slate-500">Cuerpo del drawer (lista de productos, etc.).</p>
        </Drawer>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
