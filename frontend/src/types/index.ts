export interface Patient {
  id: number;
  rut: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  phone?: string;
  address?: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
  curaciones?: Curacion[];
}

export interface PatientStatusChange {
  id: number;
  patientId: number;
  type: 'discharge' | 'readmission';
  performedBy: { id: number; username: string };
  createdAt: string;
}

export type CuracionType = 'avanzada' | 'pie_diabetico' | 'ulcera_venosa';

export interface CuracionEdit {
  id: number;
  curacionId: number;
  editedBy: { id: number; username: string };
  reason: string;
  createdAt: string;
}

export interface Curacion {
  id: number;
  patientId: number;
  type: CuracionType;
  date: string;
  quantity?: number;
  observations?: string;
  bootDelivered?: boolean;
  createdAt: string;
  patient?: Patient;
  appointment?: Appointment;
  edits?: CuracionEdit[];
}

export interface Appointment {
  id: number;
  patientId: number;
  curacionId?: number;
  date: string;
  time: string;
  createdAt: string;
  curacion?: Curacion;
}

export interface AgendaItem {
  id: number;
  date: string;
  time: string;
  source: 'curacion' | 'standalone';
  patient: { id: number; firstName: string; lastName: string; rut: string };
  curacion?: { id: number; type: CuracionType };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface MonthlyReport {
  year: number;
  month: number;
  startDate: string;
  endDate: string;
  avanzada: number;
  pie_diabetico: number;
  ulcera_venosa: number;
  totalGeneral: number;
}

export interface MonthlyCycle {
  id?: number;
  year: number;
  month: number;
  startDate: string;
  endDate: string;
}

export interface DetailedReport {
  filters: {
    year?: number;
    quarter?: number;
    gender?: string;
    ageMin?: number;
    ageMax?: number;
  };
  total: number;
  byGender: Record<string, number>;
  bootsDelivered: number;
}

export interface DashboardTodayItem {
  id: number;
  date: string;
  time: string;
  patient: { id: number; firstName: string; lastName: string; rut: string };
  curacion?: { id: number; type: CuracionType };
  source: 'curacion' | 'standalone';
}

export interface PatientNoAppointment {
  id: number;
  firstName: string;
  lastName: string;
  rut: string;
  lastCuracion: { date: string; type: string } | null;
  daysSinceLastCuracion: number | null;
}

export interface PatientInactive {
  id: number;
  firstName: string;
  lastName: string;
  rut: string;
  lastCuracionDate: string | null;
  lastCuracionType: string | null;
  daysSinceLastCuracion: number | null;
}

export interface UserPreferences {
  inactivityThresholdDays: number;
}

export interface WoundPhoto {
  id: number;
  patientId: number;
  filename: string;
  description: string | null;
  photoDate: string;
  createdAt: string;
  uploadedBy: { id: number; username: string };
}

export type WoundColor = 'red' | 'yellow' | 'black' | 'pink' | 'mixed';
export type ExudateLevel = 'none' | 'low' | 'moderate' | 'high';
export type HealingStage = 'inflammatory' | 'proliferative' | 'maturation' | 'chronic';

export interface WoundNote {
  id: number;
  curacionId: number;
  woundWidth: number | null;
  woundLength: number | null;
  woundArea: number | null;
  woundColor: WoundColor | null;
  exudateLevel: ExudateLevel | null;
  healingStage: HealingStage | null;
  notes: string | null;
  createdAt: string;
  recordedBy: { id: number; username: string };
}

export interface WoundEvolutionPoint {
  date: string;
  woundArea: number | null;
  woundColor: WoundColor | null;
  healingStage: HealingStage | null;
}

export interface ConsentSignature {
  id: number;
  patientId: number;
  filename: string;
  consentText: string | null;
  signedAt: string;
  witnessedBy: { id: number; username: string };
}

export type CodeSystem = 'AVIS_QUILPUE' | 'AVIS_OTRA' | 'RAYEN' | 'OTRO';
export type ProductType = 'INSUMO' | 'MEDICAMENTO' | 'ORTESIS' | 'OTRO';
export type LotMovementType = 'RECEPTION' | 'COUNT' | 'ADJUSTMENT';
export type StockCountStatus = 'DRAFT' | 'CLOSED';
export type CanastaSection = 'INSUMOS' | 'AYUDAS_TECNICAS';

export interface ProductCode {
  id: number;
  productId: number;
  codeSystem: CodeSystem;
  code: string;
}

export interface Product {
  id: number;
  name: string;
  type: ProductType;
  packaging: string;
  tracksExpiration: boolean;
  codes: ProductCode[];
  createdAt: string;
}

export interface Lot {
  id: number;
  productId: number;
  establishmentId: number;
  lotCode: string | null;
  expiresAt: string | null;
  receivedAt: string;
  createdAt: string;
  product?: Product;
  currentStock?: number;
  daysToExpiry?: number;
}

export interface LotMovement {
  id: number;
  lotId: number;
  type: LotMovementType;
  delta: number | null;
  absoluteValue: number | null;
  stockCountId: number | null;
  notes: string | null;
  performedById: number;
  createdAt: string;
}

export interface StockCount {
  id: number;
  establishmentId: number;
  countDate: string;
  status: StockCountStatus;
  closedAt: string | null;
  performedById: number;
  createdAt: string;
}

export interface CanastaCategory {
  id: number;
  name: string;
  section: CanastaSection;
  displayOrder: number;
  isOptional: boolean;
  notes: string | null;
  products: Product[];
}

export interface Establishment {
  id: number;
  name: string;
  comuna: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
}

export interface ExpiringResponse {
  lots: Lot[];
  total: number;
}
