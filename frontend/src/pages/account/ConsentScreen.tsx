import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, PageHeader, Select, Skeleton } from '../../components/ui';
import { useToast } from '../../contexts/ToastContext';
import {
  fetchConsentInteraction,
  submitConsent,
  type ConsentInteraction,
} from '../../api/oauth';

export function ConsentScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { showError } = useToast();
  const uid = params.get('interaction');
  const [data, setData] = useState<ConsentInteraction | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!uid) {
      navigate('/');
      return;
    }
    fetchConsentInteraction(uid)
      .then((d) => {
        setData(d);
        setOrgId(d.preselectedOrganizationId);
      })
      .catch(() =>
        showError('No pudimos cargar la solicitud de autorización.'),
      )
      .finally(() => setLoading(false));
  }, [uid, navigate, showError]);

  async function decide(approved: boolean) {
    if (!uid) return;
    setSubmitting(true);
    try {
      const { redirectTo } = await submitConsent(uid, {
        approved,
        organizationId: approved ? orgId : undefined,
      });
      window.location.assign(redirectTo);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      showError(
        err?.response?.data?.message ?? 'Error al procesar la decisión.',
      );
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-xl mx-auto py-8 space-y-3">
        <Skeleton height={24} />
        <Skeleton height={16} />
        <Skeleton height={16} />
        <Skeleton height={16} />
        <Skeleton height={120} />
      </div>
    );
  }
  if (!data) return null;

  const orgOptions = data.organizations.map((o) => ({
    value: o.id,
    label: `${o.name} — ${o.role}`,
  }));

  return (
    <div className="max-w-xl mx-auto py-8">
      <PageHeader title={`${data.client.name} quiere conectarse`} />
      <Card>
        <div className="space-y-6">
          {data.client.logoUri && (
            <img
              src={data.client.logoUri}
              alt={data.client.name}
              className="h-12"
            />
          )}
          {!data.client.verified && (
            <p className="text-sm text-amber-700">
              Aplicación no verificada. Asegurate de que conocés a quien la
              opera.
            </p>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">
              Conectar a:
            </label>
            {data.organizations.length > 1 ? (
              <Select
                options={orgOptions}
                value={orgId}
                onChange={(value) => setOrgId(value)}
              />
            ) : (
              <p className="text-sm">
                {data.organizations[0]?.name} —{' '}
                {data.organizations[0]?.role}
              </p>
            )}
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Esta app podrá:</p>
            <ul className="space-y-2">
              {data.scopes.map((s) => (
                <li key={s.id} className="text-sm">
                  <span className="font-medium">✓ {s.label}</span>
                  <p className="text-gray-600 ml-5">{s.description}</p>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-gray-600">
            Podés revocar el acceso en cualquier momento desde Mi cuenta ›
            Aplicaciones conectadas.
          </p>

          {(data.client.policyUri || data.client.tosUri) && (
            <div className="text-xs space-x-2">
              {data.client.policyUri && (
                <a
                  href={data.client.policyUri}
                  target="_blank"
                  rel="noreferrer"
                >
                  Política de privacidad
                </a>
              )}
              {data.client.tosUri && (
                <a href={data.client.tosUri} target="_blank" rel="noreferrer">
                  Términos
                </a>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="secondary"
              onClick={() => decide(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => decide(true)}
              disabled={submitting || !orgId}
            >
              Autorizar
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default ConsentScreen;
