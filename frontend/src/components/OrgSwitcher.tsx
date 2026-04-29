import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui';

export function OrgSwitcher() {
  const { organizations, currentOrg, switchOrg } = useAuth();
  const [open, setOpen] = useState(false);

  if (organizations.length <= 1) {
    return (
      <span className="text-sm text-slate-500 dark:text-slate-400">
        {currentOrg?.name ?? ''}
      </span>
    );
  }

  return (
    <div className="relative">
      <Button variant="ghost" onClick={() => setOpen((v) => !v)}>
        {currentOrg?.name ?? 'Seleccionar organización'}
      </Button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg z-50">
          {organizations.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
                o.id === currentOrg?.id ? 'font-semibold' : ''
              }`}
              onClick={async () => {
                await switchOrg(o.id);
                setOpen(false);
                window.location.reload();
              }}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
