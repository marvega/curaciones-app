import { z, type ZodTypeAny } from 'zod';
import type { VerifiedToken } from '../auth/jwt-verifier.js';
import type { BackendClient } from '../http/backend-client.js';
import { searchPatientsHandler } from './patients/search-patients.js';
import { getPatientHandler } from './patients/get-patient.js';
import { getPatientPdfHandler } from './patients/get-patient-pdf.js';
import { dischargePatientHandler } from './patients/discharge-patient.js';
import { createPatientHandler } from './patients/create-patient.js';
import { updatePatientHandler } from './patients/update-patient.js';
import { readmitPatientHandler } from './patients/readmit-patient.js';
import { listPatientAppointmentsHandler } from './agenda/list-patient-appointments.js';
import { getAgendaByDateRangeHandler } from './agenda/get-agenda-by-date-range.js';
import { cancelAppointmentHandler } from './agenda/cancel-appointment.js';
import { createAppointmentHandler } from './agenda/create-appointment.js';
import { listCuracionesHandler } from './curaciones/list-curaciones.js';
import { registerCuracionHandler } from './curaciones/register-curacion.js';
import { listWoundNotesHandler } from './wound-notes/list-wound-notes.js';
import { addWoundNoteHandler } from './wound-notes/add-wound-note.js';
import { searchInventoryHandler } from './inventory/search-inventory.js';
import { listLotsExpiringHandler } from './inventory/list-lots-expiring.js';
import { registerCanastaConsumptionHandler } from './inventory/register-canasta-consumption.js';
import { monthlyReportHandler } from './reports/monthly-report.js';
import { whoamiHandler } from './identity/whoami.js';

export interface ToolContext {
  token: VerifiedToken;
  bearer: string;
  correlationId: string;
  backend: BackendClient;
  // elicitation handle is injected by the MCP server adapter at register time
  elicit?: (schema: ZodTypeAny, prompt: string) => Promise<unknown>;
}

export interface ToolResult {
  content: Array<{ type: 'text' | 'resource'; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

export interface ToolDef {
  name: string;
  description: string;
  requiredScope: string; // '' for whoami (no scope check)
  readOnly: boolean;
  destructive: boolean;
  inputSchema: ZodTypeAny;
  handler: (input: unknown, ctx: ToolContext) => Promise<ToolResult>;
}

export const TOOLS: ToolDef[] = [
  // patients
  { name: 'search_patients', description: 'Busca pacientes por nombre, RUT o teléfono. Devuelve lista paginada con cursor.', requiredScope: 'patients:read', readOnly: true, destructive: false, inputSchema: z.object({ q: z.string().optional(), cursor: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }), handler: (input, ctx) => searchPatientsHandler(input as any, ctx) },
  { name: 'get_patient', description: 'Devuelve los datos demográficos y clínicos de un paciente por id.', requiredScope: 'patients:read', readOnly: true, destructive: false, inputSchema: z.object({ id: z.number().int() }), handler: (input, ctx) => getPatientHandler(input as any, ctx) },
  { name: 'create_patient', description: 'Crea un paciente nuevo. Solicita RUT, nombre, fecha de nacimiento y datos demográficos vía elicitation.', requiredScope: 'patients:write', readOnly: false, destructive: false, inputSchema: z.object({}).passthrough(), handler: (input, ctx) => createPatientHandler(input, ctx) },
  { name: 'update_patient', description: 'Actualiza datos demográficos de un paciente existente. Solicita campos a modificar vía elicitation.', requiredScope: 'patients:write', readOnly: false, destructive: false, inputSchema: z.object({ id: z.number().int() }).passthrough(), handler: (input, ctx) => updatePatientHandler(input as any, ctx) },
  { name: 'discharge_patient', description: 'Da de alta a un paciente. Acción destructiva: detiene seguimiento clínico.', requiredScope: 'patients:write', readOnly: false, destructive: true, inputSchema: z.object({ id: z.number().int(), cancelAppointment: z.boolean().optional() }), handler: (input, ctx) => dischargePatientHandler(input as any, ctx) },
  { name: 'readmit_patient', description: 'Reingresa a un paciente previamente dado de alta.', requiredScope: 'patients:write', readOnly: false, destructive: false, inputSchema: z.object({ id: z.number().int() }), handler: (input, ctx) => readmitPatientHandler(input as any, ctx) },
  { name: 'get_patient_pdf', description: 'Devuelve el PDF de la ficha clínica del paciente como recurso descargable.', requiredScope: 'patients:read', readOnly: true, destructive: false, inputSchema: z.object({ id: z.number().int() }), handler: (input, ctx) => getPatientPdfHandler(input as any, ctx) },
  // agenda
  { name: 'list_patient_appointments', description: 'Lista las citas agendadas de un paciente específico.', requiredScope: 'agenda:read', readOnly: true, destructive: false, inputSchema: z.object({ patientId: z.number().int() }), handler: (input, ctx) => listPatientAppointmentsHandler(input as any, ctx) },
  { name: 'get_agenda_by_date_range', description: 'Devuelve la agenda de curaciones planeadas en un rango de fechas (formato YYYY-MM-DD).', requiredScope: 'clinical:read', readOnly: true, destructive: false, inputSchema: z.object({ from: z.string(), to: z.string() }), handler: (input, ctx) => getAgendaByDateRangeHandler(input as any, ctx) },
  { name: 'create_appointment', description: 'Agenda una nueva cita. Solicita paciente, fecha y hora vía elicitation.', requiredScope: 'agenda:write', readOnly: false, destructive: false, inputSchema: z.object({}).passthrough(), handler: (input, ctx) => createAppointmentHandler(input, ctx) },
  { name: 'cancel_appointment', description: 'Cancela una cita agendada por id. Acción destructiva.', requiredScope: 'agenda:write', readOnly: false, destructive: true, inputSchema: z.object({ id: z.number().int() }), handler: (input, ctx) => cancelAppointmentHandler(input as any, ctx) },
  // curaciones
  { name: 'list_curaciones', description: 'Lista curaciones de un paciente, paginadas con cursor.', requiredScope: 'clinical:read', readOnly: true, destructive: false, inputSchema: z.object({ patientId: z.number().int(), cursor: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }), handler: (input, ctx) => listCuracionesHandler(input as any, ctx) },
  { name: 'register_curacion', description: 'Registra una nueva curación. Solicita localización, tipo de herida, observaciones y cuidados aplicados vía elicitation.', requiredScope: 'clinical:write', readOnly: false, destructive: false, inputSchema: z.object({}).passthrough(), handler: (input, ctx) => registerCuracionHandler(input, ctx) },
  // wound notes
  { name: 'add_wound_note', description: 'Agrega una nota de evolución a una curación o paciente.', requiredScope: 'clinical:write', readOnly: false, destructive: false, inputSchema: z.object({ patientId: z.number().int().optional(), curacionId: z.number().int().optional(), content: z.string().min(1) }), handler: (input, ctx) => addWoundNoteHandler(input as any, ctx) },
  { name: 'list_wound_notes', description: 'Lista las notas de evolución de un paciente.', requiredScope: 'clinical:read', readOnly: true, destructive: false, inputSchema: z.object({ patientId: z.number().int(), cursor: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }), handler: (input, ctx) => listWoundNotesHandler(input as any, ctx) },
  // inventory
  { name: 'search_inventory', description: 'Busca productos del inventario por nombre o código.', requiredScope: 'inventory:read', readOnly: true, destructive: false, inputSchema: z.object({ q: z.string().optional(), cursor: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }), handler: (input, ctx) => searchInventoryHandler(input as any, ctx) },
  { name: 'list_lots_expiring', description: 'Lista lotes de inventario próximos a vencer en N días (default 30).', requiredScope: 'inventory:read', readOnly: true, destructive: false, inputSchema: z.object({ days: z.number().int().min(1).max(365).optional() }), handler: (input, ctx) => listLotsExpiringHandler(input as any, ctx) },
  { name: 'register_canasta_consumption', description: 'Registra consumo de insumos en una curación o canasta. Solicita productos y cantidades vía elicitation.', requiredScope: 'inventory:write', readOnly: false, destructive: false, inputSchema: z.object({}).passthrough(), handler: (input, ctx) => registerCanastaConsumptionHandler(input, ctx) },
  // reports
  { name: 'monthly_report', description: 'Reporte mensual de curaciones (formato YYYY-MM).', requiredScope: 'reports:read', readOnly: true, destructive: false, inputSchema: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }), handler: (input, ctx) => monthlyReportHandler(input as any, ctx) },
  // identity
  { name: 'whoami', description: 'Devuelve el usuario y organización actuales (lee del JWT, no llama al backend).', requiredScope: '', readOnly: true, destructive: false, inputSchema: z.object({}), handler: (input, ctx) => whoamiHandler(input, ctx) },
];
