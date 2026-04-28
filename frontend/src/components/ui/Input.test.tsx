import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Input } from './Input';

describe('<Input>', () => {
  it('renders with label', () => {
    render(<Input label="Nombre" />);
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument();
  });

  it('shows help text', () => {
    render(<Input label="Edad" helpText="En años" />);
    expect(screen.getByText('En años')).toBeInTheDocument();
  });

  it('shows error and applies error class', () => {
    render(<Input label="RUT" error="Inválido" />);
    expect(screen.getByText('Inválido')).toBeInTheDocument();
    const input = screen.getByLabelText('RUT');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.className).toMatch(/border-rose/);
  });

  it('forwards onChange events', async () => {
    const onChange = vi.fn();
    render(<Input label="X" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('X'), 'hi');
    expect(onChange).toHaveBeenCalled();
  });

  it('forwards ref', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<Input label="X" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('renders left and right icons', () => {
    render(
      <Input
        label="Buscar"
        leftIcon={<span data-testid="li">L</span>}
        rightIcon={<span data-testid="ri">R</span>}
      />,
    );
    expect(screen.getByTestId('li')).toBeInTheDocument();
    expect(screen.getByTestId('ri')).toBeInTheDocument();
  });
});
