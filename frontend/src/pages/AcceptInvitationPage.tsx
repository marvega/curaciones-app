import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { previewInvitation, acceptInvitation } from '../services/api';
import { Button, Input, PageHeader, Card } from '../components/ui';
import { useToast } from '../contexts/ToastContext';

interface InvitationPreview {
  valid: boolean;
  email?: string;
  organizationName?: string;
  role?: string;
}

export default function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { showError } = useToast();
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setPreview({ valid: false });
      return;
    }
    previewInvitation(token)
      .then((data) => setPreview(data))
      .catch(() => setPreview({ valid: false }));
  }, [token]);

  if (!preview) return <div>Cargando...</div>;
  if (!preview.valid)
    return (
      <div className="max-w-md mx-auto py-12">
        <Card>Invitación inválida o expirada.</Card>
      </div>
    );

  return (
    <div className="max-w-md mx-auto py-12">
      <PageHeader
        title="Aceptar invitación"
        subtitle={`Te invitaron a ${preview.organizationName ?? ''} como ${preview.role ?? ''}`}
      />
      <Card>
        <div className="space-y-3">
          <Input
            label="Nombre completo"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <Input label="Email" value={preview.email ?? ''} disabled />
          <Input
            label="Contraseña (mínimo 12 caracteres)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            label="Confirmar contraseña"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button
            disabled={submitting || password.length < 12 || password !== confirm}
            onClick={async () => {
              setSubmitting(true);
              try {
                const data = await acceptInvitation(token, password, fullName);
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
            Aceptar e ingresar
          </Button>
        </div>
      </Card>
    </div>
  );
}
