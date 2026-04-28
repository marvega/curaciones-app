import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './Card';

describe('<Card>', () => {
  it('renders children', () => {
    render(<Card>Hello</Card>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('applies card class', () => {
    const { container } = render(<Card>x</Card>);
    expect((container.firstChild as HTMLElement).className).toContain('card');
  });

  it('applies padding=none', () => {
    const { container } = render(<Card padding="none">x</Card>);
    expect((container.firstChild as HTMLElement).className).not.toMatch(/p-\d/);
  });
});
