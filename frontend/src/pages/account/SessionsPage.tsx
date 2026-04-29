import { useEffect, useState } from 'react';
import { listSessions, revokeSession, logoutAll } from '../../services/api';
import { Button, DataTable, PageHeader } from '../../components/ui';
import type { ColumnDef } from '../../components/ui';
import { useToast } from '../../contexts/ToastContext';

interface Row {
  jti: string;
  deviceLabel: string | null;
  lastUsedAt: string;
  current: boolean;
}

export default function SessionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const { showSuccess, showError } = useToast();

  const reload = async () => {
    setLoading(true);
    try {
      setRows(await listSessions());
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      showError(err?.response?.data?.message ?? 'Error al cargar sesiones');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cols: ColumnDef<Row>[] = [
    { key: 'deviceLabel', label: 'Dispositivo', render: (r) => r.deviceLabel ?? '—' },
    {
      key: 'lastUsedAt',
      label: 'Último uso',
      render: (r) => new Date(r.lastUsedAt).toLocaleString('es-CL'),
    },
    { key: 'current', label: 'Actual', render: (r) => (r.current ? 'Sí' : '') },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (r) =>
        r.current ? null : (
          <Button
            variant="danger"
            size="sm"
            onClick={async () => {
              try {
                await revokeSession(r.jti);
                reload();
              } catch (e) {
                const err = e as { response?: { data?: { message?: string } } };
                showError(err?.response?.data?.message ?? 'Error');
              }
            }}
          >
            Revocar
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Sesiones activas"
        subtitle="Revisá los dispositivos conectados a tu cuenta"
        actions={
          <Button
            variant="danger"
            onClick={async () => {
              try {
                await logoutAll();
                showSuccess('Todas las sesiones cerradas');
                window.location.href = '/login';
              } catch (e) {
                const err = e as { response?: { data?: { message?: string } } };
                showError(err?.response?.data?.message ?? 'Error');
              }
            }}
          >
            Cerrar todas las sesiones
          </Button>
        }
      />
      <DataTable
        columns={cols}
        data={rows}
        loading={loading}
        keyExtractor={(r) => r.jti}
      />
    </>
  );
}
