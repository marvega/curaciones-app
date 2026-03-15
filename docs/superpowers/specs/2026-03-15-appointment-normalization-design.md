# Standalone Appointments & Data Normalization

> **Priority: FOUNDATIONAL** — Must be implemented before all other features in this batch (discharge/readmission, edit curacion, second friday AM).
> **Co-implement with:** Second Friday AM spec (to avoid temporary hardcoded PM-only slot logic).

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

**Constraints:**
- `UNIQUE("curacionId")` — enforces 1:1 between Curacion and Appointment.
- `UNIQUE(date, time)` — prevents double-bookings at DB level (race condition protection).

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

### Module structure

**New module: `AppointmentsModule`**
- `AppointmentsController` — handles `/api/appointments` endpoints.
- `AppointmentsService` — CRUD logic, availability checks, slot validation.
- Entity `Appointment` registered in `AppModule`'s `TypeOrmModule.forRoot({ entities: [..., Appointment] })`.
- `CuracionesModule` imports `AppointmentsModule` to create linked appointments when saving a curacion.

### Migration strategy

**Critical: `synchronize: true` is active in production.** TypeORM will auto-drop `nextAppointmentDate`/`nextAppointmentTime` columns when the new entity code deploys, BEFORE data is migrated. This must be handled with a phased deploy:

**Phase 1 — Add new table, keep old columns:**
- Deploy code that creates `Appointment` entity and `AppointmentsModule`.
- Keep `nextAppointmentDate`/`nextAppointmentTime` on `Curacion` entity (do NOT remove yet).
- New code writes to BOTH old fields and new `appointments` table (dual-write).
- New code reads from `appointments` table.
- `synchronize: true` safely adds the new table without dropping anything.

**Phase 2 — Migrate existing data:**
- Run migration script to copy existing appointment data to `appointments` table.

```sql
BEGIN;

-- Pre-check: verify no duplicate slots (informational)
-- SELECT date, time, COUNT(*) FROM appointments GROUP BY date, time HAVING COUNT(*) > 1;

-- Migrate existing data (skip rows that would violate UNIQUE(date, time))
INSERT INTO appointments ("patientId", "curacionId", date, time, "createdAt")
SELECT c."patientId", c.id, c."nextAppointmentDate", c."nextAppointmentTime", c."createdAt"
FROM curaciones c
WHERE c."nextAppointmentDate" IS NOT NULL
  AND c."nextAppointmentTime" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.date = c."nextAppointmentDate" AND a.time = c."nextAppointmentTime"
  )
ON CONFLICT ("curacionId") DO NOTHING;

COMMIT;
```

**Pre-migration check:** Run before migrating to detect slot conflicts:
```sql
SELECT "nextAppointmentDate", "nextAppointmentTime", COUNT(*)
FROM curaciones
WHERE "nextAppointmentDate" IS NOT NULL
GROUP BY "nextAppointmentDate", "nextAppointmentTime"
HAVING COUNT(*) > 1;
```
If duplicates found, resolve manually before running migration (keep the most recent curacion's appointment).

**Phase 3 — Remove old columns:**
- Deploy code that removes `nextAppointmentDate`/`nextAppointmentTime` from `Curacion` entity.
- `synchronize: true` drops the old columns.
- Remove dual-write logic.

**Development:** TypeORM synchronize handles everything. Run Phase 2 SQL against dev DB if it has seed data.

## Backend

### New endpoints (AppointmentsModule)

| Method | Route | Body | Description |
|--------|-------|------|-------------|
| `POST` | `/api/appointments` | `{ patientId, date, time }` | Create standalone appointment |
| `DELETE` | `/api/appointments/:id` | — | Cancel appointment |
| `GET` | `/api/appointments/patient/:patientId` | — | Get patient's appointments |

All protected by `JwtAuthGuard`.

**Validation on create:**
- Patient must exist. Status check (`active`) added when discharge spec is implemented — initially skip this validation since `status` field doesn't exist yet.
- Date must be in the future.
- Time must be a valid slot for the given date (uses `getSlotsForDate()` from second-friday spec).
- Slot must not be already occupied (check availability + DB unique constraint as safety net).

**Delete behavior:**
- Standalone appointments (`curacionId === null`): deleted normally.
- Curacion-linked appointments (`curacionId !== null`): also deleted normally. The curacion loses its "next appointment" reference — this is acceptable and shows "-" in the history table. For controlled edits of linked appointments, use the Edit Curacion feature instead.

### Changes to existing endpoints

**`POST /api/curaciones`:**
- If `appointmentDate` and `appointmentTime` are provided, create a linked `Appointment` with `curacionId` set.
- Validate time slot availability for the date.

**`GET /api/curaciones/agenda`:**
- Query `appointments` table instead of curacion fields.
- Join with `patient` for display data.
- Join with `curacion` (optional) to determine source and curacion type.
- Response shape:

```typescript
interface AgendaItem {
  id: number;              // appointment id
  date: string;
  time: string;
  source: 'curacion' | 'standalone';
  patient: { id: number; firstName: string; lastName: string; rut: string };
  curpiacion?: { id: number; type: CuracionType };  // present only if source === 'curacion'
}
```

**`GET /api/curaciones/availability`:**
- Count occupied slots from `appointments` table for the given date.
- Return available/occupied slots based on date (standard or AM slots via `getSlotsForDate()`).

**`GET /api/curaciones/patient/:patientId`:**
- Curaciones are returned with their linked `Appointment` (if any) via the relation, so the "Proxima Cita" column still works in the history table.

### Removed validation

The static regex in `CreateCuracionDto` for `nextAppointmentTime` is removed. Time validation is now dynamic in the service layer, checking valid slots for the specific date.

## Frontend

### Type changes

Add to `types/index.ts`:
- New `Appointment` type: `{ id, patientId, curacionId?, date, time, createdAt }`.
- New `AgendaItem` type matching the response shape above.
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

**Button layout when all specs are implemented (patient active):**
`[+ Nueva Curacion] [Agendar Cita] [Dar de Alta]`

When patient is discharged:
`[Reingresar Paciente]`

### AgendaPage changes

- Query returns `AgendaItem[]` instead of curacion array.
- Follow-up appointments display the curacion type badge as before.
- Standalone appointments display a "Cita Agendada" badge in a different color (e.g., blue instead of teal).

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
