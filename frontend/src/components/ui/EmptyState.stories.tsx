import type { Meta, StoryObj } from '@storybook/react';
import { Package } from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

const meta: Meta<typeof EmptyState> = { title: 'UI/EmptyState', component: EmptyState, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: { icon: Package, title: 'Sin productos', description: 'Sube el catálogo AVIS para empezar' },
};
export const WithAction: Story = {
  args: {
    icon: Package,
    title: 'Sin productos',
    description: 'Sube el catálogo AVIS',
    action: <Button>Subir archivo</Button>,
  },
};
