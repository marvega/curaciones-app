import { useEffect, useState } from 'react';
import {
  listMembers,
  inviteMember,
  updateMemberRole,
  revokeMember,
} from '../../services/api';
import {
  Button,
  Input,
  Select,
  PageHeader,
  DataTable,
  Modal,
} from '../../components/ui';
import type { ColumnDef } from '../../components/ui';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';

interface Member {
  userId: number;
  username: string;
  email: string;
  role: string;
  status: string;
}

const ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'clinician', label: 'Clinician' },
  { value: 'receptionist', label: 'Receptionist' },
];

const INVITE_ROLE_OPTIONS = ROLE_OPTIONS.filter((o) => o.value !== 'owner');

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('clinician');
  const { showSuccess, showError } = useToast();
  const confirm = useConfirm();

  const reload = async () => {
    setLoading(true);
    try {
      setMembers(await listMembers());
    } catch (e) {
      const err = e as { response?: { data?: { message?: string } } };
      showError(err?.response?.data?.message ?? 'Error al cargar miembros');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cols: ColumnDef<Member>[] = [
    { key: 'username', label: 'Usuario', render: (m) => m.username },
    { key: 'email', label: 'Email', render: (m) => m.email },
    {
      key: 'role',
      label: 'Rol',
      render: (m) => (
        <Select
          value={m.role}
          onChange={async (value) => {
            try {
              await updateMemberRole(m.userId, value);
              reload();
            } catch (e) {
              const err = e as { response?: { data?: { message?: string } } };
              showError(err?.response?.data?.message ?? 'Error');
            }
          }}
          options={ROLE_OPTIONS}
        />
      ),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (m) => (
        <Button
          variant="danger"
          size="sm"
          onClick={async () => {
            const ok = await confirm({
              title: 'Revocar acceso',
              message: `¿Revocar a ${m.username}?`,
            });
            if (ok) {
              try {
                await revokeMember(m.userId);
                reload();
              } catch (e) {
                const err = e as { response?: { data?: { message?: string } } };
                showError(err?.response?.data?.message ?? 'Error');
              }
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
        title="Miembros"
        actions={<Button onClick={() => setOpen(true)}>Invitar</Button>}
      />
      <DataTable
        columns={cols}
        data={members}
        loading={loading}
        keyExtractor={(m) => String(m.userId)}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Invitar a un nuevo miembro"
      >
        <div className="space-y-3">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Select
            label="Rol"
            value={role}
            onChange={setRole}
            options={INVITE_ROLE_OPTIONS}
          />
          <Button
            onClick={async () => {
              try {
                await inviteMember(email, role);
                showSuccess('Invitación enviada');
                setOpen(false);
                setEmail('');
              } catch (e) {
                const err = e as { response?: { data?: { message?: string } } };
                showError(err?.response?.data?.message ?? 'Error');
              }
            }}
          >
            Enviar invitación
          </Button>
        </div>
      </Modal>
    </>
  );
}
