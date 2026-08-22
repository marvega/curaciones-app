import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import MembersPage from '../MembersPage';
import * as api from '../../../services/api';
import { ToastProvider } from '../../../contexts/ToastContext';
import { ConfirmProvider } from '../../../contexts/ConfirmContext';

vi.mock('../../../services/api');

const ACCEPT_URL = 'https://curaciones.web.app/accept-invite?token=abc123';

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ConfirmProvider>
          <MembersPage />
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

async function openInviteModal() {
  await waitFor(() => screen.getByRole('button', { name: 'Invitar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Invitar' }));
  await waitFor(() => screen.getByLabelText('Email'));
}

function submitInvite(email: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }));
}

describe('MembersPage invite flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listMembers).mockResolvedValue([]);
  });

  it('shows the accept link and keeps the modal open when the server returns acceptUrl', async () => {
    vi.mocked(api.inviteMember).mockResolvedValue({ id: 'inv-1', acceptUrl: ACCEPT_URL });
    renderPage();
    await openInviteModal();
    submitInvite('nuevo@example.com');

    await waitFor(() =>
      expect(screen.getByLabelText('Enlace de invitación')).toHaveValue(ACCEPT_URL),
    );
    // Modal is still open so the owner can copy the link.
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByText('Invitación creada. Copia el enlace y envíaselo.')).toBeInTheDocument();
  });

  it('closes the modal and shows no link when the server returns only an id', async () => {
    vi.mocked(api.inviteMember).mockResolvedValue({ id: 'inv-2' });
    renderPage();
    await openInviteModal();
    submitInvite('otro@example.com');

    await waitFor(() => expect(screen.getByText('Invitación enviada')).toBeInTheDocument());
    expect(screen.queryByLabelText('Enlace de invitación')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('does not show a stale link after the modal is closed and reopened', async () => {
    vi.mocked(api.inviteMember).mockResolvedValue({ id: 'inv-3', acceptUrl: ACCEPT_URL });
    renderPage();
    await openInviteModal();
    submitInvite('primero@example.com');
    await waitFor(() =>
      expect(screen.getByLabelText('Enlace de invitación')).toHaveValue(ACCEPT_URL),
    );

    // The modal's own close control, scoped so the toast dismiss button
    // (same aria-label) does not match.
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByLabelText('Email')).not.toBeInTheDocument());

    await openInviteModal();
    expect(screen.queryByLabelText('Enlace de invitación')).not.toBeInTheDocument();
  });

  it('does not leave the previous link behind when a later invite returns no acceptUrl', async () => {
    vi.mocked(api.inviteMember)
      .mockResolvedValueOnce({ id: 'inv-5', acceptUrl: ACCEPT_URL })
      .mockResolvedValueOnce({ id: 'inv-6' });
    renderPage();
    await openInviteModal();
    submitInvite('con-enlace@example.com');
    await waitFor(() =>
      expect(screen.getByLabelText('Enlace de invitación')).toHaveValue(ACCEPT_URL),
    );

    // Second invite from the same open modal, this time with email delivery on.
    submitInvite('sin-enlace@example.com');
    await waitFor(() => expect(screen.queryByLabelText('Email')).not.toBeInTheDocument());

    await openInviteModal();
    expect(screen.queryByLabelText('Enlace de invitación')).not.toBeInTheDocument();
  });

  it('copies the link to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    vi.mocked(api.inviteMember).mockResolvedValue({ id: 'inv-4', acceptUrl: ACCEPT_URL });
    renderPage();
    await openInviteModal();
    submitInvite('copia@example.com');
    await waitFor(() => screen.getByRole('button', { name: 'Copiar enlace' }));

    fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(ACCEPT_URL));
    expect(screen.getByText('Enlace copiado')).toBeInTheDocument();
  });
});
