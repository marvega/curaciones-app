# Bota de Descarga (Pie Diabético) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track boot deliveries (ayuda técnica de descarga) on diabetic-foot curaciones, replace the existing "Dar de alta" checkbox with a polished `Switch` toggle component, and surface a "Botas entregadas" stat in the quarterly report.

**Architecture:** A single boolean column on `curaciones` records each boot delivery (one per curación). The frontend conditionally renders a new toggle only when the curación type is `pie_diabetico`, resetting on type change. The quarterly report runs a parallel aggregation that respects the same filters as the patient count, and surfaces it as a second stat card alongside the existing one.

**Tech Stack:** NestJS + TypeORM (backend), React 19 + Vite + Tailwind v4 + lucide-react + recharts + xlsx (frontend), Jest (tests).

**Spec:** `docs/superpowers/specs/2026-04-27-bota-descarga-pie-diabetico-design.md`

---

## File Structure

**Create:**
- `frontend/src/components/Switch.tsx` — reusable pill toggle (label + helpText + switch)

**Modify:**
- `backend/src/curaciones/curacion.entity.ts` — new `bootDelivered` column
- `backend/src/curaciones/create-curacion.dto.ts` — accept `bootDelivered`
- `backend/src/curaciones/update-curacion.dto.ts` — accept `bootDelivered`
- `backend/src/reports/reports.service.ts` — extract filter helper + add boots aggregation
- `backend/src/reports/reports.service.spec.ts` — update existing detailed tests + add boot cases
- `frontend/src/types/index.ts` — `Curacion.bootDelivered`, `DetailedReport.bootsDelivered`
- `frontend/src/pages/PatientPage.tsx` — replace checkbox with Switch group, add boot toggle in both the create form and the edit modal, save logic
- `frontend/src/pages/DetailedReportPage.tsx` — 2-card grid, new boots card, Excel row

---

## Task 1: Backend — Add `bootDelivered` to entity & DTOs

**Files:**
- Modify: `backend/src/curaciones/curacion.entity.ts`
- Modify: `backend/src/curaciones/create-curacion.dto.ts`
- Modify: `backend/src/curaciones/update-curacion.dto.ts`

- [ ] **Step 1: Add the column to `curacion.entity.ts`**

Insert after the `observations` column (~L39), before `@CreateDateColumn()`:

```ts
  @Column({ type: 'boolean', default: false })
  bootDelivered: boolean;
```

- [ ] **Step 2: Add the field to `create-curacion.dto.ts`**

Add `IsBoolean` to the `class-validator` import line (currently `IsEnum, IsNumber, IsOptional, IsString, IsDateString`). Then append before the closing brace:

```ts
  @ApiPropertyOptional({ example: false, description: 'Boot (ayuda técnica de descarga) delivered — only meaningful for pie_diabetico' })
  @IsBoolean()
  @IsOptional()
  bootDelivered?: boolean;
```

- [ ] **Step 3: Add the field to `update-curacion.dto.ts`**

Add `IsBoolean` to its `class-validator` import. Insert the same field above the existing `reason` field (so optional fields stay grouped before the required `reason`):

```ts
  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  bootDelivered?: boolean;
```

- [ ] **Step 4: Build the backend to verify TypeScript compiles**

Run from `backend/`:

```bash
npm run build
```

Expected: build succeeds with no TS errors.

- [ ] **Step 5: Restart the backend dev server and verify the column exists**

Restart the backend (TypeORM `synchronize: true` will add the column). Then check the DB column:

```bash
docker exec curaciones-postgres psql -U postgres -d curaciones \
  -c "\d curaciones" | grep boot
```

Expected output (column name may be `bootDelivered` or `boot_delivered` depending on the project's naming strategy — either is correct as long as it exists):

```
 boot_delivered  | boolean |  | not null | false
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/curaciones/curacion.entity.ts \
        backend/src/curaciones/create-curacion.dto.ts \
        backend/src/curaciones/update-curacion.dto.ts
git commit -m "feat(curaciones): add bootDelivered field to entity and DTOs"
```

---

## Task 2: Backend — Refactor filter logic into `applyDetailedFilters` helper

This is a no-behavior-change refactor. Existing tests must keep passing.

**Files:**
- Modify: `backend/src/reports/reports.service.ts`

- [ ] **Step 1: Run existing tests to establish a green baseline**

```bash
cd backend && npx jest src/reports/reports.service.spec.ts
```

Expected: all 8 tests pass.

- [ ] **Step 2: Add the helper method**

In `backend/src/reports/reports.service.ts`, add the import for `SelectQueryBuilder` from `typeorm` (top of file).

Then add this private method at the end of the class (after `getDetailedReport`):

```ts
  private async applyDetailedFilters(
    qb: SelectQueryBuilder<Curacion>,
    filters: {
      year?: number;
      quarter?: number;
      gender?: string;
      ageMin?: number;
      ageMax?: number;
    },
  ): Promise<void> {
    if (filters.year && filters.quarter) {
      const startMonth = (filters.quarter - 1) * 3 + 1;
      const endMonth = filters.quarter * 3;

      const startCycle = await this.cyclesService.getEffectiveDates(
        filters.year,
        startMonth,
      );
      const endCycle = await this.cyclesService.getEffectiveDates(
        filters.year,
        endMonth,
      );

      qb.andWhere('c.date >= :startDate AND c.date <= :endDate', {
        startDate: startCycle.startDate,
        endDate: endCycle.endDate,
      });
    }

    if (filters.gender) {
      qb.andWhere('p.gender = :gender', { gender: filters.gender });
    }

    if (filters.ageMin !== undefined || filters.ageMax !== undefined) {
      if (filters.ageMax !== undefined) {
        const minBirthDate = new Date();
        minBirthDate.setFullYear(
          minBirthDate.getFullYear() - filters.ageMax - 1,
        );
        qb.andWhere('p.birthDate >= :minBirth', {
          minBirth: minBirthDate.toISOString().split('T')[0],
        });
      }

      if (filters.ageMin !== undefined) {
        const maxBirthDate = new Date();
        maxBirthDate.setFullYear(
          maxBirthDate.getFullYear() - filters.ageMin,
        );
        qb.andWhere('p.birthDate <= :maxBirth', {
          maxBirth: maxBirthDate.toISOString().split('T')[0],
        });
      }
    }
  }
```

- [ ] **Step 3: Replace the inline filter logic in `getDetailedReport` with a call to the helper**

In `getDetailedReport`, replace **everything between** the line `.where('c.type = :type', { type: 'pie_diabetico' });` and `const results = await qb.groupBy('p.gender').getRawMany();` with a single call:

```ts
    await this.applyDetailedFilters(qb, filters);

    const results = await qb.groupBy('p.gender').getRawMany();
```

The deleted block is 3 top-level `if`-blocks (year/quarter, gender, ageMin/ageMax with two nested ifs) — about 45 lines.

- [ ] **Step 4: Run tests to verify the refactor preserves behavior**

```bash
cd backend && npx jest src/reports/reports.service.spec.ts
```

Expected: all 8 tests still pass with no changes to the test file.

- [ ] **Step 5: Commit**

```bash
git add backend/src/reports/reports.service.ts
git commit -m "refactor(reports): extract detailed-filter logic into helper"
```

---

## Task 3: Backend — Add `bootsDelivered` aggregation (TDD)

**Files:**
- Modify: `backend/src/reports/reports.service.spec.ts`
- Modify: `backend/src/reports/reports.service.ts`

- [ ] **Step 1: Update the test setup so each `getDetailedReport` call provisions TWO query-builder mocks**

In `reports.service.spec.ts`, modify the `setupDetailedQueryBuilder` helper inside `describe('getDetailedReport')` (~L97-109) to register both the patient-by-gender qb AND a boots qb, returning both:

```ts
    const mockGetCount = jest.fn();

    function setupDetailedQueryBuilder() {
      const patientsQb = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: mockDetailedGetRawMany,
      };
      const bootsQb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: mockGetCount,
      };
      mockCuracionRepo.createQueryBuilder
        .mockReturnValueOnce(patientsQb)
        .mockReturnValueOnce(bootsQb);
      return { patientsQb, bootsQb };
    }
```

Update existing tests' destructuring (the 5 tests in `describe('getDetailedReport')`) to use the new shape — keep the `qb` name pointing to `patientsQb` to minimize churn:

For each test that uses `const qb = setupDetailedQueryBuilder();`, change to:

```ts
const { patientsQb: qb } = setupDetailedQueryBuilder();
```

For tests that previously did `setupDetailedQueryBuilder();` without binding, leave as-is.

In every existing test, also add a default `mockGetCount.mockResolvedValueOnce(0)` after the `mockDetailedGetRawMany.mockResolvedValueOnce(...)` line — this stops the new boots query from returning `undefined`.

- [ ] **Step 2: Run the existing tests to verify they still pass after the setup change**

```bash
cd backend && npx jest src/reports/reports.service.spec.ts
```

Expected: all 8 tests pass (since the implementation hasn't been changed yet, the boots qb mock will be provisioned but unused — that's fine).

If any test now fails, the setup refactor is incorrect — fix before continuing.

- [ ] **Step 3: Add new failing tests for boot counting**

Inside `describe('getDetailedReport')`, add these tests:

```ts
    it('returns 0 bootsDelivered when no boots in period', async () => {
      setupDetailedQueryBuilder();
      mockDetailedGetRawMany.mockResolvedValueOnce([]);
      mockGetCount.mockResolvedValueOnce(0);

      const result = await service.getDetailedReport({});

      expect(result.bootsDelivered).toBe(0);
    });

    it('returns the boot count from the boots query', async () => {
      setupDetailedQueryBuilder();
      mockDetailedGetRawMany.mockResolvedValueOnce([]);
      mockGetCount.mockResolvedValueOnce(3);

      const result = await service.getDetailedReport({});

      expect(result.bootsDelivered).toBe(3);
    });

    it('boots query filters by pie_diabetico type and bootDelivered=true', async () => {
      const { bootsQb } = setupDetailedQueryBuilder();
      mockDetailedGetRawMany.mockResolvedValueOnce([]);
      mockGetCount.mockResolvedValueOnce(0);

      await service.getDetailedReport({});

      expect(bootsQb.where).toHaveBeenCalledWith('c.type = :type', {
        type: 'pie_diabetico',
      });
      expect(bootsQb.andWhere).toHaveBeenCalledWith('c.bootDelivered = true');
    });

    it('boots query respects gender filter', async () => {
      const { bootsQb } = setupDetailedQueryBuilder();
      mockDetailedGetRawMany.mockResolvedValueOnce([]);
      mockGetCount.mockResolvedValueOnce(0);

      await service.getDetailedReport({ gender: 'Femenino' });

      expect(bootsQb.andWhere).toHaveBeenCalledWith('p.gender = :gender', {
        gender: 'Femenino',
      });
    });
```

- [ ] **Step 4: Run the new tests to verify they FAIL**

```bash
cd backend && npx jest src/reports/reports.service.spec.ts -t bootsDelivered
```

Expected: 4 new tests fail (because `result.bootsDelivered` is `undefined` and the boots query isn't built yet).

- [ ] **Step 5: Implement the boots aggregation in `getDetailedReport`**

In `backend/src/reports/reports.service.ts`, modify the end of `getDetailedReport` to build the second query and include `bootsDelivered` in the response. Replace the current return block:

```ts
    const byGender: Record<string, number> = {};
    let total = 0;
    for (const row of results) {
      const count = parseInt(row.total, 10);
      byGender[row.gender] = count;
      total += count;
    }

    const bootsQb = this.curacionRepo
      .createQueryBuilder('c')
      .innerJoin('c.patient', 'p')
      .where('c.type = :type', { type: 'pie_diabetico' })
      .andWhere('c.bootDelivered = true');
    await this.applyDetailedFilters(bootsQb, filters);
    const bootsDelivered = await bootsQb.getCount();

    return {
      filters,
      total,
      byGender,
      bootsDelivered,
    };
```

- [ ] **Step 6: Run all reports tests**

```bash
cd backend && npx jest src/reports/reports.service.spec.ts
```

Expected: all 12 tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/reports/reports.service.ts \
        backend/src/reports/reports.service.spec.ts
git commit -m "feat(reports): count boots delivered in detailed quarterly report"
```

---

## Task 4: Frontend — Create reusable `Switch` component

**Files:**
- Create: `frontend/src/components/Switch.tsx`

The repo has no systematic component tests; per spec we skip a unit test and rely on manual verification.

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/components/Switch.tsx
type SwitchProps = {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  helpText?: string;
  disabled?: boolean;
  id?: string;
};

export default function Switch({
  checked,
  onChange,
  label,
  helpText,
  disabled = false,
  id,
}: SwitchProps) {
  const handleToggle = () => {
    if (!disabled) onChange(!checked);
  };

  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={handleToggle}
      disabled={disabled}
      className={`flex w-full items-center justify-between gap-4 py-3 text-left transition-opacity ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-700">{label}</div>
        {helpText && (
          <div className="text-xs text-slate-500 mt-0.5">{helpText}</div>
        )}
      </div>
      <span
        aria-hidden
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Switch.tsx
git commit -m "feat(ui): add reusable Switch toggle component"
```

---

## Task 5: Frontend — Update types

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add `bootDelivered` to `Curacion`**

Find the `Curacion` interface (it has `id`, `patientId`, `type`, `date`, `quantity?`, `observations?`, `createdAt`, plus optional relations). Add a new optional field:

```ts
  bootDelivered?: boolean;
```

Place it next to `observations?` to keep optional fields grouped.

- [ ] **Step 2: Add `bootsDelivered` to `DetailedReport`**

Find the `DetailedReport` interface. After the existing `byGender` field, add:

```ts
  bootsDelivered: number;
```

(Required, not optional — the backend always returns it.)

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(types): add boot fields to Curacion and DetailedReport"
```

---

## Task 6: Frontend — Replace "Dar de alta" checkbox with Switch group

This task introduces the visual change for the existing checkbox only. The boot toggle comes in Task 7.

**Files:**
- Modify: `frontend/src/pages/PatientPage.tsx`

- [ ] **Step 1: Import `Switch` at the top of `PatientPage.tsx`**

Add to the existing imports:

```tsx
import Switch from '../components/Switch';
```

- [ ] **Step 2: Locate the existing checkbox block**

Find the JSX block at ~L996-1001. It looks like:

```tsx
<label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
  <input type="checkbox" checked={dischargeCheckbox}
    onChange={(e) => setDischargeCheckbox(e.target.checked)}
    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
  Dar de alta al paciente
</label>
```

- [ ] **Step 3: Replace with a `<fieldset>` containing the Switch**

```tsx
<fieldset className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-1">
  <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
    Estado del paciente
  </legend>
  <Switch
    checked={dischargeCheckbox}
    onChange={setDischargeCheckbox}
    label="Dar de alta al paciente"
    helpText="Cierra el caso al guardar"
  />
</fieldset>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manually verify in browser**

Restart the frontend dev server. Open a patient and start "Registrar Curación":
- The Switch appears at the bottom of the form, inside a fieldset titled "Estado del paciente"
- Clicking the switch toggles ON (blue-600) ↔ OFF (slate-300)
- Tabbing to it, pressing Space toggles
- When ON, the next-appointment fields hide (existing L929 logic continues to work)
- Saving with the switch ON still triggers the discharge call (existing L426 logic)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/PatientPage.tsx
git commit -m "feat(curaciones): replace Dar de alta checkbox with Switch component"
```

---

## Task 7: Frontend — Add Bota toggle in the create form

**Files:**
- Modify: `frontend/src/pages/PatientPage.tsx`

The create form (`curacionForm`, `handleSaveCuracion`) and the edit modal (`curacionEditForm`, `handleSaveEdit`) are independent state machines. This task wires up the **create** flow only. Task 7b handles the edit modal.

- [ ] **Step 1: Add `bootDelivered` state next to `dischargeCheckbox` (~L49)**

Below the existing `const [dischargeCheckbox, setDischargeCheckbox] = useState(false);` line, add:

```tsx
const [bootDelivered, setBootDelivered] = useState(false);
```

- [ ] **Step 2: Add the reset `useEffect`**

Place this `useEffect` immediately after the `useEffect` that watches `curacionForm.appointmentDate` (it ends around L288). The new effect lives in the same neighborhood of "form reactivity" effects:

```tsx
useEffect(() => {
  if (curacionForm.type !== 'pie_diabetico') {
    setBootDelivered(false);
  }
}, [curacionForm.type]);
```

- [ ] **Step 3: Render the boot Switch inside the fieldset, conditionally**

Inside the `<fieldset>` introduced in Task 6, append after the discharge `<Switch>`:

```tsx
{curacionForm.type === 'pie_diabetico' && (
  <div className="border-t border-slate-200">
    <Switch
      checked={bootDelivered}
      onChange={setBootDelivered}
      label="Bota de descarga entregada"
      helpText="Descuenta de inventario · solo pie diabético"
    />
  </div>
)}
```

The thin top border separates the two switches inside the fieldset.

- [ ] **Step 4: Send `bootDelivered` in `handleSaveCuracion`**

Locate `handleSaveCuracion` (~L398-438). Find where the curación payload is built (the `...curacionForm` spread, ~L414). Add `bootDelivered` to the payload:

```tsx
const payload = {
  ...curacionForm,
  bootDelivered,
};
```

If the existing code already spreads into the API call directly (e.g., `await createCuracion({ ...curacionForm, ... })`), insert `bootDelivered` into that object literal at the same level.

After the call succeeds, reset `setBootDelivered(false)` alongside any other form-reset call so subsequent registrations start clean.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Manually verify the create flow in browser**

Restart the frontend if needed. Open a patient and:

1. Start "Registrar Curación", select type **Avanzada** → boot Switch is **not visible**
2. Change type to **Pie Diabético** → boot Switch appears, OFF
3. Toggle ON, then change type back to **Avanzada** → boot Switch disappears (state reset to OFF)
4. Switch back to **Pie Diabético** → toggle is OFF (not stuck ON)
5. Set Pie Diabético + boot ON, save → curación appears in the list
6. Network tab: confirm the POST body contains `"bootDelivered": true`

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/PatientPage.tsx
git commit -m "feat(curaciones): add bota de descarga toggle in create form"
```

---

## Task 7b: Frontend — Add Bota toggle in the edit modal

**Files:**
- Modify: `frontend/src/pages/PatientPage.tsx`

The edit form (`curacionEditForm`, `handleOpenEdit`, `handleSaveEdit`) is an independent state. The edit modal is rendered around L1676-1759.

- [ ] **Step 1: Add `bootDelivered` to the `curacionEditForm` initial state (~L175-181)**

```tsx
const [curacionEditForm, setCuracionEditForm] = useState({
  type: '' as CuracionType,
  quantity: 1,
  appointmentDate: '',
  appointmentTime: '',
  reason: '',
  bootDelivered: false,
});
```

- [ ] **Step 2: Initialize `bootDelivered` in `handleOpenEdit` (~L365-374)**

In `setCuracionEditForm({...})`, add:

```tsx
bootDelivered: curacion.bootDelivered ?? false,
```

- [ ] **Step 3: Add a reset `useEffect` for the edit form's type field**

Place near the existing `useEffect` watching `curacionEditForm.appointmentDate` (~L311-326):

```tsx
useEffect(() => {
  if (curacionEditForm.type !== 'pie_diabetico' && curacionEditForm.bootDelivered) {
    setCuracionEditForm(prev => ({ ...prev, bootDelivered: false }));
  }
}, [curacionEditForm.type]);
```

(The extra `curacionEditForm.bootDelivered` guard avoids redundant state writes when nothing changes.)

- [ ] **Step 4: Render the Switch in the edit modal**

In the edit modal JSX (~L1737, just before the "Motivo de la edición *" textarea block), add a fieldset matching the create form's pattern. Use the existing `Switch` component imported in Task 6:

```tsx
{curacionEditForm.type === 'pie_diabetico' && (
  <fieldset className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-1">
    <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
      Inventario
    </legend>
    <Switch
      checked={curacionEditForm.bootDelivered}
      onChange={(v) => setCuracionEditForm(prev => ({ ...prev, bootDelivered: v }))}
      label="Bota de descarga entregada"
      helpText="Descuenta de inventario"
    />
  </fieldset>
)}
```

(Note: this modal does not contain "Dar de alta" — that's only relevant during creation — so the fieldset only holds the boot switch.)

- [ ] **Step 5: Send `bootDelivered` in `handleSaveEdit` (~L376-396)**

In the `updateCuracion(...)` call payload (~L381-387), add the field:

```tsx
await updateCuracion(editingCuracion.id, {
  type: curacionEditForm.type,
  quantity: curacionEditForm.quantity,
  appointmentDate: curacionEditForm.appointmentDate || null,
  appointmentTime: curacionEditForm.appointmentTime || null,
  reason: curacionEditForm.reason,
  bootDelivered: curacionEditForm.bootDelivered,
});
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Manually verify the edit flow in browser**

1. From a patient with a saved Pie Diabético curación, click edit
2. Boot Switch shows the saved value
3. Toggle it, fill "motivo", save → reload patient, re-open edit → toggle reflects the change
4. Edit a Pie Diabético curación, change type to Avanzada → boot Switch hides; save with "motivo" → re-open: `bootDelivered` is now `false` server-side (use Network tab or DB query to confirm)
5. Network tab: confirm the PATCH body contains `"bootDelivered"` with the expected value

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/PatientPage.tsx
git commit -m "feat(curaciones): add bota de descarga toggle in edit modal"
```

---

## Task 8: Frontend — Add boots stat card and Excel row

**Files:**
- Modify: `frontend/src/pages/DetailedReportPage.tsx`

- [ ] **Step 1: Wrap the existing summary card in a 2-column grid and add a sibling boots card**

Locate the existing patient card: `<div className="bg-blue-50 border border-blue-100 rounded-xl p-6">` opens around L231 and closes around L268. **Do not edit anything inside that card** — only:

1. Insert a new opening line `<div className="grid md:grid-cols-2 gap-4">` immediately before that `<div>`.
2. Insert the new boots card (snippet below) immediately after that card's closing `</div>`.
3. Insert a new closing `</div>` to close the grid wrapper.

Boots card to insert:

```tsx
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
```

Final structure (illustrative):

```tsx
<div className="grid md:grid-cols-2 gap-4">
  <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
    {/* existing card content — untouched */}
  </div>
  <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
    {/* new boots card */}
  </div>
</div>
```

- [ ] **Step 2: Add Excel row for boots**

Find `handleDownloadExcel` (~L80). After the line `['Total de pacientes únicos', report.total],` insert:

```ts
['Botas entregadas', report.bootsDelivered],
```

The row sits between the patient total and the empty row before "Detalle por Género".

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manually verify in browser**

1. Generate the report for a quarter with known data → both cards render side-by-side on desktop
2. Resize to mobile (<768 px) → cards stack vertically
3. Change filters (gender, age) → both numbers update consistently with the period
4. Click "Descargar Excel" → open file → "Botas entregadas" row appears with the correct count

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/DetailedReportPage.tsx
git commit -m "feat(reports): show botas entregadas stat card and add to Excel"
```

---

## Task 9: End-to-end manual verification

This is the gating check before declaring the feature done (per project memory: never claim done without full local testing).

**No code changes** — all execution.

- [ ] **Step 1: Confirm both servers are running and DB is restored**

Backend on its dev port, frontend on its dev port, Postgres up with the production-restored data.

- [ ] **Step 2: Run the full backend test suite**

```bash
cd backend && npx jest
```

Expected: all tests green (the 12 reports-service tests plus the rest of the suite untouched).

- [ ] **Step 3: Run the frontend type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Walk through the user flows in the browser**

Use a real patient from the restored production dataset.

| # | Flow | Expected |
|---|------|----------|
| 1 | New curación, type=Pie Diabético, boot=ON, save | Curación saved, network shows `bootDelivered: true` |
| 2 | Reload patient, open the curación in edit modal | Switch shows ON in the modal |
| 3 | Edit: change type to Avanzada, save with reason | Re-open: `bootDelivered` is `false` server-side |
| 4 | New curación, type=Avanzada | Boot Switch not rendered in create form |
| 4b | Edit a non-pie_diabetico curación | Boot Switch not rendered in edit modal |
| 5 | Generate Q1 2026 report, no filters | Both cards visible, boot count > 0 if data exists |
| 6 | Apply gender=Femenino | Both numbers respond consistently |
| 7 | Apply age 60-64 | Both numbers respond consistently |
| 8 | Download Excel | "Botas entregadas" row present |
| 9 | Mobile viewport (<640 px) | Cards stack, switches render correctly |

- [ ] **Step 5: Final review and clean-up commit (if needed)**

If any minor fixes were needed during manual verification, commit them with a `fix:` message. If everything works on the first pass, no commit is needed for this step.

- [ ] **Step 6: Report ready for review**

Push the worktree branch and surface to the user.

```bash
git log --oneline feat/clinical-features..HEAD
```

Expected: a clean sequence of feature commits ready to merge or PR.
