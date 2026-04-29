import { render, screen, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from '../AuthContext';

vi.mock('../../services/api', () => ({
  login: vi.fn(),
}));

function TestConsumer() {
  const { user, token, isAdmin, loading, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? JSON.stringify(user) : 'null'}</span>
      <span data-testid="token">{token || 'null'}</span>
      <span data-testid="isAdmin">{String(isAdmin)}</span>
      <button data-testid="login" onClick={() => login('test', 'pass')}>Login</button>
      <button data-testid="logout" onClick={() => logout()}>Logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders children when wrapped in AuthProvider', () => {
    render(
      <AuthProvider>
        <div>child</div>
      </AuthProvider>
    );
    expect(screen.getByText('child')).toBeInTheDocument();
  });

  it('provides default unauthenticated state', async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );
    expect(await screen.findByText('null', { selector: '[data-testid="user"]' })).toBeInTheDocument();
    expect(screen.getByTestId('token')).toHaveTextContent('null');
    expect(screen.getByTestId('isAdmin')).toHaveTextContent('false');
  });

  it('restores session from localStorage', async () => {
    const mockUser = { id: 1, username: 'admin', role: 'admin' };
    localStorage.setItem('curaciones_token', 'saved-token');
    localStorage.setItem('curaciones_user', JSON.stringify(mockUser));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    expect(await screen.findByTestId('token')).toHaveTextContent('saved-token');
    expect(screen.getByTestId('isAdmin')).toHaveTextContent('true');
  });

  it('login stores token and user', async () => {
    const { login: apiLogin } = await import('../../services/api');
    (apiLogin as ReturnType<typeof vi.fn>).mockResolvedValue({
      access_token: 'new-token',
      user: { id: 1, username: 'test', role: 'user' },
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await act(async () => {
      screen.getByTestId('login').click();
    });

    expect(screen.getByTestId('token')).toHaveTextContent('new-token');
    // AuthContext now writes to the new ACCESS_KEY; the legacy 'curaciones_token'
    // is only read for backward compatibility, never written.
    expect(localStorage.getItem('curaciones_access_token')).toBe('new-token');
  });

  it('logout clears state', async () => {
    localStorage.setItem('curaciones_token', 'old-token');
    localStorage.setItem('curaciones_user', JSON.stringify({ id: 1, username: 'x', role: 'user' }));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await screen.findByText('old-token', { selector: '[data-testid="token"]' });

    await act(async () => {
      screen.getByTestId('logout').click();
    });

    expect(screen.getByTestId('token')).toHaveTextContent('null');
    expect(screen.getByTestId('user')).toHaveTextContent('null');
    expect(localStorage.getItem('curaciones_token')).toBeNull();
  });

  it('useAuth throws when used outside AuthProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow('useAuth debe usarse dentro de AuthProvider');
    spy.mockRestore();
  });
});
