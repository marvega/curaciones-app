import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getPatient, createCuracion, updatePatient, deletePatient, getAvailability } from '../services/api';
import type { Patient, CuracionType } from '../types';

const CURACION_LABELS: Record<CuracionType, string> = {
  avanzada: 'Curación Avanzada',
  pie_diabetico: 'Curación Avanzada - Pie Diabético',
  ulcera_venosa: 'Curación Avanzada - Úlcera Venosa',
};

export default function PatientPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [curacionForm, setCuracionForm] = useState({
    type: 'avanzada' as CuracionType,
    date: new Date().toISOString().split('T')[0],
    nextAppointmentDate: '',
    nextAppointmentTime: '',
    quantity: 1,
    observations: '',
  });
  const [availability, setAvailability] = useState<any[]>([]);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    birthDate: '',
    gender: '',
    phone: '',
    address: '',
  });

  const loadPatient = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getPatient(parseInt(id));
      setPatient(data);
      setEditForm({
        firstName: data.firstName,
        lastName: data.lastName,
        birthDate: data.birthDate,
        gender: data.gender,
        phone: data.phone || '',
        address: data.address || '',
      });
    } catch {
      setPatient(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPatient();
  }, [id]);

  useEffect(() => {
    const fetchAvailability = async () => {
      if (curacionForm.nextAppointmentDate) {
        setLoadingAvailability(true);
        try {
          const data = await getAvailability(curacionForm.nextAppointmentDate);
          setAvailability(data);
        } catch {
          setAvailability([]);
        } finally {
          setLoadingAvailability(false);
        }
      } else {
        setAvailability([]);
      }
    };
    fetchAvailability();
  }, [curacionForm.nextAppointmentDate]);

  const handleSaveCuracion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) return;
    
    // Validar disponibilidad si hay hora seleccionada
    if (curacionForm.nextAppointmentDate && curacionForm.nextAppointmentTime) {
      const slot = availability.find(s => s.time === curacionForm.nextAppointmentTime);
      if (slot && !slot.available) {
        alert(`El horario ${curacionForm.nextAppointmentTime} ya está ocupado por ${slot.patient.firstName} ${slot.patient.lastName}.`);
        return;
      }
    }

    setSaving(true);
    try {
      await createCuracion({
        patientId: patient.id,
        ...curacionForm,
      });
      setShowForm(false);
      setCuracionForm({
        type: 'avanzada',
        date: new Date().toISOString().split('T')[0],
        nextAppointmentDate: '',
        nextAppointmentTime: '',
        quantity: 1,
        observations: '',
      });
      await loadPatient();
    } catch {
      alert('Error al registrar la curación');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) return;
    setSaving(true);
    try {
      await updatePatient(patient.id, editForm);
      setShowEditForm(false);
      await loadPatient();
    } catch {
      alert('Error al actualizar los datos del paciente');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!patient) return;
    setShowDeleteModal(false);
    setSaving(true);
    try {
      await deletePatient(patient.id);
      navigate('/pacientes');
    } catch {
      alert('Error al eliminar el paciente');
    } finally {
      setSaving(false);
    }
  };

  const calculateAge = (birthDate: string) => {
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="text-gray-500">Cargando ficha del paciente...</div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="text-center py-12 text-gray-500">
        Paciente no encontrado
      </div>
    );
  }

  return (
    <>
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Datos del paciente */}
      <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800">
            {patient.firstName} {patient.lastName}
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowEditForm(!showEditForm)}
              className="p-2 text-gray-400 hover:text-teal-600 transition-colors"
              title="Editar paciente"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <button
              onClick={() => setShowDeleteModal(true)}
              type="button"
              className="p-2 text-gray-400 hover:text-red-600 transition-colors"
              title="Eliminar paciente"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <span className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-sm font-medium">
              {patient.rut}
            </span>
          </div>
        </div>

        {showEditForm ? (
          <form onSubmit={handleUpdatePatient} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input
                type="text"
                value={editForm.firstName}
                onChange={(e) => setEditForm(prev => ({ ...prev, firstName: e.target.value }))}
                className="form-control w-full"
                required
              />
            </div>
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Apellido</label>
              <input
                type="text"
                value={editForm.lastName}
                onChange={(e) => setEditForm(prev => ({ ...prev, lastName: e.target.value }))}
                className="form-control w-full"
                required
              />
            </div>
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Nacimiento</label>
              <input
                type="date"
                value={editForm.birthDate}
                onChange={(e) => setEditForm(prev => ({ ...prev, birthDate: e.target.value }))}
                className="form-control w-full"
                required
              />
            </div>
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Género</label>
              <select
                value={editForm.gender}
                onChange={(e) => setEditForm(prev => ({ ...prev, gender: e.target.value }))}
                className="form-control w-full"
                required
              >
                <option value="Femenino">Femenino</option>
                <option value="Masculino">Masculino</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
              <input
                type="text"
                value={editForm.phone}
                onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                className="form-control w-full"
              />
            </div>
            <div className="col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
              <input
                type="text"
                value={editForm.address}
                onChange={(e) => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                className="form-control w-full"
              />
            </div>
            <div className="col-span-1 sm:col-span-2 flex flex-col-reverse sm:flex-row justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => setShowEditForm(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500 block">Fecha Nacimiento</span>
              <span className="font-medium">{patient.birthDate}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Edad</span>
              <span className="font-medium">
                {calculateAge(patient.birthDate)} años
              </span>
            </div>
            <div>
              <span className="text-gray-500 block">Género</span>
              <span className="font-medium">{patient.gender}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Teléfono</span>
              <span className="font-medium">{patient.phone || '-'}</span>
            </div>
            <div className="col-span-2">
              <span className="text-gray-500 block">Dirección</span>
              <span className="font-medium">{patient.address || '-'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Botón nueva curación */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-5 py-2.5 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 transition-colors"
        >
          {showForm ? 'Cancelar' : '+ Nueva Curación'}
        </button>
      </div>

      {/* Formulario nueva curación */}
      {showForm && (
        <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-4">
            Registrar Curación
          </h3>
          <form onSubmit={handleSaveCuracion} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Curación *
                </label>
                <select
                  value={curacionForm.type}
                  onChange={(e) =>
                    setCuracionForm((prev) => ({
                      ...prev,
                      type: e.target.value as CuracionType,
                    }))
                  }
                  className="form-control w-full"
                >
                  <option value="avanzada">Curación Avanzada</option>
                  <option value="pie_diabetico">
                    Curación Avanzada - Pie Diabético
                  </option>
                  <option value="ulcera_venosa">
                    Curación Avanzada - Úlcera Venosa
                  </option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de Curación *
                </label>
                <input
                  type="date"
                  value={curacionForm.date}
                  onChange={(e) =>
                    setCuracionForm((prev) => ({
                      ...prev,
                      date: e.target.value,
                    }))
                  }
                  required
                  className="form-control w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cantidad de Curaciones *
                </label>
                <input
                  type="number"
                  min={1}
                  value={curacionForm.quantity}
                  onChange={(e) =>
                    setCuracionForm((prev) => ({
                      ...prev,
                      quantity: parseInt(e.target.value) || 1,
                    }))
                  }
                  required
                  className="form-control w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Próxima Cita (Fecha)
                </label>
                <input
                  type="date"
                  value={curacionForm.nextAppointmentDate}
                  onChange={(e) =>
                    setCuracionForm((prev) => ({
                      ...prev,
                      nextAppointmentDate: e.target.value,
                      nextAppointmentTime: '', // Reset time when date changes
                    }))
                  }
                  className="form-control w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Próxima Cita (Hora)
                </label>
                <select
                  value={curacionForm.nextAppointmentTime}
                  onChange={(e) =>
                    setCuracionForm((prev) => ({
                      ...prev,
                      nextAppointmentTime: e.target.value,
                    }))
                  }
                  disabled={!curacionForm.nextAppointmentDate || loadingAvailability}
                  className="form-control w-full disabled:bg-gray-50"
                >
                  <option value="">{loadingAvailability ? 'Cargando disponibilidad...' : 'Seleccionar hora'}</option>
                  {availability.map((slot) => (
                    <option 
                      key={slot.time} 
                      value={slot.time}
                      disabled={!slot.available}
                      className={!slot.available ? 'text-red-500' : ''}
                    >
                      {slot.time} {slot.available ? '(Disponible)' : `(Ocupado: ${slot.patient.firstName} ${slot.patient.lastName})`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observaciones
              </label>
              <textarea
                value={curacionForm.observations}
                onChange={(e) =>
                  setCuracionForm((prev) => ({
                    ...prev,
                    observations: e.target.value,
                  }))
                }
                rows={3}
                className="form-control w-full resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando...' : 'Registrar Curación'}
            </button>
          </form>
        </div>
      )}

      {/* Historial de curaciones */}
      <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Historial de Curaciones
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({patient.curaciones?.length || 0} registros)
          </span>
        </h3>

        {patient.curaciones && patient.curaciones.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-2 font-medium text-gray-600">
                    Fecha
                  </th>
                  <th className="text-left py-3 px-2 font-medium text-gray-600">
                    Tipo
                  </th>
                  <th className="text-center py-3 px-2 font-medium text-gray-600">
                    Cant.
                  </th>
                  <th className="text-left py-3 px-2 font-medium text-gray-600">
                    Próxima Cita
                  </th>
                  <th className="text-left py-3 px-2 font-medium text-gray-600">
                    Observaciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {patient.curaciones.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="py-3 px-2">{c.date}</td>
                    <td className="py-3 px-2">
                      <span className="px-2 py-1 bg-teal-50 text-teal-700 rounded-lg text-xs font-medium">
                        {CURACION_LABELS[c.type]}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-center font-medium">
                      {c.quantity || 1}
                    </td>
                    <td className="py-3 px-2">
                      {c.nextAppointmentDate
                        ? `${c.nextAppointmentDate} ${c.nextAppointmentTime || ''}`
                        : '-'}
                    </td>
                    <td className="py-3 px-2 text-gray-600">
                      {c.observations || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-6">
            No hay curaciones registradas
          </p>
        )}
      </div>
    </div>

    {/* Modal de confirmación para eliminar */}
    {showDeleteModal && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={() => setShowDeleteModal(false)}
      >
        <div
          className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            Confirmar eliminación
          </h3>
          <p className="text-gray-600 mb-6">
            ¿Está seguro de que desea eliminar al paciente{' '}
            <strong>{patient.firstName} {patient.lastName}</strong>? Esta acción no
            se puede deshacer y se eliminará también su historial de curaciones.
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowDeleteModal(false)}
              className="px-4 py-2.5 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={saving}
              className="px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
