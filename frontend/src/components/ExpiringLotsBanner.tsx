import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';
import { getExpiringLots } from '../services/api';

export default function ExpiringLotsBanner() {
  const [count, setCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getExpiringLots(30, 1)
      .then((r) => setCount(r.total))
      .catch(() => {});
  }, []);

  if (dismissed || count === 0) return null;

  return (
    <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/inventory?expiringFilter=30')}>
        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
        <p className="text-sm text-red-800 dark:text-red-200">
          <span className="font-medium">Insumos por vencer:</span> {count} {count === 1 ? 'lote vence' : 'lotes vencen'} en los próximos 30 días
        </p>
      </div>
      <button onClick={() => setDismissed(true)} className="text-red-400 hover:text-red-600 p-1">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
