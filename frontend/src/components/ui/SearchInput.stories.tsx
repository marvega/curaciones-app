import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { SearchInput } from './SearchInput';

const meta: Meta<typeof SearchInput> = { title: 'UI/SearchInput', component: SearchInput, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof SearchInput>;

function SearchInputDefaultStory() {
  const [v, setV] = useState('');
  return <div className="w-96"><SearchInput value={v} onChange={setV} placeholder="Buscar pacientes…" /></div>;
}

function SearchInputWithValueStory() {
  const [v, setV] = useState('Juan Pérez');
  return <div className="w-96"><SearchInput value={v} onChange={setV} placeholder="Buscar…" /></div>;
}

export const Default: Story = {
  render: () => <SearchInputDefaultStory />,
};

export const WithValue: Story = {
  render: () => <SearchInputWithValueStory />,
};
