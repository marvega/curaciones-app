import { useState, useEffect, useCallback, Fragment } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getAuditLogs } from '../services/api';
import { Navigate } from 'react-router-dom';
import { Loader2, ChevronDown, ChevronRight, Search } from 'lucide-react';

interface AuditLogEntry {
  id: number;
  userId: number;
  username: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: string;
  entityId: number;
  payload: Record<string, any> | null;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditLogResponse {
  data: AuditLogEntry[];
  total: number;
  page: number;
  totalPages: number;
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Crear',
  UPDATE: 'Actualizar',
  DELETE: 'Eliminar',
};

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  UPDATE: 'bg-blue-50 text-blue-700 border border-blue-200',
  DELETE: 'bg-rose-50 text-rose-700 border border-rose-200',
};

const ENTITY_OPTIONS = [
  { value: '', label: 'Todas' },
  { value: 'patients', label: 'Pacientes' },
  { value: 'curaciones', label: 'Curaciones' },
  { value: 'appointments', label: 'Citas' },
  { value: 'cycles', label: 'Ciclos' },
  { value: 'users', label: 'Usuarios' },
];

export default function AuditLogPage() {
  const { user, isAdmin } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Filter state
  const [entity, setEntity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const fetchLogs = useCallback(async (p: number, filters: { entity: string; from: string; to: string }) => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page: p, limit: 20 };
      if (filters.entity) params.entity = filters.entity;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;

      const result: AuditLogResponse = await getAuditLogs(params);
      setLogs(result.data);
      setTotalPages(result.totalPages);
      setTotal(result.total);
      setPage(result.page);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchLogs(1, { entity, from, to });
    }
  }, [isAdmin, fetchLogs]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilter = () => {
    setExpandedId(null);
    fetchLogs(1, { entity, from, to });
  };

  const handlePageChange = (newPage: number) => {
    setExpandedId(null);
    fetchLogs(newPage, { entity, from, to });
  };

  if (!user) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="card p-5 sm:p-6">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">
          Registro de Auditoría
        </h2>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Entidad</label>
            <select
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
              className="form-control w-full sm:w-40"
            >
              {ENTITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Desde</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="form-control w-full sm:w-40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Hasta</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="form-control w-full sm:w-40"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleFilter}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              Filtrar
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            No hay registros
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="w-8"></th>
                    <th className="text-left py-3 px-3 font-medium text-slate-500 text-xs uppercase tracking-wider">Fecha</th>
                    <th className="text-left py-3 px-3 font-medium text-slate-500 text-xs uppercase tracking-wider">Usuario</th>
                    <th className="text-left py-3 px-3 font-medium text-slate-500 text-xs uppercase tracking-wider">Acción</th>
                    <th className="text-left py-3 px-3 font-medium text-slate-500 text-xs uppercase tracking-wider">Entidad</th>
                    <th className="text-left py-3 px-3 font-medium text-slate-500 text-xs uppercase tracking-wider">ID Entidad</th>
                    <th className="text-left py-3 px-3 font-medium text-slate-500 text-xs uppercase tracking-wider">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <Fragment key={log.id}>
                      <tr
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                      >
                        <td className="py-3 px-2 text-slate-400">
                          {log.payload ? (
                            expandedId === log.id
                              ? <ChevronDown className="w-4 h-4" />
                              : <ChevronRight className="w-4 h-4" />
                          ) : null}
                        </td>
                        <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString('es-CL')}
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-800">{log.username}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${ACTION_COLORS[log.action] || ''}`}>
                            {ACTION_LABELS[log.action] || log.action}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-600">{log.entity}</td>
                        <td className="py-3 px-3 text-slate-600">{log.entityId}</td>
                        <td className="py-3 px-3 text-slate-500 text-xs">{log.ipAddress || '-'}</td>
                      </tr>
                      {expandedId === log.id && log.payload && (
                        <tr className="border-b border-slate-100">
                          <td colSpan={7} className="px-6 py-4 bg-slate-50">
                            <pre className="text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
                              {JSON.stringify(log.payload, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-200">
              <p className="text-sm text-slate-500">
                Mostrando página {page} de {totalPages} ({total} registros)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Anterior
                </button>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
