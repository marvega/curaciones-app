import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/org/members', label: 'Miembros' },
  { to: '/org/invitations', label: 'Invitaciones' },
  { to: '/org/establishments', label: 'Establecimientos' },
  { to: '/org/settings', label: 'Información' },
];

export function OrgTabs() {
  return (
    <nav
      aria-label="Mi organización"
      className="mb-6 border-b border-slate-200 dark:border-slate-800"
    >
      <ul className="flex gap-1 overflow-x-auto -mb-px">
        {tabs.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              className={({ isActive }) =>
                `inline-flex items-center px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:border-slate-600'
                }`
              }
            >
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
