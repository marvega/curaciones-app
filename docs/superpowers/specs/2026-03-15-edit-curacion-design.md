# Edit Curacion (Admin Only)

> **Depends on:** Appointment Normalization spec (must be implemented first).

## Problem

Data entry errors in curacion records (e.g., wrong curacion type) cannot be corrected after saving. There is no edit functionality — only create.

## Solution

Allow admin users to edit specific fields of a curacion record, with a mandatory audit trail capturing the reason for each edit.

## Data Model

### New entity: CuracionEdit

| Field | Type | Description |
|-------|------|-------------|
| `id` | `PK` | Auto-generated |
| `curacionId` | `FK → Curacion` | Curacion that was edited |
| `editedById` | `FK → User` | Admin who performed the edit |
| `reason` | `text` | Mandatory reason for the edit |
| `createdAt` | `timestamp` | When the edit occurred |

Relation: `Curacion` 1:N `CuracionEdit` (cascade on delete).
Relation: `User` 1:N `CuracionEdit`.

## Editable Fields

| Field | Editable | Notes |
|-------|----------|-------|
| `type` | Yes | The primary use case (correcting misclassification) |
| `quantity` | Yes | Correcting count errors |
| Linked `Appointment` (date/time) | Yes | Via updating/creating/deleting the linked Appointment |
| `date` | No | Immutable — the curacion date is the source of truth |
| `observations` | No | Historical record — add corrections via edit reason instead |

## Backend

### New endpoint

| Method | Route | Body | Description |
|--------|-------|------|-------------|
| `PUT` | `/api/curaciones/:id` | `{ type?, quantity?, appointmentDate?, appointmentTime?, reason }` | Edit curacion |

Protected by `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('admin')` decorator (matching existing `roles.guard.ts` + `roles.decorator.ts` pattern).

### Edit logic

All steps execute within a single TypeORM `QueryRunner` transaction:

1. Validate curacion exists.
2. Validate `reason` is non-empty.
3. Update permitted fields on the curacion (`type`, `quantity`).
4. Handle linked appointment changes:
   - If `appointmentDate` and `appointmentTime` provided and curacion has no linked appointment → create new `Appointment`.
   - If provided and appointment exists → update the existing `Appointment`.
   - If both are null/empty and appointment exists → delete the `Appointment`.
   - Validate time slot availability if creating/updating (skip if slot is already occupied by this same appointment).
5. Insert `CuracionEdit` record with `editedById` from JWT and `reason`.

### New endpoint for edit history

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/curaciones/:id/edits` | Get edit history for a curacion |

Returns list of edits ordered by `createdAt` DESC.

## Frontend

### Type changes

Add to `types/index.ts`:
- New `CuracionEdit` type: `{ id, curacionId, editedBy: { id, username }, reason, createdAt }`.

Add to `api.ts`:
- `updateCuracion(id, data)` — PUT request.
- `getCuracionEdits(id)` — GET edit history.

### PatientPage changes

**Edit trigger (admin only):**
- The type badge in each curacion history row becomes clickeable for admin users.
- Cursor changes to pointer, subtle hover effect.
- Click opens the edit modal.
- Non-admin users see the badge as static (no interaction).

**Edit modal:**
- Title: "Editar Curacion — [date]"
- Fields:
  - Tipo de Curacion (select) — pre-filled with current value.
  - Cantidad (number input) — pre-filled.
  - Proxima Cita: Fecha (date picker) + Hora (slot selector with availability) — pre-filled from linked Appointment if exists.
  - Fecha de Curacion — shown but grayed out (not editable).
  - Observaciones — shown but grayed out (not editable).
  - **Motivo de la edicion** (textarea, required) — empty, must be filled.
- Submit button: "Guardar Cambios" (disabled until reason is filled).
- Cancel button.

**Edit indicator in history:**
- Curaciones that have been edited show a small pencil icon next to the date.
- Tooltip on hover: "Editado por [username] el [date]: [reason]".
- If multiple edits, tooltip shows the most recent one. Click opens full edit history.

### AuthContext

The frontend already has the user role available via `AuthContext`. Use it to conditionally render the clickeable badge.

## Out of scope

- Editing the curacion `date` field.
- Editing `observations` (use edit reason to document corrections).
- Non-admin edit access.
- Batch editing of multiple curaciones.
