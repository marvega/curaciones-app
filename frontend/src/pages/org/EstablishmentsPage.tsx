import { useEffect, useState } from 'react';
import { listEstablishments, createEstablishment } from '../../services/api';
import { Button, Input, PageHeader, DataTable, Modal } from '../../components/ui';
import type { ColumnDef } from '../../components/ui';
import { useToast } from '../../contexts/ToastContext';

interface Est {
  id: string;
  name: string;
  comuna: string;
}

export default function EstablishmentsPage() {
  const [rows, setRows] = useState<Est[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [comuna, setComuna] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { showError, showSuccess } = useToast();

  const reload = async () => {
    setLoading(true);
    try {
      const data = await listEstablishments();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      showError(err?.response?.data?.message ?? 'Error al cargar establecimientos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cols: ColumnDef<Est>[] = [
    { key: 'name', label: 'Nombre', render: (e) => e.name },
    { key: 'comuna', label: 'Comuna', render: (e) => e.comuna },
  ];

  return (
    <>
      <PageHeader
        title="Establecimientos"
        actions={<Button onClick={() => setOpen(true)}>Agregar</Button>}
      />
      <DataTable
        columns={cols}
        data={rows}
        loading={loading}
        keyExtractor={(e) => e.id}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo establecimiento"
      >
        <div className="space-y-3">
          <Input
            label="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Comuna"
            value={comuna}
            onChange={(e) => setComuna(e.target.value)}
          />
          <Button
            disabled={!name || submitting}
            loading={submitting}
            onClick={async () => {
              setSubmitting(true);
              try {
                await createEstablishment({ name, comuna });
                showSuccess('Establecimiento creado');
                setOpen(false);
                setName('');
                setComuna('');
                reload();
              } catch (e) {
                const err = e as { response?: { data?: { message?: string } } };
                showError(err?.response?.data?.message ?? 'Error');
              } finally {
                setSubmitting(false);
              }
            }}
          >
            Crear
          </Button>
        </div>
      </Modal>
    </>
  );
}
