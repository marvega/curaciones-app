import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import LoginPage from '../LoginPage';

const mockNavigate = vi.fn();
const mockLogin = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: null }),
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate-to">{to}</div>,
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Stub lucide-react Loader2 to avoid SVG rendering issues in jsdom
vi.mock('lucide-react', () => ({
  Loader2: (props: Record<string, unknown>) => <span data-testid="loader" {...props} />,
}));

import { useAuth } from '../../contexts/AuthContext';
const mockedUseAuth = useAuth as ReturnType<typeof vi.fn>;

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders username and password fields', () => {
    mockedUseAuth.mockReturnValue({
      login: mockLogin,
      user: null,
      loading: false,
    });

    render(<LoginPage />);

    expect(screen.getByPlaceholderText('Usuario')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Contraseña')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('shows spinner when auth is loading', () => {
    mockedUseAuth.mockReturnValue({
      login: mockLogin,
      user: null,
      loading: true,
    });

    render(<LoginPage />);

    expect(screen.getByTestId('loader')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Usuario')).not.toBeInTheDocument();
  });

  it('redirects when user is already authenticated', () => {
    mockedUseAuth.mockReturnValue({
      login: mockLogin,
      user: { id: 1, username: 'admin', role: 'admin' },
      loading: false,
    });

    render(<LoginPage />);

    expect(screen.getByTestId('navigate-to')).toHaveTextContent('/');
    expect(screen.queryByPlaceholderText('Usuario')).not.toBeInTheDocument();
  });

  it('calls login on form submission', async () => {
    mockLogin.mockResolvedValue(undefined);
    mockedUseAuth.mockReturnValue({
      login: mockLogin,
      user: null,
      loading: false,
    });

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('Usuario'), 'testuser');
    await user.type(screen.getByPlaceholderText('Contraseña'), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(mockLogin).toHaveBeenCalledWith('testuser', 'secret123');
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('shows error message on failed login', async () => {
    mockLogin.mockRejectedValue(new Error('Credenciales inválidas'));
    mockedUseAuth.mockReturnValue({
      login: mockLogin,
      user: null,
      loading: false,
    });

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('Usuario'), 'bad');
    await user.type(screen.getByPlaceholderText('Contraseña'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByText('Credenciales inválidas')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows button loading state during submission', async () => {
    // Make login hang so we can observe the loading state
    mockLogin.mockImplementation(() => new Promise(() => {}));
    mockedUseAuth.mockReturnValue({
      login: mockLogin,
      user: null,
      loading: false,
    });

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('Usuario'), 'test');
    await user.type(screen.getByPlaceholderText('Contraseña'), 'pass');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByText('Iniciando sesión...')).toBeInTheDocument();
  });
});
