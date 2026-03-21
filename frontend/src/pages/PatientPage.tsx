import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getPatient, createCuracion, updatePatient, deletePatient, getAvailability, createAppointment, deleteAppointment, getPatientAppointments, dischargePatient, readmitPatient, getPatientStatusHistory, updateCuracion, downloadPatientPdf } from '../services/api';
import type { Patient, CuracionType, Appointment, PatientStatusChange } from '../types';
import { Pencil, Trash2, Plus, CalendarPlus, UserCheck, RotateCcw, X, Loader2, FileText, FileDown } from 'lucide-react';

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
    appointmentDate: '',
    appointmentTime: '',
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

  const [downloadingPdf, setDownloadingPdf] = useState(false);

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
      if (curacionForm.appointmentDate) {
        setLoadingAvailability(true);
        try {
          const data = await getAvailability(curacionForm.appointmentDate);
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
  }, [curacionForm.appointmentDate]);

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

    if (curacionForm.appointmentDate && curacionForm.appointmentTime) {
      const slot = availability.find(s => s.time === curacionForm.appointmentTime);
      if (slot && !slot.available) {
        alert(`El horario ${curacionForm.appointmentTime} ya está ocupado por ${slot.patient.firstName} ${slot.patient.lastName}.`);
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
        appointmentDate: '',
        appointmentTime: '',
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
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="skeleton h-7 w-48" />
            <div className="flex gap-2">
              <div className="skeleton h-8 w-20 rounded-lg" />
              <div className="skeleton h-8 w-20 rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <div className="skeleton h-3 w-20 mb-2" />
                <div className="skeleton h-4 w-28" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="text-center py-16">
        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
          <FileText className="w-6 h-6 text-slate-400" />
        </div>
        <p className="text-slate-500">Paciente no encontrado</p>
      </div>
    );
  }

  return (
    <>
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Patient info */}
      <div className="card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800">
            {patient.firstName} {patient.lastName}
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowEditForm(!showEditForm)}
              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all cursor-pointer"
              title="Editar paciente"
            >
              <Pencil className="w-4.5 h-4.5" />
            </button>
            <button
              onClick={async () => {
                if (!patient) return;
                setDownloadingPdf(true);
                try {
                  await downloadPatientPdf(patient.id);
                } catch {
                  alert('Error al descargar PDF');
                } finally {
                  setDownloadingPdf(false);
                }
              }}
              disabled={downloadingPdf}
              className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all cursor-pointer disabled:opacity-50"
              title="Descargar ficha clínica PDF"
            >
              {downloadingPdf ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <FileDown className="w-4.5 h-4.5" />}
            </button>
            <button
              onClick={() => setShowDeleteModal(true)}
              type="button"
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
              title="Eliminar paciente"
            >
              <Trash2 className="w-4.5 h-4.5" />
            </button>
            <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium">
              {patient.rut}
            </span>
            <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
              patient.status === 'discharged'
                ? 'bg-slate-100 text-slate-600 border border-slate-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}>
              {patient.status === 'discharged' ? 'Alta médica' : 'Activo'}
            </span>
          </div>
        </div>

        {showEditForm ? (
          <form onSubmit={handleUpdatePatient} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div className="col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre</label>
              <input
                type="text"
                value={editForm.firstName}
                onChange={(e) => setEditForm(prev => ({ ...prev, firstName: e.target.value }))}
                className="form-control w-full"
                required
              />
            </div>
            <div className="col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Apellido</label>
              <input
                type="text"
                value={editForm.lastName}
                onChange={(e) => setEditForm(prev => ({ ...prev, lastName: e.target.value }))}
                className="form-control w-full"
                required
              />
            </div>
            <div className="col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Fecha Nacimiento</label>
              <input
                type="date"
                value={editForm.birthDate}
                onChange={(e) => setEditForm(prev => ({ ...prev, birthDate: e.target.value }))}
                className="form-control w-full"
                required
              />
            </div>
            <div className="col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Género</label>
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
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Teléfono</label>
              <input
                type="text"
                value={editForm.phone}
                onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                className="form-control w-full"
              />
            </div>
            <div className="col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Dirección</label>
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
                className="btn-secondary cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-primary cursor-pointer flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-slate-400 block text-xs uppercase tracking-wider mb-0.5">Fecha Nacimiento</span>
              <span className="font-medium text-slate-800">{patient.birthDate}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-xs uppercase tracking-wider mb-0.5">Edad</span>
              <span className="font-medium text-slate-800">
                {calculateAge(patient.birthDate)} años
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-xs uppercase tracking-wider mb-0.5">Género</span>
              <span className="font-medium text-slate-800">{patient.gender}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-xs uppercase tracking-wider mb-0.5">Teléfono</span>
              <span className="font-medium text-slate-800">{patient.phone || '-'}</span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-400 block text-xs uppercase tracking-wider mb-0.5">Dirección</span>
              <span className="font-medium text-slate-800">{patient.address || '-'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-2">
        {patient.status !== 'discharged' ? (
          <>
            <button
              onClick={() => { setShowAppointmentForm(!showAppointmentForm); setShowForm(false); }}
              className="btn-primary cursor-pointer inline-flex items-center gap-2 text-sm"
            >
              <CalendarPlus className="w-4 h-4" />
              {showAppointmentForm ? 'Cancelar' : 'Agendar Cita'}
            </button>
            <button
              onClick={() => { setShowForm(!showForm); setShowAppointmentForm(false); }}
              className="btn-primary cursor-pointer inline-flex items-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              {showForm ? 'Cancelar' : 'Nueva Curación'}
            </button>
            <button
              onClick={() => setShowDischargeModal(true)}
              className="btn-secondary cursor-pointer inline-flex items-center gap-2 text-sm"
            >
              <UserCheck className="w-4 h-4" />
              Dar de Alta
            </button>
          </>
        ) : (
          <button
            onClick={handleReadmit}
            disabled={saving}
            className="btn-success cursor-pointer inline-flex items-center gap-2 text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            {saving ? 'Reingresando...' : 'Reingresar Paciente'}
          </button>
        )}
      </div>

      {/* Appointment form */}
      {showAppointmentForm && (
        <div className="card p-5 sm:p-6">
          <h3 className="text-base font-semibold text-slate-800 mb-4">Agendar Cita</h3>
          <form onSubmit={handleSaveAppointment} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Fecha *</label>
                <input type="date" value={appointmentForm.date}
                  onChange={(e) => setAppointmentForm(prev => ({ ...prev, date: e.target.value, time: '' }))}
                  required className="form-control w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Hora *</label>
                <select value={appointmentForm.time}
                  onChange={(e) => setAppointmentForm(prev => ({ ...prev, time: e.target.value }))}
                  disabled={!appointmentForm.date || loadingAppointmentAvailability}
                  required className="form-control w-full disabled:bg-slate-50">
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
              className="btn-primary w-full cursor-pointer flex items-center justify-center gap-2">
              {savingAppointment ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {savingAppointment ? 'Agendando...' : 'Agendar Cita'}
            </button>
          </form>
        </div>
      )}

      {/* New curacion form */}
      {showForm && (
        <div className="card p-5 sm:p-6">
          <h3 className="text-base font-semibold text-slate-800 mb-4">
            Registrar Curación
          </h3>
          <form onSubmit={handleSaveCuracion} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
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
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
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
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
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
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Próxima Cita (Fecha)
                  </label>
                  <input
                    type="date"
                    value={curacionForm.appointmentDate}
                    onChange={(e) =>
                      setCuracionForm((prev) => ({
                        ...prev,
                        appointmentDate: e.target.value,
                        appointmentTime: '',
                      }))
                    }
                    className="form-control w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Próxima Cita (Hora)
                  </label>
                  <select
                    value={curacionForm.appointmentTime}
                    onChange={(e) =>
                      setCuracionForm((prev) => ({
                        ...prev,
                        appointmentTime: e.target.value,
                      }))
                    }
                    disabled={!curacionForm.appointmentDate || loadingAvailability}
                    className="form-control w-full disabled:bg-slate-50"
                  >
                    <option value="">{loadingAvailability ? 'Cargando disponibilidad...' : 'Seleccionar hora'}</option>
                    {availability.map((slot) => (
                      <option
                        key={slot.time}
                        value={slot.time}
                        disabled={!slot.available}
                        className={!slot.available ? 'text-rose-500' : ''}
                      >
                        {slot.time} {slot.available ? '(Disponible)' : `(Ocupado: ${slot.patient.firstName} ${slot.patient.lastName})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
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

            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={dischargeCheckbox}
                onChange={(e) => setDischargeCheckbox(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              Dar de alta al paciente
            </label>

            <button
              type="submit"
              disabled={saving}
              className="btn-primary w-full cursor-pointer flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? 'Guardando...' : 'Registrar Curación'}
            </button>
          </form>
        </div>
      )}

      {/* Scheduled appointments */}
      {appointments.length > 0 && (
        <div className="card p-5 sm:p-6">
          <h3 className="text-base font-semibold text-slate-800 mb-4">
            Citas Agendadas
            <span className="ml-2 text-sm font-normal text-slate-400">({appointments.length})</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-2 font-medium text-slate-500 text-xs uppercase tracking-wider">Fecha</th>
                  <th className="text-left py-3 px-2 font-medium text-slate-500 text-xs uppercase tracking-wider">Hora</th>
                  <th className="text-left py-3 px-2 font-medium text-slate-500 text-xs uppercase tracking-wider">Tipo</th>
                  <th className="text-right py-3 px-2 font-medium text-slate-500 text-xs uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((apt) => (
                  <tr key={apt.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-2 text-slate-800">{apt.date}</td>
                    <td className="py-3 px-2 font-medium text-slate-800">{apt.time}</td>
                    <td className="py-3 px-2">
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                        apt.curacionId ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {apt.curacionId ? 'Seguimiento' : 'Cita Agendada'}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right">
                      <button onClick={() => handleDeleteAppointment(apt.id)}
                        className="px-3 py-1 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-medium transition-all cursor-pointer">
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

      {/* Curaciones history */}
      <div className="card p-5 sm:p-6">
        <h3 className="text-base font-semibold text-slate-800 mb-4">
          Historial de Curaciones
          <span className="ml-2 text-sm font-normal text-slate-400">
            ({patient.curaciones?.length || 0} registros)
          </span>
        </h3>

        {patient.curaciones && patient.curaciones.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-2 font-medium text-slate-500 text-xs uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="text-left py-3 px-2 font-medium text-slate-500 text-xs uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="text-center py-3 px-2 font-medium text-slate-500 text-xs uppercase tracking-wider">
                    Cant.
                  </th>
                  <th className="text-left py-3 px-2 font-medium text-slate-500 text-xs uppercase tracking-wider">
                    Próxima Cita
                  </th>
                  <th className="text-left py-3 px-2 font-medium text-slate-500 text-xs uppercase tracking-wider">
                    Observaciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {patient.curaciones.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="py-3 px-2 text-slate-800">
                      {c.date}
                      {c.edits && c.edits.length > 0 && (
                        <span className="ml-1.5 inline-flex" title={`Editado por ${c.edits[0].editedBy.username}: ${c.edits[0].reason}`}>
                          <Pencil className="w-3 h-3 text-slate-400" />
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      {isAdmin ? (
                        <span
                          onClick={(e) => { e.stopPropagation(); handleOpenEdit(c); }}
                          className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium cursor-pointer hover:bg-blue-100 transition-all"
                          title="Click para editar"
                        >
                          {CURACION_LABELS[c.type]}
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium">
                          {CURACION_LABELS[c.type]}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-center font-medium text-slate-800">
                      {c.quantity || 1}
                    </td>
                    <td className="py-3 px-2 text-slate-600">
                      {c.appointment ? `${c.appointment.date} ${c.appointment.time}` : '-'}
                    </td>
                    <td className="py-3 px-2 text-slate-500">
                      {c.observations || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-500 text-center py-8 text-sm">
            No hay curaciones registradas
          </p>
        )}
      </div>

      {/* Status history */}
      {statusHistory.length > 0 && (
        <div className="card p-5 sm:p-6">
          <h3 className="text-base font-semibold text-slate-800 mb-4">Historial de Altas y Reingresos</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-2 font-medium text-slate-500 text-xs uppercase tracking-wider">Fecha</th>
                  <th className="text-left py-3 px-2 font-medium text-slate-500 text-xs uppercase tracking-wider">Tipo</th>
                  <th className="text-left py-3 px-2 font-medium text-slate-500 text-xs uppercase tracking-wider">Usuario</th>
                </tr>
              </thead>
              <tbody>
                {statusHistory.map((sc) => (
                  <tr key={sc.id} className="border-b border-slate-100">
                    <td className="py-3 px-2 text-slate-800">{new Date(sc.createdAt).toLocaleDateString('es-CL')}</td>
                    <td className="py-3 px-2">
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                        sc.type === 'discharge' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {sc.type === 'discharge' ? 'Alta' : 'Reingreso'}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-slate-500">{sc.performedBy.username}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>

    {/* Delete confirmation modal */}
    {showDeleteModal && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        onClick={() => setShowDeleteModal(false)}
      >
        <div
          className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">
              Confirmar eliminación
            </h3>
            <button onClick={() => setShowDeleteModal(false)} className="p-1 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
          <p className="text-slate-600 text-sm mb-6">
            ¿Está seguro de que desea eliminar al paciente{' '}
            <strong>{patient.firstName} {patient.lastName}</strong>? Esta acción no
            se puede deshacer y se eliminará también su historial de curaciones.
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowDeleteModal(false)}
              className="btn-secondary cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={saving}
              className="btn-danger cursor-pointer"
            >
              {saving ? 'Eliminando...' : 'Eliminar'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Edit curacion modal */}
    {editingCuracion && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setEditingCuracion(null)}>
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">
              Editar Curación — {editingCuracion.date}
            </h3>
            <button onClick={() => setEditingCuracion(null)} className="p-1 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Tipo de Curación</label>
                <select value={curacionEditForm.type}
                  onChange={(e) => setCuracionEditForm(prev => ({ ...prev, type: e.target.value as CuracionType }))}
                  className="form-control w-full">
                  <option value="avanzada">Curación Avanzada</option>
                  <option value="pie_diabetico">Curación Avanzada - Pie Diabético</option>
                  <option value="ulcera_venosa">Curación Avanzada - Úlcera Venosa</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Cantidad</label>
                <input type="number" min={1} value={curacionEditForm.quantity}
                  onChange={(e) => setCuracionEditForm(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                  className="form-control w-full" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Próxima Cita (Fecha)</label>
                <input type="date" value={curacionEditForm.appointmentDate}
                  onChange={(e) => setCuracionEditForm(prev => ({ ...prev, appointmentDate: e.target.value, appointmentTime: '' }))}
                  className="form-control w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Próxima Cita (Hora)</label>
                <select value={curacionEditForm.appointmentTime}
                  onChange={(e) => setCuracionEditForm(prev => ({ ...prev, appointmentTime: e.target.value }))}
                  disabled={!curacionEditForm.appointmentDate || loadingEditAvailability}
                  className="form-control w-full disabled:bg-slate-50">
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
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Fecha de Curación</label>
                <input type="date" value={editingCuracion.date} disabled className="form-control w-full bg-slate-50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Observaciones</label>
                <input type="text" value={editingCuracion.observations || '-'} disabled className="form-control w-full bg-slate-50" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Motivo de la edición *</label>
              <textarea value={curacionEditForm.reason}
                onChange={(e) => setCuracionEditForm(prev => ({ ...prev, reason: e.target.value }))}
                rows={2} required placeholder="Ingrese el motivo de la corrección..."
                className="form-control w-full resize-none" />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setEditingCuracion(null)}
                className="btn-secondary cursor-pointer">
                Cancelar
              </button>
              <button type="submit" disabled={savingEdit || !curacionEditForm.reason.trim()}
                className="btn-primary cursor-pointer flex items-center gap-2">
                {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {savingEdit ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* Discharge modal */}
    {showDischargeModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowDischargeModal(false)}>
        <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">Dar de Alta</h3>
            <button onClick={() => setShowDischargeModal(false)} className="p-1 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
          {appointments.length > 0 ? (
            <p className="text-slate-600 text-sm mb-6">
              Este paciente tiene <strong>{appointments.length}</strong> cita{appointments.length !== 1 ? 's' : ''} agendada{appointments.length !== 1 ? 's' : ''}. ¿Desea cancelarlas al dar de alta?
            </p>
          ) : (
            <p className="text-slate-600 text-sm mb-6">
              ¿Confirma dar de alta a <strong>{patient.firstName} {patient.lastName}</strong>?
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowDischargeModal(false)}
              className="btn-secondary cursor-pointer">
              Cancelar
            </button>
            {appointments.length > 0 && (
              <button type="button" onClick={() => handleDischarge(false)} disabled={saving}
                className="btn-secondary cursor-pointer">
                {saving ? 'Procesando...' : 'Alta sin cancelar citas'}
              </button>
            )}
            <button type="button" onClick={() => handleDischarge(true)} disabled={saving}
              className="btn-danger cursor-pointer">
              {saving ? 'Procesando...' : (appointments.length > 0 ? 'Alta y cancelar citas' : 'Confirmar Alta')}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
