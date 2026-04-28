import type { Meta, StoryObj } from '@storybook/react';
import { Textarea } from './Textarea';

const meta: Meta<typeof Textarea> = { title: 'UI/Textarea', component: Textarea, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = { args: { label: 'Observaciones', placeholder: 'Detalles…' } };
export const WithError: Story = { args: { label: 'Observaciones', error: 'Mínimo 10 caracteres' } };
