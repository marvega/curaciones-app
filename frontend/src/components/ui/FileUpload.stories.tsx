import type { Meta, StoryObj } from '@storybook/react';
import { FileUpload } from './FileUpload';

const meta: Meta<typeof FileUpload> = { title: 'UI/FileUpload', component: FileUpload, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof FileUpload>;

export const Idle: Story = {
  args: { label: 'Importar catálogo AVIS', helperText: 'Excel .xlsx, hoja PRODUCTOS AVIS', onUpload: async () => {} },
};

export const WithSuccessResult: Story = {
  args: {
    label: 'Importar catálogo AVIS',
    helperText: '.xlsx',
    onUpload: async () => {},
    result: { created: 612, updated: 48, unchanged: 0, skipped: 0, errors: [] },
  },
};

export const WithErrors: Story = {
  args: {
    label: 'Importar catálogo AVIS',
    helperText: '.xlsx',
    onUpload: async () => {},
    result: {
      created: 600,
      updated: 30,
      unchanged: 0,
      skipped: 3,
      errors: [
        { row: 12, reason: 'Código vacío' },
        { row: 34, reason: 'Nombre duplicado' },
        { row: 89, reason: 'Tipo desconocido' },
      ],
    },
  },
};
