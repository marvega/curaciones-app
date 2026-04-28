import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getUsers, createUser } from '../services/api';
import { Navigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { Button, Input, Select, Card, PageHeader, DataTable, Tag } from '../components/ui';
import type { ColumnDef } from '../components/ui';

interface User {
  id: number;
  username: string;
  role: string;
  createdAt: string;
}

export default function UsersPage() {
  const { user, isAdmin } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', role: 'user' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const data = await getUsers();
      setUsers(data);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin, loadUsers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await createUser(form);
      setForm({ username: '', password: '', role: 'user' });
      setShowForm(false);
      await loadUsers();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al crear usuario');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;
  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const columns: ColumnDef<User>[] = [
    {
      key: 'username',
      label: 'Usuario',
      render: (u) => <span className="font-medium text-slate-800">{u.username}</span>,
    },
    {
      key: 'role',
      label: 'Rol',
      render: (u) => (
        <Tag variant={u.role === 'admin' ? 'yellow' : 'gray'}>
          {u.role === 'admin' ? 'Administrador' : 'Usuario'}
        </Tag>
      ),
    },
    {
      key: 'createdAt',
      label: 'Creado',
      render: (u) => (
        <span className="text-slate-500">{new Date(u.createdAt).toLocaleDateString()}</span>
      ),
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card padding="md" className="sm:p-6">
        <div className="mb-6">
          <PageHeader
            title="Gestión de Usuarios"
            actions={
              <Button onClick={() => setShowForm(!showForm)} leftIcon={<UserPlus className="w-4 h-4" />}>
                {showForm ? 'Cancelar' : 'Crear Usuario'}
              </Button>
            }
          />
        </div>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-6 p-5 bg-slate-50 rounded-xl border border-slate-200"
          >
            <h3 className="text-base font-semibold text-slate-800 mb-4">
              Nuevo usuario
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Input
                label="Usuario"
                type="text"
                value={form.username}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, username: e.target.value }))
                }
                required
              />
              <Input
                label="Contraseña"
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, password: e.target.value }))
                }
                required
                minLength={6}
              />
              <Select
                label="Rol"
                value={form.role}
                onChange={(v) => setForm((prev) => ({ ...prev, role: v }))}
                options={[
                  { value: 'user', label: 'Usuario' },
                  { value: 'admin', label: 'Administrador' },
                ]}
              />
            </div>
            {error && (
              <div className="mt-3 text-rose-600 text-sm bg-rose-50 border border-rose-100 px-3 py-2 rounded-lg">
                {error}
              </div>
            )}
            <Button type="submit" loading={saving} className="mt-4">
              {saving ? 'Guardando...' : 'Crear'}
            </Button>
          </form>
        )}

        <DataTable
          columns={columns}
          data={users}
          loading={loading}
          keyExtractor={(u) => u.id}
        />
      </Card>
    </div>
  );
}
