import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LayoutDashboard,
  Users,
  Calendar,
  FileBarChart,
  PieChart,
  Shield,
  ClipboardList,
  LogOut,
  Menu,
  ChevronLeft,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/pacientes', label: 'Pacientes', icon: Users },
  { to: '/agenda', label: 'Agenda', icon: Calendar },
  { to: '/reportes/mensual', label: 'Reporte Mensual', icon: FileBarChart },
  { to: '/reportes/detallado', label: 'Reporte Detallado', icon: PieChart },
];

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/pacientes': 'Pacientes',
  '/paciente/nuevo': 'Nuevo Paciente',
  '/agenda': 'Agenda',
  '/reportes/mensual': 'Reporte Mensual',
  '/reportes/detallado': 'Reporte Detallado',
  '/usuarios': 'Usuarios',
  '/audit-log': 'Auditoría',
};

export default function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const pageTitle = PAGE_TITLES[location.pathname] || (location.pathname.startsWith('/paciente/') ? 'Ficha Paciente' : '');

  // Close mobile sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Close mobile sidebar on outside click
  useEffect(() => {
    if (!sidebarOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setSidebarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [sidebarOpen]);

  const sidebarWidth = collapsed ? 'w-[72px]' : 'w-64';

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      {/* Logo */}
      <div className={`h-16 flex items-center border-b border-slate-700/50 shrink-0 ${collapsed && !mobile ? 'justify-center px-0' : 'px-5 gap-3'}`}>
        <img src="/logo.png" alt="Curaciones" className="w-9 h-9 object-contain shrink-0" />
        {(!collapsed || mobile) && (
          <span className="text-white font-bold text-base tracking-tight">Curaciones</span>
        )}
      </div>

      {/* Nav */}
      <nav className={`flex-1 py-4 space-y-1 overflow-y-auto ${collapsed && !mobile ? 'px-2' : 'px-3'}`}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
                collapsed && !mobile ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
              } ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`
            }
            title={collapsed && !mobile ? item.label : undefined}
          >
            <item.icon className="w-5 h-5 shrink-0" />
            {(!collapsed || mobile) && item.label}
          </NavLink>
        ))}
        {isAdmin && (
          <>
            <NavLink
              to="/usuarios"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
                  collapsed && !mobile ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
                } ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`
              }
              title={collapsed && !mobile ? 'Usuarios' : undefined}
            >
              <Shield className="w-5 h-5 shrink-0" />
              {(!collapsed || mobile) && 'Usuarios'}
            </NavLink>
            <NavLink
              to="/audit-log"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
                  collapsed && !mobile ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
                } ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`
              }
              title={collapsed && !mobile ? 'Auditoría' : undefined}
            >
              <ClipboardList className="w-5 h-5 shrink-0" />
              {(!collapsed || mobile) && 'Auditoría'}
            </NavLink>
          </>
        )}
      </nav>

      {/* User section */}
      <div className={`border-t border-slate-700/50 shrink-0 ${collapsed && !mobile ? 'p-2' : 'p-4'}`}>
        {(!collapsed || mobile) ? (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 uppercase">
              {user?.username?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">{user?.username}</p>
              {isAdmin && <p className="text-[10px] text-blue-400 uppercase tracking-wider font-semibold">Admin</p>}
            </div>
          </div>
        ) : (
          <div className="flex justify-center mb-2">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 uppercase">
              {user?.username?.charAt(0)}
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className={`w-full flex items-center gap-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all cursor-pointer ${
            collapsed && !mobile ? 'justify-center p-2' : 'px-3 py-2'
          }`}
          title={collapsed && !mobile ? 'Cerrar sesión' : undefined}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {(!collapsed || mobile) && 'Cerrar sesión'}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex lg:flex-col ${sidebarWidth} bg-slate-900 fixed inset-y-0 left-0 z-30 transition-all duration-200`}>
        <SidebarContent />
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-slate-900 border-2 border-slate-200 flex items-center justify-center hover:bg-slate-800 transition-colors cursor-pointer z-40"
        >
          <ChevronLeft className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside ref={sidebarRef} className="relative w-64 h-full bg-slate-900 flex flex-col shadow-2xl">
            <SidebarContent mobile />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-200 ${collapsed ? 'lg:ml-[72px]' : 'lg:ml-64'}`}>
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-4 sm:px-6 sticky top-0 z-20 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-2 mr-2 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5 text-slate-600" />
          </button>

          <h1 className="text-base font-semibold text-slate-800">{pageTitle}</h1>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:block text-sm text-slate-500">
              {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
