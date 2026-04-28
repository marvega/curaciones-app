import type { Meta, StoryObj } from '@storybook/react';
import { Plus, Save } from 'lucide-react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'danger', 'success', 'ghost', 'link'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
  },
};
export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { children: 'Guardar', variant: 'primary' } };
export const Secondary: Story = { args: { children: 'Cancelar', variant: 'secondary' } };
export const Danger: Story = { args: { children: 'Eliminar', variant: 'danger' } };
export const Success: Story = { args: { children: 'Confirmar', variant: 'success' } };
export const Ghost: Story = { args: { children: 'Más opciones', variant: 'ghost' } };
export const Link: Story = { args: { children: 'Ver detalle', variant: 'link' } };

export const WithLeftIcon: Story = { args: { children: 'Nuevo', leftIcon: <Plus className="w-4 h-4" /> } };
export const Loading: Story = { args: { children: 'Guardando…', loading: true, leftIcon: <Save className="w-4 h-4" /> } };
export const Disabled: Story = { args: { children: 'Deshabilitado', disabled: true } };

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};
