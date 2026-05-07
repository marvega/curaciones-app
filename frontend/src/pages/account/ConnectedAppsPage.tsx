import { useEffect, useState } from 'react';
import { Button, Card, EmptyState, PageHeader, Skeleton } from '../../components/ui';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import {
  listConnectedApps,
  revokeConnectedApp,
  type ConnectedApp,
} from '../../api/oauth';

export default function ConnectedAppsPage() {
  const [apps, setApps] = useState<ConnectedApp[] | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const { showSuccess, showError } = useToast();
  const confirm = useConfirm();

  async function load() {
    setApps(await listConnectedApps());
  }

  useEffect(() => {
    load().catch(() => {
      setApps([]);
      showError('Error al cargar las apps.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onRevoke(app: ConnectedApp) {
    if (revoking) return;
    const ok = await confirm({
      title: 'Revocar acceso',
      message: `Vas a revocar el acceso de ${app.client.name} a ${app.organizationName}. Esto cierra cualquier sesión activa de la app inmediatamente.`,
      confirmText: 'Revocar',
      cancelText: 'Cancelar',
      variant: 'destructive',
    });
    if (!ok) return;
    setRevoking(app.grantId);
    try {
      await revokeConnectedApp(app.grantId);
      showSuccess('Acceso revocado.');
      try {
        await load();
      } catch {
        // reload failed but revoke succeeded — silently ignore
      }
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      showError(err?.response?.data?.message ?? 'No pudimos revocar.');
    } finally {
      setRevoking(null);
    }
  }

  if (apps === null) {
    return (
      <div className="space-y-3">
        <Skeleton height={24} width="40%" />
        <Skeleton height={80} />
        <Skeleton height={80} />
        <Skeleton height={80} />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Aplicaciones conectadas"
        subtitle="Estas aplicaciones pueden acceder a tu cuenta. Revocar el acceso es inmediato."
      />
      {apps.length === 0 ? (
        <EmptyState
          title="No tenés aplicaciones conectadas"
          description="Cuando una app pida acceso a tu cuenta, podrás verla acá."
        />
      ) : (
        <div className="space-y-4 mt-4">
          {apps.map((a) => (
            <Card key={a.grantId}>
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    {a.client.logoUri && (
                      <img
                        src={a.client.logoUri}
                        alt={a.client.name}
                        className="h-8"
                      />
                    )}
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200">
                      {a.client.name}
                    </h3>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Conectada a <strong>{a.organizationName}</strong> ·{' '}
                    {a.scopes.length} permisos
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {a.lastUsedAt
                      ? `Último uso: ${new Date(a.lastUsedAt).toLocaleString('es-CL')}`
                      : 'Aún no se usó'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Conectada el{' '}
                    {new Date(a.createdAt).toLocaleDateString('es-CL')}
                  </p>
                </div>
                <Button
                  variant="danger"
                  onClick={() => onRevoke(a)}
                  loading={revoking === a.grantId}
                  disabled={revoking !== null}
                >
                  Revocar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
