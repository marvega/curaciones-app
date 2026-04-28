import type { Meta, StoryObj } from '@storybook/react';
import { Checkbox } from './Checkbox';

const meta: Meta<typeof Checkbox> = { title: 'UI/Checkbox', component: Checkbox, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Default: Story = { args: { label: 'Acepto los términos' } };
export const Checked: Story = { args: { label: 'Activo', checked: true, readOnly: true } };
export const Disabled: Story = { args: { label: 'No editable', disabled: true } };
