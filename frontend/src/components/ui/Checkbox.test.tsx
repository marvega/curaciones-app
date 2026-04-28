import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './Checkbox';

describe('<Checkbox>', () => {
  it('renders label', () => {
    render(<Checkbox label="Acepto" />);
    expect(screen.getByLabelText('Acepto')).toBeInTheDocument();
  });

  it('toggles on click', async () => {
    const onChange = vi.fn();
    render(<Checkbox label="x" onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('x'));
    expect(onChange).toHaveBeenCalled();
  });

  it('reflects checked state', () => {
    render(<Checkbox label="x" checked readOnly />);
    expect(screen.getByLabelText('x')).toBeChecked();
  });
});
