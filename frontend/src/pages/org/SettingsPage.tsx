import { useEffect, useState } from 'react';
import { getOrgSettings, updateOrgSettings } from '../../services/api';
import { Button, Input, PageHeader, Card } from '../../components/ui';
import { useToast } from '../../contexts/ToastContext';

export default function OrgSettingsPage() {
  const [name, setName] = useState('');
  const [rut, setRut] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const data = await getOrgSettings();
        setName(data?.name ?? '');
        setRut(data?.rut ?? '');
      } catch (e) {
        const err = e as { response?: { data?: { message?: string } } };
        showError(err?.response?.data?.message ?? 'Error al cargar la organización');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHeader title="Información de la organización" />
      <Card>
        <div className="space-y-3">
          <Input
            label="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
          />
          <Input
            label="RUT"
            value={rut}
            onChange={(e) => setRut(e.target.value)}
            disabled={loading}
          />
          <Button
            disabled={loading || saving || !name}
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await updateOrgSettings({ name, rut });
                showSuccess('Cambios guardados');
              } catch (e) {
                const err = e as { response?: { data?: { message?: string } } };
                showError(err?.response?.data?.message ?? 'Error');
              } finally {
                setSaving(false);
              }
            }}
          >
            Guardar
          </Button>
        </div>
      </Card>
    </>
  );
}
