import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable';

interface Row { id: number; name: string; age: number }
const data: Row[] = [
  { id: 1, name: 'Ana', age: 30 },
  { id: 2, name: 'Bea', age: 25 },
];

describe('<DataTable>', () => {
  it('renders columns and rows', () => {
    render(
      <DataTable
        columns={[
          { key: 'name', label: 'Nombre' },
          { key: 'age', label: 'Edad' },
        ]}
        data={data}
        keyExtractor={(r) => r.id}
      />,
    );
    expect(screen.getByText('Nombre')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Bea')).toBeInTheDocument();
  });

  it('uses custom render function for column', () => {
    render(
      <DataTable
        columns={[
          { key: 'name', label: 'N', render: (r) => <strong>{r.name}!</strong> },
        ]}
        data={data}
        keyExtractor={(r) => r.id}
      />,
    );
    expect(screen.getByText('Ana!')).toBeInTheDocument();
  });

  it('shows empty state when no data and not loading', () => {
    render(
      <DataTable
        columns={[{ key: 'name', label: 'N' }]}
        data={[]}
        emptyState={<p>No hay datos</p>}
        keyExtractor={() => ''}
      />,
    );
    expect(screen.getByText('No hay datos')).toBeInTheDocument();
  });

  it('shows skeleton rows when loading', () => {
    const { container } = render(
      <DataTable
        columns={[{ key: 'name', label: 'N' }]}
        data={[]}
        loading
        keyExtractor={() => ''}
      />,
    );
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('calls onRowClick', async () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        columns={[{ key: 'name', label: 'N' }]}
        data={data}
        onRowClick={onRowClick}
        keyExtractor={(r) => r.id}
      />,
    );
    await userEvent.click(screen.getByText('Ana'));
    expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ana' }));
  });
});
