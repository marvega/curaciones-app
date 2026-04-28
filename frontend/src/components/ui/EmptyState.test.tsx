import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';

describe('<EmptyState>', () => {
  it('renders title and description', () => {
    render(<EmptyState title="Sin datos" description="No hay nada aquí" />);
    expect(screen.getByText('Sin datos')).toBeInTheDocument();
    expect(screen.getByText('No hay nada aquí')).toBeInTheDocument();
  });

  it('renders action when provided', () => {
    render(<EmptyState title="x" action={<button>Crear</button>} />);
    expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument();
  });
});
