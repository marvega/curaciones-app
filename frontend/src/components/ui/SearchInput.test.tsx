import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SearchInput } from './SearchInput';

describe('<SearchInput>', () => {
  it('renders with placeholder and search icon', () => {
    render(<SearchInput value="" onChange={() => {}} placeholder="Buscar…" />);
    expect(screen.getByPlaceholderText('Buscar…')).toBeInTheDocument();
  });

  it('fires onChange with new value', async () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} placeholder="x" />);
    await userEvent.type(screen.getByPlaceholderText('x'), 'h');
    expect(onChange).toHaveBeenCalledWith('h');
  });

  it('shows clear button when value is non-empty', () => {
    render(<SearchInput value="hello" onChange={() => {}} placeholder="x" />);
    expect(screen.getByRole('button', { name: /limpiar/i })).toBeInTheDocument();
  });

  it('hides clear button when value is empty', () => {
    render(<SearchInput value="" onChange={() => {}} placeholder="x" />);
    expect(screen.queryByRole('button', { name: /limpiar/i })).not.toBeInTheDocument();
  });

  it('clears value when clear button clicked', async () => {
    const onChange = vi.fn();
    render(<SearchInput value="hello" onChange={onChange} placeholder="x" />);
    await userEvent.click(screen.getByRole('button', { name: /limpiar/i }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
