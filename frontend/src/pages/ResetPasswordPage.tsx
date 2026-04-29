import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { resetPassword } from '../services/api';
import { Button, Input, Card, PageHeader } from '../components/ui';
import { useToast } from '../contexts/ToastContext';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { showError } = useToast();
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="max-w-md mx-auto py-12">
      <PageHeader title="Crear nueva contraseña" />
      <Card>
        <div className="space-y-3">
          <Input
            label="Nueva contraseña"
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
          />
          <Input
            label="Confirmar"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button
            disabled={pwd.length < 12 || pwd !== confirm || submitting}
            loading={submitting}
            onClick={async () => {
              setSubmitting(true);
              try {
                const data = await resetPassword(token, pwd);
                localStorage.setItem('curaciones_access_token', data.accessToken);
                if (data.refreshToken) {
                  localStorage.setItem('curaciones_refresh_token', data.refreshToken);
                }
                navigate('/');
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
    </div>
  );
}
