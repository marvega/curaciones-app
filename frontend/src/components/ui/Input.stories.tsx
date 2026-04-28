import type { Meta, StoryObj } from '@storybook/react';
import { Mail, Search } from 'lucide-react';
import { Input } from './Input';

const meta: Meta<typeof Input> = {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = { args: { label: 'Nombre', placeholder: 'Juan Pérez' } };
export const WithHelpText: Story = { args: { label: 'RUT', placeholder: '12.345.678-9', helpText: 'Sin puntos ni guión' } };
export const WithError: Story = { args: { label: 'RUT', error: 'RUT inválido', value: '123' } };
export const WithLeftIcon: Story = { args: { label: 'Email', placeholder: 'tu@email.com', leftIcon: <Mail className="w-4 h-4" /> } };
export const WithRightIcon: Story = { args: { label: 'Buscar', placeholder: '…', rightIcon: <Search className="w-4 h-4" /> } };
export const Disabled: Story = { args: { label: 'Bloqueado', disabled: true, value: 'No editable' } };
