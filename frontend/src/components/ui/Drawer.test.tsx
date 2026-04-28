import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Drawer } from './Drawer';

describe('<Drawer>', () => {
  it('renders title, subtitle, body and footer when open', () => {
    render(
      <Drawer open onClose={() => {}} title="Categoría" subtitle="Editar productos" footer={<button>Save</button>}>
        <p>body</p>
      </Drawer>,
    );
    expect(screen.getByText('Categoría')).toBeInTheDocument();
    expect(screen.getByText('Editar productos')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<Drawer open={false} onClose={() => {}} title="x">body</Drawer>);
    expect(screen.queryByText('x')).not.toBeInTheDocument();
  });

  it('calls onClose on ESC', async () => {
    const onClose = vi.fn();
    render(<Drawer open onClose={onClose} title="x">b</Drawer>);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when X button clicked', async () => {
    const onClose = vi.fn();
    render(<Drawer open onClose={onClose} title="x">b</Drawer>);
    await userEvent.click(screen.getByRole('button', { name: /cerrar/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
