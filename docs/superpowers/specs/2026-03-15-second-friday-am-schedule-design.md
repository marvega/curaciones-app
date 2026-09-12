# Second Friday AM-Only Schedule

> **Depends on:** Appointment Normalization spec (must be implemented first).

## Problem

On the second Friday of each month, the clinic operates in AM-only mode. The last patient should be seen at 12:00 (finishing by 12:30). Currently the system only knows about PM slots (12:30-16:00) and has no concept of variable schedules.

## Solution

Make the time slot generation date-aware. When the requested date is a second Friday, return AM slots instead of the standard PM slots.

## Schedule Definition

| Schedule | Condition | Slots | Block size |
|----------|-----------|-------|------------|
| Standard (PM) | Any day that is NOT a second Friday | 12:30, 13:00, 13:30, 14:00, 14:30, 15:00, 15:30, 16:00 | 30 min |
| AM-only | Second Friday of the month | 08:00, 08:30, 09:00, 09:30, 10:00, 10:30, 11:00, 11:30, 12:00 | 30 min |

**Second Friday calculation:** The second Friday is the second occurrence of Friday (day 5) in a given month. Examples:
- March 2026 → Fridays: 6, 13, 20, 27 → second Friday = March 13
- April 2026 → Fridays: 3, 10, 17, 24 → second Friday = April 10

## Backend

### New utility function

```typescript
// src/common/schedule.util.ts

function isSecondFriday(date: string): boolean
function getSlotsForDate(date: string): string[]
```

`getSlotsForDate` returns the appropriate slot array based on whether the date is a second Friday.

### Changes to existing endpoints

**`GET /api/curaciones/availability?date=YYYY-MM-DD`:**
- Replace hardcoded PM slots with `getSlotsForDate(date)`.
- Rest of logic unchanged — check occupied slots from `appointments` table.

**`POST /api/appointments` and `POST /api/curaciones` (when creating linked appointment):**
- Validate `time` is in `getSlotsForDate(date)` instead of using static regex.
- Return 400 with descriptive message if invalid slot for that date.

### Removed validation

The static regex in `CreateCuracionDto`:
```
/^(12:30|13:00|13:30|14:00|14:30|15:00|15:30|16:00)$/
```
is removed. All time validation is dynamic through the service layer using `getSlotsForDate`.

### Migration note

No schema changes. No data migration needed. Existing appointments on second Fridays with PM times remain valid (they were booked under the old rules). The new rules only apply to future bookings.

## Frontend

### Automatic behavior (no changes needed)

The time slot selector in both the curacion form and the appointment form already builds options dynamically from the `availability` API response. When a second Friday is selected, the API will return AM slots and the UI will display them automatically.

### Optional enhancement

When the selected date is a second Friday, show an informational note next to the time selector:
> "Horario AM — Segundo viernes del mes"

This helps the user understand why the available times are different.

### AgendaPage

No changes needed. The agenda displays existing appointments regardless of their time. Second Friday appointments will simply show AM times.

## Edge Cases

| Case | Behavior |
|------|----------|
| Existing PM appointment on a second Friday | Remains valid. No retroactive enforcement. |
| User selects a second Friday, then changes date to a non-second-Friday | Availability refreshes automatically (existing behavior). Selected time is cleared if invalid. |
| Second Friday falls on a holiday | Out of scope — no holiday calendar in the system. |

## Out of scope

- Configurable schedule rules (admin-managed slot definitions).
- Holiday calendar.
- Other special schedule days.
- Retroactive enforcement of AM rules on existing appointments.

## Update 2026-09-12 — one-off date overrides

"Other special schedule days" left the original scope. They are now supported,
in the narrowest form that solves the case: a `DATE_OVERRIDES` map in
`schedule.util.ts`, keyed by ISO date, consulted before the second-Friday rule.

| Date | Slots | Reason |
|------|-------|--------|
| 2026-09-17 | 08:30, 09:00, 09:30, 10:00, 10:30 | Eve of the national holiday; the clinic closes early |

Adding a date is a code change and a backend deploy — the map is not
configurable from the app, and it applies to every organization, since
`getSlotsForDate` takes no organization. A per-organization, admin-managed
calendar remains out of scope.

Existing appointments are never rewritten. A booking that predates an override
survives in the agenda but its time no longer appears in availability, so check
`SELECT date, time FROM appointments WHERE date = '<date>'` before adding one.
