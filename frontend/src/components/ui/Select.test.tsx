import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Select } from './Select';

describe('<Select>', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ];

  it('renders label and options', () => {
    render(<Select label="Letra" options={options} value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Letra')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument();
  });

  it('fires onChange with new value', async () => {
    const onChange = vi.fn();
    render(<Select label="Letra" options={options} value="" onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText('Letra'), 'b');
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('shows placeholder option when provided', () => {
    render(<Select label="x" options={options} value="" onChange={() => {}} placeholder="Selecciona" />);
    expect(screen.getByRole('option', { name: 'Selecciona' })).toBeInTheDocument();
  });
});
