# Dashboard de Pacientes Pendientes — Design Spec

**Date:** 2026-03-21
**Status:** Approved
**Scope:** Expand HomePage with 3 dashboard sections + user preferences

## Overview

Expand the existing HomePage with 3 new sections that help nurses quickly assess their daily workload: today's appointments, patients without scheduled appointments, and patients who haven't been seen recently. The inactivity threshold is configurable per user and persisted in the database.

## 1. Data Model Changes

### User entity — add `preferences` column

Add a JSONB column `preferences` to the existing `User` entity:

```typescript
@Column({ type: 'jsonb', nullable: true })
preferences: UserPreferences | null;
```

Default handling is done in the service layer, not the database column. When `preferences` is null, the service returns defaults.

```typescript
// Interface (in users module)
export interface UserPreferences {
  inactivityThresholdDays: number;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  inactivityThresholdDays: 14,
};
```

No new entities are created.

### UpdatePreferencesDto

```typescript
export class UpdatePreferencesDto {
  @IsInt()
  @Min(1)
  @Max(365)
  inactivityThresholdDays: number;
}
```

The PUT endpoint validates and deep-merges with existing preferences (doesn't overwrite the whole object).

## 2. Backend — New Endpoints

### DashboardModule

New module: `backend/src/dashboard/`

All dashboard endpoints use `@UseGuards(JwtAuthGuard)` only (no RolesGuard — all authenticated nurses can see the dashboard).

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `GET /api/dashboard/today` | GET | JWT | Today's appointments with patient and curacion details |
| `GET /api/dashboard/no-appointment` | GET | JWT | Active patients with no future appointments (limit 50) |
| `GET /api/dashboard/inactive?days=14` | GET | JWT | Active patients whose last curacion exceeds threshold |

### `GET /api/dashboard/today`

Reuses the existing `AppointmentsService.getAgenda(today, today)` method. The DashboardService delegates to it — no query duplication.

Response shape (same as existing agenda):
```json
[
  {
    "id": 1,
    "date": "2026-03-21",
    "time": "13:00",
    "patient": { "id": 1, "firstName": "Ana", "lastName": "González", "rut": "11111111-1" },
    "curacion": { "id": 5, "type": "avanzada" } | null,
    "source": "curacion" | "standalone"
  }
]
```

### `GET /api/dashboard/no-appointment`

Query: Active patients (status = 'active') who have NO appointment with `date >= today`.

```sql
SELECT p.* FROM patients p
LEFT JOIN appointments a ON a."patientId" = p.id AND a.date >= CURRENT_DATE
WHERE p.status = 'active' AND a.id IS NULL
LIMIT 50
```

Additionally, for each patient, fetch their most recent curacion date and type (if any).

**Note:** A patient with an appointment TODAY but no future appointments will NOT appear in this list today, but will appear tomorrow. This is intentional — they still have today's appointment to attend.

A patient can appear in both Card 2 and Card 3 simultaneously. This is intentional — the cards serve different purposes (scheduling vs. clinical attention).

Response shape:
```json
[
  {
    "id": 1,
    "firstName": "Ana",
    "lastName": "González",
    "rut": "11111111-1",
    "lastCuracion": { "date": "2026-03-10", "type": "avanzada" } | null,
    "daysSinceLastCuracion": 11 | null
  }
]
```

`daysSinceLastCuracion` is `null` when the patient has never had a curacion. The frontend treats `null` as "never seen" and displays it as the highest urgency.

### `GET /api/dashboard/inactive?days=14`

**Parameter validation:** `days` is required, validated with `ParseIntPipe` and must be >= 1. Returns 400 if missing or invalid.

Query: Active patients whose most recent curacion date is older than `today - days`, OR who have no curaciones at all. Uses parameterized queries (never string interpolation).

```sql
SELECT p.*, MAX(c.date) as last_curacion_date
FROM patients p
LEFT JOIN curaciones c ON c."patientId" = p.id
WHERE p.status = 'active'
GROUP BY p.id
HAVING MAX(c.date) < CURRENT_DATE - $1::int * INTERVAL '1 day' OR MAX(c.date) IS NULL
ORDER BY MAX(c.date) ASC NULLS FIRST
```

Ordered by last curacion date ASC with NULLS FIRST (patients never seen appear first, then oldest-to-newest).

Response shape:
```json
[
  {
    "id": 1,
    "firstName": "Ana",
    "lastName": "González",
    "rut": "11111111-1",
    "lastCuracionDate": "2026-03-01" | null,
    "lastCuracionType": "avanzada" | null,
    "daysSinceLastCuracion": 20 | null
  }
]
```

### User Preferences Endpoints

Added to existing `UsersController`. Use `@UseGuards(JwtAuthGuard)` only (no admin role required — each user manages their own preferences).

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `PUT /api/users/me/preferences` | PUT | JWT | Update current user's preferences (deep merge) |
| `GET /api/users/me/preferences` | GET | JWT | Get current user's preferences (with defaults) |

`GET` returns merged defaults: `{ ...DEFAULT_PREFERENCES, ...user.preferences }`. If `user.preferences` is null, returns `DEFAULT_PREFERENCES`.

`PUT` validates body with `UpdatePreferencesDto`, deep-merges with existing preferences, and saves.

Request body for PUT:
```json
{ "inactivityThresholdDays": 21 }
```

Response for both:
```json
{ "inactivityThresholdDays": 21 }
```

## 3. Frontend — HomePage Expansion

### Layout

Below the existing HomePage content (search bar, stats cards), add 3 new card sections:

**Card 1: "Citas de hoy"**
- Compact table: Hora | Paciente (nombre + RUT) | Tipo de curación | Link
- Empty state: "No hay citas programadas para hoy"
- Ordered by time ASC
- Uses `GET /api/dashboard/today`

**Card 2: "Pacientes sin cita agendada"**
- Compact table: Paciente | Última curación (fecha + tipo) | Días sin atención | Link
- Empty state: "Todos los pacientes activos tienen cita"
- `null` daysSinceLastCuracion displayed as "Sin atenciones" with red badge
- Uses `GET /api/dashboard/no-appointment`

**Card 3: "Pacientes sin atención reciente"**
- Threshold selector: dropdown with options 7, 14, 21, 30 days
- On change: saves to `PUT /api/users/me/preferences`, then refetches data
- Initial value loaded from `GET /api/users/me/preferences`
- Compact table: Paciente | Última curación (fecha) | Días sin atención | Link
- `null` daysSinceLastCuracion displayed as "Nunca" with red badge
- Ordered by days without attention DESC (most urgent first)
- Empty state: "Todos los pacientes están al día"
- Uses `GET /api/dashboard/inactive?days=N`

### Styling

Follow existing patterns:
- Cards use `bg-white rounded-xl shadow-sm border border-slate-200 p-6`
- Tables use compact styling with `text-sm`
- Links to patients use existing navigation pattern (`/paciente/:id`)
- Urgency badges: > 30 days = red, > 14 days = amber, null (never seen) = red
- Each card has independent loading and error states. On fetch error, show a subtle error message within the card (not a global error).

### Data Fetching

Each card fetches independently on mount. Use standard axios calls via the `api` service. No global state management needed — local component state with useEffect.

### TypeScript Interfaces

Add to `frontend/src/types/index.ts`:
```typescript
export interface DashboardTodayItem {
  id: number;
  date: string;
  time: string;
  patient: { id: number; firstName: string; lastName: string; rut: string };
  curacion: { id: number; type: string } | null;
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
```

## 4. Testing

### Backend Unit Tests
- `DashboardService.getTodayAppointments()` — delegates to AppointmentsService.getAgenda
- `DashboardService.getPatientsWithoutAppointment()` — returns active patients with no future appointment
- `DashboardService.getInactivePatients(days)` — returns patients exceeding threshold, null patients first
- `UsersService.updatePreferences(userId, prefs)` — deep merges and saves
- `UsersService.getPreferences(userId)` — returns merged defaults when preferences is null

### Backend E2E Tests
- `GET /api/dashboard/today` — returns correct appointments for today
- `GET /api/dashboard/no-appointment` — returns patients without future appointments
- `GET /api/dashboard/inactive?days=14` — returns inactive patients
- `GET /api/dashboard/inactive?days=1` — with very low threshold, returns more patients
- `GET /api/dashboard/inactive` — without days param, returns 400
- `PUT /api/users/me/preferences` — saves preferences
- `GET /api/users/me/preferences` — returns saved preferences
- `GET /api/users/me/preferences` — returns defaults when no preferences saved

### Swagger
- `@ApiTags('Dashboard')` on DashboardController
- `@ApiOperation()` on all endpoints
- `@ApiQuery()` for `days` parameter with validation docs
- `@ApiProperty()` on UpdatePreferencesDto

## 5. File Structure

### New Files
```
backend/src/dashboard/dashboard.module.ts
backend/src/dashboard/dashboard.controller.ts
backend/src/dashboard/dashboard.service.ts
backend/src/dashboard/dashboard.service.spec.ts
backend/src/users/update-preferences.dto.ts
backend/test/dashboard.e2e-spec.ts
```

### Modified Files
```
backend/src/app.module.ts              — add DashboardModule
backend/src/users/user.entity.ts       — add preferences column
backend/src/users/users.service.ts     — add updatePreferences/getPreferences methods
backend/src/users/users.controller.ts  — add preferences endpoints
backend/src/users/users.service.spec.ts — add preferences tests
frontend/src/pages/HomePage.tsx        — add 3 dashboard sections
frontend/src/services/api.ts           — add dashboard API functions
frontend/src/types/index.ts            — add dashboard TypeScript interfaces
```

## Out of Scope
- WhatsApp notifications (separate feature, later)
- Photo uploads (separate feature)
- PDF export (separate feature)
- PWA (separate feature)
- Real-time updates (WebSocket) — polling or manual refresh is sufficient for 1-3 nurses
- Pagination for dashboard lists (limit 50 is sufficient for a small clinic)
