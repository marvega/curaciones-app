import type { Meta, StoryObj } from '@storybook/react';
import { Card } from './Card';

const meta: Meta<typeof Card> = { title: 'UI/Card', component: Card, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = { args: { children: <p>Contenido del card</p> } };
export const NoPadding: Story = { args: { padding: 'none', children: <p className="p-2">Sin padding</p> } };
