# Handoff — Wire the 3 orphan `/org/*` pages into the sidebar

**Date:** 2026-05-08
**Branch base:** `main` (or off the unmerged `feat/org-administration-endpoints` if you keep stacking)
**Estimated effort:** 30–60 min

## Context

Sub #1 (multi-tenancy foundation, commit `6bada78`) merged four React pages under `frontend/src/pages/org/`:
- `MembersPage.tsx`
- `InvitationsPage.tsx`
- `EstablishmentsPage.tsx`
- `SettingsPage.tsx`

All four routes are wired in `frontend/src/App.tsx:70-73`:
```
<Route path="org/members" element={<MembersPage />} />
<Route path="org/invitations" element={<InvitationsPage />} />
<Route path="org/establishments" element={<EstablishmentsPage />} />
<Route path="org/settings" element={<OrgSettingsPage />} />
```

But `frontend/src/components/Layout.tsx:173` only has a single sidebar link:
```
<NavLink to="/org/members">Mi organización</NavLink>
```

Result: `/org/members` is the only one reachable from the UI. The other three are orphans. Verified via Playwright smoke on 2026-05-08.

The backend for all four was just landed on branch `feat/org-administration-endpoints` (19 commits, local-only — see "Branch state" below). Endpoints work; they just aren't navigable.

## What to build

Pick one of two approaches. I recommend (A); (B) is acceptable if it matches existing patterns in the codebase.

**(A) Internal tabs at the top of `MembersPage`** — a horizontal tab bar that switches between `/org/members | /org/invitations | /org/establishments | /org/settings` while the sidebar entry stays as a single "Mi organización". This is what most multi-section admin pages look like, and it keeps the sidebar uncluttered. Implement once in a shared `<OrgTabs>` component and render at the top of all four pages.

**(B) Expandable sidebar group** — "Mi organización" expands into 4 child links. Closer to how some IDEs and admin panels do it; works if the codebase already has this pattern. Grep `Layout.tsx` first; if no expandable groups exist, lean toward (A) to avoid inventing a navigation idiom.

**Decision input:** check `frontend/src/components/Layout.tsx` and `frontend/src/components/ui/` for existing tab/group primitives. If `<Tabs>` exists in the UI primitive library (per CLAUDE.md, `frontend/src/components/ui/` is canonical), use it. If only `<NavLink>` patterns exist, build a small `<OrgTabs>`.

## Files likely affected

- `frontend/src/components/org/OrgTabs.tsx` (new, if going with approach A) — tab strip pinned at the top of the org pages
- `frontend/src/pages/org/MembersPage.tsx` — render `<OrgTabs />` above the existing `<PageHeader>`
- `frontend/src/pages/org/InvitationsPage.tsx` — same
- `frontend/src/pages/org/EstablishmentsPage.tsx` — same
- `frontend/src/pages/org/SettingsPage.tsx` — same
- `frontend/src/components/Layout.tsx` — no change if (A); update sidebar entry if (B)

## Acceptance

- Logged-in admin/owner can switch between the 4 org pages without typing URLs
- Non-admin/owner roles see no broken state (the routes stay protected by the existing `RolesGuard`; sidebar entry probably hides for non-admins already — verify)
- Existing primitives (`Button`, etc) used per `CLAUDE.md` ESLint rule `ui/use-primitives`

## Branch state at handoff time

Two local branches sitting unpushed off `main`:

| Branch | Commits | What |
|---|---|---|
| `fix/dist-layout-tsconfig` | 1 | `tsconfig.build.json` excludes `scripts/` so `dist/` stays flat (start:prod works) |
| `feat/org-administration-endpoints` | 19 | All 9 `/api/org/*` endpoints + KMS email decrypt + tenant-isolation fix on `EstablishmentsService` + transactional last-owner guard + JwtUser type alias + lint cleanup. Includes a cherry-pick of the path fix above. |

**Commits on `feat/org-administration-endpoints`** (newest first):
```
1ddbf64 fix(backend): exclude scripts/ from tsconfig.build so dist/ stays flat
72be221 style(org): apply eslint-disable for any-typed test mocks; format with prettier
562154a feat(org): POST /api/org/establishments
af9beac fix(establishments): scope list() and findById() to caller's org
6d00bcd feat(org): GET /api/org/establishments (reuses EstablishmentsService)
e5b4e43 fix(org): use 'import type' for JwtUser to satisfy isolatedModules
7ab9d0a feat(org): POST /api/org/invitations with duplicate-member guard
4f56e75 refactor(org): JwtUser type alias + transactional last-owner guard
5d5f6c6 feat(org): GET /api/org/invitations (pending only)
d57a759 feat(org): DELETE /api/org/members/:userId with self-revoke and last-owner guards
0ac237e feat(org): PATCH /api/org/members/:userId with last-owner guard
9fcf8fa fix(org): decrypt member emails via KmsService; type Member; harden e2e
94a192b feat(org): GET /api/org/members
f77ac20 test(org): cover NotFound + rut-omitted branches; fresh mocks per test
553ee9c feat(org): PATCH /api/org/settings with role/name/rut validation
1428557 test(org): add clinician-403 case + future-offset passwordChangedAt
3c58d52 feat(org): module skeleton + GET /api/org/settings
f605b38 docs(superpowers): implementation plan for org administration endpoints
d9d2586 docs(superpowers): design org administration endpoints
```

**Branch decision for the orphan-routes work:** branch off `main` (clean) for portability. If you want the sidebar fix to land before the backend, you can merge `feat/org-administration-endpoints` to `main` first — but that's a separate decision (no push has been done). Spec lives at `docs/superpowers/specs/2026-05-08-org-administration-endpoints-design.md`, plan at `docs/superpowers/plans/2026-05-08-org-administration-endpoints-plan.md`.

## Drill DB state at handoff time

The local `curaciones` database (Docker postgres on `:5433`) was reset to the drilled prd dump (`~/curaciones-backups/curaciones-2026-05-08-002828.sql.gz`) and migrated up to `main`'s 10 migrations. **Then I mutated it for smoke testing**:

1. `UPDATE users SET email = NULL` — wiped 3 prod-encrypted email blobs (KMS key local ≠ prod's, decrypt always failed). Without this, `GET /api/org/members` 500s.
2. `UPDATE users SET passwordHash = bcrypt('demo1234'), passwordChangedAt = now() - 1h WHERE username = 'admin'` — set a known password so I could log in. The other two users (cynthia, Camila) still have their prod hashes.
3. Demoted cynthia and Camila Owner→Admin via the UI.
4. Revoked Camila (her membership has `status='revoked'`, won't show in active lists).
5. Created an invitation for `newperson@test.cl` (clinician role).
6. Created establishment `CESFAM Smoke Test / Viña del Mar`.
7. Updated org settings to `name='Curaciones Demo (smoke)', rut='76.999.999-9'`.

**To get back to a clean drill state**, redo the reset block from `docs/superpowers/plans/2026-05-08-org-administration-endpoints-plan.md` Task 10 step 3 (drop+restore the dump). Or accept the mutated state — it's actually a useful starting point for testing the orphan-routes UI: there's a pending invitation, two establishments, a non-default settings row, and 2 active members (cynthia+admin) so most of the screens show non-empty data.

## Running services at handoff time

| Port | Process | Notes |
|---|---|---|
| `:3000` | backend prod-style (`npm run start:prod`) on PID `98852` | Logs at `/tmp/task10-startprod.log`. Uses the mutated drill DB. |
| `:5173` | Vite dev (frontend) on PID `61059` | Started weeks ago, still alive. |

Decide whether to leave them running or kill them at the start of the next session. If killing: `lsof -ti :3000 \| xargs -r kill` (frontend can stay).

## Login for smoke

- URL: http://localhost:5173/
- User: `admin`
- Password: `demo1234` (set on the drill DB only — see "Drill DB state" #2)
- After login, the dashboard will toast/log a `500` from `/api/dashboard/no-appointment` because patient encrypted columns can't decrypt with the local KMS key. **Ignore it** — unrelated to org admin and to whatever you're building next.

## Known follow-ups (separate scope)

- **Concurrent invite-then-revoke race**: the duplicate-member check in `OrgService.invite` is not transactional with `InvitationsService.create`. Two simultaneous invites to the same email could both pass — but per the existing index `UQ_invitation_org_email_pending`, only one will persist. Acceptable; flag if it ever shows up in production.
- **`oauth-multi-org.e2e-spec.ts` style** — the codebase convention for any-typed e2e specs is the `/* eslint-disable no-unsafe-* */` header. New `org-administration.e2e-spec.ts` and `org.service.spec.ts` use it.
- **Dashboard KMS issue**: the local KMS key doesn't match prod's. To smoke other pages without 500s, also wipe `patients.rut` etc. — but that's destructive in different ways since `rut` is `NOT NULL`. Easier: re-encrypt selectively with the local KMS, or skip pages that read PHI in this drill.
