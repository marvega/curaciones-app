import type { Meta, StoryObj } from '@storybook/react';
import { CodePill } from './CodePill';
import { DataTable } from './DataTable';
import { Tag } from './Tag';

const meta: Meta = { title: 'UI/DataTable', tags: ['autodocs'] };
export default meta;

interface Product { id: number; code: string; name: string; type: string }
const products: Product[] = [
  { id: 1, code: '19', name: 'Acetazolamida 250 mg comprimido', type: 'Medicamento' },
  { id: 2, code: '1408', name: 'Apósito alginato de calcio 10×10 cm UD', type: 'Insumo' },
];

export const ProductCatalog: StoryObj = {
  render: () => (
    <DataTable<Product>
      columns={[
        { key: 'code', label: 'Código', width: 100, render: (p) => <CodePill>{p.code}</CodePill> },
        { key: 'name', label: 'Nombre' },
        { key: 'type', label: 'Tipo', width: 140, render: (p) => <Tag>{p.type}</Tag> },
      ]}
      data={products}
      keyExtractor={(p) => p.id}
    />
  ),
};

export const Loading: StoryObj = {
  render: () => (
    <DataTable<Product>
      columns={[{ key: 'code', label: 'Código' }, { key: 'name', label: 'Nombre' }]}
      data={[]}
      loading
      keyExtractor={(p) => p.id}
    />
  ),
};
