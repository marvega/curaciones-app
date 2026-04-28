import type { Meta, StoryObj } from '@storybook/react';
import { Tag } from './Tag';

const meta: Meta<typeof Tag> = { title: 'UI/Tag', component: Tag, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof Tag>;

export const Variants: Story = {
  render: () => (
    <div className="flex gap-2 flex-wrap">
      <Tag>Gray</Tag>
      <Tag variant="blue">Blue</Tag>
      <Tag variant="green">Green</Tag>
      <Tag variant="yellow">Yellow</Tag>
      <Tag variant="red">Red</Tag>
    </div>
  ),
};
