import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { to: '/', label: 'Inicio' },
  { to: '/pacientes', label: 'Pacientes' },
  { to: '/agenda', label: 'Agenda' },
  { to: '/reportes/mensual', label: 'Reporte Mensual' },
  { to: '/reportes/detallado', label: 'Reporte Detallado' },
];

export default function Layout() {
  const { user, isAdmin, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-teal-700 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">
            Enfermería - Gestión de Curaciones
          </h1>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-teal-900 text-white'
                      : 'text-teal-100 hover:bg-teal-600'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink
                to="/usuarios"
                className={({ isActive }) =>
                  `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-teal-900 text-white'
                      : 'text-teal-100 hover:bg-teal-600'
                  }`
                }
              >
                Usuarios
              </NavLink>
            )}
            <div className="ml-4 flex items-center gap-2 border-l border-teal-600 pl-4">
              <span className="text-sm text-teal-100">
                {user?.username}
                {isAdmin && (
                  <span className="ml-1 text-xs text-amber-200">(admin)</span>
                )}
              </span>
              <button
                onClick={logout}
                className="px-3 py-1.5 text-sm rounded-lg bg-teal-800 hover:bg-teal-900 transition-colors"
              >
                Cerrar sesión
              </button>
            </div>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        <Outlet />
      </main>
      <footer className="bg-gray-100 border-t text-center py-3 text-sm text-gray-500">
        Sistema de Gestión de Curaciones &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
