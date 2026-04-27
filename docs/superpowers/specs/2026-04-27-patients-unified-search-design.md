# Buscador unificado en Pacientes — Design

**Date:** 2026-04-27
**Branch (planned):** `feat/patients-search` (worktree)
**Base branch:** `feat/clinical-features`

## Goal

Add a single search input on the Pacientes list page that searches across RUT, full name, and phone simultaneously. Users want to type whatever piece of information they have at hand without choosing a field first.

## Non-Goals

- Replacing the existing advanced filters panel (it stays).
- Full-text search infrastructure (Postgres trigram/tsvector). ILIKE is enough at current scale (~33 patients) and can be revisited if needed.
- Searching across other entities (curaciones, appointments).
- Highlighting matched substrings in the table.

## UX

- Search input rendered above the table, inside the same card, always visible — not inside the collapsible filter panel.
- Placeholder: `Buscar por RUT, nombre o teléfono...`
- Left-aligned magnifying-glass icon (lucide `Search`).
- Trailing "X" button (lucide `X`) appears when the input has content, clears in one click.
- Live search with **300 ms debounce**. Each keystroke after debounce triggers a new request and resets pagination to page 1.
- Empty input + no advanced filters → original full paginated list.
- Search query persists in URL search params (`?q=...&page=1`) so the URL is shareable and survives reload.
- Combined with advanced filters using **AND** logic (intersect q match with filters).
- Empty-result copy unchanged structurally; existing message already covers "no se encontraron pacientes con los filtros aplicados" — extend to also cover the `q` case.

## Backend

### Endpoint

`GET /api/patients` — extend with new optional query param `q`.

| Param | Type | Existing? |
|-------|------|-----------|
| `q` | string (trimmed, max 100 chars) | new |
| `page`, `limit` | number | existing |
| `status`, `gender`, `curacionType`, `dateFrom`, `dateTo`, `ageMin`, `ageMax` | various | existing |

Routing in the controller:

- If `rut` is present (legacy exact-match flow) → unchanged.
- If `q` is present **or** any advanced filter is present → `findAdvanced({ ..., q })`.
- Otherwise → `findPaginated` / `findAll` (unchanged).

### Service: `findAdvanced` — `q` handling

When `q` is provided (after `trim()`, ignored if empty):

1. Compute `qNorm = q.replace(/[.\-\s]/g, '')` — used for RUT comparison only.
2. Compute `qLike = `%${q}%`` — used for name/phone.
3. Compute `qNormLike = `%${qNorm}%``.
4. Add a single combined `andWhere(...)` to the query builder:

```sql
(
  REPLACE(REPLACE(p.rut, '.', ''), '-', '') ILIKE :qNormLike
  OR p."firstName" ILIKE :qLike
  OR p."lastName"  ILIKE :qLike
  OR (p."firstName" || ' ' || p."lastName") ILIKE :qLike
  OR (p.phone IS NOT NULL AND p.phone ILIKE :qLike)
)
```

Notes:
- The concatenation `firstName || ' ' || lastName` lets users search "Mario Basaez" as one string.
- Phone field is nullable, so the `IS NOT NULL` guard avoids ILIKE on NULL.
- The clause is added with `andWhere`, so it composes with existing filters as AND.
- DISTINCT/select projection in the existing builder is preserved.

### Validation

- `q` is sanitized (trim, max length 100). No SQL escaping concerns — TypeORM parameter binding handles it. ILIKE wildcards `%` and `_` typed by the user are treated as wildcards (acceptable for a search box; not user-controlled SQL).

## Frontend

### New: `frontend/src/hooks/useDebouncedValue.ts`

Tiny hook:

```ts
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
```

### `frontend/src/services/api.ts`

Extend the params type for `searchPatientsAdvanced` to include `q?: string`. Pass it through as a query string param when present.

### `frontend/src/pages/PatientsListPage.tsx`

State changes:

- `const [searchQuery, setSearchQuery] = useState(searchParams.get('q') ?? '');`
- `const debouncedQuery = useDebouncedValue(searchQuery, 300);`
- A new effect syncs `debouncedQuery` into `searchParams` (`?q=...`, removed when empty) and resets `page` to 1 on change.
- `loadPatients(currentPage, appliedFilters, debouncedQuery)`:
  - If `debouncedQuery` non-empty **or** `hasActiveFilters(f)` → call `searchPatientsAdvanced` (passing `q` when set).
  - Else → `getPatientsPaginated`.

UI changes:

- New row inside the card header area (above the table, below the title row), containing:
  - Input with `Search` icon prefix.
  - "X" suffix button (visible only when `searchQuery !== ''`) that clears the input.
- The empty-state message becomes: `"No se encontraron pacientes"` when `searchQuery || hasActiveFilters(appliedFilters)`, else `"No hay pacientes registrados"`. The "Limpiar filtros" CTA also clears `searchQuery`.

## Testing

### Backend (`backend/src/patients/patients.service.spec.ts`)

Add four test cases for `findAdvanced` (mocked QueryBuilder following the existing pattern in the file):

1. `q` matches RUT regardless of formatting (e.g. query `"13856216"` finds patient with stored `rut = "13.856.216-6"`).
2. `q` matches partial name (`"basa"` finds `"Mario Basaez"`).
3. `q` matches partial phone (`"95153"` finds `"951530817"`).
4. `q` combined with `gender` filter applies both as AND.

### Frontend

Manual smoke test in browser per repo convention (memory feedback: always test locally end-to-end). Verify:

- Live search reflects results within ~300ms of last keystroke.
- Clearing input restores full list.
- Search + filter panel work together.
- URL reflects `?q=...&page=...` and reload preserves state.
- Server-side: backend dev log shows expected SQL being generated.

## Risk and rollback

- Single migration-free change. No DB schema impact.
- Rollback = revert PR. No data implications.
- Performance: at current scale, ILIKE with `%term%` over ~33 rows is trivial. If the table grows past tens of thousands, consider `pg_trgm` GIN indexes on `firstName`, `lastName`, `phone`, and a generated normalized `rut` column.

## Files

| File | Change |
|------|--------|
| `backend/src/patients/patients.controller.ts` | accept `q` query param, route to `findAdvanced` |
| `backend/src/patients/patients.service.ts` | extend `findAdvanced` signature with `q`, add OR clause |
| `backend/src/patients/patients.service.spec.ts` | 4 new tests |
| `frontend/src/services/api.ts` | accept `q` in advanced search params |
| `frontend/src/hooks/useDebouncedValue.ts` | **new** small hook |
| `frontend/src/pages/PatientsListPage.tsx` | search input UI, debounce, URL sync, loader plumbing |

## Open questions

None at this time. Approved verbally with the user 2026-04-27.
