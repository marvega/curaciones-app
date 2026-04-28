import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

describe('<PageHeader>', () => {
  it('renders title and subtitle', () => {
    render(<PageHeader title="Catálogo" subtitle="660 productos" />);
    expect(screen.getByRole('heading', { name: 'Catálogo' })).toBeInTheDocument();
    expect(screen.getByText('660 productos')).toBeInTheDocument();
  });

  it('renders actions slot', () => {
    render(<PageHeader title="x" actions={<button>Nuevo</button>} />);
    expect(screen.getByRole('button', { name: 'Nuevo' })).toBeInTheDocument();
  });
});
