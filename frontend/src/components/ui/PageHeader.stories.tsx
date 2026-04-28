import type { Meta, StoryObj } from '@storybook/react';
import { Plus } from 'lucide-react';
import { Button } from './Button';
import { PageHeader } from './PageHeader';

const meta: Meta<typeof PageHeader> = { title: 'UI/PageHeader', component: PageHeader, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof PageHeader>;

export const Default: Story = { args: { title: 'Pacientes', subtitle: '33 registrados' } };
export const WithActions: Story = {
  args: {
    title: 'Pacientes',
    subtitle: '33 registrados',
    actions: <Button leftIcon={<Plus className="w-4 h-4" />}>Nuevo paciente</Button>,
  },
};
