import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Textarea } from './Textarea';

describe('<Textarea>', () => {
  it('renders with label', () => {
    render(<Textarea label="Notas" />);
    expect(screen.getByLabelText('Notas')).toBeInTheDocument();
  });

  it('forwards onChange', async () => {
    const onChange = vi.fn();
    render(<Textarea label="x" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('x'), 'h');
    expect(onChange).toHaveBeenCalled();
  });

  it('shows error', () => {
    render(<Textarea label="x" error="Requerido" />);
    expect(screen.getByText('Requerido')).toBeInTheDocument();
    expect(screen.getByLabelText('x')).toHaveAttribute('aria-invalid', 'true');
  });

  it('respects rows prop', () => {
    render(<Textarea label="x" rows={6} />);
    expect(screen.getByLabelText('x')).toHaveAttribute('rows', '6');
  });
});
