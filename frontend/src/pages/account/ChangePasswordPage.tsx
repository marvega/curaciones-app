import { useState } from 'react';
import { changePassword } from '../../services/api';
import { Button, Input, Card, PageHeader } from '../../components/ui';
import { useToast } from '../../contexts/ToastContext';

export default function ChangePasswordPage() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { showSuccess, showError } = useToast();

  return (
    <>
      <PageHeader title="Cambiar contraseña" />
      <Card>
        <div className="space-y-3">
          <Input
            label="Contraseña actual"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <Input
            label="Nueva contraseña"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <Input
            label="Confirmar"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button
            disabled={!current || next.length < 12 || next !== confirm || submitting}
            loading={submitting}
            onClick={async () => {
              setSubmitting(true);
              try {
                await changePassword(current, next);
                showSuccess('Contraseña actualizada. Volvé a iniciar sesión.');
                localStorage.clear();
                window.location.href = '/login';
              } catch (e) {
                const err = e as { response?: { data?: { message?: string } } };
                showError(err?.response?.data?.message ?? 'Error');
              } finally {
                setSubmitting(false);
              }
            }}
          >
            Cambiar contraseña
          </Button>
        </div>
      </Card>
    </>
  );
}
