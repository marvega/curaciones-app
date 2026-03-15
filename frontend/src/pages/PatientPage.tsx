import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getPatient, createCuracion, updatePatient, deletePatient, getAvailability, createAppointment, deleteAppointment, getPatientAppointments, dischargePatient, readmitPatient, getPatientStatusHistory, updateCuracion } from '../services/api';
import type { Patient, CuracionType, Appointment, PatientStatusChange } from '../types';

const CURACION_LABELS: Record<CuracionType, string> = {
  avanzada: 'Curación Avanzada',
  pie_diabetico: 'Curación Avanzada - Pie Diabético',
  ulcera_venosa: 'Curación Avanzada - Úlcera Venosa',
};

export default function PatientPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDischargeModal, setShowDischargeModal] = useState(false);
  const [statusHistory, setStatusHistory] = useState<PatientStatusChange[]>([]);
  const [dischargeCheckbox, setDischargeCheckbox] = useState(false);

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
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentForm, setAppointmentForm] = useState({ date: '', time: '' });
  const [appointmentAvailability, setAppointmentAvailability] = useState<any[]>([]);
  const [loadingAppointmentAvailability, setLoadingAppointmentAvailability] = useState(false);
  const [savingAppointment, setSavingAppointment] = useState(false);

  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    birthDate: '',
    gender: '',
    phone: '',
    address: '',
  });

  const [editingCuracion, setEditingCuracion] = useState<any>(null);
  const [curacionEditForm, setCuracionEditForm] = useState({
    type: '' as CuracionType,
    quantity: 1,
    appointmentDate: '',
    appointmentTime: '',
    reason: '',
  });
  const [editAvailability, setEditAvailability] = useState<any[]>([]);
  const [loadingEditAvailability, setLoadingEditAvailability] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

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

  const loadAppointments = async () => {
    if (!id) return;
    try {
      const data = await getPatientAppointments(parseInt(id));
      const today = new Date().toISOString().split('T')[0];
      setAppointments(data.filter(a => a.date >= today));
    } catch {
      setAppointments([]);
    }
  };

  const loadStatusHistory = async () => {
    if (!id) return;
    try {
      const data = await getPatientStatusHistory(parseInt(id));
      setStatusHistory(data);
    } catch {
      setStatusHistory([]);
    }
  };

  useEffect(() => {
    loadPatient();
    loadAppointments();
    loadStatusHistory();
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

  useEffect(() => {
    const fetchAvailability = async () => {
      if (appointmentForm.date) {
        setLoadingAppointmentAvailability(true);
        try {
          const data = await getAvailability(appointmentForm.date);
          setAppointmentAvailability(data);
        } catch {
          setAppointmentAvailability([]);
        } finally {
          setLoadingAppointmentAvailability(false);
        }
      } else {
        setAppointmentAvailability([]);
      }
    };
    fetchAvailability();
  }, [appointmentForm.date]);

  useEffect(() => {
    const fetchAvailability = async () => {
      if (curacionEditForm.appointmentDate) {
        setLoadingEditAvailability(true);
        try {
          const data = await getAvailability(curacionEditForm.appointmentDate);
          setEditAvailability(data);
        } catch {
          setEditAvailability([]);
        } finally {
          setLoadingEditAvailability(false);
        }
      } else {
        setEditAvailability([]);
      }
    };
    fetchAvailability();
  }, [curacionEditForm.appointmentDate]);

  const handleOpenEdit = (curacion: any) => {
    setEditingCuracion(curacion);
    setCuracionEditForm({
      type: curacion.type,
      quantity: curacion.quantity || 1,
      appointmentDate: curacion.appointment?.date || '',
      appointmentTime: curacion.appointment?.time || '',
      reason: '',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCuracion || !curacionEditForm.reason.trim()) return;
    setSavingEdit(true);
    try {
      await updateCuracion(editingCuracion.id, {
        type: curacionEditForm.type,
        quantity: curacionEditForm.quantity,
        appointmentDate: curacionEditForm.appointmentDate || null,
        appointmentTime: curacionEditForm.appointmentTime || null,
        reason: curacionEditForm.reason,
      });
      setEditingCuracion(null);
      await loadPatient();
      await loadAppointments();
    } catch {
      alert('Error al editar la curación');
    } finally {
      setSavingEdit(false);
    }
  };

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
      if (dischargeCheckbox) {
        await dischargePatient(patient.id, true);
        setDischargeCheckbox(false);
        await loadPatient();
        await loadAppointments();
        await loadStatusHistory();
      }
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

  const handleSaveAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient || !appointmentForm.date || !appointmentForm.time) return;
    setSavingAppointment(true);
    try {
      await createAppointment(patient.id, appointmentForm.date, appointmentForm.time);
      setShowAppointmentForm(false);
      setAppointmentForm({ date: '', time: '' });
      await loadAppointments();
    } catch {
      alert('Error al agendar la cita');
    } finally {
      setSavingAppointment(false);
    }
  };

  const handleDeleteAppointment = async (appointmentId: number) => {
    if (!confirm('¿Desea cancelar esta cita?')) return;
    try {
      await deleteAppointment(appointmentId);
      await loadAppointments();
    } catch {
      alert('Error al cancelar la cita');
    }
  };

  const handleDischarge = async (cancelAppointments: boolean) => {
    if (!patient) return;
    setSaving(true);
    try {
      await dischargePatient(patient.id, cancelAppointments);
      setShowDischargeModal(false);
      await loadPatient();
      await loadAppointments();
      await loadStatusHistory();
    } catch {
      alert('Error al dar de alta al paciente');
    } finally {
      setSaving(false);
    }
  };

  const handleReadmit = async () => {
    if (!patient) return;
    if (!confirm(`¿Confirma reingresar a ${patient.firstName} ${patient.lastName}?`)) return;
    setSaving(true);
    try {
      await readmitPatient(patient.id);
      await loadPatient();
      await loadStatusHistory();
    } catch {
      alert('Error al reingresar al paciente');
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
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              patient.status === 'discharged'
                ? 'bg-gray-100 text-gray-600'
                : 'bg-green-100 text-green-700'
            }`}>
              {patient.status === 'discharged' ? 'Alta médica' : 'Activo'}
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

      {/* Botones de acción */}
      <div className="flex justify-end gap-2">
        {patient.status !== 'discharged' ? (
          <>
            <button
              onClick={() => { setShowAppointmentForm(!showAppointmentForm); setShowForm(false); }}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
            >
              {showAppointmentForm ? 'Cancelar' : 'Agendar Cita'}
            </button>
            <button
              onClick={() => { setShowForm(!showForm); setShowAppointmentForm(false); }}
              className="px-5 py-2.5 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 transition-colors"
            >
              {showForm ? 'Cancelar' : '+ Nueva Curación'}
            </button>
            <button
              onClick={() => setShowDischargeModal(true)}
              className="px-5 py-2.5 bg-gray-600 text-white rounded-xl font-medium hover:bg-gray-700 transition-colors"
            >
              Dar de Alta
            </button>
          </>
        ) : (
          <button
            onClick={handleReadmit}
            disabled={saving}
            className="px-5 py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Reingresando...' : 'Reingresar Paciente'}
          </button>
        )}
      </div>

      {/* Formulario nueva cita */}
      {showAppointmentForm && (
        <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-4">Agendar Cita</h3>
          <form onSubmit={handleSaveAppointment} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
                <input type="date" value={appointmentForm.date}
                  onChange={(e) => setAppointmentForm(prev => ({ ...prev, date: e.target.value, time: '' }))}
                  required className="form-control w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hora *</label>
                <select value={appointmentForm.time}
                  onChange={(e) => setAppointmentForm(prev => ({ ...prev, time: e.target.value }))}
                  disabled={!appointmentForm.date || loadingAppointmentAvailability}
                  required className="form-control w-full disabled:bg-gray-50">
                  <option value="">{loadingAppointmentAvailability ? 'Cargando...' : 'Seleccionar hora'}</option>
                  {appointmentAvailability.map((slot) => (
                    <option key={slot.time} value={slot.time} disabled={!slot.available}>
                      {slot.time} {slot.available ? '(Disponible)' : `(Ocupado: ${slot.patient.firstName} ${slot.patient.lastName})`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button type="submit" disabled={savingAppointment}
              className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {savingAppointment ? 'Agendando...' : 'Agendar Cita'}
            </button>
          </form>
        </div>
      )}

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

            {!dischargeCheckbox && (
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
            )}

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

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={dischargeCheckbox}
                onChange={(e) => setDischargeCheckbox(e.target.checked)}
                className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
              Dar de alta al paciente
            </label>

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

      {/* Citas agendadas */}
      {appointments.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Citas Agendadas
            <span className="ml-2 text-sm font-normal text-gray-500">({appointments.length})</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-2 font-medium text-gray-600">Fecha</th>
                  <th className="text-left py-3 px-2 font-medium text-gray-600">Hora</th>
                  <th className="text-left py-3 px-2 font-medium text-gray-600">Tipo</th>
                  <th className="text-right py-3 px-2 font-medium text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((apt) => (
                  <tr key={apt.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-2">{apt.date}</td>
                    <td className="py-3 px-2 font-medium">{apt.time}</td>
                    <td className="py-3 px-2">
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                        apt.curacionId ? 'bg-teal-50 text-teal-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {apt.curacionId ? 'Seguimiento' : 'Cita Agendada'}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right">
                      <button onClick={() => handleDeleteAppointment(apt.id)}
                        className="px-3 py-1 text-red-600 hover:bg-red-50 rounded-lg text-xs font-medium transition-colors">
                        Cancelar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                    <td className="py-3 px-2">
                      {c.date}
                      {c.edits && c.edits.length > 0 && (
                        <span className="ml-1 text-gray-400" title={`Editado por ${c.edits[0].editedBy.username}: ${c.edits[0].reason}`}>
                          ✏️
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      {isAdmin ? (
                        <span
                          onClick={(e) => { e.stopPropagation(); handleOpenEdit(c); }}
                          className="px-2 py-1 bg-teal-50 text-teal-700 rounded-lg text-xs font-medium cursor-pointer hover:bg-teal-100 transition-colors"
                          title="Click para editar"
                        >
                          {CURACION_LABELS[c.type]}
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-teal-50 text-teal-700 rounded-lg text-xs font-medium">
                          {CURACION_LABELS[c.type]}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-center font-medium">
                      {c.quantity || 1}
                    </td>
                    <td className="py-3 px-2">
                      {c.appointment
                        ? `${c.appointment.date} ${c.appointment.time}`
                        : (c.nextAppointmentDate
                          ? `${c.nextAppointmentDate} ${c.nextAppointmentTime || ''}`
                          : '-')}
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

      {/* Historial de altas y reingresos */}
      {statusHistory.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Historial de Altas y Reingresos</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-2 font-medium text-gray-600">Fecha</th>
                  <th className="text-left py-3 px-2 font-medium text-gray-600">Tipo</th>
                  <th className="text-left py-3 px-2 font-medium text-gray-600">Usuario</th>
                </tr>
              </thead>
              <tbody>
                {statusHistory.map((sc) => (
                  <tr key={sc.id} className="border-b border-gray-100">
                    <td className="py-3 px-2">{new Date(sc.createdAt).toLocaleDateString('es-CL')}</td>
                    <td className="py-3 px-2">
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                        sc.type === 'discharge' ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'
                      }`}>
                        {sc.type === 'discharge' ? 'Alta' : 'Reingreso'}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-gray-600">{sc.performedBy.username}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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

    {/* Modal de edición de curación */}
    {editingCuracion && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditingCuracion(null)}>
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Editar Curación — {editingCuracion.date}
          </h3>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Curación</label>
                <select value={curacionEditForm.type}
                  onChange={(e) => setCuracionEditForm(prev => ({ ...prev, type: e.target.value as CuracionType }))}
                  className="form-control w-full">
                  <option value="avanzada">Curación Avanzada</option>
                  <option value="pie_diabetico">Curación Avanzada - Pie Diabético</option>
                  <option value="ulcera_venosa">Curación Avanzada - Úlcera Venosa</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                <input type="number" min={1} value={curacionEditForm.quantity}
                  onChange={(e) => setCuracionEditForm(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                  className="form-control w-full" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Próxima Cita (Fecha)</label>
                <input type="date" value={curacionEditForm.appointmentDate}
                  onChange={(e) => setCuracionEditForm(prev => ({ ...prev, appointmentDate: e.target.value, appointmentTime: '' }))}
                  className="form-control w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Próxima Cita (Hora)</label>
                <select value={curacionEditForm.appointmentTime}
                  onChange={(e) => setCuracionEditForm(prev => ({ ...prev, appointmentTime: e.target.value }))}
                  disabled={!curacionEditForm.appointmentDate || loadingEditAvailability}
                  className="form-control w-full disabled:bg-gray-50">
                  <option value="">{loadingEditAvailability ? 'Cargando...' : 'Seleccionar hora'}</option>
                  {editAvailability.map((slot) => (
                    <option key={slot.time} value={slot.time} disabled={!slot.available}>
                      {slot.time} {slot.available ? '(Disponible)' : `(Ocupado)`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 opacity-50">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Curación</label>
                <input type="date" value={editingCuracion.date} disabled className="form-control w-full bg-gray-50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                <input type="text" value={editingCuracion.observations || '-'} disabled className="form-control w-full bg-gray-50" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Motivo de la edición *</label>
              <textarea value={curacionEditForm.reason}
                onChange={(e) => setCuracionEditForm(prev => ({ ...prev, reason: e.target.value }))}
                rows={2} required placeholder="Ingrese el motivo de la corrección..."
                className="form-control w-full resize-none" />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setEditingCuracion(null)}
                className="px-4 py-2.5 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={savingEdit || !curacionEditForm.reason.trim()}
                className="px-4 py-2.5 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors">
                {savingEdit ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* Modal de dar de alta */}
    {showDischargeModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowDischargeModal(false)}>
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Dar de Alta</h3>
          {appointments.length > 0 ? (
            <p className="text-gray-600 mb-6">
              Este paciente tiene <strong>{appointments.length}</strong> cita{appointments.length !== 1 ? 's' : ''} agendada{appointments.length !== 1 ? 's' : ''}. ¿Desea cancelarlas al dar de alta?
            </p>
          ) : (
            <p className="text-gray-600 mb-6">
              ¿Confirma dar de alta a <strong>{patient.firstName} {patient.lastName}</strong>?
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowDischargeModal(false)}
              className="px-4 py-2.5 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            {appointments.length > 0 && (
              <button type="button" onClick={() => handleDischarge(false)} disabled={saving}
                className="px-4 py-2.5 bg-gray-600 text-white rounded-xl font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {saving ? 'Procesando...' : 'Alta sin cancelar citas'}
              </button>
            )}
            <button type="button" onClick={() => handleDischarge(true)} disabled={saving}
              className="px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
              {saving ? 'Procesando...' : (appointments.length > 0 ? 'Alta y cancelar citas' : 'Confirmar Alta')}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
