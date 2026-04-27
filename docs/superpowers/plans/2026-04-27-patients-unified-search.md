# Patients Unified Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single search input on the Pacientes list page that searches simultaneously by RUT (format-flexible), name, and phone, with 300ms debounce and URL persistence.

**Architecture:** Backend extends `findAdvanced` in `PatientsService` with an optional `q` parameter that builds an OR-clause across normalized RUT, firstName, lastName, full-name concatenation, and phone using ILIKE. Frontend adds a debounced search input above the existing filter panel that combines with advanced filters (AND) and persists in URL search params.

**Tech Stack:** NestJS 11 + TypeORM (Postgres) for the backend; React 19 + Vite + react-router-dom 7 + Tailwind for the frontend. Tests: Jest (backend), Vitest available (frontend, but plan uses backend Jest only — frontend covered by manual smoke test per repo convention).

**Spec:** `docs/superpowers/specs/2026-04-27-patients-unified-search-design.md`

**Worktree branch:** `feat/patients-search` (created in Task 1)

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `backend/src/patients/patients.service.ts` | Add `q` to `findAdvanced` signature; build OR-clause | Modify |
| `backend/src/patients/patients.controller.ts` | Accept `q` query param; route to `findAdvanced` when set | Modify |
| `backend/src/patients/patients.service.spec.ts` | Add tests for `findAdvanced` with `q` (uses mocked QueryBuilder) | Modify |
| `frontend/src/hooks/useDebouncedValue.ts` | Generic debounce hook | Create |
| `frontend/src/services/api.ts` | Add `q` to `searchPatientsAdvanced` params type | Modify |
| `frontend/src/pages/PatientsListPage.tsx` | Search input UI, debounce wiring, URL sync, loader plumbing | Modify |
| `docs/superpowers/specs/2026-04-27-patients-unified-search-design.md` | Already exists in main working tree — copy into worktree | Copy |

---

## Task 1: Set up worktree and seed spec

**Files:**
- Create worktree at: `.claude/worktrees/feat-patients-search` (auto-managed by EnterWorktree)
- Copy: `docs/superpowers/specs/2026-04-27-patients-unified-search-design.md` from main repo

- [ ] **Step 1: Save the spec to a temp location accessible from the worktree**

The spec file currently lives in the main working tree (untracked). The worktree starts from `feat/clinical-features` HEAD and will not see untracked files. Copy the spec contents to a temp file before entering the worktree:

```bash
cp /Users/marcelo/dev/claude/curaciones/docs/superpowers/specs/2026-04-27-patients-unified-search-design.md /tmp/patients-search-spec.md
```

- [ ] **Step 2: Enter a fresh worktree**

Use the EnterWorktree tool with `name: "feat-patients-search"`. This creates branch `feat-patients-search` from current HEAD and switches the session into the worktree.

- [ ] **Step 3: Restore the spec file inside the worktree**

```bash
mkdir -p docs/superpowers/specs docs/superpowers/plans
cp /tmp/patients-search-spec.md docs/superpowers/specs/2026-04-27-patients-unified-search-design.md
```

- [ ] **Step 4: Recreate this plan file in the worktree**

The plan file is also untracked in the main working tree. Either copy it across or regenerate by re-running this skill. Simplest:

```bash
cp /Users/marcelo/dev/claude/curaciones/docs/superpowers/plans/2026-04-27-patients-unified-search.md docs/superpowers/plans/
```

- [ ] **Step 5: Commit spec and plan**

```bash
git add docs/superpowers/specs/2026-04-27-patients-unified-search-design.md docs/superpowers/plans/2026-04-27-patients-unified-search.md
git commit -m "docs(patients): add unified search spec and plan"
```

Expected: clean commit on `feat-patients-search` branch.

---

## Task 2: Backend — failing test for `q` matching RUT regardless of formatting

**Files:**
- Test: `backend/src/patients/patients.service.spec.ts`

The existing spec file does NOT mock `createQueryBuilder`. We introduce that mock in this task so subsequent tasks can reuse it.

- [ ] **Step 1: Add a QueryBuilder mock and a test for normalized-RUT match**

Edit `backend/src/patients/patients.service.spec.ts`. Inside the `describe('PatientsService', ...)` block, add a `mockQueryBuilder` constant near the other mocks (after `mockPatientRepo`, line ~20):

```ts
  const mockQueryBuilder = {
    andWhere: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getCount: jest.fn(),
    getRawMany: jest.fn(),
  };
```

Then add `createQueryBuilder: jest.fn(() => mockQueryBuilder)` to the `mockPatientRepo` literal so it becomes:

```ts
  const mockPatientRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn((dto) => dto),
    save: jest.fn((entity) => Promise.resolve({ id: 1, ...entity })),
    remove: jest.fn((entity) => Promise.resolve(entity)),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };
```

Inside `beforeEach` (after `jest.clearAllMocks()`), reset the QueryBuilder mock chain:

```ts
    mockQueryBuilder.andWhere.mockClear().mockReturnThis();
    mockQueryBuilder.innerJoin.mockClear().mockReturnThis();
    mockQueryBuilder.select.mockClear().mockReturnThis();
    mockQueryBuilder.addSelect.mockClear().mockReturnThis();
    mockQueryBuilder.orderBy.mockClear().mockReturnThis();
    mockQueryBuilder.offset.mockClear().mockReturnThis();
    mockQueryBuilder.limit.mockClear().mockReturnThis();
    mockQueryBuilder.getCount.mockReset();
    mockQueryBuilder.getRawMany.mockReset();
    mockPatientRepo.createQueryBuilder.mockClear().mockReturnValue(mockQueryBuilder);
```

At the end of the file (just before the closing `});` of the outer `describe`), add this test:

```ts
  // findAdvanced — q matches RUT regardless of formatting
  it('findAdvanced q matches RUT ignoring punctuation', async () => {
    mockQueryBuilder.getCount.mockResolvedValue(1);
    mockQueryBuilder.getRawMany.mockResolvedValue([
      { id: 1, rut: '13.856.216-6', firstName: 'Luis', lastName: 'Alarcon' },
    ]);

    const result = await service.findAdvanced({
      page: 1,
      limit: 20,
      q: '13856216',
    });

    const andWhereCalls = mockQueryBuilder.andWhere.mock.calls;
    const qClauseCall = andWhereCalls.find(
      ([sql]) => typeof sql === 'string' && sql.includes("REPLACE(REPLACE(p.rut"),
    );
    expect(qClauseCall).toBeDefined();
    expect(qClauseCall![1]).toMatchObject({
      qNormLike: '%13856216%',
      qLike: '%13856216%',
    });
    expect(result.total).toBe(1);
  });
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd backend && npx jest patients.service.spec --testNamePattern "q matches RUT" 2>&1 | tail -20
```

Expected: FAIL. Either `service.findAdvanced` does not accept a `q` property (TS error) or no `andWhere` call contains the expected SQL fragment.

---

## Task 3: Backend — implement `q` clause in `findAdvanced`

**Files:**
- Modify: `backend/src/patients/patients.service.ts`

- [ ] **Step 1: Extend the filters parameter type and add the OR-clause**

In `backend/src/patients/patients.service.ts` (line 106), update the `findAdvanced` method signature to accept `q?: string`:

```ts
  async findAdvanced(filters: {
    page: number;
    limit: number;
    status?: string;
    gender?: string;
    curacionType?: string;
    dateFrom?: string;
    dateTo?: string;
    ageMin?: number;
    ageMax?: number;
    q?: string;
  }) {
    const qb = this.patientRepo.createQueryBuilder('p');

    if (filters.q && filters.q.trim() !== '') {
      const trimmed = filters.q.trim().slice(0, 100);
      const qNorm = trimmed.replace(/[.\-\s]/g, '');
      const qLike = `%${trimmed}%`;
      const qNormLike = `%${qNorm}%`;
      qb.andWhere(
        `(
          REPLACE(REPLACE(p.rut, '.', ''), '-', '') ILIKE :qNormLike
          OR p."firstName" ILIKE :qLike
          OR p."lastName" ILIKE :qLike
          OR (p."firstName" || ' ' || p."lastName") ILIKE :qLike
          OR (p.phone IS NOT NULL AND p.phone ILIKE :qLike)
        )`,
        { qLike, qNormLike },
      );
    }
```

Place this `q` block immediately after `const qb = this.patientRepo.createQueryBuilder('p');` and before the existing `if (filters.status)` block. The rest of the method body is unchanged.

- [ ] **Step 2: Run the test — expect PASS**

```bash
cd backend && npx jest patients.service.spec --testNamePattern "q matches RUT" 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 3: Run the entire patients spec to ensure no regression**

```bash
cd backend && npx jest patients.service.spec 2>&1 | tail -30
```

Expected: all tests pass (15 prior + 1 new = 16 total).

- [ ] **Step 4: Commit**

```bash
git add backend/src/patients/patients.service.ts backend/src/patients/patients.service.spec.ts
git commit -m "feat(patients): add q parameter to findAdvanced search"
```

---

## Task 4: Backend — additional tests for name, phone, and combined filters

**Files:**
- Test: `backend/src/patients/patients.service.spec.ts`

- [ ] **Step 1: Write three more failing tests**

Add these tests at the end of the `describe` block, after the test added in Task 2:

```ts
  // findAdvanced — q matches partial firstName/lastName via the same OR clause
  it('findAdvanced q applies partial-name match in the same OR clause', async () => {
    mockQueryBuilder.getCount.mockResolvedValue(1);
    mockQueryBuilder.getRawMany.mockResolvedValue([
      { id: 5, rut: '6.174.623-4', firstName: 'Mario', lastName: 'Basaez' },
    ]);

    await service.findAdvanced({ page: 1, limit: 20, q: 'basa' });

    const qClause = mockQueryBuilder.andWhere.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes("REPLACE(REPLACE(p.rut"),
    );
    expect(qClause).toBeDefined();
    expect(qClause![0]).toContain('p."firstName" ILIKE :qLike');
    expect(qClause![0]).toContain('p."lastName" ILIKE :qLike');
    expect(qClause![0]).toContain(`p."firstName" || ' ' || p."lastName"`);
    expect(qClause![1]).toMatchObject({ qLike: '%basa%' });
  });

  // findAdvanced — q matches partial phone via the same OR clause
  it('findAdvanced q applies partial-phone match in the same OR clause', async () => {
    mockQueryBuilder.getCount.mockResolvedValue(1);
    mockQueryBuilder.getRawMany.mockResolvedValue([
      { id: 1, rut: '13.856.216-6', firstName: 'Luis', lastName: 'Alarcon', phone: '951530817' },
    ]);

    await service.findAdvanced({ page: 1, limit: 20, q: '95153' });

    const qClause = mockQueryBuilder.andWhere.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes("REPLACE(REPLACE(p.rut"),
    );
    expect(qClause).toBeDefined();
    expect(qClause![0]).toContain('p.phone ILIKE :qLike');
    expect(qClause![0]).toContain('p.phone IS NOT NULL');
    expect(qClause![1]).toMatchObject({ qLike: '%95153%' });
  });

  // findAdvanced — q combined with gender filter applies both as AND
  it('findAdvanced applies q AND gender filter together', async () => {
    mockQueryBuilder.getCount.mockResolvedValue(0);
    mockQueryBuilder.getRawMany.mockResolvedValue([]);

    await service.findAdvanced({
      page: 1,
      limit: 20,
      q: 'ana',
      gender: 'Femenino',
    });

    const calls = mockQueryBuilder.andWhere.mock.calls;
    const hasGender = calls.some(
      ([sql, params]) =>
        typeof sql === 'string' &&
        sql.includes('p.gender = :gender') &&
        params?.gender === 'Femenino',
    );
    const hasQ = calls.some(
      ([sql]) => typeof sql === 'string' && sql.includes("REPLACE(REPLACE(p.rut"),
    );
    expect(hasGender).toBe(true);
    expect(hasQ).toBe(true);
  });

  // findAdvanced — empty q is ignored (no q clause added)
  it('findAdvanced ignores empty q', async () => {
    mockQueryBuilder.getCount.mockResolvedValue(0);
    mockQueryBuilder.getRawMany.mockResolvedValue([]);

    await service.findAdvanced({ page: 1, limit: 20, q: '   ' });

    const hasQ = mockQueryBuilder.andWhere.mock.calls.some(
      ([sql]) => typeof sql === 'string' && sql.includes("REPLACE(REPLACE(p.rut"),
    );
    expect(hasQ).toBe(false);
  });
```

- [ ] **Step 2: Run the new tests — expect PASS (implementation is already in place from Task 3)**

```bash
cd backend && npx jest patients.service.spec 2>&1 | tail -30
```

Expected: all tests pass (15 prior + 4 new q tests = 19 total).

- [ ] **Step 3: Commit**

```bash
git add backend/src/patients/patients.service.spec.ts
git commit -m "test(patients): add coverage for q name/phone/combined cases"
```

---

## Task 5: Backend — controller routes `q` to `findAdvanced`

**Files:**
- Modify: `backend/src/patients/patients.controller.ts`

- [ ] **Step 1: Accept `q` query param and route accordingly**

Edit `backend/src/patients/patients.controller.ts`. In the `find` method (line 33), add `q` to the list of `@Query` params and to the routing logic:

```ts
  @Get()
  async find(
    @Query('rut') rut?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('gender') gender?: string,
    @Query('curacionType') curacionType?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('ageMin') ageMin?: string,
    @Query('ageMax') ageMax?: string,
  ) {
    if (rut) {
      const patient = await this.patientsService.findByRut(rut);
      return patient ? patient : { found: false };
    }

    const trimmedQ = q?.trim();
    const hasQ = !!trimmedQ;
    const hasAdvancedFilters = status || gender || curacionType || dateFrom || dateTo || ageMin || ageMax;

    if (hasQ || hasAdvancedFilters) {
      return this.patientsService.findAdvanced({
        page: parseInt(page || '1', 10) || 1,
        limit: parseInt(limit || '20', 10) || 20,
        status: status || undefined,
        gender: gender || undefined,
        curacionType: curacionType || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        ageMin: ageMin ? parseInt(ageMin, 10) : undefined,
        ageMax: ageMax ? parseInt(ageMax, 10) : undefined,
        q: trimmedQ || undefined,
      });
    }

    if (page) {
      return this.patientsService.findPaginated(
        parseInt(page, 10) || 1,
        parseInt(limit || '20', 10) || 20,
      );
    }
    return this.patientsService.findAll();
  }
```

- [ ] **Step 2: Type-check the backend**

```bash
cd backend && npx tsc --noEmit 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 3: Run all backend tests**

```bash
cd backend && npx jest 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 4: Manual integration check — start backend and curl**

Start the backend (assumes Postgres is running per repo convention):

```bash
cd backend && npm run start:dev &
sleep 10
```

Get a JWT for the admin user (replace credentials with the dev seed values; this command lives in repo memory/CLAUDE if needed — adjust if login fails):

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
echo "Token length: ${#TOKEN}"
```

Smoke each search dimension against real data:

```bash
# RUT (formatted)
curl -s "http://localhost:3000/api/patients?q=13.856.216&page=1&limit=5" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -20

# RUT (unformatted) — should match the same patient
curl -s "http://localhost:3000/api/patients?q=13856216&page=1&limit=5" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -20

# Name partial
curl -s "http://localhost:3000/api/patients?q=basa&page=1&limit=5" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -20

# Phone partial
curl -s "http://localhost:3000/api/patients?q=95153&page=1&limit=5" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -20
```

Expected: each call returns a `data` array; the two RUT calls return the same patient; "basa" returns Mario Basaez; "95153" returns Luis Alarcon.

Stop the backend before continuing:

```bash
kill %1 2>/dev/null
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/patients/patients.controller.ts
git commit -m "feat(patients): route q query param to advanced search"
```

---

## Task 6: Frontend — debounce hook

**Files:**
- Create: `frontend/src/hooks/useDebouncedValue.ts`

- [ ] **Step 1: Create the hook**

```bash
mkdir -p frontend/src/hooks
```

Then create `frontend/src/hooks/useDebouncedValue.ts`:

```ts
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
```

- [ ] **Step 2: Type-check the frontend**

```bash
cd frontend && npx tsc -b --noEmit 2>&1 | tail -10
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useDebouncedValue.ts
git commit -m "feat(frontend): add useDebouncedValue hook"
```

---

## Task 7: Frontend — `searchPatientsAdvanced` accepts `q`

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Add `q` to the params type**

Edit `frontend/src/services/api.ts` (line 99). Update the `searchPatientsAdvanced` signature:

```ts
export const searchPatientsAdvanced = async (filters: {
  page?: number;
  limit?: number;
  status?: string;
  gender?: string;
  curacionType?: string;
  dateFrom?: string;
  dateTo?: string;
  ageMin?: number;
  ageMax?: number;
  q?: string;
}): Promise<PaginatedResponse<Patient>> => {
  const { data } = await api.get('/patients', { params: filters });
  return data;
};
```

- [ ] **Step 2: Type-check the frontend**

```bash
cd frontend && npx tsc -b --noEmit 2>&1 | tail -10
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "feat(frontend): allow q in searchPatientsAdvanced params"
```

---

## Task 8: Frontend — search input UI in PatientsListPage

**Files:**
- Modify: `frontend/src/pages/PatientsListPage.tsx`

- [ ] **Step 1: Add imports**

In `frontend/src/pages/PatientsListPage.tsx`, line 5, extend the lucide imports to include `Search`. Line 1 already imports `useEffect, useState, useCallback`. Add an import for the new hook on line 6:

```tsx
import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getPatientsPaginated, searchPatientsAdvanced } from '../services/api';
import type { Patient, PaginatedResponse } from '../types';
import { UserPlus, Users, Eye, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Filter, X, Search } from 'lucide-react';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
```

- [ ] **Step 2: Add search state and debounced value**

Inside the `PatientsListPage` component, after the `currentPage` line (line 51), insert:

```tsx
  const [searchQuery, setSearchQuery] = useState<string>(searchParams.get('q') ?? '');
  const debouncedQuery = useDebouncedValue(searchQuery, 300);
```

- [ ] **Step 3: Update `loadPatients` to accept and use the search term**

Replace the `loadPatients` definition (lines 59–82) with:

```tsx
  const loadPatients = useCallback(async (page: number, f: AdvancedFilters, q: string) => {
    setLoading(true);
    try {
      const trimmed = q.trim();
      if (hasActiveFilters(f) || trimmed !== '') {
        const params: Record<string, string | number> = { page, limit: 20 };
        if (f.status) params.status = f.status;
        if (f.gender) params.gender = f.gender;
        if (f.curacionType) params.curacionType = f.curacionType;
        if (f.dateFrom) params.dateFrom = f.dateFrom;
        if (f.dateTo) params.dateTo = f.dateTo;
        if (f.ageMin) params.ageMin = parseInt(f.ageMin, 10);
        if (f.ageMax) params.ageMax = parseInt(f.ageMax, 10);
        if (trimmed) params.q = trimmed;
        const data = await searchPatientsAdvanced(params);
        setResult(data);
      } else {
        const data = await getPatientsPaginated(page, 20);
        setResult(data);
      }
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);
```

- [ ] **Step 4: Update the load effect**

Replace the existing `useEffect` (lines 84–86) with one that depends on the debounced query:

```tsx
  useEffect(() => {
    loadPatients(currentPage, appliedFilters, debouncedQuery);
  }, [currentPage, appliedFilters, debouncedQuery, loadPatients]);
```

- [ ] **Step 5: Add a sync effect that mirrors `debouncedQuery` into URL params and resets page to 1 on change**

Add this `useEffect` immediately below the `useDebouncedValue` line:

```tsx
  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (trimmed) {
        if (next.get('q') !== trimmed) {
          next.set('q', trimmed);
          next.set('page', '1');
        }
      } else if (next.has('q')) {
        next.delete('q');
        next.set('page', '1');
      }
      return next;
    });
  }, [debouncedQuery, setSearchParams]);
```

- [ ] **Step 6: Update `clearFilters` and the empty-state CTA to also clear the search**

Replace the existing `clearFilters` (lines 97–101) with:

```tsx
  const clearFilters = () => {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setSearchQuery('');
    setSearchParams({ page: '1' });
  };
```

- [ ] **Step 7: Render the search input row**

Find the card header `<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 border-b ...">` (line 121) and the closing tag of that wrapping `<div>` near line 146 (after `</button>`'s `</div>`). Immediately AFTER the closing `</div>` of that header row (so before the `{filtersOpen && (...)}` block on line 148), insert this new search row:

```tsx
        <div className="px-5 pt-4 pb-1">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por RUT, nombre o teléfono..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 pl-9 pr-9 py-2 text-sm bg-white dark:bg-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
```

- [ ] **Step 8: Update the empty-state copy to include the search case**

Find the empty-state block (lines 255–268) and replace its text logic so the message handles `searchQuery` too:

```tsx
          ) : !result || result.data.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">
                {hasActiveFilters(appliedFilters) || searchQuery
                  ? 'No se encontraron pacientes'
                  : 'No hay pacientes registrados'}
              </p>
              {(hasActiveFilters(appliedFilters) || searchQuery) && (
                <button onClick={clearFilters} className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium">
                  Limpiar búsqueda
                </button>
              )}
            </div>
```

- [ ] **Step 9: Type-check the frontend**

```bash
cd frontend && npx tsc -b --noEmit 2>&1 | tail -10
```

Expected: no TypeScript errors.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/PatientsListPage.tsx
git commit -m "feat(frontend): add unified search input in patients list"
```

---

## Task 9: End-to-end manual smoke test

**Files:**
- None modified — verification only.

This task is required by repo convention (memory: never claim done without full local testing — backend + frontend + DB).

- [ ] **Step 1: Start backend**

```bash
cd backend && npm run start:dev &
sleep 10
```

Expected: server logs `Application is running on: http://[::1]:3000`.

- [ ] **Step 2: Start frontend**

In a separate command:

```bash
cd frontend && npm run dev &
sleep 5
```

Expected: Vite reports `Local: http://localhost:5173/`.

- [ ] **Step 3: Open `http://localhost:5173/pacientes` in a browser via Chrome MCP or Playwright MCP**

Use `mcp__claude-in-chrome__tabs_context_mcp` first (per session start guidelines), then either reuse a tab or `tabs_create_mcp` to load the URL. Log in with the dev admin credentials if redirected.

- [ ] **Step 4: Verify the input appears above the table with placeholder "Buscar por RUT, nombre o teléfono..."**

Use `mcp__claude-in-chrome__read_page` or `browser_snapshot` to confirm.

- [ ] **Step 5: Type "Mario" — verify list narrows to patients matching by name within ~300ms**

Use `mcp__claude-in-chrome__form_input` (or Playwright `browser_type`) to type into the input. Then snapshot and confirm filtered results.

- [ ] **Step 6: Clear, type "13856216" — verify it matches the patient stored as `13.856.216-6`**

Confirm that the resulting patient's RUT in the table is `13.856.216-6` (or whichever formatted RUT corresponds in the current dataset).

- [ ] **Step 7: Verify URL contains `?q=13856216&page=1`**

Read tab URL via tabs context.

- [ ] **Step 8: Reload the page — verify `q` persists and the filter is still applied**

- [ ] **Step 9: Open the filter panel, select gender = Femenino, verify combined search still works**

Verify result count changes consistently with applying both filters.

- [ ] **Step 10: Click "X" inside the search input — verify input clears and full list returns**

- [ ] **Step 11: Stop both servers**

```bash
kill %1 %2 2>/dev/null
wait 2>/dev/null
```

- [ ] **Step 12: If any step revealed a bug, file a follow-up task and fix before declaring complete.**

---

## Task 10: Final review and merge prep

**Files:**
- None modified.

- [ ] **Step 1: Run full backend test suite once more**

```bash
cd backend && npx jest 2>&1 | tail -10
```

Expected: all green.

- [ ] **Step 2: Run frontend type-check and lint**

```bash
cd frontend && npx tsc -b --noEmit && npx eslint src/pages/PatientsListPage.tsx src/hooks/useDebouncedValue.ts src/services/api.ts 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 3: Show the commit log on the worktree branch**

```bash
git log --oneline feat/clinical-features..HEAD
```

Expected: clean linear history of commits matching tasks 1–8.

- [ ] **Step 4: Summary message for the user (no commit needed here)**

Report results to user with: branch name, list of commits, link to spec/plan files, and a one-line note that smoke test passed in browser. Wait for user direction on merging back into `feat/clinical-features` or opening a PR — do not merge without explicit approval (per global rules in `~/.claude/CLAUDE.md`).

---

## Self-Review Notes

- **Spec coverage**: every section of the spec maps to at least one task — UX (Task 8), backend service (Tasks 2–4), backend controller (Task 5), debounce hook (Task 6), api.ts (Task 7), URL persistence (Task 8 step 5), tests (Tasks 2 & 4), manual smoke (Task 9).
- **Type consistency**: `q` is the param name used end-to-end (controller → service → frontend api.ts → URL search param). `searchQuery` is the React state local to the component; `debouncedQuery` is the read-side. `useDebouncedValue` is the hook name everywhere.
- **No placeholders**: every step has either exact code or exact commands with expected output. No "etc.", no "similar to above".
- **Risk note**: Task 1 hinges on copying the spec/plan files from the main working tree into the worktree. If the worker can't access the original paths (e.g. session reset), the brainstorming spec contents need to be regenerated by re-reading the design doc. Both files are already in the main working tree at known paths so this is straightforward.
