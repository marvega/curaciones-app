import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('<Modal>', () => {
  it('renders children when open', () => {
    render(
      <Modal open onClose={() => {}} title="Title">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <Modal open={false} onClose={() => {}} title="X">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.queryByText('X')).not.toBeInTheDocument();
  });

  it('calls onClose when close button clicked', async () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="X"><p>b</p></Modal>);
    await userEvent.click(screen.getByRole('button', { name: /cerrar/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on ESC', async () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="X"><p>b</p></Modal>);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('renders footer slot', () => {
    render(
      <Modal open onClose={() => {}} title="X" footer={<button>Save</button>}>
        body
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
