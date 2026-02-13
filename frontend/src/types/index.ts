export interface Patient {
  id: number;
  rut: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  phone?: string;
  address?: string;
  createdAt: string;
  updatedAt: string;
  curaciones?: Curacion[];
}

export type CuracionType = 'avanzada' | 'pie_diabetico' | 'ulcera_venosa';

export interface Curacion {
  id: number;
  patientId: number;
  type: CuracionType;
  date: string;
  nextAppointmentDate?: string;
  nextAppointmentTime?: string;
  quantity?: number;
  observations?: string;
  createdAt: string;
  patient?: Patient;
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
  summary: {
    avanzada: { total: number; byGender: Record<string, number> };
    ulcera_venosa: { total: number; byGender: Record<string, number> };
  };
}
