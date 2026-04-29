import { useEffect, useState } from 'react';
import { listOrgInvitations } from '../../services/api';
import { PageHeader, DataTable } from '../../components/ui';
import type { ColumnDef } from '../../components/ui';
import { useToast } from '../../contexts/ToastContext';

interface Invite {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  expiresAt: string;
}

export default function InvitationsPage() {
  const [rows, setRows] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const { showError } = useToast();

  const reload = async () => {
    setLoading(true);
    try {
      const data = await listOrgInvitations();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      showError(err?.response?.data?.message ?? 'Error al cargar invitaciones');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cols: ColumnDef<Invite>[] = [
    { key: 'email', label: 'Email', render: (i) => i.email },
    { key: 'role', label: 'Rol', render: (i) => i.role },
    {
      key: 'expiresAt',
      label: 'Expira',
      render: (i) => new Date(i.expiresAt).toLocaleDateString('es-CL'),
    },
  ];

  return (
    <>
      <PageHeader title="Invitaciones pendientes" />
      <DataTable
        columns={cols}
        data={rows}
        loading={loading}
        keyExtractor={(i) => i.id}
      />
    </>
  );
}
