import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchPatientByRut, getPatientsPaginated, getAgenda, getDashboardToday, getDashboardNoAppointment, getDashboardInactive, getUserPreferences, updateUserPreferences } from '../services/api';
import type { Patient, AgendaItem, DashboardTodayItem, PatientNoAppointment, PatientInactive } from '../types';
import { Search, UserPlus, ChevronRight, UserX, Loader2, Users, CalendarCheck, Activity, Clock, AlertTriangle, CalendarOff, Clock3 } from 'lucide-react';

export default function HomePage() {
  const [rut, setRut] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [patient, setPatient] = useState<Patient | null>(null);
  const navigate = useNavigate();

  // Dashboard stats
  const [totalPatients, setTotalPatients] = useState<number | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<AgendaItem[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  // Dashboard sections
  const [dashToday, setDashToday] = useState<DashboardTodayItem[]>([]);
  const [dashTodayLoading, setDashTodayLoading] = useState(true);
  const [noAppt, setNoAppt] = useState<PatientNoAppointment[]>([]);
  const [noApptLoading, setNoApptLoading] = useState(true);
  const [inactive, setInactive] = useState<PatientInactive[]>([]);
  const [inactiveLoading, setInactiveLoading] = useState(true);
  const [thresholdDays, setThresholdDays] = useState(14);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        const nextWeekStr = nextWeek.toISOString().split('T')[0];
        const [patientsRes, agendaRes] = await Promise.all([
          getPatientsPaginated(1, 1),
          getAgenda(todayStr, nextWeekStr),
        ]);
        setTotalPatients(patientsRes.total);
        setTodayAppointments(agendaRes);
      } catch {
        // silently fail
      } finally {
        setStatsLoading(false);
      }
    };
    loadStats();
  }, []);

  useEffect(() => {
    getDashboardToday().then(setDashToday).catch(() => {}).finally(() => setDashTodayLoading(false));
    getDashboardNoAppointment().then(setNoAppt).catch(() => {}).finally(() => setNoApptLoading(false));
    getUserPreferences().then(prefs => {
      setThresholdDays(prefs.inactivityThresholdDays);
      return getDashboardInactive(prefs.inactivityThresholdDays);
    }).then(setInactive).catch(() => {}).finally(() => setInactiveLoading(false));
  }, []);

  const handleThresholdChange = async (days: number) => {
    setThresholdDays(days);
    setInactiveLoading(true);
    try {
      await updateUserPreferences({ inactivityThresholdDays: days });
      const data = await getDashboardInactive(days);
      setInactive(data);
    } catch { /* silently fail */ }
    finally { setInactiveLoading(false); }
  };

  const urgencyBadge = (days: number | null) => {
    if (days === null) return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-100 text-rose-700">Sin atenciones</span>;
    if (days > 30) return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-100 text-rose-700">{days} días</span>;
    if (days > 14) return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">{days} días</span>;
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">{days} días</span>;
  };

  const formatRut = (value: string) => {
    const clean = value.replace(/[^0-9kK]/g, '');
    if (clean.length <= 1) return clean;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1).toUpperCase();
    const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${formatted}-${dv}`;
  };

  const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRut(formatRut(e.target.value));
    setSearched(false);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rut.trim()) return;
    setLoading(true);
    try {
      const result = await searchPatientByRut(rut.trim());
      setPatient(result);
      setSearched(true);
    } catch {
      setPatient(null);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const activePatients = totalPatients ?? 0;

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Pacientes</p>
              {statsLoading ? (
                <div className="skeleton h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-slate-900 mt-1">{activePatients}</p>
              )}
            </div>
            <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Próximas Citas</p>
              {statsLoading ? (
                <div className="skeleton h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold text-slate-900 mt-1">{todayAppointments.length}</p>
              )}
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center">
              <CalendarCheck className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Próxima Cita</p>
              {statsLoading ? (
                <div className="skeleton h-8 w-24 mt-1" />
              ) : todayAppointments.length > 0 ? (
                <div>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{todayAppointments[0].time}</p>
                  <p className="text-xs text-slate-400">{new Date(todayAppointments[0].date + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-400 mt-2">Sin citas</p>
              )}
            </div>
            <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center">
              <Activity className="w-5 h-5 text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Quick search */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5">
            <h2 className="text-base font-semibold text-slate-800 mb-1">Buscar Paciente</h2>
            <p className="text-sm text-slate-500 mb-4">Busque por RUT</p>

            <form onSubmit={handleSearch} className="space-y-3">
              <input
                type="text"
                value={rut}
                onChange={handleRutChange}
                placeholder="12.345.678-9"
                className="form-control text-lg"
              />
              <button
                type="submit"
                disabled={loading || !rut.trim()}
                className="btn-primary w-full"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Buscando...</>
                ) : (
                  <><Search className="w-4 h-4" /> Buscar</>
                )}
              </button>
            </form>

            {searched && (
              <div className="mt-4">
                {patient ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-emerald-800">
                        {patient.firstName} {patient.lastName}
                      </span>
                      <span className="text-xs text-emerald-600 font-medium">{patient.rut}</span>
                    </div>
                    <button
                      onClick={() => navigate(`/paciente/${patient.id}`)}
                      className="w-full mt-2 btn-primary text-sm"
                    >
                      Ver Ficha <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-center">
                    <UserX className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                    <p className="text-sm text-slate-600 mb-2">No encontrado</p>
                    <button
                      onClick={() => navigate(`/paciente/nuevo?rut=${encodeURIComponent(rut)}`)}
                      className="btn-primary text-sm w-full"
                    >
                      <UserPlus className="w-4 h-4" /> Registrar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Today's agenda */}
        <div className="lg:col-span-3">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-800">Próximas Citas</h2>
              <button
                onClick={() => navigate('/agenda')}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium cursor-pointer flex items-center gap-1"
              >
                Ver toda <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {statsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3">
                    <div className="skeleton h-5 w-14" />
                    <div className="skeleton h-4 flex-1" />
                    <div className="skeleton h-5 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            ) : todayAppointments.length === 0 ? (
              <div className="text-center py-10">
                <CalendarCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No hay citas próximas</p>
              </div>
            ) : (
              <div className="space-y-1">
                {todayAppointments.slice(0, 8).map((apt) => (
                  <div
                    key={apt.id}
                    onClick={() => navigate(`/paciente/${apt.patient.id}`)}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <div className="shrink-0 w-20 text-center">
                      <p className="text-[11px] text-slate-400">{new Date(apt.date + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' })}</p>
                      <p className="text-sm font-bold text-blue-600 flex items-center justify-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {apt.time}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {apt.patient.firstName} {apt.patient.lastName}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium shrink-0 ${
                      apt.source === 'curacion'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {apt.source === 'curacion' ? 'Curación' : 'Cita'}
                    </span>
                  </div>
                ))}
                {todayAppointments.length > 8 && (
                  <p className="text-center text-xs text-slate-400 pt-2">
                    +{todayAppointments.length - 8} citas más
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dashboard cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: Citas de hoy */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Clock3 className="w-4 h-4 text-blue-600" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">Citas de hoy</h2>
          </div>

          {dashTodayLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2">
                  <div className="skeleton h-4 w-12" />
                  <div className="skeleton h-4 flex-1" />
                  <div className="skeleton h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : dashToday.length === 0 ? (
            <div className="text-center py-10">
              <Clock3 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No hay citas para hoy</p>
            </div>
          ) : (
            <div className="space-y-1">
              {dashToday.map((item) => (
                <div
                  key={`${item.source}-${item.id}`}
                  onClick={() => navigate(`/paciente/${item.patient.id}`)}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <span className="text-sm font-bold text-blue-600 w-12 shrink-0">{item.time}</span>
                  <span className="text-sm text-slate-800 truncate flex-1">
                    {item.patient.firstName} {item.patient.lastName}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-medium shrink-0 ${
                    item.source === 'curacion'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}>
                    {item.source === 'curacion' && item.curacion
                      ? item.curacion.type.replace('_', ' ')
                      : 'Cita'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Card 2: Pacientes sin cita agendada */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <CalendarOff className="w-4 h-4 text-amber-600" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">Pacientes sin cita agendada</h2>
          </div>

          {noApptLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2">
                  <div className="skeleton h-4 flex-1" />
                  <div className="skeleton h-4 w-20" />
                  <div className="skeleton h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : noAppt.length === 0 ? (
            <div className="text-center py-10">
              <CalendarOff className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Todos los pacientes tienen cita</p>
            </div>
          ) : (
            <div className="space-y-1">
              {noAppt.map((p) => (
                <div
                  key={p.id}
                  onClick={() => navigate(`/paciente/${p.id}`)}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{p.firstName} {p.lastName}</p>
                    <p className="text-[11px] text-slate-400">{p.rut}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {p.lastCuracion ? (
                      <p className="text-[11px] text-slate-400">{p.lastCuracion.type.replace('_', ' ')}</p>
                    ) : (
                      <p className="text-[11px] text-slate-400">Sin curaciones</p>
                    )}
                  </div>
                  {urgencyBadge(p.daysSinceLastCuracion)}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Card 3: Pacientes sin atención reciente */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
              </div>
              <h2 className="text-base font-semibold text-slate-800">Sin atención reciente</h2>
            </div>
            <select
              value={thresholdDays}
              onChange={(e) => handleThresholdChange(Number(e.target.value))}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 bg-white"
            >
              <option value={7}>7 días</option>
              <option value={14}>14 días</option>
              <option value={21}>21 días</option>
              <option value={30}>30 días</option>
            </select>
          </div>

          {inactiveLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2">
                  <div className="skeleton h-4 flex-1" />
                  <div className="skeleton h-4 w-20" />
                  <div className="skeleton h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : inactive.length === 0 ? (
            <div className="text-center py-10">
              <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Todos los pacientes están al día</p>
            </div>
          ) : (
            <div className="space-y-1">
              {inactive.map((p) => (
                <div
                  key={p.id}
                  onClick={() => navigate(`/paciente/${p.id}`)}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{p.firstName} {p.lastName}</p>
                    <p className="text-[11px] text-slate-400">{p.rut}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {p.lastCuracionDate ? (
                      <p className="text-[11px] text-slate-400">{p.lastCuracionType?.replace('_', ' ')}</p>
                    ) : (
                      <p className="text-[11px] text-slate-400">Nunca</p>
                    )}
                  </div>
                  {urgencyBadge(p.daysSinceLastCuracion)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
