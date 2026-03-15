# Standalone Appointments & Data Normalization

> **Priority: FOUNDATIONAL** — Must be implemented before all other features in this batch (discharge/readmission, edit curacion, second friday AM).

## Problem

Currently, appointments live as fields inside the `Curacion` entity (`nextAppointmentDate`, `nextAppointmentTime`). This creates two issues:

1. A patient cannot have a scheduled appointment without an existing curacion record.
2. Appointment data is denormalized — querying, cancelling, and editing appointments requires traversing curacion records.

## Solution

Create a standalone `Appointment` entity. Migrate all existing appointment data from curacion fields. Remove the denormalized fields from `Curacion`.

## Data Model

### New entity: Appointment

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | `PK` | no | Auto-generated |
| `patientId` | `FK → Patient` | no | Owning patient |
| `curacionId` | `FK → Curacion` | yes | Source curacion (null = standalone appointment) |
| `date` | `date` | no | Appointment date |
| `time` | `varchar` | no | Appointment time slot |
| `createdAt` | `timestamp` | no | Record creation time |

```typescript
export enum AppointmentSource {
  CURACION = 'curacion',
  STANDALONE = 'standalone',
}
```

Note: `source` is derived, not stored — `curacionId !== null` means curacion source, otherwise standalone.

**Relations:**
- `Patient` 1:N `Appointment` (cascade on delete). Add `appointments: Appointment[]` inverse field on `Patient`.
- `Curacion` 1:1 `Appointment` (optional, nullable). Add `appointment: Appointment` inverse field on `Curacion`.

### Changes to Curacion entity

Remove fields:
- `nextAppointmentDate`
- `nextAppointmentTime`

### Changes to CreateCuracionDto

Remove fields:
- `nextAppointmentDate`
- `nextAppointmentTime`

Add optional fields:
- `appointmentDate?: string` (ISO date)
- `appointmentTime?: string` (validated dynamically — see second-friday spec)

When these are present, `CuracionesService.create()` creates a linked `Appointment` after saving the curacion.

### Migration

**Data migration script (must run atomically with schema changes):**

```sql
-- Step 1: Create appointments table
CREATE TABLE appointments (
  id SERIAL PRIMARY KEY,
  "patientId" INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  "curacionId" INTEGER REFERENCES curaciones(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  time VARCHAR NOT NULL,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  UNIQUE("curacionId")
);

-- Step 2: Migrate ALL existing appointment data (past and future)
INSERT INTO appointments ("patientId", "curacionId", date, time, "createdAt")
SELECT "patientId", id, "nextAppointmentDate", "nextAppointmentTime", "createdAt"
FROM curaciones
WHERE "nextAppointmentDate" IS NOT NULL AND "nextAppointmentTime" IS NOT NULL;

-- Step 3: Drop old columns
ALTER TABLE curaciones DROP COLUMN "nextAppointmentDate";
ALTER TABLE curaciones DROP COLUMN "nextAppointmentTime";
```

**Deploy strategy:** Migration script and new code must deploy together. No intermediate state where code reads from `appointments` but data is still in `curaciones`.

**Development:** TypeORM synchronize handles schema changes. Seed a bootstrap migration for existing dev data.

## Backend

### New endpoints (AppointmentsModule)

| Method | Route | Body | Description |
|--------|-------|------|-------------|
| `POST` | `/api/appointments` | `{ patientId, date, time }` | Create standalone appointment |
| `DELETE` | `/api/appointments/:id` | — | Cancel appointment |
| `GET` | `/api/appointments/patient/:patientId` | — | Get patient's appointments |

All protected by `JwtAuthGuard`.

**Validation on create:**
- Patient must exist and `status === 'active'` (once discharge spec is implemented).
- Date must be in the future.
- Time must be a valid slot for the given date (standard or AM for second fridays — see second-friday spec).
- Slot must not be already occupied (check availability).

### Changes to existing endpoints

**`POST /api/curaciones`:**
- If `appointmentDate` and `appointmentTime` are provided, create a linked `Appointment` with `curacionId` set.
- Validate time slot availability for the date.

**`GET /api/curaciones/agenda`:**
- Query `appointments` table instead of curacion fields.
- Join with `patient` for display data.
- Join with `curacion` (optional) to determine source.
- Return `source: 'curacion' | 'standalone'` in response.

**`GET /api/curaciones/availability`:**
- Count occupied slots from `appointments` table for the given date.
- Return available/occupied slots based on date (standard or AM slots).

**`GET /api/curaciones/patient/:patientId`:**
- Curaciones are returned with their linked `Appointment` (if any) via the relation, so the "Proxima Cita" column still works in the history table.

### Removed validation

The static regex in `CreateCuracionDto` for `nextAppointmentTime` is removed. Time validation is now dynamic in the service layer, checking valid slots for the specific date.

## Frontend

### Type changes

Add to `types/index.ts`:
- New `Appointment` type: `{ id, patientId, curacionId?, date, time, createdAt }`.
- Remove `nextAppointmentDate` and `nextAppointmentTime` from `Curacion` type.
- Add `appointment?: Appointment` to `Curacion` type.

Add to `api.ts`:
- `createAppointment(patientId, date, time)`
- `deleteAppointment(id)`
- `getPatientAppointments(patientId)`

### PatientPage changes

- **New button "Agendar Cita"** next to "+ Nueva Curacion". Visible when patient is active.
  - Opens mini form: date picker + time slot selector (reuses existing availability logic).
  - Creates a standalone appointment.

- **New section "Citas Agendadas"** between patient data and curacion history.
  - Shows future appointments (both standalone and curacion-linked).
  - Each row: Date | Time | Source (badge: "Seguimiento" or "Primera cita") | Cancel button.

- **Curacion form:** Fields "Proxima Cita (Fecha)" and "Proxima Cita (Hora)" remain but internally create an `Appointment`.

- **Curacion history table:** "Proxima Cita" column reads from `curacion.appointment.date` / `curacion.appointment.time` instead of direct fields.

### AgendaPage changes

- Query returns appointments with source info.
- Standalone appointments shown with a distinct visual style (different badge/color) to differentiate from follow-up appointments.

## Cross-spec impact

| Spec | Impact |
|------|--------|
| **Discharge/Readmission** | "Cancel future appointments" = delete `Appointment` records with future dates for the patient |
| **Edit Curacion** | Editing "next appointment" = update/create/delete the linked `Appointment` |
| **Second Friday AM** | Slot generation logic applies to `Appointment` validation, not curacion DTO |

## Out of scope

- Appointment status (confirmed/cancelled/completed) — appointments are either present or deleted.
- Recurring appointments.
- SMS/email reminders.
