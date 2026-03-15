# Patient Discharge & Readmission

## Problem

Currently the system has no concept of patient discharge. Every curacion implicitly requires scheduling a follow-up appointment. There is no way to mark a patient as having completed their treatment cycle, nor to readmit them if they return later.

## Solution

Add a `status` field to `Patient` and a `PatientStatusChange` audit log to support discharge and readmission workflows.

## Data Model

### Patient entity — new field

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | `varchar` | `'active'` | `'active'` or `'discharged'` |

### New entity: PatientStatusChange

| Field | Type | Description |
|-------|------|-------------|
| `id` | `PK` | Auto-generated |
| `patientId` | `FK → Patient` | Owning patient |
| `type` | `varchar` | `'discharge'` or `'readmission'` |
| `date` | `timestamp` | When the status change occurred |
| `createdAt` | `timestamp` | Record creation time |

Relation: `Patient` 1:N `PatientStatusChange` (cascade on delete).

## Backend

### New endpoints

| Method | Route | Body | Description |
|--------|-------|------|-------------|
| `POST` | `/api/patients/:id/discharge` | `{ cancelAppointment?: boolean }` | Discharge patient |
| `POST` | `/api/patients/:id/readmit` | — | Readmit patient |
| `GET` | `/api/patients/:id/status-history` | — | Get status change log |

All endpoints protected by `JwtAuthGuard`.

### Discharge logic

1. Validate patient exists and `status === 'active'`.
2. Set `patient.status = 'discharged'`.
3. Insert `PatientStatusChange` with `type: 'discharge'`.
4. If `cancelAppointment === true`: find the patient's most recent curacion that has a `nextAppointmentDate` in the future and set `nextAppointmentDate = null`, `nextAppointmentTime = null`.

The frontend already has the patient data loaded, so it determines whether a pending appointment exists before calling this endpoint, showing a confirmation modal if needed.

### Readmit logic

1. Validate patient exists and `status === 'discharged'`.
2. Set `patient.status = 'active'`.
3. Insert `PatientStatusChange` with `type: 'readmission'`.

### Change to createCuracion

- Accept optional `discharge?: boolean` in `CreateCuracionDto`.
- If `discharge === true`: after creating the curacion, execute the same discharge logic (set patient status, create status change record). In this case, `nextAppointmentDate` and `nextAppointmentTime` from the curacion itself are ignored/cleared since discharge implies no follow-up.

## Frontend

### PatientPage changes

- **Status badge** next to the RUT pill: green "Activo" / gray "Alta médica".
- **"Dar de Alta" button** next to "+ Nueva Curacion" — visible only when `status === 'active'`.
  - If patient has a future appointment → modal: "Este paciente tiene una cita agendada para [date] [time]. Desea cancelarla?" with Cancel/Confirm.
  - If no future appointment → simple confirmation: "Confirma dar de alta a [name]?"
- **"Reingresar Paciente" button** — visible only when `status === 'discharged'`. Replaces both "Dar de Alta" and "+ Nueva Curacion".
- **Curacion form**: checkbox "Dar de alta al paciente" above the submit button. Visible only when `status === 'active'`. When checked, next appointment fields are hidden/disabled.
- **Block**: "+ Nueva Curacion" button hidden when `status === 'discharged'`.

### Status history section

New section below the curaciones history table: "Historial de Altas y Reingresos".
Simple table: Date | Type (Alta / Reingreso).

### PatientsListPage changes

- Small badge next to patient name showing status.
- No filtering or hiding — all patients visible.

### Agenda

No query changes. Appointments cancelled during discharge are simply cleared from the curacion record, so they no longer appear.

## Out of scope

- Filtering reports by patient status.
- Bulk discharge operations.
- Discharge reason/observations (only readmission keeps it simple with no extra data).
- Role-based restrictions on discharge/readmit actions.
