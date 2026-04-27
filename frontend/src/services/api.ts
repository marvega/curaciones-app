import axios from 'axios';
import type {
  Patient,
  Curacion,
  CuracionEdit,
  MonthlyReport,
  DetailedReport,
  PaginatedResponse,
  MonthlyCycle,
  Appointment,
  AgendaItem,
  PatientStatusChange,
  DashboardTodayItem,
  PatientNoAppointment,
  PatientInactive,
  UserPreferences,
  WoundPhoto,
  WoundNote,
  WoundEvolutionPoint,
  ConsentSignature,
} from '../types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('curaciones_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // No redirigir en 401 para login (credenciales incorrectas)
    const isLoginRequest = err.config?.url?.includes('/auth/login');
    if (err.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('curaciones_token');
      localStorage.removeItem('curaciones_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

// Auth
export const login = async (username: string, password: string) => {
  const { data } = await api.post('/auth/login', { username, password });
  return data;
};

// Users (admin only)
export const getUsers = async () => {
  const { data } = await api.get('/users');
  return data;
};

export const createUser = async (user: {
  username: string;
  password: string;
  role?: string;
}) => {
  const { data } = await api.post('/users', user);
  return data;
};

// Patients
export const searchPatientByRut = async (
  rut: string,
): Promise<Patient | null> => {
  const { data } = await api.get('/patients', { params: { rut } });
  if (data.found === false) return null;
  return data;
};

export const getPatient = async (id: number): Promise<Patient> => {
  const { data } = await api.get(`/patients/${id}`);
  return data;
};

export const createPatient = async (
  patient: Omit<Patient, 'id' | 'createdAt' | 'updatedAt' | 'curaciones'>,
): Promise<Patient> => {
  const { data } = await api.post('/patients', patient);
  return data;
};

export const getPatientsPaginated = async (
  page: number = 1,
  limit: number = 20,
): Promise<PaginatedResponse<Patient>> => {
  const { data } = await api.get('/patients', { params: { page, limit } });
  return data;
};

export const searchPatientsAdvanced = async (filters: {
  page?: number;
  limit?: number;
  status?: string;
  gender?: string;
  curacionType?: string;
  dateFrom?: string;
  dateTo?: string;
  ageMin?: number;
  ageMax?: number;
}): Promise<PaginatedResponse<Patient>> => {
  const { data } = await api.get('/patients', { params: filters });
  return data;
};

export const updatePatient = async (
  id: number,
  patient: Partial<Patient>,
): Promise<Patient> => {
  const { data } = await api.put(`/patients/${id}`, patient);
  return data;
};

export const deletePatient = async (id: number): Promise<void> => {
  await api.delete(`/patients/${id}`);
};

export const seedPatients = async (): Promise<{ created: number }> => {
  const { data } = await api.post('/patients/seed');
  return data;
};

// Curaciones
export const createCuracion = async (
  curacion: Omit<Curacion, 'id' | 'createdAt' | 'patient'>,
): Promise<Curacion> => {
  const { data } = await api.post('/curaciones', curacion);
  return data;
};

export const getCuracionesByPatient = async (
  patientId: number,
): Promise<Curacion[]> => {
  const { data } = await api.get(`/curaciones/patient/${patientId}`);
  return data;
};

export const getAgenda = async (
  from: string,
  to: string,
): Promise<AgendaItem[]> => {
  const { data } = await api.get('/curaciones/agenda', {
    params: { from, to },
  });
  return data;
};

export const getAvailability = async (date: string): Promise<any[]> => {
  const { data } = await api.get('/curaciones/availability', {
    params: { date },
  });
  return data;
};

export const updateCuracion = async (
  id: number,
  data: { type?: string; quantity?: number; appointmentDate?: string | null; appointmentTime?: string | null; reason: string; bootDelivered?: boolean },
): Promise<Curacion> => {
  const { data: result } = await api.put(`/curaciones/${id}`, data);
  return result;
};

export const getCuracionEdits = async (id: number): Promise<CuracionEdit[]> => {
  const { data } = await api.get(`/curaciones/${id}/edits`);
  return data;
};

// Reports
export const getMonthlyReport = async (
  year: number,
  month: number,
): Promise<MonthlyReport> => {
  const { data } = await api.get('/reports/monthly', {
    params: { year, month },
  });
  return data;
};

// Cycles
export const getCyclesByYear = async (year: number): Promise<MonthlyCycle[]> => {
  const { data } = await api.get('/cycles', { params: { year } });
  return data;
};

export const saveCycles = async (
  cycles: MonthlyCycle[],
): Promise<MonthlyCycle[]> => {
  const { data } = await api.post('/cycles/bulk', { cycles });
  return data;
};

export const getDetailedReport = async (filters: {
  year?: number;
  quarter?: number;
  gender?: string;
  ageMin?: number;
  ageMax?: number;
}): Promise<DetailedReport> => {
  const { data } = await api.get('/reports/detailed', { params: filters });
  return data;
};

// Appointments
export const createAppointment = async (
  patientId: number,
  date: string,
  time: string,
): Promise<Appointment> => {
  const { data } = await api.post('/appointments', { patientId, date, time });
  return data;
};

export const deleteAppointment = async (id: number): Promise<void> => {
  await api.delete(`/appointments/${id}`);
};

export const getPatientAppointments = async (
  patientId: number,
): Promise<Appointment[]> => {
  const { data } = await api.get(`/appointments/patient/${patientId}`);
  return data;
};

export const dischargePatient = async (
  id: number,
  cancelAppointment?: boolean,
): Promise<Patient> => {
  const { data } = await api.post(`/patients/${id}/discharge`, { cancelAppointment });
  return data;
};

export const readmitPatient = async (id: number): Promise<Patient> => {
  const { data } = await api.post(`/patients/${id}/readmit`);
  return data;
};

export const getPatientStatusHistory = async (
  id: number,
): Promise<PatientStatusChange[]> => {
  const { data } = await api.get(`/patients/${id}/status-history`);
  return data;
};

// Audit Logs (admin only)
export const getAuditLogs = async (params: {
  page?: number;
  limit?: number;
  entity?: string;
  from?: string;
  to?: string;
}) => {
  const { data } = await api.get('/audit-logs', { params });
  return data;
};

// Dashboard
export const getDashboardToday = async (): Promise<DashboardTodayItem[]> => {
  const { data } = await api.get('/dashboard/today');
  return data;
};

export const getDashboardNoAppointment = async (): Promise<PatientNoAppointment[]> => {
  const { data } = await api.get('/dashboard/no-appointment');
  return data;
};

export const getDashboardInactive = async (days: number): Promise<PatientInactive[]> => {
  const { data } = await api.get('/dashboard/inactive', { params: { days } });
  return data;
};

// User Preferences
export const getUserPreferences = async (): Promise<UserPreferences> => {
  const { data } = await api.get('/users/me/preferences');
  return data;
};

export const updateUserPreferences = async (prefs: Partial<UserPreferences>): Promise<UserPreferences> => {
  const { data } = await api.put('/users/me/preferences', prefs);
  return data;
};

// Wound Photos
export const getWoundPhotos = async (patientId: number): Promise<WoundPhoto[]> => {
  const { data } = await api.get(`/wound-photos/patient/${patientId}`);
  return data;
};

export const uploadWoundPhoto = async (
  patientId: number,
  photo: File,
  photoDate: string,
  description?: string,
): Promise<WoundPhoto> => {
  const formData = new FormData();
  formData.append('photo', photo);
  formData.append('patientId', String(patientId));
  formData.append('photoDate', photoDate);
  if (description) formData.append('description', description);
  const { data } = await api.post('/wound-photos', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

export const deleteWoundPhoto = async (id: number): Promise<void> => {
  await api.delete(`/wound-photos/${id}`);
};

export const getWoundPhotoUrl = (filename: string): string => {
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  return `${baseURL}/wound-photos/file/${filename}`;
};

// Wound Notes
export const createWoundNote = async (note: {
  curacionId: number;
  woundWidth?: number;
  woundLength?: number;
  woundColor?: string;
  exudateLevel?: string;
  healingStage?: string;
  notes?: string;
}): Promise<WoundNote> => {
  const { data } = await api.post('/wound-notes', note);
  return data;
};

export const getWoundNotesByCuracion = async (curacionId: number): Promise<WoundNote | null> => {
  const { data } = await api.get(`/wound-notes/curacion/${curacionId}`);
  return data;
};

export const getWoundNotesByPatient = async (patientId: number): Promise<WoundNote[]> => {
  const { data } = await api.get(`/wound-notes/patient/${patientId}`);
  return data;
};

export const getWoundEvolution = async (patientId: number): Promise<WoundEvolutionPoint[]> => {
  const { data } = await api.get(`/wound-notes/evolution/${patientId}`);
  return data;
};

// Consent Signatures
export const saveConsentSignature = async (
  patientId: number,
  signature: string,
  consentText?: string,
): Promise<ConsentSignature> => {
  const { data } = await api.post('/consent', { patientId, signature, consentText });
  return data;
};

export const getConsentSignatures = async (patientId: number): Promise<ConsentSignature[]> => {
  const { data } = await api.get(`/consent/patient/${patientId}`);
  return data;
};

export const getConsentSignatureUrl = (filename: string): string => {
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  return `${baseURL}/consent/file/${filename}`;
};

// PDF Export
export const downloadPatientPdf = async (patientId: number): Promise<void> => {
  const response = await api.get(`/patients/${patientId}/pdf`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = `ficha-paciente-${patientId}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};
