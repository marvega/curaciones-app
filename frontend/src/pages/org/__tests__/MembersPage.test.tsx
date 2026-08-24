import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// jsdom ships no navigator.clipboard, so the copy tests install one. Restore the
// prior descriptor (including "was absent") instead of leaking the stub into
// whatever test or file runs next.
const priorClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
}

describe('MembersPage invite flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listMembers).mockResolvedValue([]);
  });

  afterEach(() => {
    if (priorClipboard) {
      Object.defineProperty(navigator, 'clipboard', priorClipboard);
    } else {
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
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

  // The only path where clearing the link at the top of the submit handler is
  // the sole protection: the modal stays open, so no close path runs.
  it('drops the previous link when a later invite fails', async () => {
    vi.mocked(api.inviteMember)
      .mockResolvedValueOnce({ id: 'inv-7', acceptUrl: ACCEPT_URL })
      .mockRejectedValueOnce({ response: { data: { message: 'Ese email ya fue invitado' } } });
    renderPage();
    await openInviteModal();
    submitInvite('con-enlace@example.com');
    await waitFor(() =>
      expect(screen.getByLabelText('Enlace de invitación')).toHaveValue(ACCEPT_URL),
    );

    submitInvite('falla@example.com');
    await waitFor(() =>
      expect(screen.getByText('Ese email ya fue invitado')).toBeInTheDocument(),
    );
    // The dead invitation's link must not stay on screen next to the error.
    expect(screen.queryByLabelText('Enlace de invitación')).not.toBeInTheDocument();
    // Modal stays open so the owner can correct the email.
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('blocks a second submit while an invite is in flight', async () => {
    let resolveFirst: (res: { id: string; acceptUrl?: string }) => void = () => {};
    vi.mocked(api.inviteMember).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    renderPage();
    await openInviteModal();
    submitInvite('lento@example.com');

    const button = screen.getByRole('button', { name: 'Enviar invitación' });
    await waitFor(() => expect(button).toBeDisabled());
    // A double-click would create a second invitation server-side.
    fireEvent.click(button);
    expect(api.inviteMember).toHaveBeenCalledTimes(1);

    resolveFirst({ id: 'inv-8', acceptUrl: ACCEPT_URL });
    await waitFor(() =>
      expect(screen.getByLabelText('Enlace de invitación')).toHaveValue(ACCEPT_URL),
    );
  });

  it('re-enables the submit button after a failed invite', async () => {
    vi.mocked(api.inviteMember).mockRejectedValue({ response: { data: { message: 'Falló' } } });
    renderPage();
    await openInviteModal();
    submitInvite('error@example.com');

    await waitFor(() => expect(screen.getByText('Falló')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Enviar invitación' })).toBeEnabled();
  });

  it('copies the link to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    vi.mocked(api.inviteMember).mockResolvedValue({ id: 'inv-4', acceptUrl: ACCEPT_URL });
    renderPage();
    await openInviteModal();
    submitInvite('copia@example.com');
    await waitFor(() => screen.getByRole('button', { name: 'Copiar enlace' }));

    fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(ACCEPT_URL));
    expect(screen.getByText('Enlace copiado')).toBeInTheDocument();
  });

  it('reports a copy failure instead of claiming success', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('permiso denegado'));
    stubClipboard(writeText);
    vi.mocked(api.inviteMember).mockResolvedValue({ id: 'inv-9', acceptUrl: ACCEPT_URL });
    renderPage();
    await openInviteModal();
    submitInvite('sin-permiso@example.com');
    await waitFor(() => screen.getByRole('button', { name: 'Copiar enlace' }));

    fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }));
    await waitFor(() =>
      expect(
        screen.getByText('No se pudo copiar. Selecciona el enlace y cópialo manualmente.'),
      ).toBeInTheDocument(),
    );
    // Must not tell the owner the link is on their clipboard when it is not.
    expect(screen.queryByText('Enlace copiado')).not.toBeInTheDocument();
  });
});
