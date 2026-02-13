import axios from 'axios';
import type {
  Patient,
  Curacion,
  MonthlyReport,
  DetailedReport,
  PaginatedResponse,
  MonthlyCycle,
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
): Promise<Curacion[]> => {
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
