import { useState, useEffect } from 'react';
import { getDashboardNoAppointment, getDashboardInactive, getUserPreferences } from '../services/api';
import { AlertTriangle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AlertBanner() {
  const [noApptCount, setNoApptCount] = useState(0);
  const [inactiveCount, setInactiveCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const [noAppt, prefs] = await Promise.all([
          getDashboardNoAppointment(),
          getUserPreferences(),
        ]);
        const inactive = await getDashboardInactive(prefs.inactivityThresholdDays);
        setNoApptCount(noAppt.length);
        setInactiveCount(inactive.length);
      } catch {
        // silently ignore — banner just won't show
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading || dismissed || (noApptCount === 0 && inactiveCount === 0)) {
    return null;
  }

  const messages: string[] = [];
  if (noApptCount > 0) messages.push(`${noApptCount} sin cita agendada`);
  if (inactiveCount > 0) messages.push(`${inactiveCount} sin atención reciente`);

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
        <p className="text-sm text-amber-800 dark:text-amber-200">
          <span className="font-medium">Pacientes pendientes:</span>{' '}
          {messages.join(' · ')}
        </p>
      </div>
      <button onClick={() => setDismissed(true)} className="text-amber-400 hover:text-amber-600 p-1">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
