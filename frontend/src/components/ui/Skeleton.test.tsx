import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton } from './Skeleton';

describe('<Skeleton>', () => {
  it('renders with skeleton class and inline width/height', () => {
    const { container } = render(<Skeleton width={100} height={20} />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('skeleton');
    expect(el.style.width).toBe('100px');
    expect(el.style.height).toBe('20px');
  });

  it('applies circle shape when circle prop set', () => {
    const { container } = render(<Skeleton width={32} height={32} circle />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/rounded-full/);
  });
});
