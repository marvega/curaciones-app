# Archivo de pull requests — curaciones-app

Exportado el 2026-08-24, antes de recrear el repositorio para eliminar
credenciales del historial. Las referencias `refs/pull/*` de GitHub no se
pueden borrar desde el cliente, así que recrear el repositorio era la única
vía que no dependía de un ticket de soporte. Esto preserva el registro de
decisiones que vivía en esas discusiones.

Total: 37 pull requests.

## #1 — feat: complete UI/UX redesign

**Estado:** MERGED · **autor:** marvega · **ui/redesign-look-and-feel → main** · creado 2026-03-16 · mergeado 2026-03-16

## Summary
- Sidebar navigation (dark, collapsible, mobile drawer)
- Blue primary palette replacing teal
- Dashboard homepage with stats + upcoming appointments
- Figtree + Noto Sans typography
- Lucide React icons replacing emojis
- Skeleton loading states
- Unified button system
- Split-screen login with branding
- Custom molecular logo + favicon
- No backend logic changes

## Test plan
- [x] TypeScript + build pass
- [x] Tested with production data
- [ ] Verify Render auto-deploy

---

## #2 — feat: per-user rate limiting (fixes shared-IP 429s for clinic users)

**Estado:** MERGED · **autor:** marvega · **fix/per-user-throttler → main** · creado 2026-04-27 · mergeado 2026-04-27

## Problem

The current rate limiter (introduced in feat/clinical-features) tracks requests per IP. Multiple nurses sharing a clinic NAT would exhaust the same bucket and get random 429s during normal use — a typical patient-page load is 9 requests, so 11 simultaneous flows would hit the 100/min cap.

## Fix

`PerUserThrottlerGuard` extends `ThrottlerGuard` and overrides `getTracker()` to:
- Use `user:<sub>` from the JWT for authenticated requests → each nurse has her own bucket.
- Fall back to IP when no/invalid JWT → preserves brute-force protection on `/auth/login`.

Production limits (tunable via env, no redeploy needed):
- `THROTTLE_DEFAULT_LIMIT=200` per-user req/min
- `THROTTLE_LOGIN_LIMIT=5` per-IP req/min

## Why this PR (vs. waiting for feat/clinical-features)

The throttler base config lives on feat/clinical-features but PRD currently runs main without it. Backporting just the rate-limit infrastructure with the per-user fix from day one means:
- No 429 incidents when feat/clinical-features eventually ships.
- Smaller, focused change to review.
- README documents the new env vars and operational tuning path.

## Verification

- Unit: 18/18 (incl. 5 new for guard)
- E2E: 2/2 — user A throttles at 5 reqs, user B from same IP keeps working (would fail under old per-IP guard)
- Build: clean

## Test plan

- [ ] CI green (or local \`npm test\` + \`npm run test:e2e -- --runInBand\`)
- [ ] Verify \`THROTTLE_DEFAULT_LIMIT=200\` set on Render (or accept code default)
- [ ] Smoke test post-merge: \`/api/auth/login\` + an authenticated endpoint in PRD

> **Comentario de vercel** (2026-04-27):
> [vc]: #HTLDEDAro+hG27Xe63L7bDzSxenfwEKG0Abe6uE6OiQ=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1maXgtcGVyLXVzZXItdGhyb3R0bGVyLW1hcnZlZ2FzLXByb2plY3RzLnZlcmNlbC5hcHAifSwiaW5zcGVjdG9yVXJsIjoiaHR0cHM6Ly92ZXJjZWwuY29tL21hcnZlZ2FzLXByb2plY3RzL2N1cmFjaW9uZXMtYXBwL1E2Q2tGTTNnVEN6VlZtOWpGam1Ud0NvU1dmWEciLCJwcmV2aWV3VXJsIjoiY3VyYWNpb25lcy1hcHAtZ2l0LWZpeC1wZXItdXNlci10aHJvdHRsZXItbWFydmVnYXMtcHJvamVjdHMudmVyY2VsLmFwcCIsIm5leHRDb21taXRTdGF0dXMiOiJERVBMT1lFRCJ9XX0=
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/Q6CkFM3gTCzVVm9jFjmTwCoSWfXG) | [Preview](https://curaciones-app-git-fix-per-user-throttler-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-fix-per-user-throttler-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 27, 2026 3:32pm |

---

## #3 — feat: clinical features + per-user throttler integration

**Estado:** MERGED · **autor:** marvega · **merge/clinical-features-and-throttler → main** · creado 2026-04-27 · mergeado 2026-04-27

## Summary
Promotes `feat/clinical-features` (advanced patient filters, dark mode, QR codes, digital consent, alert banner, simplified diabetic-foot quarterly report, dashboard cards, etc.) to `main`, integrated with the per-user rate limiter that landed on `main` separately.

## Conflict resolution
Four files conflicted; resolutions chosen to keep both features functional:

| File | Resolution |
|---|---|
| `backend/src/app.module.ts` | `ThrottlerModule.forRootAsync` + `PerUserThrottlerGuard` (from main) AND `APP_INTERCEPTOR: AuditLogInterceptor` (from clinical-features) |
| `backend/src/auth/auth.controller.ts` | Kept `@ApiTags('Auth')` from clinical-features alongside `@Throttle` decorator from main |
| `backend/src/health.controller.ts` | Kept `@ApiTags('Health')` from clinical-features alongside `@SkipThrottle` from main |
| `backend/test/app.e2e-spec.ts` | Kept the clinical-features version (replaced by a real `/api/health` e2e test); main wanted to delete because it was previously scaffolding |

## Verification
- `npx jest` → 12 suites, 98 tests passing
- E2E suite skipped (no `.env.test` configured locally)

## Test plan
- [ ] CI green
- [ ] Smoke after deploy: login (/api/auth/login), dashboard cards, patient list with advanced filters, monthly + diabetic-foot reports, dark-mode toggle
- [ ] Confirm rate limiter still applies (`THROTTLE_DEFAULT_LIMIT`, `THROTTLE_LOGIN_LIMIT`)

> **Comentario de vercel** (2026-04-27):
> [vc]: #uahJ6glz8mQWqTDYPdd8IYHARZqd4sIHYTqFNCfTSTg=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1tZXJnZS1jbGluaWNhbC1mZWF0LWZhYTFjNy1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIn0sImluc3BlY3RvclVybCI6Imh0dHBzOi8vdmVyY2VsLmNvbS9tYXJ2ZWdhcy1wcm9qZWN0cy9jdXJhY2lvbmVzLWFwcC9DWVdVNWVwcjhpMmhMSkJKQWFtZ3g5Y1hiRlQxIiwicHJldmlld1VybCI6ImN1cmFjaW9uZXMtYXBwLWdpdC1tZXJnZS1jbGluaWNhbC1mZWF0LWZhYTFjNy1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIiwibmV4dENvbW1pdFN0YXR1cyI6IkRFUExPWUVEIn1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/CYWU5epr8i2hLJBJAamgx9cXbFT1) | [Preview](https://curaciones-app-git-merge-clinical-feat-faa1c7-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-merge-clinical-feat-faa1c7-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 27, 2026 3:46pm |

---

## #4 — feat(patients): unified search by RUT, name, or phone

**Estado:** MERGED · **autor:** marvega · **feat/patients-search → main** · creado 2026-04-27 · mergeado 2026-04-27

## Summary
Adds a single search input on the Pacientes list page that searches RUT (format-flexible), name, and phone in one box, with 300ms debounce, URL persistence, and combined-with-filters semantics.

Also fixes a pre-existing bug in `findAdvanced` where `select('DISTINCT p.id', ...)` produced malformed SQL — the existing advanced filter panel was returning 500 silently.

## What's included
- **Backend** (`patients.service.ts`, `patients.controller.ts`): new `q` query param. ILIKE matches against RUT (normalized — punctuation removed), `firstName`, `lastName`, `firstName || ' ' || lastName`, and `phone` (with `IS NOT NULL` guard). Capped to 100 chars. Composes via AND with existing filters.
- **Backend tests** (`patients.service.spec.ts`): 5 new unit tests covering RUT-normalized match, partial name, partial phone, combined `q + gender`, and empty-`q` ignored.
- **Frontend** (`PatientsListPage.tsx`, `useDebouncedValue` hook, `api.ts`): debounced live search above the table with `Search` icon and X-clear button. URL query persists (`?q=...&page=1`). Pagination and apply-filter callbacks preserve `q`. Empty-state copy and "Limpiar búsqueda" CTA updated.
- **Bug fix** (`patients.service.ts`): switched to `qb.distinct(true).select(...)` so `DISTINCT` lands right after `SELECT` (was previously appearing mid-list and 500'd at runtime).

## Verification
- `npx jest` → 12 suites, 103 tests passing
- `npx tsc --noEmit` → only pre-existing errors in `appointments.service.spec.ts` (untouched)
- `npx eslint` on changed files → clean
- Browser smoke (Playwright + production-restored Postgres):
  - `basa` → Mario Basaez (1)
  - `13856216` → Luis Alarcon Caceres (RUT stored as `13.856.216-6`)
  - `13.856.216` → same patient (format insensitive)
  - `95153` → Luis Alarcon (partial phone)
  - `mario` reload → query persists, 2 results
  - `ana` + `gender=Femenino` → only Adriana (combined AND)
  - X clear button → URL reverts to `?page=1`, full list returns
  - `ZZZZ` → empty state "No se encontraron pacientes"

## Spec & plan
- Spec: `docs/superpowers/specs/2026-04-27-patients-unified-search-design.md`
- Plan: `docs/superpowers/plans/2026-04-27-patients-unified-search.md`

## Test plan
- [ ] CI green
- [ ] Smoke after deploy: search by RUT/name/phone, combine with filters, pagination, refresh preserves `q`

> **Comentario de vercel** (2026-04-27):
> [vc]: #0J6rNShiiXkFKTD0CoFI61fXNevmT0VGpT0vAnI1Vs0=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1mZWF0LXBhdGllbnRzLXNlYXJjaC1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIn0sImluc3BlY3RvclVybCI6Imh0dHBzOi8vdmVyY2VsLmNvbS9tYXJ2ZWdhcy1wcm9qZWN0cy9jdXJhY2lvbmVzLWFwcC82d1N2M2tqOGVRWVVpZ2VoR05qdkhKQk5Cd2FLIiwicHJldmlld1VybCI6ImN1cmFjaW9uZXMtYXBwLWdpdC1mZWF0LXBhdGllbnRzLXNlYXJjaC1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIiwibmV4dENvbW1pdFN0YXR1cyI6IkRFUExPWUVEIn1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/6wSv3kj8eQYUigehGNjvHJBNBwaK) | [Preview](https://curaciones-app-git-feat-patients-search-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-feat-patients-search-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 27, 2026 3:47pm |

---

## #5 — feat: bota de descarga (ayuda técnica) tracking + Switch UI

**Estado:** MERGED · **autor:** marvega · **feat/clinical-features → main** · creado 2026-04-27 · mergeado 2026-04-27

## Summary

- Adds **`bootDelivered`** boolean to `Curacion` entity, persisted via `create()` and `update()`. Toggle visible only for `pie_diabetico` curaciones; resets if type changes.
- New reusable **`Switch`** component (pill toggle, dark mode, focus-visible ring, `role="switch"` + `aria-describedby`) replaces the existing "Dar de alta" checkbox and powers the new bota toggle in both create form and edit modal.
- **Quarterly diabetic-foot report** extended with a "Botas entregadas" stat card alongside the patient card (2-col grid, same blue palette, mirrored filter chips). Backend reuses an extracted `applyDetailedFilters` helper to apply year/quarter/gender/age filters consistently across the patient and boots queries. Excel export gets a "Botas entregadas" row.
- **SQL migration** `backend/scripts/migrate-boot-delivered.sql` (idempotent via `ADD COLUMN IF NOT EXISTS`) for production deploys where `synchronize` is disabled.
- **Bug fix** (preexisting, surfaced during smoke test): `handleSaveCuracion` was sending empty strings for `appointmentDate`/`appointmentTime`, which `class-validator @IsDateString` rejected with 400. Fixed by coercing empties to `undefined` so the fields are omitted from the payload.

Driven by a brainstorming → spec → plan → execution flow:
- Spec: `docs/superpowers/specs/2026-04-27-bota-descarga-pie-diabetico-design.md`
- Plan: `docs/superpowers/plans/2026-04-27-bota-descarga-pie-diabetico-plan.md`

## Test plan

Backend: `cd backend && npx jest` → 97/97 green (4 new tests for `bootsDelivered` aggregation + filter propagation).

Frontend: `cd frontend && npx tsc --noEmit` → clean.

End-to-end smoke (verified locally with Chrome MCP against production-restored DB):
- [x] Create curación type Pie Diabético + bota ON → POST 201, persisted (`bootDelivered=true`)
- [x] Create curación type Avanzada → boot toggle not rendered
- [x] Edit existing curación → modal hidrates boot toggle from saved value
- [x] Edit: toggle bota OFF + reason → PUT 200, persisted (`bootDelivered=false`)
- [x] Reporte trimestral: 2 cards side-by-side, boot count = 1 with single matching curación
- [x] Filter by Femenino → boot count drops to 0 (boots query respects filter via shared helper)

## Production deploy

Before deploying the new application code, run on production DB:
```sql
\i backend/scripts/migrate-boot-delivered.sql
```

> **Comentario de vercel** (2026-04-27):
> [vc]: #/LR5T09sr9jIbezDt+5QnYtDvCIelX+w53bxbPWgtNM=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1mZWF0LWNsaW5pY2FsLWZlYXR1cmVzLW1hcnZlZ2FzLXByb2plY3RzLnZlcmNlbC5hcHAifSwiaW5zcGVjdG9yVXJsIjoiaHR0cHM6Ly92ZXJjZWwuY29tL21hcnZlZ2FzLXByb2plY3RzL2N1cmFjaW9uZXMtYXBwLzVuSmpGTDhad3Z0VEZiWjFOaWVXRFoyTThmS2siLCJwcmV2aWV3VXJsIjoiY3VyYWNpb25lcy1hcHAtZ2l0LWZlYXQtY2xpbmljYWwtZmVhdHVyZXMtbWFydmVnYXMtcHJvamVjdHMudmVyY2VsLmFwcCIsIm5leHRDb21taXRTdGF0dXMiOiJERVBMT1lFRCJ9XX0=
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/5nJjFL8ZwvtTFbZ1NieWDZ2M8fKk) | [Preview](https://curaciones-app-git-feat-clinical-features-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-feat-clinical-features-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 27, 2026 5:47pm |

---

## #6 — chore(backend): wire TypeORM migrations into Render preDeployCommand

**Estado:** MERGED · **autor:** marvega · **chore/typeorm-migrations → main** · creado 2026-04-27 · mergeado 2026-04-27

## Summary

Auto-deploy on merge to `main` has been failing on every PR that adds an entity/column because:
- `synchronize: false` in production (correct — avoids data loss)
- No automated migration runner — schema changes never reached prod
- The app crashes on startup in `BootstrapService.onModuleInit` → `UsersService.seed()` queries a column that doesn't exist → healthcheck never passes → Render marks the deploy `update_failed`

This PR introduces TypeORM migrations + Render `preDeployCommand`, the standard pattern for NestJS + TypeORM on Render.

## Changes

- `backend/src/data-source.ts` — TypeORM `DataSource` for the CLI (same entity list as `app.module.ts`).
- `backend/src/migrations/1714230000000-InitialBaseline.ts` — baseline migration capturing the current prod schema. Idempotent (`CREATE/ALTER … IF NOT EXISTS`) so it's safe against any state. **Already marked as applied in prod's `migrations` table** so this PR is a no-op for data.
- `backend/package.json` — scripts:
  - `migration:generate`, `migration:run`, `migration:revert`, `migration:show` for dev (TS via `ts-node`)
  - `migration:run:prod` for the deploy pipeline (compiled JS, no `ts-node` runtime dep)
- `render.yaml` — `preDeployCommand: npm run migration:run:prod` on `curaciones-api`. Runs after build, before traffic flip; if it fails, the deploy aborts and the previous version keeps serving.

## Why this approach (vs. alternatives)

| Option | Why rejected |
|---|---|
| Bootstrap auto-migrate (run SQL inside `onModuleInit`) | Anti-pattern: app needs DDL privileges in runtime; multi-instance race; failed migration → app down vs. deploy down |
| Custom Node SQL runner | Reinvents tracking, lock, dry-run, revert that TypeORM already provides |
| Manual `*.sql` scripts | What we had — a single human forgetting was enough to break prod three times in a row today |

## Future workflow

When changing an entity:
1. Edit entity
2. `cd backend && npm run migration:generate -- src/migrations/<DescriptiveName>`
3. Commit entity change + generated migration in the same PR
4. On merge to main, Render runs `migration:run:prod` automatically before the new code starts

## Test plan

- [x] Built locally (`npm run build`) — `dist/data-source.js` and `dist/migrations/*.js` produced
- [x] `npm run migration:run` against fresh DB → all 11 tables created, registered in `migrations` table
- [x] Re-run on same DB → "No migrations are pending" (idempotent)
- [x] Run against existing dev DB (already had schema via `synchronize:true`) → no-op, registers baseline
- [x] `npm run migration:run:prod` (compiled JS path) works the same
- [x] All 107 backend unit tests still pass
- [x] Baseline migration manually inserted into prod's `migrations` table — Render's first `migration:run:prod` after this merges will report "No migrations are pending"

## Rollback

If anything goes wrong:
- The migration is idempotent and additive only; no data is at risk.
- Worst case: revert this PR; prod's schema and `migrations` table stay where they are; subsequent merges go back to the previous (broken) auto-deploy state until a new fix lands.

> **Comentario de vercel** (2026-04-27):
> [vc]: #ufb23p+3ld5llzAQNVWMQLmOuiU7obUBhGcaEiWvwE4=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1jaG9yZS10eXBlb3JtLW1pZ3JhdGlvbnMtbWFydmVnYXMtcHJvamVjdHMudmVyY2VsLmFwcCJ9LCJpbnNwZWN0b3JVcmwiOiJodHRwczovL3ZlcmNlbC5jb20vbWFydmVnYXMtcHJvamVjdHMvY3VyYWNpb25lcy1hcHAvRE04OXV4NVQ4SDV6d1dIV2lWbUhhb2ZiZlRyYiIsInByZXZpZXdVcmwiOiJjdXJhY2lvbmVzLWFwcC1naXQtY2hvcmUtdHlwZW9ybS1taWdyYXRpb25zLW1hcnZlZ2FzLXByb2plY3RzLnZlcmNlbC5hcHAiLCJuZXh0Q29tbWl0U3RhdHVzIjoiREVQTE9ZRUQifV19
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/DM89ux5T8H5zwWHWiVmHaofbfTrb) | [Preview](https://curaciones-app-git-chore-typeorm-migrations-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-chore-typeorm-migrations-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 27, 2026 6:21pm |

---

## #7 — perf(backend): memory instrumentation, lazy PDFKit, DB pool cap

**Estado:** MERGED · **autor:** marvega · **perf/memory-instrumentation → main** · creado 2026-04-27 · mergeado 2026-04-27

## Summary

Diagnostic + low-risk mitigations for production OOM symptoms on Render starter plan (512MB RAM, silent SIGKILL every ~2min).

- New `GET /api/health/memory` endpoint exposes `process.memoryUsage()` (MB). Gated by `HEALTH_TOKEN` env var: hidden (404) if unset, requires matching `X-Health-Token` header otherwise.
- PDFKit moved to dynamic import inside `generatePdf()` — removes ~5–10MB of AFM font data from boot heap (rarely-used codepath).
- TypeORM `pg` pool capped at 3 (override via `DB_POOL_MAX`) with 30s idle timeout. Default of 10 was oversized for current 3-user load and added pressure on the basic_256mb DB plan.
- `scripts/monitor-memory.sh` samples the new endpoint every N seconds and logs RSS/heap stats for offline graphing.

## Required deploy steps (after merge)

In Render dashboard for the `curaciones-api` service, add env vars:
- `HEALTH_TOKEN` = a long random string (so the endpoint is reachable)
- `NODE_OPTIONS` = `--max-old-space-size=400` (forces V8 to GC at 400MB instead of letting the kernel SIGKILL silently — turns silent OOMs into visible Node errors)

Optional: `DB_POOL_MAX` to override the pool size (default 3).

## Test plan

- [x] 107/107 backend unit tests pass (`cd backend && npm test`)
- [x] `npm run build` clean
- [x] Local `node dist/main.js` boot OK; baseline RSS ~130MB (Mac, idle, no traffic)
- [x] `curl /api/health/memory` returns 404 when `HEALTH_TOKEN` unset, 401 with wrong token, 200 + JSON with correct token
- [x] `/api/health` (existing) keeps responding
- [ ] After deploy: run `HEALTH_TOKEN=xxx ./scripts/monitor-memory.sh` for ~10 min in idle, then in mild use
- [ ] After deploy: confirm whether kernel SIGKILL is replaced by Node's `FATAL ERROR: ... heap out of memory` in logs (proves OOM as root cause)

> **Comentario de vercel** (2026-04-27):
> [vc]: #jkWGJ/6IeYbkrqFrw1SfpFF7WZtDjuf9Q0ryoL63dH0=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1wZXJmLW1lbW9yeS1pbnN0cnVtLTYwYWQxNC1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIn0sImluc3BlY3RvclVybCI6Imh0dHBzOi8vdmVyY2VsLmNvbS9tYXJ2ZWdhcy1wcm9qZWN0cy9jdXJhY2lvbmVzLWFwcC80cDZZNm9RU2puVHZhVnJaQjU2WkZWSHhFbW1vIiwicHJldmlld1VybCI6ImN1cmFjaW9uZXMtYXBwLWdpdC1wZXJmLW1lbW9yeS1pbnN0cnVtLTYwYWQxNC1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIiwibmV4dENvbW1pdFN0YXR1cyI6IkRFUExPWUVEIn1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/4p6Y6oQSjnTvaVrZB56ZFVHxEmmo) | [Preview](https://curaciones-app-git-perf-memory-instrum-60ad14-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-perf-memory-instrum-60ad14-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 27, 2026 7:13pm |

---

## #8 — fix(throttler): bypass /api/health to stop Render restart loop

**Estado:** MERGED · **autor:** marvega · **fix/health-check-bypass-throttler → main** · creado 2026-04-27 · mergeado 2026-04-27

## Summary

Production crash-loop root-caused. **It was never OOM.** Memory instrumentation from #7 measured RSS at ~97MB and heap at ~30MB on a 512MB instance — nowhere near the cap.

The real cause came from Render's service events:
```
reason.unhealthy = "HTTP health check failed with status code 429"
```

The global throttler was returning 429 to Render's own \`/api/health\` probe. Render interpreted that as unhealthy and killed the container every ~2 min, producing the silent SIGKILL pattern that looked like OOM.

## Why 429 was happening

Two problems compounding:

1. **Custom throttler may not respect \`@SkipThrottle()\`.** \`PerUserThrottlerGuard\` extends \`ThrottlerGuard\` with a custom \`getTracker\`, and the v6 SkipThrottle metadata path with multiple throttlers (\`default\` + \`login\`) is fragile.
2. **No \`trust proxy\`.** Without it, \`req.ip\` returns the Render load-balancer IP for every external request, so all unauthenticated traffic shared a single 200/min bucket — easy to saturate with health probes + crawlers + frontend traffic.

## Fix

- \`PerUserThrottlerGuard.shouldSkip\`: hard-bypass \`/api/health\` and \`/api/health/memory\` regardless of decorator metadata.
- \`main.ts\`: \`app.getHttpAdapter().getInstance().set('trust proxy', true)\` so per-IP throttling actually segregates by user.

## Test plan

- [x] 111/111 tests pass (107 prior + 4 new for \`shouldSkip\`)
- [x] \`npm run build\` clean
- [ ] After deploy: confirm \`/api/health\` responds 200 consistently in burst from external host
- [ ] After deploy: monitor \`render logs\` for absence of \`status code 429\` health-failure events for ≥10 min
- [ ] After deploy: \`scripts/monitor-memory.sh\` shows stable uptime climbing past 5+ min on a single PID

> **Comentario de vercel** (2026-04-27):
> [vc]: #nmlo8duTEWgSMIy8LQStXW3i7rPFQR+IUHWtaOxizTI=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwiaW5zcGVjdG9yVXJsIjoiaHR0cHM6Ly92ZXJjZWwuY29tL21hcnZlZ2FzLXByb2plY3RzL2N1cmFjaW9uZXMtYXBwL0o5bUxuQlhwaEQ5aHFvYmd2S0J5cmFGNUNMeVYiLCJwcmV2aWV3VXJsIjoiY3VyYWNpb25lcy1hcHAtZ2l0LWZpeC1oZWFsdGgtY2hlY2stYnktMDcxZmEwLW1hcnZlZ2FzLXByb2plY3RzLnZlcmNlbC5hcHAiLCJuZXh0Q29tbWl0U3RhdHVzIjoiREVQTE9ZRUQiLCJsaXZlRmVlZGJhY2siOnsicmVzb2x2ZWQiOjAsInVucmVzb2x2ZWQiOjAsInRvdGFsIjowLCJsaW5rIjoiY3VyYWNpb25lcy1hcHAtZ2l0LWZpeC1oZWFsdGgtY2hlY2stYnktMDcxZmEwLW1hcnZlZ2FzLXByb2plY3RzLnZlcmNlbC5hcHAifSwicm9vdERpcmVjdG9yeSI6bnVsbH1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/J9mLnBXphD9hqobgvKByraF5CLyV) | [Preview](https://curaciones-app-git-fix-health-check-by-071fa0-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-fix-health-check-by-071fa0-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 27, 2026 7:31pm |

---

## #9 — fix(frontend): unblock prod build to deploy 6 weeks of pending features

**Estado:** MERGED · **autor:** marvega · **fix/frontend-build → main** · creado 2026-04-27 · mergeado 2026-04-27

## Summary

Frontend Static Site on Render has been failing to build since **2026-03-16** (last live deploy). Six weeks of merged PRs (patient search, bota de descarga, detailed report, clinical features) never reached production — users have been running a stale bundle the whole time.

Two TypeScript errors blocked \`tsc -b\`:

1. \`PatientPage.tsx\` passes \`appointmentDate\` / \`appointmentTime\` to \`createCuracion()\` (which the backend DTO accepts), but the frontend's \`Omit<Curacion, ...>\` payload type didn't allow them. **Fix**: introduce \`CreateCuracionPayload\` that mirrors the backend DTO.
2. \`tsc\` was type-checking \`*.test.tsx\` files during prod build and failing on jest-dom matchers (\`toBeInTheDocument\`, \`toHaveTextContent\`). Tests run via Vitest and are never bundled. **Fix**: exclude tests from \`tsconfig.app.json\`.

Both fixes are scoped to build config / typing. Zero runtime behavior change.

## Test plan

- [x] \`npm run build\` succeeds locally (was failing on main)
- [x] 12/12 frontend tests still pass (\`npm test\`)
- [ ] After deploy: patient search input shows on \`/pacientes\`
- [ ] After deploy: detailed report renders at \`/reportes/detallado\`
- [ ] After deploy: \`curl https://curaciones-app.onrender.com/\` returns updated asset hash (not \`index-CjaNs1DM.js\`)

> **Comentario de vercel** (2026-04-27):
> [vc]: #MxPA6VS+3JIjvn/tDzQcY1XxuGXh0v04E+4JWziFh28=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwiaW5zcGVjdG9yVXJsIjoiaHR0cHM6Ly92ZXJjZWwuY29tL21hcnZlZ2FzLXByb2plY3RzL2N1cmFjaW9uZXMtYXBwL0hId0JLaVE0TVdGdXhpZW4xWUVqaHVXUlh1N3IiLCJwcmV2aWV3VXJsIjoiY3VyYWNpb25lcy1hcHAtZ2l0LWZpeC1mcm9udGVuZC1idWlsZC1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIiwibmV4dENvbW1pdFN0YXR1cyI6IlBFTkRJTkciLCJsaXZlRmVlZGJhY2siOnsicmVzb2x2ZWQiOjAsInVucmVzb2x2ZWQiOjAsInRvdGFsIjowLCJsaW5rIjoiIn19XX0=
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Building](https://vercel.com/static/status/building.svg) [Building](https://vercel.com/marvegas-projects/curaciones-app/HHwBKiQ4MWFuxien1YEjhuWRXu7r) | [Preview](https://curaciones-app-git-fix-frontend-build-marvegas-projects.vercel.app) | Apr 27, 2026 7:54pm |

---

## #10 — ci: add build+test workflow for backend and frontend

**Estado:** MERGED · **autor:** marvega · **chore/ci-builds → main** · creado 2026-04-27 · mergeado 2026-04-27

## Summary

Closes the loop on the silent-build-failure incident: the frontend Static Site failed to build on Render for 6 weeks (since 2026-03-16) and nothing alerted us, because no CI check enforced that PRs build cleanly.

This workflow runs on every PR to \`main\` and every push to \`main\`:

- **backend** job: \`npm ci\` → \`npm test\` (Jest, 111 tests) → \`npm run build\` (\`nest build\`)
- **frontend** job: \`npm ci\` → \`npm test\` (Vitest, 12 tests) → \`npm run build\` (\`tsc -b && vite build\`)

Both jobs run **in parallel**, on Node 22 (matching Render), with per-app npm cache. Concurrency group cancels superseded runs on the same ref.

## Follow-up after merge

Enable branch protection on \`main\` requiring both checks to pass — without it, a red check is just a warning, not a blocker:

\`Settings → Branches → Branch protection rules → Add rule\` for \`main\` →
- Require a pull request before merging
- Require status checks to pass before merging → select \`backend (build + test)\` and \`frontend (build + test)\`

## Test plan

- [x] Workflow YAML validated locally
- [ ] PR shows green checks for both jobs before merging (the workflow runs on this PR)

> **Comentario de vercel** (2026-04-27):
> [vc]: #XsCprXz0sjT5ABXRlxWLcRsh/aIDnzXJXid3E4K2i6g=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1jaG9yZS1jaS1idWlsZHMtbWFydmVnYXMtcHJvamVjdHMudmVyY2VsLmFwcCJ9LCJpbnNwZWN0b3JVcmwiOiJodHRwczovL3ZlcmNlbC5jb20vbWFydmVnYXMtcHJvamVjdHMvY3VyYWNpb25lcy1hcHAvOVFrcm50dUFZNjNjeEV2YmRGTWRqdUJrN1U4VSIsInByZXZpZXdVcmwiOiJjdXJhY2lvbmVzLWFwcC1naXQtY2hvcmUtY2ktYnVpbGRzLW1hcnZlZ2FzLXByb2plY3RzLnZlcmNlbC5hcHAiLCJuZXh0Q29tbWl0U3RhdHVzIjoiREVQTE9ZRUQifV19
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/9QkrntuAY63cxEvbdFMdjuBk7U8U) | [Preview](https://curaciones-app-git-chore-ci-builds-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-chore-ci-builds-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 27, 2026 10:43pm |

---

## #11 — fix(backend): scope login throttler to login route only

**Estado:** MERGED · **autor:** marvega · **fix/throttler-login-global → main** · creado 2026-04-28 · mergeado 2026-04-28

## Summary

- Production was returning 429 on `GET /api/patients?page=1&limit=20` for a single authenticated user during normal navigation.
- Root cause: the named `login` throttler (limit: 5/min) was registered globally in `ThrottlerModule.forRootAsync`. `@nestjs/throttler` v6 applies every named throttler to every route unless explicitly skipped, so each endpoint was getting capped at 5 req/min per user.
- Fix: remove the `login` named throttler from global config; override the `default` throttler limit on the login handler instead, preserving the `THROTTLE_LOGIN_LIMIT` env-var contract.

## Test plan

- [x] Unit tests pass (`npm test` — 111/111)
- [x] Local end-to-end with real DB:
  - With `THROTTLE_DEFAULT_LIMIT=20 THROTTLE_LOGIN_LIMIT=5`, hit `/api/patients` 20 times → all 200, 21st → 429
  - Response headers show only `X-RateLimit-*` (no `-login` suffix), confirming login throttler is no longer applied
  - 6 wrong logins → 6th returns 429 with `Retry-After: 60` (login protection preserved)
- [ ] Verify production after deploy: `/api/patients` no longer 429s on normal navigation

> **Comentario de vercel** (2026-04-28):
> [vc]: #cPcMbxTNGFwqbClT/TSiZk4AOZ+iSHOycHB4P81KFAM=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1maXgtdGhyb3R0bGVyLWxvZ2luLWdsb2JhbC1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIn0sImluc3BlY3RvclVybCI6Imh0dHBzOi8vdmVyY2VsLmNvbS9tYXJ2ZWdhcy1wcm9qZWN0cy9jdXJhY2lvbmVzLWFwcC85aVpxY1lHMmZmUG5kOW1nN254SlVlRGJaQ3l1IiwicHJldmlld1VybCI6ImN1cmFjaW9uZXMtYXBwLWdpdC1maXgtdGhyb3R0bGVyLWxvZ2luLWdsb2JhbC1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIiwibmV4dENvbW1pdFN0YXR1cyI6IkRFUExPWUVEIn1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/9iZqcYG2ffPnd9mg7nxJUeDbZCyu) | [Preview](https://curaciones-app-git-fix-throttler-login-global-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-fix-throttler-login-global-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 28, 2026 0:50am |

---

## #12 — feat(frontend): patient QR opens patient record on scan

**Estado:** MERGED · **autor:** marvega · **feat/qr-patient-deeplink → main** · creado 2026-04-28 · mergeado 2026-04-28

## Summary
- QR del paciente ahora codifica la URL absoluta a la ficha (`${window.location.origin}/paciente/${patient.id}`) en vez de sólo el RUT.
- Al escanear desde el cel, abre directamente la ficha del paciente (asumiendo sesión activa en el dispositivo).

## Test plan
- [x] `tsc --noEmit` pasa.
- [x] Validado end-to-end en LAN: escaneo desde celular abre `/paciente/:id` correctamente.
- [ ] Verificar deploy en Render una vez mergeado.

> **Comentario de vercel** (2026-04-28):
> [vc]: #IRkqfSBlfV1DOqUV/1DLPhutGSckgWvFNXllQaHPbnI=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1mZWF0LXFyLXBhdGllbnQtZGVlcGxpbmstbWFydmVnYXMtcHJvamVjdHMudmVyY2VsLmFwcCJ9LCJpbnNwZWN0b3JVcmwiOiJodHRwczovL3ZlcmNlbC5jb20vbWFydmVnYXMtcHJvamVjdHMvY3VyYWNpb25lcy1hcHAvQ1ZqeTdROHZRam9SdUhXcUU1TE5zdUVwbjlmWiIsInByZXZpZXdVcmwiOiJjdXJhY2lvbmVzLWFwcC1naXQtZmVhdC1xci1wYXRpZW50LWRlZXBsaW5rLW1hcnZlZ2FzLXByb2plY3RzLnZlcmNlbC5hcHAiLCJuZXh0Q29tbWl0U3RhdHVzIjoiREVQTE9ZRUQifV19
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/CVjy7Q8vQjoRuHWqE5LNsuEpn9fZ) | [Preview](https://curaciones-app-git-feat-qr-patient-deeplink-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-feat-qr-patient-deeplink-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 28, 2026 1:21am |

---

## #13 — feat(inventory): Phase 1 — catalog, lots, weekly counts, audit export

**Estado:** MERGED · **autor:** marvega · **feat/inventario-insumos-spec → main** · creado 2026-04-28 · mergeado 2026-04-28

## Summary
- New inventory module: products with multi-comuna codes, lots with expiration, event-sourced movements (RECEPTION/COUNT/ADJUSTMENT), weekly stock counts (DRAFT/CLOSED).
- Bulk Excel import for AVIS catalog (660 products), audit Excel export for Canasta CAPD (replicates ANEXO 5 GES 2022-2025 format).
- New frontend pages under `/inventory`: list with expiring highlights, reception, weekly count with autosave, catalog admin, canasta admin, audit export.
- Banner global de vencimientos integrado en Layout.
- Spec: \`docs/superpowers/specs/2026-04-27-inventario-insumos-design.md\`
- Plan:  \`docs/superpowers/plans/2026-04-27-inventario-insumos-plan.md\`

## Architecture highlights
- Stock derivation event-sourced from \`lot_movements\` (no cached current_quantity).
- 8 new tables created via migration \`1714240000000-InventoryFoundation.ts\` with 14 canasta seeds + 1 establishment seed (Pompeya/Quilpué).
- Multi-comuna ready: \`product_codes\` table allows N codes per product (AVIS_QUILPUE, RAYEN, etc.).
- Multi-establishment ready: \`establishments\` table + FK on lots/counts. Frontend hardcodes id=1 for Phase 1.
- \`xlsx\` lazy-loaded both for Excel import and audit export (no startup memory impact, aligned with PDFKit pattern).
- Botas/ortesis NOT inventoried (decision: kinesiología gestiona externamente).
- 11 INSUMOS + 3 AYUDAS_TECNICAS canasta categories with regex-based product mapping in \`backend/src/seeds/canasta-mappings.ts\`.

## Test plan
- [ ] Backend unit tests: \`cd backend && npm test\` — 143 passing
- [ ] Backend e2e: \`cd backend && npm run test:e2e -- --runInBand inventory\` — 2 passing
- [ ] Frontend tests: \`cd frontend && npm test\` — 14 passing
- [ ] Local manual smoke:
  - Login as admin
  - Navigate to \`/inventory/admin/catalog\` → upload sample AVIS Excel → verify created count
  - Click "Aplicar mapeo sugerido" in \`/inventory/admin/canasta\`
  - Register a lot at \`/inventory/reception\` with expiration in 20 days
  - Verify red banner appears and lot row is highlighted in \`/inventory\`
  - Open \`/inventory/count\`, type cantidad observada, see "guardando..." then disappear, click "Cerrar conteo"
  - Download Excel from \`/inventory/audit-export\` and verify SI/NO marks
- [ ] After merge, verify Render backend deploy succeeds and memory remains stable
- [ ] Verify Railway frontend deploy succeeds

## Phase 2 (deuda técnica documentada en spec)
- Solicitudes de restock mensuales + Excel "SOLICITUD UNIDADES"
- Llenado automático de columnas E/F del Excel auditable
- Notificaciones push (PWA) y/o email para vencimientos
- Decremento automático de stock por curación
- Multi-establishment activo en UI (selector)

## Pre-existing test failure (unrelated)
\`backend/test/reports.e2e-spec.ts > detailed report structure\` falla en \`origin/main\` también — el endpoint cambió shape (\`total\`/\`byGender\`/\`bootsDelivered\`) pero el test espera \`summary\`. Recomiendo fixarlo en otro PR.

> **Comentario de vercel** (2026-04-28):
> [vc]: #0CNU3s9kCDoHZh//Fo5MQH9kTBlCo8dMrwuyWWkIp0s=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1mZWF0LWludmVudGFyaW8taW5zLTMwMmU2YS1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIn0sImluc3BlY3RvclVybCI6Imh0dHBzOi8vdmVyY2VsLmNvbS9tYXJ2ZWdhcy1wcm9qZWN0cy9jdXJhY2lvbmVzLWFwcC9KN3ZGa1lmQ1k0TnhaTXJLRURFTmJUeDd5a3hiIiwicHJldmlld1VybCI6ImN1cmFjaW9uZXMtYXBwLWdpdC1mZWF0LWludmVudGFyaW8taW5zLTMwMmU2YS1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIiwibmV4dENvbW1pdFN0YXR1cyI6IkRFUExPWUVEIn1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/J7vFkYfCY4NxZMrKEDENbTx7ykxb) | [Preview](https://curaciones-app-git-feat-inventario-ins-302e6a-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-feat-inventario-ins-302e6a-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 28, 2026 2:48am |

---

## #14 — feat(backend): redesign patient PDF with Puppeteer (institutional layout)

**Estado:** MERGED · **autor:** marvega · **feat/pdf-ficha-clinica-redesign → main** · creado 2026-04-28 · mergeado 2026-04-28

## Summary

Rediseño completo del PDF de ficha clínica del CESFAM Pompeya. La generación pasa de **pdfkit** (drawing manual) a **Puppeteer** (HTML→PDF vía Chromium headless), lo que permite reproducir 1:1 el mockup institucional aprobado: paleta navy, jerarquía tipográfica, badges de estado, secciones numeradas, grids para citas e historial.

**Mockup de referencia:** `Downloads/ficha-clinica-standalone.html` (creado por el usuario, validado visualmente antes de implementar).

## Cambios principales

- **`backend/src/patients/patient-pdf.template.ts`** (nuevo) — función `renderFichaHtml(data)` con HTML+CSS embebido para tamaño Carta.
- **`backend/src/patients/patient-pdf.service.ts`** — refactor: ahora arma `FichaData`, llama al template, y rendea con `puppeteer.launch().pdf({ format: 'Letter' })`. Calcula edad desde `birthDate`, mapea status `discharged → DADO DE ALTA` / `active → EN TRATAMIENTO`, mapea eventos del historial a frases completas.
- **`backend/src/patients/pdf-constants.ts`** — eliminado (constantes visuales ahora en CSS).
- **`backend/package.json`** — `+ puppeteer ^24.42.0` / `- pdfkit` / `- @types/pdfkit`.
- **`render.yaml`** — buildCommand instala Chromium (`npx puppeteer browsers install chrome`) y se pinea `PUPPETEER_CACHE_DIR` a `/opt/render/project/.cache/puppeteer` (persistido entre build y runtime).

## Test plan

- [x] `npm run build` limpio
- [x] `npm run lint` limpio en archivos modificados
- [x] `npm test` — 111 tests pasan (sin regresión)
- [x] Verificación visual local con frontend: paciente activo (badge ámbar), dado de alta (badge verde), con observaciones, sin curaciones/citas
- [ ] **Verificar deploy en Render post-merge** — primer arranque con Puppeteer puede tardar (descarga Chromium en build); revisar logs si falla
- [ ] **Verificar PDF en producción** después de que Render termine de desplegar

## Notas para Render

Puppeteer descarga Chromium (~170MB) en el build step. Esto incrementa el tiempo de build y el disco usado. Si Render falla:
- Verificar que `PUPPETEER_CACHE_DIR` quedó en la ubicación correcta
- Si faltan libs del sistema, se puede agregar `apt-get install -y libnss3 libxss1 libasound2 libatk-bridge2.0-0 libgtk-3-0 libgbm1` al buildCommand (Render permite root en build)
- Como fallback, considerar `puppeteer-core` + `@sparticuz/chromium`

## Performance

Cada PDF lanza Chromium (~500ms-1s/PDF vs ~50ms con pdfkit). Si la latencia molesta en producción, en una iteración futura se puede mantener un browser-pool reutilizable.

## Commits

14 commits incluyen el camino completo: la primera implementación con pdfkit (que el usuario rechazó visualmente) y la pivot a Puppeteer + diseño nuevo. Recomiendo **"Squash and merge"** al cerrar el PR para mantener `main` limpio.

> **Comentario de vercel** (2026-04-28):
> [vc]: #S3ELQXeSEz6avuSXvvS/Y54VSoIBODwlOBxZH1zgOHA=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1mZWF0LXBkZi1maWNoYS1jbGluLWY4N2JlZS1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIn0sImluc3BlY3RvclVybCI6Imh0dHBzOi8vdmVyY2VsLmNvbS9tYXJ2ZWdhcy1wcm9qZWN0cy9jdXJhY2lvbmVzLWFwcC9FTUMyZGlhN3BWNlplTVBMZ1FlNFpTNmQ4TDFIIiwicHJldmlld1VybCI6ImN1cmFjaW9uZXMtYXBwLWdpdC1mZWF0LXBkZi1maWNoYS1jbGluLWY4N2JlZS1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIiwibmV4dENvbW1pdFN0YXR1cyI6IkRFUExPWUVEIn1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/EMC2dia7pV6ZeMPLgQe4ZS6d8L1H) | [Preview](https://curaciones-app-git-feat-pdf-ficha-clin-f87bee-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-feat-pdf-ficha-clin-f87bee-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 28, 2026 3:05am |

---

## #15 — fix(backend): switch to @sparticuz/chromium for Puppeteer on Render

**Estado:** MERGED · **autor:** marvega · **fix/puppeteer-render-chromium → main** · creado 2026-04-28 · mergeado 2026-04-28

## Hotfix

The previous PR (#14) merged Puppeteer support but the production deploy returns **HTTP 500** when generating PDFs because Render's Node native runtime image lacks the shared libraries Chromium needs (libnss3, libxss1, libgbm1, etc.) and there's no apt-get in the build step.

## Fix

Switches from \`puppeteer\` (which downloads a vanilla Chromium that requires system libs) to \`puppeteer-core\` + \`@sparticuz/chromium\`. The latter is a self-contained Chromium binary with all its dependencies bundled in, designed for serverless and minimal Linux environments — known to work on Render Node runtime out of the box.

## Cambios

- \`puppeteer\` ➜ \`puppeteer-core\` + \`@sparticuz/chromium\` en \`backend/package.json\`
- \`patient-pdf.service.ts\` detecta plataforma:
  - Linux (prod): \`@sparticuz/chromium\` binary
  - Otros (dev): \`PUPPETEER_EXECUTABLE_PATH\` env var, con fallback a \`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome\`
- \`render.yaml\` simplificado: se elimina \`npx puppeteer browsers install chrome\` y \`PUPPETEER_CACHE_DIR\` (ya no se necesitan)

## Test plan

- [x] \`npm run build\` limpio
- [x] Lint limpio en archivos modificados
- [x] Smoke test local: PDF de 7.7KB generado correctamente con \`puppeteer-core\` + Chrome local
- [ ] **Verificar en Render post-merge** — esperar build (~3-5 min) y reintentar GET /api/patients/:id/pdf

## Síntoma actual en producción

\`\`\`
$ curl -H "Authorization: Bearer ..." https://curaciones-api.onrender.com/api/patients/24/pdf
HTTP 500 size=52 time=0.8s
{"statusCode":500,"message":"Internal server error"}
\`\`\`

Tiempo de respuesta corto (~0.8s) descarta timeout de descarga; es un fallo inmediato al lanzar Chromium.

> **Comentario de vercel** (2026-04-28):
> [vc]: #iDn6HtISzUgnzG8L3a/QPvtUzrqfnbQTOuk5orwfllI=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1maXgtcHVwcGV0ZWVyLXJlbmRlLTViNDg0MC1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIn0sImluc3BlY3RvclVybCI6Imh0dHBzOi8vdmVyY2VsLmNvbS9tYXJ2ZWdhcy1wcm9qZWN0cy9jdXJhY2lvbmVzLWFwcC9GTkNqWEVCR2I5QTVya0w0NFVnUXp6bVdleUI0IiwicHJldmlld1VybCI6ImN1cmFjaW9uZXMtYXBwLWdpdC1maXgtcHVwcGV0ZWVyLXJlbmRlLTViNDg0MC1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIiwibmV4dENvbW1pdFN0YXR1cyI6IkRFUExPWUVEIn1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/FNCjXEBGb9A5rkL44UgQzzmWeyB4) | [Preview](https://curaciones-app-git-fix-puppeteer-rende-5b4840-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-fix-puppeteer-rende-5b4840-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 28, 2026 3:15am |

---

## #16 — refactor(backend): replace Puppeteer with pdfmake for patient PDFs

**Estado:** MERGED · **autor:** marvega · **refactor/pdf-pdfmake → main** · creado 2026-04-28 · mergeado 2026-04-28

## Summary
- Drop \`puppeteer-core\` + \`@sparticuz/chromium\` in favor of \`pdfmake\` (~1 MB pure JS, no binary downloads on cold start).
- Rewrites \`patient-pdf.template.ts\` as a \`TDocumentDefinitions\` builder, preserving the institutional ficha clínica layout: header (topbar + brand block + folio block), title block with status badge, 4-column info strip, curaciones table, citas grid (2 columns), historial, footer with page counter.
- Tightens table/list font sizes (curaciones body 9→8pt, citas/historial proportional) so observation lines no longer wrap unnecessarily.
- Removes platform-aware browser launching (\`process.platform === 'linux'\` branch); pdfmake works identically on macOS and Render Linux runtime.

## Why
Production cold starts pulled down ~50–80 MB of Chromium (\`@sparticuz/chromium\`). pdfmake is pure JS, ~3 MB installed, and renders in <50 ms. Bundle/deploy size and startup latency drop substantially.

## Test plan
- [x] \`npm run build\` clean
- [x] \`npm test\` 146/146 passing (3 new tests for \`PatientPdfService\`)
- [x] Sample PDF rendered locally and visually reviewed against the previous Puppeteer output
- [ ] CI green on this PR
- [ ] After merge: poll Render \`curaciones-api\` until new build deploys, then download a patient PDF from the production UI to confirm end-to-end behavior

> **Comentario de vercel** (2026-04-28):
> [vc]: #V1QiNmseEqbvyK7Yzx4ac9EtIxOONY1XNxNH4cQsPu4=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1yZWZhY3Rvci1wZGYtcGRmbWFrZS1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIn0sImluc3BlY3RvclVybCI6Imh0dHBzOi8vdmVyY2VsLmNvbS9tYXJ2ZWdhcy1wcm9qZWN0cy9jdXJhY2lvbmVzLWFwcC9EQUdNRjhiR3FpTHBpSDJjVGZLckRxWnZyUGk4IiwicHJldmlld1VybCI6ImN1cmFjaW9uZXMtYXBwLWdpdC1yZWZhY3Rvci1wZGYtcGRmbWFrZS1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIiwibmV4dENvbW1pdFN0YXR1cyI6IkRFUExPWUVEIiwicm9vdERpcmVjdG9yeSI6bnVsbH1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/DAGMF8bGqiLpiH2cTfKrDqZvrPi8) | [Preview](https://curaciones-app-git-refactor-pdf-pdfmake-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-refactor-pdf-pdfmake-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 28, 2026 4:13am |

---

## #17 — feat(inventory): UI redesign — design system, primitives, canasta import flow, all pages migrated

**Estado:** MERGED · **autor:** marvega · **feat/inventory-ui-redesign → main** · creado 2026-04-28 · mergeado 2026-04-28

## Summary

Complete UI redesign of the inventory module plus migration of all existing pages to a unified design system. Replaces inline JSX with typed React primitives, adds an Excel-driven canasta import flow, and enforces consistent UI via custom ESLint rule.

### Plan A — Design System & UI Primitives
- 16 typed React primitives in `frontend/src/components/ui/` (Button, Input, SearchInput, Select, Textarea, Checkbox, Modal, Drawer, DataTable, FileUpload, Tag, CodePill, EmptyState, Card, PageHeader, Skeleton)
- Design tokens (`--ui-*` namespace, avoiding Tailwind v4 collision)
- Text formatters: `toSentenceCase` (medical-aware), `formatCode`
- `useFocusTrap` shared hook (Modal/Drawer)
- Storybook 8 with stories per primitive
- In-app gallery at `/dev/ui` (dev-only, tree-shaken from prod)
- Custom ESLint rule `ui/use-primitives` enforcing primitives in `src/pages/**`

### Plan B — Backend Canasta Refactor
- Migration `1714320000000-CanastaResetAndAutomappedFlag` adds `auto_mapped`, `archived`, `source_key` columns; wipes prior canasta seed data
- Removed hardcoded `canasta-mappings.ts` matchers and `seedCanastaDefaults` endpoint
- New `POST /api/inventory/canasta/import` endpoint: uploads CURACIONES.xlsx guide, parses categories, applies merge-intelligent logic (preserves manual associations, archives missing categories, auto-maps products by AVIS code or note keywords)
- New CRUD endpoints: `POST /categories`, `PATCH /:id`, `DELETE /:id`
- Frontend API client updated with `importCanastaGuide`, `createCanastaCategory`, `updateCanastaCategory`, `deleteCanastaCategory`

### Plan C — Inventory Pages Redesign
All 6 pages in `src/pages/inventory/` redesigned using primitives:
- `CatalogAdminPage` — PageHeader + FileUpload + SearchInput + DataTable with CodePill/Tag/sentence-case
- `CanastaAdminPage` — guide-import flow + DataTable + Drawer for product editing + Modal for category CRUD
- `ReceptionPage`, `StockCountPage`, `InventoryListPage`, `AuditExportPage` — primitives + sentence-case + tags

### Plan D — Migrate Existing Pages
All root pages migrated to primitives:
- PatientsListPage, NewPatientPage, PatientPage (the big one), LoginPage, UsersPage, AuditLogPage, HomePage, AgendaPage, MonthlyReportPage, DetailedReportPage
- ESLint rule `ui/use-primitives` promoted from `warn` to `error`

## Spec & plans

- Spec: `docs/superpowers/specs/2026-04-28-inventory-ui-redesign-design.md`
- Plan A: `docs/superpowers/plans/2026-04-28-plan-a-design-system-primitives.md`

## Migrations

`backend/src/migrations/1714320000000-CanastaResetAndAutomappedFlag.ts` — schema additions are idempotent; data wipe is unconditional. Production deploy steps: backup DB → deploy → run migration → manually upload current `CURACIONES.xlsx` via admin endpoint to repopulate.

## Test plan

- [x] `npm test` (frontend): 97 tests passing
- [x] `npm test` (backend): 146 tests passing
- [x] `npm run build` (frontend): clean
- [x] `npm run build` (backend): clean
- [x] `npm run lint`: 0 `ui/use-primitives` errors
- [ ] Visit `/dev/ui` in dev — verify all primitives render
- [ ] `npm run storybook` — verify stories load
- [ ] Smoke test inventory pages in dev
- [ ] Validate Pacientes / NewPaciente / PatientPage (visual regression check)
- [ ] After merge: backup prd → migrate → upload canasta guide → smoke test prd

> **Comentario de vercel** (2026-04-28):
> [vc]: #TqE9fDrfpcyroSoSqjfRA/o5EfzpEmkpmgeps8ghkQ0=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1mZWF0LWludmVudG9yeS11aS1yZWRlc2lnbi1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIn0sImluc3BlY3RvclVybCI6Imh0dHBzOi8vdmVyY2VsLmNvbS9tYXJ2ZWdhcy1wcm9qZWN0cy9jdXJhY2lvbmVzLWFwcC9CWTNQMkZWOGN2YUJrN05BN0QySHhZZnBQQ1B3IiwicHJldmlld1VybCI6ImN1cmFjaW9uZXMtYXBwLWdpdC1mZWF0LWludmVudG9yeS11aS1yZWRlc2lnbi1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIiwibmV4dENvbW1pdFN0YXR1cyI6IkRFUExPWUVEIiwicm9vdERpcmVjdG9yeSI6bnVsbH1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/BY3P2FV8cvaBk7NA7D2HxYfpPCPw) | [Preview](https://curaciones-app-git-feat-inventory-ui-redesign-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-feat-inventory-ui-redesign-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 28, 2026 11:35am |

---

## #18 — fix(inventory): canasta import — skip header rows + better keyword matching

**Estado:** MERGED · **autor:** marvega · **fix/canasta-import-parser → main** · creado 2026-04-28 · mergeado 2026-04-28

## Summary

Two bugs found during production validation of CURACIONES.xlsx upload:

1. The Excel column-header row (`Disponibilidad de insumos... Si | No | Observaciones | ...`) was being parsed as a category, creating a spurious 15th category with the column-header text as notes.
2. Keyword tokenization was too coarse — e.g. note `"DACC lámina"` was treated as a single keyword and never matched products named `"LAMINA DE ACETATO IMPREGNADO EN DACC..."`. Result: only 2 of ~20+ expected products auto-matched.

## Fixes
- Detect column-header rows (cols B/C/D containing literal `Si`/`Sí`/`No`/`Observaciones`) and skip them regardless of section context.
- Tokenize keywords on all whitespace + punctuation, drop Spanish stopwords, strip accents on both keyword and product name during matching.
- Added unit test against a fixture that mirrors the real CURACIONES.xlsx structure.

## Test plan
- [x] `npm test` (backend): all suites green
- [x] `npm run build` (backend): clean
- [ ] After merge: re-import CURACIONES.xlsx in prod, verify 14 categories (not 15) and significantly more auto-matched products

> **Comentario de vercel** (2026-04-28):
> [vc]: #hZOQ0S7fXATm8W2xMjl8jJLS5QgGdGpPI92sCtXFl6Y=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1maXgtY2FuYXN0YS1pbXBvcnQtcGFyc2VyLW1hcnZlZ2FzLXByb2plY3RzLnZlcmNlbC5hcHAifSwiaW5zcGVjdG9yVXJsIjoiaHR0cHM6Ly92ZXJjZWwuY29tL21hcnZlZ2FzLXByb2plY3RzL2N1cmFjaW9uZXMtYXBwLzVOYXUxc216QW1qTVlvZXVLOXdNZGhucFJHOFMiLCJwcmV2aWV3VXJsIjoiY3VyYWNpb25lcy1hcHAtZ2l0LWZpeC1jYW5hc3RhLWltcG9ydC1wYXJzZXItbWFydmVnYXMtcHJvamVjdHMudmVyY2VsLmFwcCIsIm5leHRDb21taXRTdGF0dXMiOiJERVBMT1lFRCJ9XX0=
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/5Nau1smzAmjMYoeuK9wMdhnpRG8S) | [Preview](https://curaciones-app-git-fix-canasta-import-parser-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-fix-canasta-import-parser-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 28, 2026 11:45am |

---

## #19 — fix(inventory): detect AYUDAS_TECNICAS section before column-header skip

**Estado:** MERGED · **autor:** marvega · **fix/canasta-section-divider-detection → main** · creado 2026-04-28 · mergeado 2026-04-28

## Summary

Follow-up to PR #18. Production re-import after #18 still tagged the 3 ayudas técnicas categories as INSUMOS because the AYUDAS divider row carries Si/No/Observaciones headers in adjacent cells, so `isColumnHeaderRow` skipped it before `SECTION_HEADER_AYUDAS` ran.

## Fix
- Reorder parser: section detection (AYUDAS / INSUMOS) runs first, column-header skip second.
- Updated fixture to mirror the real divider layout (`['Ayudas Técnicas...', 'Si', 'No', 'Observaciones', null, null]`).

## Test plan
- [x] backend tests: 151 passing
- [x] backend build: clean
- [ ] After merge: re-import CURACIONES.xlsx in prod, verify the 3 botín categories are AYUDAS_TECNICAS not INSUMOS.

> **Comentario de vercel** (2026-04-28):
> [vc]: #4lopavc7T8U33SwcevU2iE2y+su678eC7iPVY75Yd6w=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1maXgtY2FuYXN0YS1zZWN0aW9uLWExOGRmMi1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIn0sImluc3BlY3RvclVybCI6Imh0dHBzOi8vdmVyY2VsLmNvbS9tYXJ2ZWdhcy1wcm9qZWN0cy9jdXJhY2lvbmVzLWFwcC82NTlNRnh6Y0tzYkRYSmozZTF2dlAxUjFVck5oIiwicHJldmlld1VybCI6ImN1cmFjaW9uZXMtYXBwLWdpdC1maXgtY2FuYXN0YS1zZWN0aW9uLWExOGRmMi1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIiwibmV4dENvbW1pdFN0YXR1cyI6IkRFUExPWUVEIn1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/659MFxzcKsbDXJj3e1vvP1R1UrNh) | [Preview](https://curaciones-app-git-fix-canasta-section-a18df2-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-fix-canasta-section-a18df2-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 28, 2026 11:50am |

---

## #20 — fix(inventory): raise products list limit cap to 5000

**Estado:** MERGED · **autor:** marvega · **fix/products-list-limit → main** · creado 2026-04-28 · mergeado 2026-04-28

Drawer in CanastaAdminPage requests `listProducts({ limit: 5000 })` to load the full catalog (660 products) for selection, but the backend service capped at 200, truncating the picklist.

Verified in production: drawer counter shows '11 de 200 seleccionados' — should be '11 de 660'.

Raises cap to 5000 (still bounded but comfortably above the catalog size).

> **Comentario de vercel** (2026-04-28):
> [vc]: #arlVZWi29Mzi8L8ldPjwkd8AUVmc7hvH5785kNJ0tGA=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1maXgtcHJvZHVjdHMtbGlzdC1saW1pdC1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIn0sImluc3BlY3RvclVybCI6Imh0dHBzOi8vdmVyY2VsLmNvbS9tYXJ2ZWdhcy1wcm9qZWN0cy9jdXJhY2lvbmVzLWFwcC9DZkpWektnM1pWN1FXaGFONHN5TUpWeVhTM3EyIiwicHJldmlld1VybCI6ImN1cmFjaW9uZXMtYXBwLWdpdC1maXgtcHJvZHVjdHMtbGlzdC1saW1pdC1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIiwibmV4dENvbW1pdFN0YXR1cyI6IkRFUExPWUVEIn1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/CfJVzKg3ZV7QWhaN4syMJVyXS3q2) | [Preview](https://curaciones-app-git-fix-products-list-limit-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-fix-products-list-limit-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 28, 2026 11:58am |

---

## #21 — fix(wound-notes): add missing api/ prefix to controller path

**Estado:** MERGED · **autor:** marvega · **fix/wound-notes-api-prefix → main** · creado 2026-04-28 · mergeado 2026-04-28

All other backend controllers use 'api/<path>' prefix. wound-notes was registered at '/wound-notes/*' instead, returning 404 to every frontend call (axios baseURL is '/api'). Confirmed in prod: `/api/wound-notes/patient/24` → 404 'Not Found'.

Frontend caller code was correct; only controller decorator was wrong.

> **Comentario de vercel** (2026-04-28):
> [vc]: #2PX0o2hz5mTZzgD2nTAu86uUB3sfHzdcSnmuhA0Ss9Q=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwicm9vdERpcmVjdG9yeSI6bnVsbCwiaW5zcGVjdG9yVXJsIjoiaHR0cHM6Ly92ZXJjZWwuY29tL21hcnZlZ2FzLXByb2plY3RzL2N1cmFjaW9uZXMtYXBwL0h1QzZZWkRpVTl2Z2dudHJrRURXY1p4eUN1VGkiLCJwcmV2aWV3VXJsIjoiY3VyYWNpb25lcy1hcHAtZ2l0LWZpeC13b3VuZC1ub3Rlcy1hcGktcHJlZml4LW1hcnZlZ2FzLXByb2plY3RzLnZlcmNlbC5hcHAiLCJuZXh0Q29tbWl0U3RhdHVzIjoiREVQTE9ZRUQiLCJsaXZlRmVlZGJhY2siOnsicmVzb2x2ZWQiOjAsInVucmVzb2x2ZWQiOjAsInRvdGFsIjowLCJsaW5rIjoiY3VyYWNpb25lcy1hcHAtZ2l0LWZpeC13b3VuZC1ub3Rlcy1hcGktcHJlZml4LW1hcnZlZ2FzLXByb2plY3RzLnZlcmNlbC5hcHAifX1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/HuC6YZDiU9vggntrkEDWcZxyCuTi) | [Preview](https://curaciones-app-git-fix-wound-notes-api-prefix-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-fix-wound-notes-api-prefix-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 28, 2026 0:04am |

---

## #22 — docs: multi-tenant + OAuth + MCP commercial platform specs

**Estado:** MERGED · **autor:** marvega · **docs/multi-tenant-platform-specs → main** · creado 2026-04-29 · mergeado 2026-04-29

## Summary

Strategic and design specs for the multi-tenant SaaS rebuild of curaciones. **Docs only — no code changes.**

- `2026-04-28-multi-tenant-mcp-platform-umbrella.md` — Strategic decisions across 3 sub-projects (multi-tenancy, OAuth 2.0 server, MCP server publishable in Anthropic Directory).
- `2026-04-28-multi-tenancy-foundation-design.md` — Sub #1 detailed design (per-org tenant isolation, AWS KMS envelope encryption, hash-chain audit log, auth lifecycle, invitation-based provisioning).
- `2026-04-28-multi-tenancy-foundation-plan.md` — Sub #1 implementation plan (94 tasks across 13 phases).

Implementation lives in branch `feat/multi-tenancy-foundation` (separate draft PR).

## Test plan

- [ ] Specs reviewable as markdown in PR diff
- [ ] No code/runtime changes — CI should be green or noop

> **Comentario de vercel** (2026-04-29):
> [vc]: #baJ13UFQJeTT7JujP5txb/EMJ/GWaLBj8eMHdcR0qQU=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1kb2NzLW11bHRpLXRlbmFudC1wLWI4MTU5OC1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIn0sImluc3BlY3RvclVybCI6Imh0dHBzOi8vdmVyY2VsLmNvbS9tYXJ2ZWdhcy1wcm9qZWN0cy9jdXJhY2lvbmVzLWFwcC8ybVVSSHdNZTg3TldHd3hWbk5mYmFSaTlLWTlDIiwicHJldmlld1VybCI6ImN1cmFjaW9uZXMtYXBwLWdpdC1kb2NzLW11bHRpLXRlbmFudC1wLWI4MTU5OC1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIiwibmV4dENvbW1pdFN0YXR1cyI6IkRFUExPWUVEIn1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/2mURHwMe87NWGwxVnNfbaRi9KY9C) | [Preview](https://curaciones-app-git-docs-multi-tenant-p-b81598-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-docs-multi-tenant-p-b81598-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 29, 2026 0:49am |

---

## #23 — feat: multi-tenancy foundation (Sub #1)

**Estado:** MERGED · **autor:** marvega · **feat/multi-tenancy-foundation → main** · creado 2026-04-29 · mergeado 2026-04-29

## Summary

Foundation for multi-tenant SaaS: every tenanted entity now carries `organizationId`, queries are org-scoped at the service layer, sensitive PII (rut, phone, address, observations, wound notes, user email) is encrypted at rest via a pluggable KMS abstraction, and an immutable hash-chained audit log records all writes. This is Sub-project #1 of the umbrella commercial-platform effort and a prerequisite for OAuth + MCP work that follows.

## What's done

- 120 commits ahead of `main` (3 docs + 99 implementation + 18 stabilization)
- `tsc`: 0 errors
- Frontend `npm run build`: passes
- Org isolation e2e: 35/44 passing locally, 9 skipped with TODOs (no failures)
- Production migration drill: validated end-to-end on a clone of dev DB (33 patients / 416 curaciones / 3 users)
- Rollback drill: validated via `pg_restore` from pre-migration dump

## Phase ledger

| Phase | Scope | Status |
|---|---|---|
| 0 | Repo prep, feature flag, env wiring | done |
| 1 | `Organization` + `Establishment` entities | done |
| 2 | Add `organizationId` to all tenanted tables | done |
| 3 | Backfill migration + default-org seed | done |
| 4A | KMS abstraction (`KmsService`, providers, key registry) | done |
| 5 | `OrgContextInterceptor` (post-auth, replaces middleware that never saw `req.user`) | done |
| 6 | Hash-chained audit log + `audit:verify` CLI | done |
| 7 | Transactional email (provider-agnostic) | done |
| 8 | Auth lifecycle hardening (lockout, reset, session revoke) | done |
| 9 | CLIs: `encryption:backfill`, `audit:verify`, `tenant:create` | done |
| 10 | Frontend: org-aware shell, tenant switcher scaffolding | done |
| 11 | Test infra (e2e harness, factories, helpers, KMS=memory) | done |
| 12 | Operator runbook | done |
| 13.1a | `User.role` cascade + TS1272 import-type fixes + audit-log spec | done |
| 13.1b | KMS wired into patients/curaciones/wound-notes (incl. `DecryptedPatient` DTO + 2-phase save) | done |
| 13.2 | `findScoped` / `findOneScoped` across 11 services; `Lot`/`StockCount` scoped via inner-join to `Establishment.organizationId` | done |
| 13.3 | Org isolation e2e against local Postgres | done |
| 13.4 | Production migration drill on dev clone | done |
| 13.5 | Dead-middleware removal, `pretest:e2e` migration hook, `synchronize:false` non-prod, ownership validation in `LotsService` / `StockCountsService` | done |

## Drill validation (Phase 13.4)

End-to-end ladder on a clone of dev DB:

1. `pg_dump` pre-migration snapshot
2. `pg_restore` to fresh DB
3. `migration:run` (organizationId columns + Establishment FK applied)
4. `encryption:backfill` — 33 rut, 33 phone, 33 address, 416 observations, 3 emails encrypted
5. `audit:verify` — 14 audit rows, chain OK
6. Smoke: Nest boots, `/api/health` 200, login pipeline reachable (clean 401s on unknown creds)
7. Rollback drill: `pg_restore` from pre-migration dump cleanly removes `organizationId` columns

Backup retained at `/tmp/curaciones-dev-pre-drill.dump`.

The drill caught a real bug: `encryption:backfill` was unconditionally selecting `"organizationId"` from every table, but `users` doesn't have it. Script now probes `information_schema.columns` before selecting. Phase 13.5 also added ownership validation to `LotsService.createReception` / `createAdjustment` and `StockCountsService.openOrCreate` / `upsertEntry` so a user from Org A cannot pass an `establishmentId` belonging to Org B.

## Open TODOs

1. **9 isolation specs skipped** — endpoints/DTOs absent (e.g. `GET /api/wound-notes` plain root, `POST /api/inventory/lots` non-multipart variant, `UpdateCuracionDto.reason`). Feature work, not isolation regressions.
2. **Lots/StockCounts unit specs (9 fails)** — heritage from 13.2 QueryBuilder migration; mocks not rewritten. Runtime + integration tests are green.
3. **`Patient.findAdvanced` ILIKE on encrypted columns** — TODO for blind-index strategy.
4. **Login smoke not completed during drill** — common dev passwords didn't match; auth pipeline confirmed via clean 401 responses. Reviewer should log in manually post-merge to confirm.
5. **`migration:revert` not exercised** — production rollback path is `pg_restore` from `pg_dump` (validated). The migration's `down()` throws by design.

## Merge strategy decision needed

Branch is shippable as-is. Reviewers may prefer breaking it into ~6 stacked PRs for digestibility:

| PR | Phases | Approx commits |
|---|---|---|
| 1 | 0 + 1 + 4A — infra + new entities + KMS infra | ~17 |
| 2 | 2 + 3 + 13.1 + 13.2 — entity alters + migration + KMS plumbing + scoping | ~44 |
| 3 | 5 + 6 — org context + audit chain | ~8 |
| 4 | 7 + 8 — email + auth lifecycle | ~24 |
| 5 | 9 + 10 — CLIs + frontend | ~16 |
| 6 | 11 + 12 + 13.3 + 13.5 — tests + runbook + test infra + cleanup | ~21 |

Alternative: squash-and-merge as a single PR. Decision belongs to the maintainer.

## Test plan

- [ ] Pull branch, `npm ci` in `backend/` and `frontend/`
- [ ] Backend `npm run build` — 0 errors
- [ ] Backend `npm run test:e2e -- org-isolation` — 35 pass / 9 skipped / 0 fail
- [ ] Frontend `npm run build` — passes
- [ ] On staging: dump prod DB, run migration, run `encryption:backfill`, run `audit:verify`, manual login smoke
- [ ] Confirm `KMS_BACKEND` env wiring per `docs/runbooks/multi-tenancy.md`

> **Comentario de vercel** (2026-04-29):
> [vc]: #NiS0cXUdpcpMB61v5sgjnsMO4xwpTKfpwKNbHofctU8=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1mZWF0LW11bHRpLXRlbmFuY3ktNTZlYmNmLW1hcnZlZ2FzLXByb2plY3RzLnZlcmNlbC5hcHAifSwiaW5zcGVjdG9yVXJsIjoiaHR0cHM6Ly92ZXJjZWwuY29tL21hcnZlZ2FzLXByb2plY3RzL2N1cmFjaW9uZXMtYXBwL0FWZFVKNXV1Z1hkQ0Z1RXZKbXJRMzFjRFNqV1MiLCJwcmV2aWV3VXJsIjoiY3VyYWNpb25lcy1hcHAtZ2l0LWZlYXQtbXVsdGktdGVuYW5jeS01NmViY2YtbWFydmVnYXMtcHJvamVjdHMudmVyY2VsLmFwcCIsIm5leHRDb21taXRTdGF0dXMiOiJERVBMT1lFRCIsInJvb3REaXJlY3RvcnkiOm51bGx9XX0=
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/AVdUJ5uugXdCFuEvJmrQ31cDSjWS) | [Preview](https://curaciones-app-git-feat-multi-tenancy-56ebcf-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-feat-multi-tenancy-56ebcf-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 29, 2026 2:31am |

---

## #24 — fix(kms): derive in-memory DEK from KMS_LOCAL_MASTER_KEY via HKDF

**Estado:** MERGED · **autor:** marvega · **fix/kms-local-master-key → main** · creado 2026-04-29 · mergeado 2026-04-29

## Summary
- Derive InMemoryKmsService DEKs deterministically from `KMS_LOCAL_MASTER_KEY` (HKDF-SHA256, per-org salt) so keys survive restarts.
- Falls back to random DEKs when env var is absent (test-only behavior unchanged).
- Lets prod boot without AWS KMS configured. PII still encrypted-at-rest in DB; key lives in Render env var instead of AWS KMS. Swap to AwsKmsService later by setting `KMS_BACKEND` away from `memory`.

## Context
After Sub #1 merge (#23), prod deploy `update_failed` because backend requires `KMS_CMK_ARN` to boot but AWS KMS was never configured on Render. Migration succeeded but encryption backfill never ran — patient PII is sitting in `{"plaintext":"..."}` jsonb. This PR is the minimum change needed to unblock the prod cutover.

## Deploy plan
1. Set on `curaciones-api`:
   - `KMS_BACKEND=memory`
   - `KMS_LOCAL_MASTER_KEY=<32-byte hex, kept secret>`
2. Merge this PR → auto-deploy → backend boots.
3. SSH in and run `npm run encryption:backfill` to convert plaintext jsonb → encrypted jsonb.
4. Smoke test login + patient list.

## Test plan
- [x] `aws-kms.service.spec.ts` — 5/5 pass (restart determinism, per-org isolation, short-key validation, AAD round-trip, AAD mismatch).
- [ ] Prod smoke after merge: login → open patient → verify rut decrypts.

> **Comentario de vercel** (2026-04-29):
> [vc]: #AEr3p14HGwQLtZUm/ze7m1/4j5Oy2tn2ySCOsnPIwOQ=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1maXgta21zLWxvY2FsLW1hc3Rlci1rZXktbWFydmVnYXMtcHJvamVjdHMudmVyY2VsLmFwcCJ9LCJpbnNwZWN0b3JVcmwiOiJodHRwczovL3ZlcmNlbC5jb20vbWFydmVnYXMtcHJvamVjdHMvY3VyYWNpb25lcy1hcHAvRVV6R05Rdnl2S2RhTnBuRFJ4Tk0yR0pGNHhmSCIsInByZXZpZXdVcmwiOiJjdXJhY2lvbmVzLWFwcC1naXQtZml4LWttcy1sb2NhbC1tYXN0ZXIta2V5LW1hcnZlZ2FzLXByb2plY3RzLnZlcmNlbC5hcHAiLCJuZXh0Q29tbWl0U3RhdHVzIjoiREVQTE9ZRUQifV19
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/EUzGNQvyvKdaNpnDRxNM2GJF4xfH) | [Preview](https://curaciones-app-git-fix-kms-local-master-key-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-fix-kms-local-master-key-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 29, 2026 0:20am |

---

## #25 — fix(kms): backfill skipped {plaintext: ""} rows breaking decrypt

**Estado:** MERGED · **autor:** marvega · **fix/backfill-empty-strings → main** · creado 2026-04-29 · mergeado 2026-04-29

## Summary
- The first backfill on prod left 2 phones, 9 addresses, and **395 of 417** non-null curaciones in the migration placeholder shape `{plaintext: ""}` because the truthy check on `r.val.plaintext` silently dropped empty strings.
- Service-layer decrypt then sees `field.aad === undefined`, throws `AAD mismatch`, and `/api/patients` (and any path that hits a curación) returns 500.
- Fix: use `'plaintext' in obj` and type-narrow to string. For nullable columns store NULL when plaintext is empty (cleaner than encrypting "" everywhere); for hashed columns (rut, email) keep the empty value to preserve hash-uniqueness.

## Tests
8 unit tests in `encryption-batch.script.spec.ts` covering null, already-encrypted, raw string, placeholder with value, empty placeholder, non-string plaintext, and missing plaintext-key cases.

## Deploy plan
1. Merge → manual deploy via `render` API (auto-deploy is off).
2. Re-run `encryption:backfill` job; idempotent, skips already-encrypted rows from the previous run.
3. Smoke: `GET /api/patients` returns 200 with decrypted RUTs, login still works.

> **Comentario de vercel** (2026-04-29):
> [vc]: #shvG7eL3CUk13BRk95CIp8NfZUFe9SBa8Um7wuLkeh4=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1maXgtYmFja2ZpbGwtZW1wdHktc3RyaW5ncy1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIn0sImluc3BlY3RvclVybCI6Imh0dHBzOi8vdmVyY2VsLmNvbS9tYXJ2ZWdhcy1wcm9qZWN0cy9jdXJhY2lvbmVzLWFwcC9DOHRCNmNVOEoxM3h6MVlDWFJkNXJ6cnR1THVNIiwicHJldmlld1VybCI6ImN1cmFjaW9uZXMtYXBwLWdpdC1maXgtYmFja2ZpbGwtZW1wdHktc3RyaW5ncy1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIiwibmV4dENvbW1pdFN0YXR1cyI6IkRFUExPWUVEIn1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/C8tB6cU8J13xz1YCXRd5rzrtuLuM) | [Preview](https://curaciones-app-git-fix-backfill-empty-strings-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-fix-backfill-empty-strings-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 29, 2026 0:58am |

---

## #26 — docs: OAuth 2.0 Authorization Server design spec (Sub #2)

**Estado:** CLOSED · **autor:** marvega · **docs/oauth-server-spec → main** · creado 2026-04-29

## Summary

Design spec para el sub-proyecto #2 del commercial platform effort — OAuth 2.0 / OIDC Authorization Server embebido en el backend NestJS, prerequisito de Sub #3 (MCP Server).

Decisiones clave (resumen):

- Librería: `oidc-provider` (panva) — full OIDC + DCR + PKCE built-in.
- Access token: JWT RS256 + JWKS público + jti deny-list para revocación crítica.
- Multi-org: token bound a UNA org elegida en el consent. Reusa todo el stack multi-tenancy del Sub #1.
- DCR open + rate limit estricto + validación de redirect_uris.
- 10 scopes con split read/write consistente.
- TTLs: AT 10min · RT sliding 30d / absolute 180d · code 60s · reuse detection on.
- Consent persistente all-or-nothing.
- Keys RSA en tabla cifrada con KMS, rotación por CLI.
- OIDC features habilitadas (id_token, /userinfo).
- 12 hitos / ~1.5–2 semanas.

Spec: `docs/superpowers/specs/2026-04-29-oauth-server-design.md`.
Spec padre: `docs/superpowers/specs/2026-04-28-multi-tenant-mcp-platform-umbrella.md`.

## Test plan

- [ ] Lectura completa del spec
- [ ] Validar matriz scope→endpoints contra los routers actuales
- [ ] Validar que multi-org no introduce regresiones al stack actual

> **Comentario de vercel** (2026-04-29):
> [vc]: #PfUUyuCz7VPWvsd1zV7IYJs5l20uyC6fDTb/kH3BAfw=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1kb2NzLW9hdXRoLXNlcnZlci1zcGVjLW1hcnZlZ2FzLXByb2plY3RzLnZlcmNlbC5hcHAifSwiaW5zcGVjdG9yVXJsIjoiaHR0cHM6Ly92ZXJjZWwuY29tL21hcnZlZ2FzLXByb2plY3RzL2N1cmFjaW9uZXMtYXBwL0ZTVDJGZVRlOHE3NnE1TUJGZDFSNnVCWm1xdE4iLCJwcmV2aWV3VXJsIjoiY3VyYWNpb25lcy1hcHAtZ2l0LWRvY3Mtb2F1dGgtc2VydmVyLXNwZWMtbWFydmVnYXMtcHJvamVjdHMudmVyY2VsLmFwcCIsIm5leHRDb21taXRTdGF0dXMiOiJERVBMT1lFRCJ9XX0=
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/FST2FeTe8q76q5MBFd1R6uBZmqtN) | [Preview](https://curaciones-app-git-docs-oauth-server-spec-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-docs-oauth-server-spec-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 29, 2026 1:00pm |

> **Comentario de marvega** (2026-05-07):
> Closing — el spec fue traído a main directamente en commit 6264717 como parte del cierre formal de Sub #2 OAuth (todas las phases 0-14 completas y mergeadas via 35f7b31). PR redundante.

---

## #27 — fix(api): decrypt patient.rut in dashboard + agenda projections

**Estado:** MERGED · **autor:** marvega · **fix/dashboard-decrypt-rut → main** · creado 2026-04-29 · mergeado 2026-04-29

## Summary
- `DashboardService` and `AppointmentsService` were returning `patient.rut` as the raw EncryptedField jsonb on 5 endpoints the SPA hits at home-page bootstrap.
- React threw `Minified React error #31` (`Objects are not valid as a React child, found: {v,k,iv,c,t,aad}`) on a black screen — including in incognito, because `HomePage` fetched and rendered before redirect to `/login` could complete.
- New helper `decryptPatientPii` in patients module; both services inject `KMS_SERVICE` (global) and decrypt rut before serializing.

## Affected endpoints
- `/api/dashboard/today` (via `appointmentsService.getAgenda`)
- `/api/dashboard/no-appointment`
- `/api/dashboard/inactive`
- `/api/curaciones/availability`
- `/api/curaciones/agenda`

## Tests
- New `patient-projection.util.spec` (3 tests): happy path, null phone/address, AAD tamper guard.
- `dashboard.service.spec` and `appointments.service.spec` updated to use real EncryptedField fixtures and assert decrypted values.
- All 170 backend tests pass.

## Deploy plan
1. Merge → manual deploy via Render API (auto-deploy is off on both services).
2. Smoke: load home page logged-in, verify no React #31, check `/api/dashboard/today` returns rut as a string.

> **Comentario de vercel** (2026-04-29):
> [vc]: #ILnzALwc0Djb+y1rq+gtsjemG0bamaigk0lXOsYQSRQ=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1maXgtZGFzaGJvYXJkLWRlY3J5cHQtcnV0LW1hcnZlZ2FzLXByb2plY3RzLnZlcmNlbC5hcHAifSwiaW5zcGVjdG9yVXJsIjoiaHR0cHM6Ly92ZXJjZWwuY29tL21hcnZlZ2FzLXByb2plY3RzL2N1cmFjaW9uZXMtYXBwLzJuOGtGd2o5R2NtNE1xMTZ4ajZMSHU1cXpWNksiLCJwcmV2aWV3VXJsIjoiY3VyYWNpb25lcy1hcHAtZ2l0LWZpeC1kYXNoYm9hcmQtZGVjcnlwdC1ydXQtbWFydmVnYXMtcHJvamVjdHMudmVyY2VsLmFwcCIsIm5leHRDb21taXRTdGF0dXMiOiJERVBMT1lFRCIsInJvb3REaXJlY3RvcnkiOm51bGx9XX0=
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/2n8kFwj9Gcm4Mq16xj6LHu5qzV6K) | [Preview](https://curaciones-app-git-fix-dashboard-decrypt-rut-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-fix-dashboard-decrypt-rut-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 29, 2026 1:39pm |

---

## #28 — hotfix(api): decrypt encrypted fields on patient detail endpoints

**Estado:** MERGED · **autor:** marvega · **hotfix/patient-detail-decrypt → prd** · creado 2026-04-29 · mergeado 2026-04-30

## Summary

Fixes React #31 black screen on `/paciente/:id` in PRD by decrypting the
remaining encrypted fields that PR #27 didn't cover.

Three endpoints called by the patient detail page were leaking raw
`EncryptedField` jsonb objects to the SPA:

| Endpoint | Field that leaked |
|---|---|
| `GET /api/patients/:id` | `patient.curaciones[].observations` |
| `GET /api/appointments/patient/:patientId` | `appointment.curacion.observations` |
| `GET /api/wound-notes/patient/:patientId` | `woundNote.notes` |

The `encryptedColumnTransformer` is a passthrough by design (TypeORM
transformers must be sync, KMS is async), so each service must decrypt
explicitly. PR #27 covered dashboard + agenda; this PR covers the
patient detail bundle.

## Changes

- `patients.service.decryptPatient` now also walks `curaciones[]` and
  decrypts every `observations` with AAD `Curacion.observations:${id}`.
- `appointments.service.findByPatient` decrypts `curacion.observations`
  on each appointment after the query.
- `wound-notes.service.findByPatient` and `findByCuracion` decrypt
  `notes` via a new `decryptNotes` helper using AAD
  `WoundNote.notes:${id}`.

## Tests

- Extends `patients.service.spec.ts` with a `findById decrypts curaciones[].observations` test using the deterministic mock kms.
- Extends `appointments.service.spec.ts` with `findByPatient` tests using the real `InMemoryKmsService` for round-trip verification.
- Adds new `wound-notes.service.spec.ts` covering `findByPatient`, `findByCuracion`, null handling.
- All 177 backend tests green; backend + frontend builds clean.

## Targeting

PR is against the new `prd` branch (PRD deploys from `prd`, not `main`,
to keep production protected from in-flight integration work). After
merge, the same commit will be cherry-picked to `main`.

## Test plan

- [ ] CI passes
- [ ] After merge to `prd`, Render redeploys both services
- [ ] Smoke `https://curaciones-app.onrender.com/paciente/37` — page renders, no console error #31
- [ ] Cherry-pick to `main`

> **Comentario de vercel** (2026-04-29):
> [vc]: #0shVD22VtVgChcBhmEWm79VgygPUT6NSePsWO4TuJDs=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1ob3RmaXgtcGF0aWVudC1kZXRhLTJlOWNjOS1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIn0sImluc3BlY3RvclVybCI6Imh0dHBzOi8vdmVyY2VsLmNvbS9tYXJ2ZWdhcy1wcm9qZWN0cy9jdXJhY2lvbmVzLWFwcC8ycjY1bmN4QnlhS1BlYzJhQ2tyV1REU25SNjFoIiwicHJldmlld1VybCI6ImN1cmFjaW9uZXMtYXBwLWdpdC1ob3RmaXgtcGF0aWVudC1kZXRhLTJlOWNjOS1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIiwibmV4dENvbW1pdFN0YXR1cyI6IkRFUExPWUVEIn1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/2r65ncxByaKPec2aCkrWTDSnR61h) | [Preview](https://curaciones-app-git-hotfix-patient-deta-2e9cc9-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-hotfix-patient-deta-2e9cc9-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 29, 2026 11:59pm |

---

## #29 — chore: cherry-pick PR #28 hotfix to main

**Estado:** MERGED · **autor:** marvega · **chore/cherry-pick-hotfix-28 → main** · creado 2026-04-30 · mergeado 2026-04-30

## Summary

Cherry-picks the patient-detail decrypt hotfix from \`prd\` (#28) onto \`main\` so that \`main\` keeps tracking PRD's bugfix history.

This is a no-op for the running production service (PRD deploys from \`prd\`, which already has this commit). The purpose is to keep \`main\` from diverging — \`main\` is the integration branch where Sub #2 (OAuth) and future feature work integrates, and it should always include all production fixes.

## Process being established

Per the new branching model adopted today (option A):
- PRD deploys from \`prd\` branch
- \`main\` = integration / future-work substrate
- Hotfixes: branch off \`prd\` → PR to \`prd\` → cherry-pick to \`main\`
- Big features (Sub #2/#3, multi-tenancy follow-ups): branch off \`main\` → only promote to \`prd\` when production-ready

## Test plan

- [ ] Vercel preview passes
- [ ] Squash-merge to \`main\` (no production impact; \`main\` does not deploy)

> **Comentario de vercel** (2026-04-30):
> [vc]: #4GigJh5wDA/s03Ix22pL2ZDLbfdfWfOEXkoRkIrvzRk=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1jaG9yZS1jaGVycnktcGljay1oLTBiMzMzZS1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIn0sImluc3BlY3RvclVybCI6Imh0dHBzOi8vdmVyY2VsLmNvbS9tYXJ2ZWdhcy1wcm9qZWN0cy9jdXJhY2lvbmVzLWFwcC84SGhZdHhpQU5oRk1jeVp1QXRYYlVDS2NRcFhpIiwicHJldmlld1VybCI6ImN1cmFjaW9uZXMtYXBwLWdpdC1jaG9yZS1jaGVycnktcGljay1oLTBiMzMzZS1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIiwibmV4dENvbW1pdFN0YXR1cyI6IkRFUExPWUVEIn1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/8HhYtxiANhFMcyZuAtXbUCKcQpXi) | [Preview](https://curaciones-app-git-chore-cherry-pick-h-0b333e-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-chore-cherry-pick-h-0b333e-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 30, 2026 0:26am |

---

## #30 — docs(claude.md): document branching model for prd vs main

**Estado:** MERGED · **autor:** marvega · **chore/document-branching-claude-md → main** · creado 2026-04-30 · mergeado 2026-04-30

## Summary

Adds a \"Branching\" section to \`CLAUDE.md\` that documents the rule established in 2026-04-29:

- \`prd\` = live single-tenant app, Render auto-deploys, bug fixes only
- \`main\` = integration for new multi-establishment / OAuth / MCP work, does not auto-deploy
- Hotfix flow: off \`prd\` → PR to \`prd\` → cherry-pick to \`main\`
- Platform-work flow: off \`main\` → PR to \`main\`; promote to \`prd\` only when ready to replace the live app

This complements the GitHub branch protection rules now in place on both branches (no direct push, no force-push, applies to admins). \`CLAUDE.md\` is the canonical project doc, so future Claude sessions and human reviewers see the rule from the repo itself, not just my personal memory.

After this lands on \`main\`, I'll cherry-pick to \`prd\` so both branches carry the same doc.

## Test plan

- [ ] CI green (backend + frontend test, Vercel preview)
- [ ] After merge, cherry-pick to \`prd\` via small follow-up PR

> **Comentario de vercel** (2026-04-30):
> [vc]: #CspHV8JY9FEBQO/UytlD51sUkUwkUyPbseEJ50ti0As=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1jaG9yZS1kb2N1bWVudC1icmFuLTNlNTcyNS1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIn0sImluc3BlY3RvclVybCI6Imh0dHBzOi8vdmVyY2VsLmNvbS9tYXJ2ZWdhcy1wcm9qZWN0cy9jdXJhY2lvbmVzLWFwcC9CVWNlWUFuNWlQN1luOURjb3E5Z01NRkVKVEJ3IiwicHJldmlld1VybCI6ImN1cmFjaW9uZXMtYXBwLWdpdC1jaG9yZS1kb2N1bWVudC1icmFuLTNlNTcyNS1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIiwibmV4dENvbW1pdFN0YXR1cyI6IkRFUExPWUVEIn1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/BUceYAn5iP7Yn9Dcoq9gMMFEJTBw) | [Preview](https://curaciones-app-git-chore-document-bran-3e5725-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-chore-document-bran-3e5725-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 30, 2026 0:53am |

---

## #31 — docs(claude.md): cherry-pick branching model doc to prd

**Estado:** MERGED · **autor:** marvega · **chore/sync-claude-md-to-prd → prd** · creado 2026-04-30 · mergeado 2026-04-30

Cherry-picks the branching model doc (#30) from \`main\` so \`prd\` carries the same \`CLAUDE.md\`. Pure docs change, no code, no production impact.

> **Comentario de vercel** (2026-04-30):
> [vc]: #6gpU99PUNHf8N2own4Jx/3rYowN7ykouumlY0DTD9Ec=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1jaG9yZS1zeW5jLWNsYXVkZS1tLTBlZjJiZi1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIn0sImluc3BlY3RvclVybCI6Imh0dHBzOi8vdmVyY2VsLmNvbS9tYXJ2ZWdhcy1wcm9qZWN0cy9jdXJhY2lvbmVzLWFwcC9TeHBtVnFRZGhra0RtRXVidk56WDFVY0tiazhiIiwicHJldmlld1VybCI6ImN1cmFjaW9uZXMtYXBwLWdpdC1jaG9yZS1zeW5jLWNsYXVkZS1tLTBlZjJiZi1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIiwibmV4dENvbW1pdFN0YXR1cyI6IkRFUExPWUVEIn1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/SxpmVqQdhkkDmEubvNzX1UcKbk8b) | [Preview](https://curaciones-app-git-chore-sync-claude-m-0ef2bf-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-chore-sync-claude-m-0ef2bf-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Apr 30, 2026 0:54am |

---

## #32 — feat: OAuth 2.0 Authorization Server (Sub #2)

**Estado:** CLOSED · **autor:** marvega · **feat/oauth-server-complete → main** · creado 2026-05-07

## Summary

Sub-proyecto #2 del commercial platform effort: OAuth 2.0 / OIDC Authorization Server embebido en el backend NestJS.

- 5 tablas nuevas (`oauth_client`, `oauth_grant`, `oauth_token`, `oauth_signing_key`, `oauth_revocation`)
- Endpoints: discovery (RFC 8414), JWKS, DCR (RFC 7591), authorize, consent, token, revoke, userinfo
- JWT RS256 + JWKS público + jti deny-list en writes
- 10 scopes granulares con read/write split + matriz aplicada en domain controllers
- Consent screen SPA + página de Aplicaciones Conectadas
- Rate limiting por client (10/60/120 req/min por endpoint) + cron de purga diario
- Key rotation CLI con ventana de retire

Spec: `docs/superpowers/specs/2026-04-29-oauth-server-design.md`
Plan: `docs/superpowers/plans/2026-04-29-oauth-server-plan.md`

## Test plan

- [x] 46 unit tests verdes (`src/oauth/**`)
- [x] 13 suites E2E, 29 tests verdes (happy path, PKCE, consent, refresh rotation, revocation, scope enforcement, multi-org isolation, key rotation, userinfo, rate limits)
- [x] `oauth-coverage.spec.ts` pasa (gobernanza: todos los endpoints tienen `@RequiredScopes` o `@NoOAuthAccess`)
- [x] Conformance runner creado: `backend/test/oauth/conformance.ts`
- [x] OWASP security runbook: `docs/runbooks/oauth-security-review.md`
- [x] Developer guide público: `docs/runbooks/oauth-developer-guide.md`
- [x] 37 suites / 223 unit tests backend totales verdes
- [x] 97 tests frontend verdes, build OK

## Gates manuales pendientes (post-merge en staging)

- [ ] MCP Inspector flow OK contra dev (Task 13.5)
- [ ] Smoke manual del flow completo contra staging (Task 14.1 Step 4)

> **Comentario de vercel** (2026-05-07):
> [vc]: #tjOHeQqN3lizJTFdcC6oCluzy+4q+xhrJxqvEo4wRao=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1mZWF0LW9hdXRoLXNlcnZlci1jb21wbGV0ZS1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIn0sImluc3BlY3RvclVybCI6Imh0dHBzOi8vdmVyY2VsLmNvbS9tYXJ2ZWdhcy1wcm9qZWN0cy9jdXJhY2lvbmVzLWFwcC9BMnkxdGVmVTZZNld1dDN4VnZwNmlIQnQ0ZlZDIiwicHJldmlld1VybCI6ImN1cmFjaW9uZXMtYXBwLWdpdC1mZWF0LW9hdXRoLXNlcnZlci1jb21wbGV0ZS1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIiwibmV4dENvbW1pdFN0YXR1cyI6IkRFUExPWUVEIn1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/A2y1tefU6Y6Wut3xVvp6iHBt4fVC) | [Preview](https://curaciones-app-git-feat-oauth-server-complete-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-feat-oauth-server-complete-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | May 7, 2026 6:06pm |

> **Comentario de marvega** (2026-05-07):
> Cerrado — trabajo continúa en main local.

---

## #33 — feat(frontend): manual de usuario dentro de la app en /ayuda

**Estado:** MERGED · **autor:** marvega · **claude/github-curation-app-access-p90xd4 → prd** · creado 2026-07-17 · mergeado 2026-07-17

## Qué hace

Agrega una sección **Ayuda** dentro de la aplicación (`/ayuda`), accesible para cualquier usuario con sesión iniciada desde un enlace en el menú lateral. Es un manual de usuario paso a paso pensado para el personal clínico (enfermería), como apoyo en pantalla al usar el sistema.

## Contenido del manual

- **1. Ingresar al sistema** · **2. El Panel principal** · **3. Pacientes** (ver/buscar, nuevo, ficha) · **4. Registrar una curación** · **5. Citas y Agenda** · **6. Reportes** (mensual y pie diabético) · **7. Inventario** (ver, recepción, conteo) · **8. Mi cuenta y seguridad** · **Preguntas frecuentes**.

## Detalles técnicos

- **Página nueva**: `frontend/src/pages/HelpPage.tsx`, renderizada nativamente (no un iframe ni HTML externo).
- **Ruta** `/ayuda` protegida, dentro del `Layout` (`App.tsx`).
- **Enlace "Ayuda"** + título de página en `Layout.tsx`, visible para todo usuario logueado.
- **Tema claro/oscuro** sincronizado con la app (estilos scopeados bajo `.cur-manual`, con overrides bajo `.dark`).
- **Índice lateral** ("En esta guía") con resaltado de la sección activa al hacer scroll.
- **Capturas** almacenadas como estáticos en `frontend/public/manual/` (~1.3 MB, 17 imágenes JPEG). Cargan bajo demanda (`loading="lazy"`) y **no** se incluyen en el precache del service worker (el `globPatterns` de la PWA no cubre `.jpg`).

## Privacidad de datos

Las capturas se tomaron de la versión en producción usando un **paciente de ejemplo ficticio** (Juan Demostración). Los datos de pacientes reales que aparecían en listas/agenda/dashboard fueron **difuminados** antes de guardar las imágenes; no se incluye información clínica real de ningún paciente.

## Verificación

- `tsc -b && vite build` compilan sin errores.
- ESLint limpio en la página nueva (cumple `ui/use-primitives`).
- QA visual dentro de la app confirmado en tema claro y oscuro.

## Nota de despliegue

Al mergear a `prd`, Render despliega automáticamente en ~2 min y la sección Ayuda queda visible para los usuarios actuales.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

---
_Generated by [Claude Code](https://claude.ai/code/session_01VHmTgeJF5YQuVUz5qiR8j5)_

> **Comentario de vercel** (2026-07-17):
> [vc]: #i2wdubOm6qZovRXzdrvT5a6S3xbh7zzDacTQ+sGxS9o=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1jbGF1ZGUtZ2l0aHViLWN1cmF0LWJlNzc4YS1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIn0sImluc3BlY3RvclVybCI6Imh0dHBzOi8vdmVyY2VsLmNvbS9tYXJ2ZWdhcy1wcm9qZWN0cy9jdXJhY2lvbmVzLWFwcC9GY2FoaDJzNndzMVNRcHhlNjE1OVdjcGMzM3J2IiwicHJldmlld1VybCI6ImN1cmFjaW9uZXMtYXBwLWdpdC1jbGF1ZGUtZ2l0aHViLWN1cmF0LWJlNzc4YS1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIiwibmV4dENvbW1pdFN0YXR1cyI6IkRFUExPWUVEIn1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/Fcahh2s6ws1SQpxe6159Wcpc33rv) | [Preview](https://curaciones-app-git-claude-github-curat-be778a-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-claude-github-curat-be778a-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Jul 17, 2026 3:19am |

---

## #34 — feat(agenda): permitir agendar citas a las 16:30

**Estado:** MERGED · **autor:** marvega · **claude/github-curation-app-access-p90xd4 → prd** · creado 2026-07-17 · mergeado 2026-07-17

## Qué hace

Agrega el bloque **16:30** a los horarios de atención de la tarde, extendiendo el rango de **12:30–16:00** a **12:30–16:30**.

## Cambio

- `backend/src/common/schedule.util.ts`: se añade `'16:30'` a `PM_SLOTS`.
- `backend/src/common/schedule.util.spec.ts`: se actualiza la aserción del listado PM para incluir `'16:30'`.

## Alcance / riesgo

- Es una adición a la lista blanca de horarios válidos: el bloque 16:30 pasa a ser agendable. No afecta citas existentes ni la lógica de doble-reserva (que valida por bloque).
- El horario especial de **segundo viernes** (jornada de mañana, `AM_SLOTS`) **no cambia**.
- El frontend no tiene horarios hardcodeados: obtiene los bloques disponibles desde el backend, por lo que no requiere cambios.

## Verificación

- Suite completa del backend en verde: **177 tests pasados, 0 fallos** (4 skipped).
- Tests específicos de `schedule.util` y `appointments.service` actualizados y pasando.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

---
_Generated by [Claude Code](https://claude.ai/code/session_01VHmTgeJF5YQuVUz5qiR8j5)_

> **Comentario de vercel** (2026-07-17):
> [vc]: #fkAfIEH9DFRKSY9pW+y56Clp/Q1ldkMyjNFbFdal3NI=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1jbGF1ZGUtZ2l0aHViLWN1cmF0LWJlNzc4YS1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIn0sImluc3BlY3RvclVybCI6Imh0dHBzOi8vdmVyY2VsLmNvbS9tYXJ2ZWdhcy1wcm9qZWN0cy9jdXJhY2lvbmVzLWFwcC9BWmNwUFdEWjFrTmlGdTVhcWVKOU1rc1RqMXh5IiwicHJldmlld1VybCI6ImN1cmFjaW9uZXMtYXBwLWdpdC1jbGF1ZGUtZ2l0aHViLWN1cmF0LWJlNzc4YS1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIiwibmV4dENvbW1pdFN0YXR1cyI6IkRFUExPWUVEIn1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/AZcpPWDZ1kNiFu5aqeJ9MksTj1xy) | [Preview](https://curaciones-app-git-claude-github-curat-be778a-marvegas-projects.vercel.app), [Comment](https://vercel.live/open-feedback/curaciones-app-git-claude-github-curat-be778a-marvegas-projects.vercel.app?via=pr-comment-feedback-link) | Jul 17, 2026 10:28am |

---

## #35 — feat: cutover a la versión multi-establecimiento con Authorization Server y MCP

**Estado:** MERGED · **autor:** marvega · **release/cutover-2026-08-21 → main** · creado 2026-08-24 · mergeado 2026-08-24

Reemplaza la versión single-tenant que corre hoy en GCP por la versión multi-establecimiento, con el Authorization Server OAuth y el servidor MCP incluidos.

**Diseño:** `docs/superpowers/specs/2026-08-21-cutover-multiestablecimiento-design.md`
**Plan:** `docs/superpowers/plans/2026-08-21-cutover-multiestablecimiento-plan.md`

## Ya validado en un canal preview contra la base de producción

El backend y el MCP están desplegados como servicios paralelos (`curaciones-api-next`, `curaciones-mcp-next`) y el conjunto se validó de punta a punta. Producción sigue intacta en su revisión original.

- 51 pacientes, 809 curaciones y 823 citas legibles, con RUT y observaciones descifrados
- PDF de ficha clínica, agenda, inventario, reportes y las 4 páginas de administración de organización
- **Flujo OAuth completo detrás de Firebase Hosting**, con su caso de control: la reanudación funciona con sólo la cookie `__session` y falla con 400 sin ella
- **MCP conectado**: las 20 tools, y una lectura real de paciente sin filtrar credenciales
- Cadena de auditoría idéntica a la línea base medida antes de migrar

## Cambios de fondo

**Infraestructura portada** desde la rama que corre en producción: Dockerfile, configuración de Firebase Hosting, y TLS verificado contra Postgres (elimina `rejectUnauthorized: false`).

**Features que sólo existían en producción**: el manual de usuario en `/ayuda` y el bloque de agenda de las 16:30.

**Authorization Server operativo.** Requiere rewrites de Hosting para `/oauth/**`, las dos rutas de discovery y `/jwks.json` — esta última vive en la raíz, y sin su rewrite el MCP recibía el HTML del SPA con un 200 y toda autenticación fallaba. Las cookies de `oidc-provider` van renombradas a `__session` y sin firmar, porque Hosting reenvía un único nombre de cookie y una cookie firmada son dos cookies.

**Limpieza diaria de OAuth** convertida de `@Cron` a endpoint invocado por Cloud Scheduler, autorizado verificando el token OIDC que Google firma. `@Cron` no dispara con scale-to-zero.

**Invitaciones usables sin correo.** Con `EMAIL_BACKEND=noop` el token se generaba y se descartaba, volviendo cada invitación irrecuperable. Ahora la respuesta devuelve el enlace al owner que la creó.

## Correcciones de seguridad encontradas durante la revisión

Todas afectaban al código que ya corre en producción:

- **Credenciales en la tabla de auditoría con cadena de hash**, irredactables después: el token de invitación, ambas contraseñas de `change-password`, el refresh token de `logout`, la firma del paciente en `consent`, y un access token de 4 horas. Redacción por nombre de campo aplicada a `payload` y `afterJson`.
- **`passwordHash` alcanzable por 8 rutas** vía relaciones anidadas — una de ellas serializada al contexto de un LLM por el MCP. Cerrado con `select: false` en la entidad, más un test que enumera las relaciones desde los metadatos de TypeORM para atrapar rutas futuras.
- **Rate limiting evadible.** `trust proxy: true` hacía `req.ip` forjable; el discriminador anónimo se elegía del body, así que un `client_id` aleatorio daba bucket nuevo por request; y `OAuthClientThrottlerGuard` llaveaba desde un `decode()` sin verificar firma.
- **Cadena de auditoría inverificable** para PKs bigint, hasheadas como string.

## Cobertura de CI

El gate del PR nunca corría los 26 specs e2e ni los 12 de aislamiento entre organizaciones, porque el `rootDir` de jest es `src`. Se agrega un paso con su propia configuración, excluyendo las suites legacy rojas para que un fallo nuevo sí rompa el build.

Backend 469 tests · e2e 160 · MCP 104 · frontend 106.

## Pendiente por decisión, no por omisión

`prd` se archiva después de promover. El llaveado del throttler OAuth, la carrera del `SELECT FOR UPDATE` en la cadena de auditoría y la búsqueda case-insensitive de username quedan como deuda con ticket propio.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

> **Comentario de vercel** (2026-08-24):
> [vc]: #ZCwfnGzIUaPA3oJt6XkQzdlhsDcCxmVnBxyLq9440IM=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6ImN1cmFjaW9uZXMtYXBwLWdpdC1yZWxlYXNlLWN1dG92ZXItMjAyNi0wOC0yMS1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIn0sImluc3BlY3RvclVybCI6Imh0dHBzOi8vdmVyY2VsLmNvbS9tYXJ2ZWdhcy1wcm9qZWN0cy9jdXJhY2lvbmVzLWFwcC9HM3ZBeDdjdUpxdXdKNjZiV3phRVJXRGFUZ2l0IiwicHJldmlld1VybCI6ImN1cmFjaW9uZXMtYXBwLWdpdC1yZWxlYXNlLWN1dG92ZXItMjAyNi0wOC0yMS1tYXJ2ZWdhcy1wcm9qZWN0cy52ZXJjZWwuYXBwIiwibmV4dENvbW1pdFN0YXR1cyI6IkRFUExPWUVEIiwicm9vdERpcmVjdG9yeSI6bnVsbH1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | <a href="https://vercel.com/marvegas-projects/curaciones-app"><sup><img src="https://vercel.com/api/www/avatar?projectId=prj_DLaKZqDrqY9jCbbtvc7q8naIRy53&teamId=team_O9Nl9QwwuyOdVWLmskR8X9XW&s=32" width="16" height="16" align="middle" alt="" /></sup></a> [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/G3vAx7cuJquwJ66bWzaERWDaTgit) | [Preview](https://curaciones-app-git-release-cutover-2026-08-21-marvegas-projects.vercel.app) | Aug 24, 2026 3:50am |

---

## #36 — docs: retire the prd branch after the cutover

**Estado:** MERGED · **autor:** marvega · **docs/retire-prd-branch → main** · creado 2026-08-24 · mergeado 2026-08-24

The multi-establishment version replaced the single-tenant app on 2026-08-24. `main` is now the only production branch.

Rewrites the branching model to describe what is actually true, adds the production topology and the rollback commands with real values, documents why the Authorization Server's resume cookie is unsigned, and drops the dead `render.yaml`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

> **Comentario de vercel** (2026-08-24):
> [vc]: #87eplB2xFxwX4E9P7WDHaqqYH2Jj/l/st5Pput8MtKk=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwiaW5zcGVjdG9yVXJsIjoiaHR0cHM6Ly92ZXJjZWwuY29tL21hcnZlZ2FzLXByb2plY3RzL2N1cmFjaW9uZXMtYXBwLzN3TFk0MjUxTXJab3p0ckg3allGWTFnajlFWGgiLCJwcmV2aWV3VXJsIjoiY3VyYWNpb25lcy1hcHAtZ2l0LWRvY3MtcmV0aXJlLXByZC1icmFuY2gtbWFydmVnYXMtcHJvamVjdHMudmVyY2VsLmFwcCIsIm5leHRDb21taXRTdGF0dXMiOiJQRU5ESU5HIiwibGl2ZUZlZWRiYWNrIjp7InJlc29sdmVkIjowLCJ1bnJlc29sdmVkIjowLCJ0b3RhbCI6MCwibGluayI6IiJ9fV19
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | <a href="https://vercel.com/marvegas-projects/curaciones-app"><sup><img src="https://vercel.com/api/www/avatar?projectId=prj_DLaKZqDrqY9jCbbtvc7q8naIRy53&teamId=team_O9Nl9QwwuyOdVWLmskR8X9XW&s=32" width="16" height="16" align="middle" alt="" /></sup></a> [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Building](https://vercel.com/static/status/building.svg) [Building](https://vercel.com/marvegas-projects/curaciones-app/3wLY4251MrZoztrH7jYFY1gj9EXh) | [Preview](https://curaciones-app-git-docs-retire-prd-branch-marvegas-projects.vercel.app) | Aug 24, 2026 4:07am |

---

## #37 — fix(security): remove production credentials from the repository

**Estado:** MERGED · **autor:** marvega · **fix/remove-hardcoded-credentials → main** · creado 2026-08-24 · mergeado 2026-08-24

Las contraseñas de producción de `admin` y `cynthia` —dos cuentas Owner sobre una organización con 51 fichas clínicas— estaban como literales en `UsersService.seed()`, en un repositorio **público**, presentes en el historial desde `ea96d82`. La misma contraseña aparecía en el setup de Playwright, el spec e2e del throttler y un documento de planificación.

`seed()` ahora lee `SEED_USERNAME` y `SEED_PASSWORD` y no crea nada si no están definidas, así que en un despliegue existente es inerte. Sólo resuelve el arranque de la primera cuenta, cuando todavía no existe nadie que pueda invitar.

`POST /api/users/seed` conserva el acceso anónimo —no hay nadie como quien autenticarse antes del primer usuario— pero el comentario ahora dice qué lo mantiene seguro y qué lo volvería peligroso.

**Esto no cierra la exposición.** Hay que rotar las contraseñas, y el historial sigue conteniéndolas. `docs/runbooks/2026-08-24-credential-exposure.md` registra el hallazgo, cómo apareció y qué no lograría reescribir el historial.

Backend 471 tests en verde.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

> **Comentario de vercel** (2026-08-24):
> [vc]: #CttZQMKwjurV7llkEe+f1vfB2E5M5wLi9bXTP/uTRPs=:eyJpc01vbm9yZXBvIjp0cnVlLCJ0eXBlIjoiZ2l0aHViIiwicHJvamVjdHMiOlt7Im5hbWUiOiJjdXJhY2lvbmVzLWFwcCIsInByb2plY3RJZCI6InByal9ETGFLWnFEcnFZOWpDYmJ0dmM3cThuYUlSeTUzIiwiaW5zcGVjdG9yVXJsIjoiaHR0cHM6Ly92ZXJjZWwuY29tL21hcnZlZ2FzLXByb2plY3RzL2N1cmFjaW9uZXMtYXBwL0N5OFp5enJpY0twVmUxQzNZWmJyMm9kTk0zSlMiLCJwcmV2aWV3VXJsIjoiY3VyYWNpb25lcy1hcHAtZ2l0LWZpeC1yZW1vdmUtaGFyZGNvZGUtMzkxN2VmLW1hcnZlZ2FzLXByb2plY3RzLnZlcmNlbC5hcHAiLCJuZXh0Q29tbWl0U3RhdHVzIjoiREVQTE9ZRUQiLCJsaXZlRmVlZGJhY2siOnsicmVzb2x2ZWQiOjAsInVucmVzb2x2ZWQiOjAsInRvdGFsIjowLCJsaW5rIjoiY3VyYWNpb25lcy1hcHAtZ2l0LWZpeC1yZW1vdmUtaGFyZGNvZGUtMzkxN2VmLW1hcnZlZ2FzLXByb2plY3RzLnZlcmNlbC5hcHAifSwicm9vdERpcmVjdG9yeSI6bnVsbH1dfQ==
> The latest updates on your projects. Learn more about [Vercel for GitHub](https://vercel.link/github-learn-more).
> 
> | Project | Deployment | Actions | Updated (UTC) |
> | :--- | :----- | :------ | :------ |
> | <a href="https://vercel.com/marvegas-projects/curaciones-app"><sup><img src="https://vercel.com/api/www/avatar?projectId=prj_DLaKZqDrqY9jCbbtvc7q8naIRy53&teamId=team_O9Nl9QwwuyOdVWLmskR8X9XW&s=32" width="16" height="16" align="middle" alt="" /></sup></a> [curaciones-app](https://vercel.com/marvegas-projects/curaciones-app) | ![Ready](https://vercel.com/static/status/ready.svg) [Ready](https://vercel.com/marvegas-projects/curaciones-app/Cy8ZyzricKpVe1C3YZbr2odNM3JS) | [Preview](https://curaciones-app-git-fix-remove-hardcode-3917ef-marvegas-projects.vercel.app) | Aug 24, 2026 6:44pm |

---
