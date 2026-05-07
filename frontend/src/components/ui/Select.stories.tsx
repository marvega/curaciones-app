import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Select } from './Select';

const meta: Meta<typeof Select> = { title: 'UI/Select', component: Select, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof Select>;

const options = [
  { value: 'femenino', label: 'Femenino' },
  { value: 'masculino', label: 'Masculino' },
];

function SelectDefaultStory() {
  const [v, setV] = useState('');
  return <div className="w-64"><Select label="Género" options={options} value={v} onChange={setV} placeholder="Todos" /></div>;
}

export const Default: Story = {
  render: () => <SelectDefaultStory />,
};
