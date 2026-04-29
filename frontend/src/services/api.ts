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
  Product,
  Lot,
  StockCount,
  LotMovement,
  CanastaCategory,
  CanastaImportResult,
  CanastaSection,
  ImportResult,
  ProductType,
  CodeSystem,
} from '../types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
});

const ACCESS_KEY = 'curaciones_access_token';
const REFRESH_KEY = 'curaciones_refresh_token';
const LEGACY_TOKEN_KEY = 'curaciones_token';

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_KEY) ?? localStorage.getItem(LEGACY_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const r = localStorage.getItem(REFRESH_KEY);
  if (!r) return null;
  try {
    const { data } = await axios.post(
      `${api.defaults.baseURL}/auth/refresh`,
      { refreshToken: r },
    );
    localStorage.setItem(ACCESS_KEY, data.accessToken);
    localStorage.setItem(REFRESH_KEY, data.refreshToken);
    return data.accessToken as string;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    const isAuthCall =
      original?.url?.includes('/auth/login') ||
      original?.url?.includes('/auth/refresh');
    if (err.response?.status === 401 && !isAuthCall && !original?._retry) {
      original._retry = true;
      if (!refreshing) refreshing = refreshAccessToken();
      const newToken = await refreshing;
      refreshing = null;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      localStorage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

// Auth
export const login = async (usernameOrEmail: string, password: string) => {
  // Send both keys so this works against the legacy `username`-only backend
  // and the new multi-tenant backend that expects `usernameOrEmail`.
  const { data } = await api.post('/auth/login', {
    usernameOrEmail,
    username: usernameOrEmail,
    password,
  });
  return data;
};

export const switchOrg = async (organizationId: string) => {
  const { data } = await api.post('/auth/switch-org', { organizationId });
  return data;
};

export const logoutCurrent = async (refreshToken: string) =>
  api.post('/auth/logout', { refreshToken });

export const logoutAll = async () => api.post('/auth/logout-all');

export const listSessions = async () => {
  const { data } = await api.get('/auth/sessions');
  return data as Array<{
    jti: string;
    deviceLabel: string | null;
    lastUsedAt: string;
    current: boolean;
  }>;
};

export const revokeSession = async (jti: string) =>
  api.delete(`/auth/sessions/${jti}`);

export const forgotPassword = async (email: string) =>
  api.post('/auth/forgot-password', { email });

export const resetPassword = async (token: string, newPassword: string) => {
  const { data } = await api.post('/auth/reset-password', { token, newPassword });
  return data;
};

export const changePassword = async (currentPassword: string, newPassword: string) =>
  api.post('/auth/change-password', { currentPassword, newPassword });

export const previewInvitation = async (token: string) => {
  const { data } = await api.post('/auth/invitations/preview', { token });
  return data;
};

export const acceptInvitation = async (
  token: string,
  password: string,
  fullName: string,
) => {
  const { data } = await api.post('/auth/invitations/accept', {
    token,
    password,
    fullName,
  });
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
  q?: string;
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
export type CreateCuracionPayload = Omit<
  Curacion,
  'id' | 'createdAt' | 'patient' | 'appointment' | 'edits'
> & {
  appointmentDate?: string;
  appointmentTime?: string;
};

export const createCuracion = async (
  curacion: CreateCuracionPayload,
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

// Inventory - Products
export const listProducts = async (params: { search?: string; type?: ProductType; page?: number; limit?: number } = {}): Promise<PaginatedResponse<Product>> => {
  const { data } = await api.get('/inventory/products', { params });
  return data;
};
export const getProduct = async (id: number): Promise<Product> => (await api.get(`/inventory/products/${id}`)).data;
export const updateProduct = async (id: number, patch: Partial<Product>): Promise<Product> => (await api.patch(`/inventory/products/${id}`, patch)).data;
export const addProductCode = async (id: number, dto: { codeSystem: CodeSystem; code: string }) => (await api.post(`/inventory/products/${id}/codes`, dto)).data;
export const removeProductCode = async (codeId: number) => (await api.delete(`/inventory/products/codes/${codeId}`)).data;
export const importProductsExcel = async (file: File, sheet?: string): Promise<ImportResult> => {
  const fd = new FormData();
  fd.append('file', file);
  const url = sheet ? `/inventory/products/import?sheet=${encodeURIComponent(sheet)}` : '/inventory/products/import';
  const { data } = await api.post(url, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data;
};

// Inventory - Lots / movements
export const listLots = async (params: { productId?: number; establishmentId?: number; expiringInDays?: number; active?: boolean } = {}): Promise<Lot[]> => (await api.get('/inventory/lots', { params })).data;
export const getLot = async (id: number): Promise<Lot> => (await api.get(`/inventory/lots/${id}`)).data;
export const receiveLot = async (dto: { productId: number; establishmentId: number; lotCode?: string; expiresAt?: string; receivedAt: string; quantity: number; notes?: string }): Promise<Lot> => (await api.post('/inventory/lots/reception', dto)).data;
export const adjustLot = async (lotId: number, dto: { delta: number; notes?: string }): Promise<LotMovement> => (await api.post(`/inventory/lots/${lotId}/adjustments`, dto)).data;
export const getExpiringLots = async (days = 30, establishmentId?: number) => {
  const { data } = await api.get('/inventory/expiring', { params: { days, establishmentId } });
  return data as { lots: Lot[]; total: number };
};
export const getStockSnapshot = async (establishmentId?: number, date?: string) => (await api.get('/inventory/stock-snapshot', { params: { establishmentId, date } })).data;

// Inventory - Stock counts
export const listStockCounts = async (params: { establishmentId?: number; status?: 'DRAFT' | 'CLOSED' } = {}): Promise<StockCount[]> => (await api.get('/inventory/stock-counts', { params })).data;
export const getStockCount = async (id: number): Promise<StockCount> => (await api.get(`/inventory/stock-counts/${id}`)).data;
export const openStockCount = async (dto: { establishmentId: number; countDate?: string }): Promise<StockCount> => (await api.post('/inventory/stock-counts', dto)).data;
export const patchStockCountEntry = async (id: number, lotId: number, dto: { absoluteValue: number; notes?: string }): Promise<LotMovement> => (await api.patch(`/inventory/stock-counts/${id}/lots/${lotId}`, dto)).data;
export const closeStockCount = async (id: number): Promise<StockCount> => (await api.post(`/inventory/stock-counts/${id}/close`)).data;

// Inventory - Canasta
export const listCanasta = async (includeArchived = false): Promise<CanastaCategory[]> =>
  (await api.get('/inventory/canasta', { params: includeArchived ? { includeArchived: 'true' } : {} })).data;
export const replaceCanastaProducts = async (id: number, productIds: number[]) => (await api.put(`/inventory/canasta/${id}/products`, { productIds })).data;
export const createCanastaCategory = async (dto: {
  name: string;
  section: CanastaSection;
  displayOrder?: number;
  isOptional?: boolean;
  notes?: string;
}): Promise<CanastaCategory> => (await api.post('/inventory/canasta/categories', dto)).data;
export const updateCanastaCategory = async (
  id: number,
  dto: Partial<{
    name: string;
    section: CanastaSection;
    displayOrder: number;
    isOptional: boolean;
    notes: string | null;
    archived: boolean;
  }>,
): Promise<CanastaCategory> => (await api.patch(`/inventory/canasta/categories/${id}`, dto)).data;
export const deleteCanastaCategory = async (id: number): Promise<void> => {
  await api.delete(`/inventory/canasta/categories/${id}`);
};
export const importCanastaGuide = async (file: File, sheet?: string): Promise<CanastaImportResult> => {
  const fd = new FormData();
  fd.append('file', file);
  if (sheet) fd.append('sheet', sheet);
  const { data } = await api.post('/inventory/canasta/import', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

// Inventory - Audit export
export const downloadAuditExport = async (params: { mode: 'current' | 'month'; establishmentId?: number; year?: number; month?: number }): Promise<Blob> => {
  const { data } = await api.get('/inventory/audit-export', { params, responseType: 'blob' });
  return data;
};

// Org - members
export const listMembers = async () => (await api.get('/org/members')).data;
export const inviteMember = async (email: string, role: string) =>
  (await api.post('/org/invitations', { email, role })).data;
export const updateMemberRole = async (userId: number, role: string) =>
  (await api.patch(`/org/members/${userId}`, { role })).data;
export const revokeMember = async (userId: number) =>
  api.delete(`/org/members/${userId}`);

// Org - invitations / establishments / settings
export const listOrgInvitations = async () =>
  (await api.get('/org/invitations')).data;
export const listEstablishments = async () =>
  (await api.get('/org/establishments')).data;
export const createEstablishment = async (dto: { name: string; comuna: string }) =>
  (await api.post('/org/establishments', dto)).data;
export const getOrgSettings = async () => (await api.get('/org/settings')).data;
export const updateOrgSettings = async (dto: { name: string; rut?: string }) =>
  (await api.patch('/org/settings', dto)).data;

export default api;
