import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { to: '/', label: 'Inicio' },
  { to: '/pacientes', label: 'Pacientes' },
  { to: '/agenda', label: 'Agenda' },
  { to: '/reportes/mensual', label: 'Reporte Mensual' },
  { to: '/reportes/detallado', label: 'Reporte Detallado' },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
    isActive ? 'bg-teal-900 text-white' : 'text-teal-100 hover:bg-teal-600'
  }`;

export default function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-teal-700 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">
              Enfermería - Gestión de Curaciones
            </h1>

            {/* Hamburger botón - visible solo en móvil */}
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="sm:hidden p-2 rounded-lg hover:bg-teal-600 transition-colors"
              aria-label="Abrir menú"
              aria-expanded={menuOpen}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            {/* Nav desktop - oculto en móvil */}
            <nav className="hidden sm:flex items-center gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={navLinkClass}
                >
                  {item.label}
                </NavLink>
              ))}
              {isAdmin && (
                <NavLink to="/usuarios" className={navLinkClass}>
                  Usuarios
                </NavLink>
              )}
              <div className="ml-4 flex items-center gap-2 border-l border-teal-600 pl-4">
                <span className="text-sm text-teal-100">
                  {user?.username}
                  {isAdmin && <span className="ml-1 text-xs text-amber-200">(admin)</span>}
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

          {/* Nav móvil - desplegable */}
          {menuOpen && (
            <nav
              className="sm:hidden mt-4 pt-4 border-t border-teal-600 flex flex-col gap-1"
              onClick={() => setMenuOpen(false)}
            >
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={navLinkClass}
                >
                  {item.label}
                </NavLink>
              ))}
              {isAdmin && (
                <NavLink to="/usuarios" className={navLinkClass}>
                  Usuarios
                </NavLink>
              )}
              <div className="pt-3 mt-2 border-t border-teal-600 flex flex-col gap-2">
                <span className="px-4 py-2 text-sm text-teal-100">
                  {user?.username}
                  {isAdmin && <span className="ml-1 text-xs text-amber-200">(admin)</span>}
                </span>
                <button
                  onClick={logout}
                  className="px-4 py-3 rounded-lg text-sm font-medium bg-teal-800 hover:bg-teal-900 transition-colors text-left"
                >
                  Cerrar sesión
                </button>
              </div>
            </nav>
          )}
        </div>
      </header>
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-4 sm:py-8 sm:px-4">
        <Outlet />
      </main>
      <footer className="bg-gray-100 border-t text-center py-3 text-xs sm:text-sm text-gray-500">
        Sistema de Gestión de Curaciones &copy; {new Date().getFullYear()}
        {' · '}
        <a
          href="https://marcelovega.com"
          target="_blank"
          rel="noopener noreferrer"
          title="Contactar"
          className="text-teal-600 hover:text-teal-700 hover:underline"
        >
          marcelovega.com
        </a>
      </footer>
    </div>
  );
}
