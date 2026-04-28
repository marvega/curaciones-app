import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FileUpload } from './FileUpload';

describe('<FileUpload>', () => {
  it('renders label and helper text', () => {
    render(<FileUpload label="Importar Excel" helperText=".xlsx, hoja PRODUCTOS AVIS" onUpload={async () => {}} />);
    expect(screen.getByText('Importar Excel')).toBeInTheDocument();
    expect(screen.getByText('.xlsx, hoja PRODUCTOS AVIS')).toBeInTheDocument();
  });

  it('invokes onUpload when file selected', async () => {
    const onUpload = vi.fn(async () => {});
    render(<FileUpload label="X" onUpload={onUpload} />);
    const input = screen.getByLabelText(/seleccionar archivo|x/i, { selector: 'input[type="file"]' });
    const file = new File(['x'], 'x.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    await userEvent.upload(input, file);
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(file));
  });

  it('renders result block when result prop set', () => {
    render(
      <FileUpload
        label="X"
        onUpload={async () => {}}
        result={{ created: 612, updated: 48, unchanged: 0, skipped: 0, errors: [] }}
      />,
    );
    expect(screen.getByText(/612/)).toBeInTheDocument();
    expect(screen.getByText(/48/)).toBeInTheDocument();
  });

  it('shows error count and toggleable details', async () => {
    render(
      <FileUpload
        label="X"
        onUpload={async () => {}}
        result={{ created: 0, updated: 0, unchanged: 0, skipped: 1, errors: [{ row: 12, reason: 'Código vacío' }] }}
      />,
    );
    expect(screen.getByText(/1 errores/)).toBeInTheDocument();
    await userEvent.click(screen.getByText(/1 errores/));
    expect(screen.getByText(/Fila 12/)).toBeInTheDocument();
  });
});
