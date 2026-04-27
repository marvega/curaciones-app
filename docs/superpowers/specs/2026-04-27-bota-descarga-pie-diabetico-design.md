# Boot (Ayuda Técnica de Descarga) for Diabetic Foot Patients

## Problem

When a patient with altered gait is treated for diabetic foot, clinicians sometimes deliver a "boot" (ayuda técnica de descarga) at the time of curación. There is currently no way to record this delivery, which means:

1. The clinical record is incomplete.
2. The pharmacy cannot reconcile boot stock received from central warehouse against actual deliveries — making theft or loss of clinical material undetectable.

The two existing checkboxes in the curación form (the new boot toggle and the existing "Dar de alta al paciente") use the default browser `<input type="checkbox">` styling, which feels inconsistent with the rest of the form.

## Solution

1. Add an optional boolean `bootDelivered` to each curación. It is only relevant — and only visible — when the curación type is `pie_diabetico`.
2. Replace both checkboxes with a reusable `Switch` pill toggle component, grouped in a new "Estado del paciente" section at the bottom of the form.
3. Extend the quarterly diabetic foot report with a "Botas entregadas" stat card alongside the existing patient count card. The boot count respects the report's existing filters (period, gender, age range).

This is intentionally minimal. It does not yet model boot inventory, sizes, or returns — those are explicitly out of scope (see §Out of Scope).

## Data Model

### `Curacion` entity (modified)

`backend/src/curaciones/curacion.entity.ts` — add one column:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `bootDelivered` | `boolean` | `false` | Whether a boot (ayuda técnica de descarga) was delivered at this visit. |

Use the same column-decoration style as the surrounding entity (no explicit `name:` argument; rely on the project's existing TypeORM naming convention):

```ts
@Column({ type: 'boolean', default: false })
bootDelivered: boolean;
```

In dev, TypeORM `synchronize: true` adds the column automatically (the project sets `synchronize: process.env.NODE_ENV !== 'production'`). For production deploys, run `backend/scripts/migrate-boot-delivered.sql` BEFORE deploying the new application code (the script is idempotent thanks to `ADD COLUMN IF NOT EXISTS`). The column defaults to `false` for existing rows, which is correct — no historical record contained boot tracking.

### DTOs

DTOs live directly under `backend/src/curaciones/` (there is no `dto/` subfolder).

| File | Change |
|------|--------|
| `backend/src/curaciones/create-curacion.dto.ts` | Add `bootDelivered?: boolean` (`@IsOptional() @IsBoolean()`) |
| `backend/src/curaciones/update-curacion.dto.ts` | Add `bootDelivered?: boolean` (`@IsOptional() @IsBoolean()`) |

### Server-side validation

The "only if `type === pie_diabetico`" rule is enforced in the frontend (the toggle is conditionally rendered). The backend accepts the field for any type — this avoids server-side coupling between two unrelated fields and matches the pattern already used for other optional fields. Edge case: if a future caller posts `bootDelivered: true` with `type: 'avanzada'`, the value is stored but never counted in reports (the report query filters `c.type = 'pie_diabetico'`).

## Frontend

### New reusable component: `Switch`

`frontend/src/components/Switch.tsx` (new file).

```ts
type SwitchProps = {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  helpText?: string;
  disabled?: boolean;
  id?: string;
};
```

**Visual:** pill switch, 44×24 px. Off: `bg-slate-300`. On: `bg-blue-600`. White circular knob (20×20 px) with subtle shadow, animated translation on toggle.

**Layout:** the entire row (label + helpText left-aligned, switch right-aligned) is one clickable button. The label is the visible affordance; the help text sits below the label in muted slate.

**Accessibility:** `role="switch"`, `aria-checked={checked}`, focusable button, Space and Enter toggle. `htmlFor`/`id` wiring optional but supported.

This replaces both:
- The native checkbox at `frontend/src/pages/PatientPage.tsx` (~L997-1000, "Dar de alta al paciente").
- The new boot toggle (described next).

### Curación form changes (`PatientPage.tsx`)

State additions (next to existing `dischargeCheckbox` at L49):

```ts
const [bootDelivered, setBootDelivered] = useState(false);
useEffect(() => {
  if (curacionForm.type !== 'pie_diabetico') setBootDelivered(false);
}, [curacionForm.type]);
```

Replace the existing inline checkbox block (`PatientPage.tsx` ~L997-1000) with a grouped section just before the form's submit row. Note that the curación form already uses `dischargeCheckbox` for conditional rendering of the next-appointment fields (~L929) and to trigger the discharge call in `handleSaveCuracion` (~L426); both call sites continue to read the same state — only the rendering control changes from `<input>` to `<Switch>`.

```
┌─ Estado del paciente ──────────────────────────────┐
│  Dar de alta al paciente                  [⚪──]   │
│  Cierra el caso al guardar                          │
├─────────────────────────────────────────────────────┤
│  Bota de descarga entregada              [──🔵]    │  ← only when type=pie_diabetico
│  Descuenta de inventario                            │
└─────────────────────────────────────────────────────┘
```

Implementation: a wrapper `<fieldset>` with a section heading `Estado del paciente` and two `<Switch>` instances. The boot Switch is rendered only when `curacionForm.type === 'pie_diabetico'`. The wrapper visually unifies the two via a thin top border between rows.

### Save logic

`handleSaveCuracion` (`PatientPage.tsx`) submits `bootDelivered` along with the rest of the curación payload to `POST /curaciones`. In edit mode, it submits to `PATCH /curaciones/:id` with the same field. The existing `dischargePatient(...)` side-effect (when "Dar de alta" is toggled on) is unchanged.

If the user marks `bootDelivered: true` and then changes `curacionForm.type` to a non-`pie_diabetico` value, the `useEffect` resets the local state to `false` so the saved record is internally consistent.

### Type updates

`frontend/src/types/index.ts`:

| Interface | Change |
|-----------|--------|
| `Curacion` | Add `bootDelivered?: boolean` |
| `DetailedReport` | Add `bootsDelivered: number` |

## Backend Report Changes

### `getDetailedReport` (`backend/src/reports/reports.service.ts`)

The current method runs one aggregation: `COUNT(DISTINCT c.patientId)` grouped by `p.gender`, with filters on date range, gender, and age. Returns `{ filters, total, byGender }`.

**Change:** add a second aggregation over the same filtered set that counts boot deliveries.

```ts
const bootsQb = this.curacionRepo.createQueryBuilder('c')
  .innerJoin('c.patient', 'p')
  .where('c.type = :type', { type: 'pie_diabetico' })
  .andWhere('c.bootDelivered = true');
await this.applyDetailedFilters(bootsQb, filters); // shared helper, async
const bootsDelivered = await bootsQb.getCount();

return { filters, total, byGender, bootsDelivered };
```

**Targeted refactor (in scope):** extract the application of period/gender/age filters into a private helper `applyDetailedFilters` to avoid duplicating the four filter blocks across both queries. This is the kind of small, focused improvement appropriate when touching the same code twice.

The helper must be `async` because it uses `cyclesService.getEffectiveDates(...)` (async) to translate `year + quarter` into the configured cycle's start/end dates:

```ts
private async applyDetailedFilters(
  qb: SelectQueryBuilder<Curacion>,
  filters: { year?: number; quarter?: number; gender?: string; ageMin?: number; ageMax?: number },
): Promise<void> { … }
```

Both call sites (existing patient query and new boots query) become `await this.applyDetailedFilters(qb, filters)`.

### Response shape

```ts
{
  filters: { year, quarter, gender?, ageMin?, ageMax? },
  total: number,            // unique diabetic-foot patients (existing)
  byGender: Record<string, number>, // existing
  bootsDelivered: number,   // NEW: count of curaciones with boot in same filtered period
}
```

## Frontend Report Changes (`DetailedReportPage.tsx`)

### Summary section

Today the summary is a single full-width card (`L228-268`). It becomes a 2-column grid on `md` and above, stacked on mobile:

```tsx
<div className="grid md:grid-cols-2 gap-4">
  {/* Existing patient card — unchanged content */}
  <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">…</div>

  {/* New boots card */}
  <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
    <h3 className="text-base font-semibold text-blue-800 mb-1">
      Botas entregadas
    </h3>
    <p className="text-xs text-blue-600 mb-3">
      Total de ayudas técnicas en el período filtrado
    </p>
    <div className="text-4xl font-bold text-blue-700">
      {report.bootsDelivered}
    </div>
  </div>
</div>
```

Both cards share the same blue palette so they read as equally weighted primary metrics. The pie chart below is unchanged.

### Excel export

`handleDownloadExcel` (`L80-122`): insert one row before the gender breakdown:

```ts
['Total de pacientes únicos', report.total],
['Botas entregadas', report.bootsDelivered], // NEW
[],
['Detalle por Género'],
…
```

No new sheet. Same single "Pie Diabético" sheet.

## Testing

### Backend (`reports.service.spec.ts`)

The existing test file uses **jest mocks** of TypeORM's query-builder chain (no in-memory DB, no seeded records). New tests must follow the same pattern: extend the `mockDetailedGetRawMany` setup so a second query-builder mock is registered for the boots query, and assert on:

1. The constructed query — that the new builder calls `where('c.type = :type', { type: 'pie_diabetico' })` and `andWhere('c.bootDelivered = true')`.
2. The result — that `getCount()` is invoked once and its return value flows into `bootsDelivered`.
3. That the existing patient-by-gender query still produces the same shape (regression guard).

Concrete cases:

| Case | Mock setup → Expectation |
|------|---------------------------|
| No boots in period | `getCount` mock returns `0` → `bootsDelivered === 0` |
| 3 boots in period | `getCount` mock returns `3` → `bootsDelivered === 3` |
| Filters applied to boots query | After call, the boots `qb.andWhere` mock should have been invoked with the gender, ageMin, and ageMax fragments — confirming `applyDetailedFilters` ran on the boots builder |
| Defensive type guard | The boots builder's `where` mock receives `c.type = 'pie_diabetico'` (so `avanzada` rows cannot leak in) |

If during implementation the test setup proves too cumbersome to mock reliably (two parallel builders), it is acceptable to migrate `reports.service.spec.ts` to a shared helper that produces a fresh mock builder per call. That refactor is in scope only if needed; otherwise leave the existing pattern and extend it.

### Frontend

The repo does not have systematic component tests. To match convention, no automated test for `Switch.tsx` is added — instead, manual verification covers the UI changes (see below).

### Manual verification (gating before claiming done — per project memory)

Local backend up, frontend up, DB restored from production. Steps:

1. Create a new pie diabético curación with the boot toggle ON. Save. Reload patient. Verify boot persisted and shows correctly in edit mode.
2. Create a non-pie-diabético curación. Verify the boot toggle is **not visible**.
3. Open an existing pie diabético curación, toggle boot ON, then change type to avanzada. Save. Verify boot is `false` server-side.
4. Generate the quarterly report for a period with known boot deliveries. Verify two stat cards render side-by-side and counts are correct.
5. Apply gender + age filters. Verify both numbers respond consistently.
6. Export Excel. Open file. Verify "Botas entregadas" row appears.
7. Mobile viewport (≤640 px): verify cards stack vertically and toggles render correctly.

## Out of Scope

Listed explicitly so future scope creep is recognized:

- Inventory module: warehouse stock, comparison against received units, theft detection workflow. (This spec only exposes the *delivered* number — comparison happens externally for now.)
- Boot attributes: size, color, model, return tracking.
- Boot-by-gender pie chart in the report.
- Boot history view on the patient profile.
- Migration of historical curaciones (existing rows correctly default to `bootDelivered = false`; there is no retroactive truth to backfill).
- Role-based access control for marking the boot field. The existing curación form has no role gating; the new toggle inherits the same posture.
- Permission to mark the boot toggle without simultaneously creating a curación (e.g., from the patient profile). All boot deliveries are tied to a curación.
