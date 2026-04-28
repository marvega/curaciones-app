import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('<Button>', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('fires onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('applies variant=primary by default', () => {
    render(<Button>Default</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-blue-600');
  });

  it('applies variant=secondary classes', () => {
    render(<Button variant="secondary">x</Button>);
    expect(screen.getByRole('button')).toHaveClass('border-slate-200');
  });

  it('applies variant=danger', () => {
    render(<Button variant="danger">x</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-rose-600');
  });

  it('disables and prevents click when disabled', async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>x</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows loading state and disables clicks', async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('forwards ref to underlying button', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>x</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('renders as anchor when as="a" with href', () => {
    render(<Button as="a" href="/foo">link</Button>);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/foo');
  });
});
