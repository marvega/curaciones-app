import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (user) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : err instanceof Error
            ? err.message
            : 'Error al iniciar sesión';
      setError(msg || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-900">
      {/* Left side - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 to-blue-800 items-center justify-center p-12">
        <div className="text-center">
          <div className="w-24 h-24 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center mx-auto mb-6 p-3">
            <img src="/logo.png" alt="Curaciones" className="w-full h-full object-contain brightness-0 invert" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-3">Gestión de Curaciones</h2>
          <p className="text-blue-200 text-lg max-w-sm">
            Sistema profesional de gestión de curaciones avanzadas para enfermería
          </p>
        </div>
      </div>

      {/* Right side - form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-white dark:bg-slate-900">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center mb-4 p-2">
              <img src="/logo.png" alt="Curaciones" className="w-full h-full object-contain brightness-0 invert" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-200">Gestión de Curaciones</h1>
          </div>

          <div className="hidden lg:block mb-8">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Bienvenido</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Inicie sesión para continuar</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Usuario
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="form-control"
                placeholder="Usuario"
                required
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-control"
                placeholder="Contraseña"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="text-rose-600 dark:text-rose-400 text-sm bg-rose-50 dark:bg-rose-900/30 border border-rose-100 dark:border-rose-800 px-4 py-2.5 rounded-lg">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Iniciando sesión...</>
              ) : (
                'Iniciar sesión'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
