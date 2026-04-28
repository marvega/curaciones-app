import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPatient } from '../services/api';
import { Button, Card, Input, Select } from '../components/ui';

const GENDER_OPTIONS = [
  { value: 'Femenino', label: 'Femenino' },
  { value: 'Masculino', label: 'Masculino' },
  { value: 'Otro', label: 'Otro' },
];

export default function NewPatientPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialRut = searchParams.get('rut') || '';

  const [form, setForm] = useState({
    rut: initialRut,
    firstName: '',
    lastName: '',
    birthDate: '',
    gender: '',
    phone: '',
    address: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const formatRut = (value: string) => {
    const clean = value.replace(/[^0-9kK]/g, '');
    if (clean.length <= 1) return clean;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1).toUpperCase();
    const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${formatted}-${dv}`;
  };

  const validateRut = (rut: string): boolean => {
    const clean = rut.replace(/[.\-]/g, '');
    if (clean.length < 2) return false;
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1).toUpperCase();
    let sum = 0;
    let multiplier = 2;
    for (let i = body.length - 1; i >= 0; i--) {
      sum += parseInt(body[i]) * multiplier;
      multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }
    const remainder = 11 - (sum % 11);
    const expectedDv =
      remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);
    return dv === expectedDv;
  };

  const updateField = (name: string, value: string) => {
    if (name === 'rut') {
      setForm((prev) => ({ ...prev, rut: formatRut(value) }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateRut(form.rut)) {
      setError('El RUT ingresado no es válido');
      return;
    }

    setLoading(true);
    try {
      const patient = await createPatient(form);
      navigate(`/paciente/${patient.id}`);
    } catch (err: any) {
      setError(
        err.response?.data?.message || 'Error al crear el paciente',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Card padding="lg">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">
          Nuevo Paciente
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-100 text-rose-700 rounded-xl text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="RUT *"
              name="rut"
              value={form.rut}
              onChange={(e) => updateField('rut', e.target.value)}
              placeholder="12.345.678-9"
              required
            />
            <Select
              label="Género *"
              options={GENDER_OPTIONS}
              value={form.gender}
              onChange={(v) => updateField('gender', v)}
              placeholder="Seleccionar"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nombre *"
              name="firstName"
              value={form.firstName}
              onChange={(e) => updateField('firstName', e.target.value)}
              required
            />
            <Input
              label="Apellido *"
              name="lastName"
              value={form.lastName}
              onChange={(e) => updateField('lastName', e.target.value)}
              required
            />
          </div>

          <Input
            label="Fecha de Nacimiento *"
            type="date"
            name="birthDate"
            value={form.birthDate}
            onChange={(e) => updateField('birthDate', e.target.value)}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Teléfono"
              type="tel"
              name="phone"
              value={form.phone}
              onChange={(e) => updateField('phone', e.target.value)}
            />
            <Input
              label="Dirección"
              name="address"
              value={form.address}
              onChange={(e) => updateField('address', e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate(-1)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={loading}
              className="flex-1"
            >
              {loading ? 'Guardando...' : 'Guardar Paciente'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
