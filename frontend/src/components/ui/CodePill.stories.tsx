import type { Meta, StoryObj } from '@storybook/react';
import { CodePill } from './CodePill';

const meta: Meta<typeof CodePill> = { title: 'UI/CodePill', component: CodePill, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof CodePill>;

export const Default: Story = { args: { children: '1408' } };
export const LongCode: Story = { args: { children: 'AVS-99-X' } };
