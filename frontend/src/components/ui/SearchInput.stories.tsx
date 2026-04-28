import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { SearchInput } from './SearchInput';

const meta: Meta<typeof SearchInput> = { title: 'UI/SearchInput', component: SearchInput, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof SearchInput>;

export const Default: Story = {
  render: () => {
    const [v, setV] = useState('');
    return <div className="w-96"><SearchInput value={v} onChange={setV} placeholder="Buscar pacientes…" /></div>;
  },
};

export const WithValue: Story = {
  render: () => {
    const [v, setV] = useState('Juan Pérez');
    return <div className="w-96"><SearchInput value={v} onChange={setV} placeholder="Buscar…" /></div>;
  },
};
