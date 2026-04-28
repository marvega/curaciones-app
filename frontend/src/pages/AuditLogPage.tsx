import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getAuditLogs } from '../services/api';
import { Navigate } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import { Button, Select, Card, Tag, DataTable, Modal } from '../components/ui';
import type { ColumnDef } from '../components/ui';

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

const ACTION_VARIANTS: Record<string, 'green' | 'blue' | 'red'> = {
  CREATE: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
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
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

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
    setSelectedLog(null);
    fetchLogs(1, { entity, from, to });
  };

  const handlePageChange = (newPage: number) => {
    setSelectedLog(null);
    fetchLogs(newPage, { entity, from, to });
  };

  if (!user) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  const columns: ColumnDef<AuditLogEntry>[] = [
    {
      key: 'createdAt',
      label: 'Fecha',
      render: (log) => (
        <span className="text-slate-600 whitespace-nowrap">
          {new Date(log.createdAt).toLocaleString('es-CL')}
        </span>
      ),
    },
    {
      key: 'username',
      label: 'Usuario',
      render: (log) => <span className="font-medium text-slate-800">{log.username}</span>,
    },
    {
      key: 'action',
      label: 'Acción',
      render: (log) => (
        <Tag variant={ACTION_VARIANTS[log.action] || 'gray'}>
          {ACTION_LABELS[log.action] || log.action}
        </Tag>
      ),
    },
    {
      key: 'entity',
      label: 'Entidad',
      render: (log) => <span className="text-slate-600">{log.entity}</span>,
    },
    {
      key: 'entityId',
      label: 'ID Entidad',
      render: (log) => <span className="text-slate-600">{log.entityId}</span>,
    },
    {
      key: 'ipAddress',
      label: 'IP',
      render: (log) => <span className="text-slate-500 text-xs">{log.ipAddress || '-'}</span>,
    },
    {
      key: 'actions',
      label: '',
      render: (log) =>
        log.payload ? (
          <Button
            variant="link"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedLog(log);
            }}
          >
            Ver detalle
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Card padding="md" className="sm:p-6">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">
          Registro de Auditoría
        </h2>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div className="sm:w-40">
            <Select
              label="Entidad"
              value={entity}
              onChange={setEntity}
              options={ENTITY_OPTIONS}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Desde</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="form-control w-full sm:w-40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Hasta</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="form-control w-full sm:w-40"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={handleFilter} leftIcon={<Search className="w-4 h-4" />}>
              Filtrar
            </Button>
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
            <DataTable
              columns={columns}
              data={logs}
              keyExtractor={(log) => log.id}
            />

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-200">
              <p className="text-sm text-slate-500">
                Mostrando página {page} de {totalPages} ({total} registros)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1}
                >
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <Modal
        open={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Detalle del registro"
        subtitle={
          selectedLog
            ? `${ACTION_LABELS[selectedLog.action] || selectedLog.action} - ${selectedLog.entity} #${selectedLog.entityId}`
            : undefined
        }
        size="xl"
      >
        {selectedLog?.payload && (
          <pre className="text-xs text-slate-700 dark:text-slate-300 overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto bg-slate-50 dark:bg-slate-800 rounded-lg p-4">
            {JSON.stringify(selectedLog.payload, null, 2)}
          </pre>
        )}
      </Modal>
    </div>
  );
}
