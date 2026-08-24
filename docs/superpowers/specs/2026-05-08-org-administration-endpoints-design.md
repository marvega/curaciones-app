# Org administration endpoints — design

**Date:** 2026-05-08
**Status:** Approved (design only; implementation pending)
**Branch base:** `main`

## Problem

Sub #1 (multi-tenancy foundation, commit `6bada78`) merged the frontend for organization administration — `MembersPage`, `InvitationsPage`, `EstablishmentsPage`, `SettingsPage`, sidebar entry "Mi organización", and the matching `services/api.ts` client functions — but never landed the backend. The pages call 9 endpoints under `/api/org/*` that don't exist; every fetch returns the Express default 404 body, which surfaces as `Cannot GET /api/org/members` toasts.

Discovered during a manual smoke of the prd→main migration drill on 2026-05-08. Documented in conversation memory `S2624` and the path-bug fix branch `fix/dist-layout-tsconfig`.

## Goals

Implement the 9 missing endpoints so the four admin pages work end-to-end, against the entities and services already in `main`.

Non-goals:
- New UI work (frontend already exists)
- New entities, columns, or migrations
- Establishment edit/delete (frontend has no UI for it)
- Member email-change flow (out of scope)
- OAuth scope coverage on these routes (deferred — first-party UI only)

## Endpoints

All under `@Controller('api/org')`. All require:
- `JwtAuthGuard` — populates `req.user = { id, organizationId, role, … }`
- `RolesGuard` + `@Roles('admin', 'owner')` — both org admins and owners may manage

| Method | Path                              | Body                          | Status / Response                                                                        |
| ------ | --------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| GET    | `/api/org/members`                | —                             | 200 `Member[]` — only `status='active'` rows for `req.user.organizationId`                |
| PATCH  | `/api/org/members/:userId`        | `{ role: OrgRole }`           | 200 `Member` — role must not be `owner`; reject if last owner being demoted              |
| DELETE | `/api/org/members/:userId`        | —                             | 204 — sets `status='revoked'`, `revokedAt=now()`; reject self-revoke                     |
| GET    | `/api/org/invitations`            | —                             | 200 `Invite[]` — only pending: not accepted, not cancelled, not expired                  |
| POST   | `/api/org/invitations`            | `{ email, role: OrgRole }`    | 201 `{ id }` — delegates to existing `InvitationsService.create()` (sends email)         |
| GET    | `/api/org/establishments`         | —                             | 200 `Est[]` — reuses `EstablishmentsService.list()` (already org-scoped)                  |
| POST   | `/api/org/establishments`         | `{ name, comuna }`            | 201 `Est`                                                                                |
| GET    | `/api/org/settings`               | —                             | 200 `{ name, rut }` for current org                                                       |
| PATCH  | `/api/org/settings`               | `{ name, rut? }`              | 200 `{ name, rut }` updated                                                              |

### Response shapes (TypeScript)

```ts
type Member = { userId: number; username: string; email: string | null; role: OrgRole; status: 'active' | 'revoked' };
type Invite = { id: string; email: string; role: OrgRole; createdAt: string; expiresAt: string };
type Est    = { id: number; name: string; comuna: string };
type Settings = { name: string; rut: string | null };
```

`Member.email` is read through the `EncryptedField` transformer on `User.email`. In a normal environment this auto-decrypts. In the migration-drill DB the local KMS key does not match prod's, so reads will throw — that is a known drill limitation, not a feature bug. **No try/catch papering over** (see `feedback_fail_fast.md`).

## Architecture

New module: `backend/src/org/`.

```
backend/src/org/
├── org.module.ts          # registers controller + service; imports deps
├── org.controller.ts      # 9 routes; all guarded
├── org.service.ts         # business logic that isn't reused
├── dto/
│   ├── invite-member.dto.ts
│   ├── update-role.dto.ts
│   ├── create-establishment.dto.ts
│   └── update-settings.dto.ts
└── org.service.spec.ts    # unit tests
```

**Why one module instead of four:** `members`, `invitations`, `establishments`, `settings` share the same prefix, the same auth model, the same JWT-derived org context, and operate on a small graph of entities owned by `Organization`. Splitting them adds 4× the wiring with no isolation benefit.

**Reuse:**
- `InvitationsService.create(orgId, inviterId, inviterName, email, role)` — already exists in `auth/invitations.service.ts`; sends email via `EmailService` and persists the invitation. `OrgModule` imports `AuthModule` to consume it.
- `EstablishmentsService.list()` — already exists. `OrgModule` imports `EstablishmentsModule`.
- `Organization`, `OrganizationMembership`, `Invitation`, `User` repositories — wired via `TypeOrmModule.forFeature(...)` in `OrgModule`.

`app.module.ts` adds one import: `OrgModule` after `AuthModule` (must come after, since it depends on `InvitationsService`).

## Validation

DTOs use `class-validator`. Application-level rules in the service.

| DTO | Rules |
|---|---|
| `UpdateRoleDto` | `@IsEnum(OrgRole)` + `@NotEquals(OrgRole.OWNER)` on `role` (cannot promote/demote to owner via this endpoint) |
| `InviteMemberDto` | `@IsEmail()` on `email`; `@IsEnum(OrgRole)` + `@NotEquals(OrgRole.OWNER)` on `role` |
| `CreateEstablishmentDto` | `name: IsString, IsNotEmpty, MaxLength(200)`, `comuna: IsString, IsNotEmpty, MaxLength(120)` |
| `UpdateSettingsDto` | `name: IsString, IsNotEmpty, MaxLength(200)`, `rut?: IsOptional, IsString, MaxLength(20)` |

## Edge cases / errors

Service throws `HttpException` subclasses; controller does no error transformation.

| Case | Where | HTTP | Body |
|---|---|---|---|
| PATCH role demotes last owner | `OrgService.updateRole` | 409 Conflict | `Cannot demote the last owner` |
| DELETE member with `userId === currentUser.id` | `OrgService.revokeMember` | 409 Conflict | `Cannot revoke yourself` |
| POST invitation, email already an active member | `OrgService.invite` | 409 Conflict | `User is already a member` |
| Member/invitation/establishment not found | service | 404 Not Found | `… not found` |
| Body validation failure | `ValidationPipe` | 400 Bad Request | array of messages |
| Role not `admin`/`owner` | `RolesGuard` | 403 Forbidden | (default) |
| No JWT | `JwtAuthGuard` | 401 Unauthorized | (default) |

Email-uniqueness check uses `User.emailHash` lookup (the indexed plaintext-equivalent). Avoids touching encrypted column.

## Testing

### Unit — `backend/src/org/org.service.spec.ts`
- `updateRole`: rejects last owner demotion, rejects revoked target, happy path
- `revokeMember`: rejects self-revoke, sets `status` and `revokedAt`, happy path
- `invite`: rejects existing active member by emailHash, delegates to `InvitationsService.create`
- `getSettings` / `updateSettings`: reads/writes `Organization` row from JWT's `organizationId`
- `createEstablishment`: persists with correct `organizationId`

Mocks: `InvitationsService.create`, repositories.

### E2E — `backend/test/org-administration.e2e-spec.ts`
- Boot Nest with the existing test setup (real Postgres at `TEST_DATABASE_URL`)
- Seed: 1 org, 1 owner + 1 admin + 1 clinician
- Per endpoint, assert:
  - Happy path with admin token
  - 401 without token
  - 403 with clinician token
  - One business-rule failure (e.g. self-revoke, last-owner demotion, duplicate invite) where applicable

Run via existing `npm run test:e2e` (already runs `pretest:e2e` which migrates the test DB).

## Out of scope (for this design)

- OAuth scope coverage (`org:admin` / `org:read`) — deferred. The OAuth governance test will likely flag these endpoints; an `@NoOAuthAccess()` decorator can be added to mark them as intentionally first-party-only, or scopes can be added in a follow-up.
- Establishment edit (PATCH) and delete (DELETE) — no UI uses them.
- Pagination — current data volumes (≤ tens of members per org) don't justify it.
- Resending or cancelling invitations from the page — frontend doesn't expose those actions.

## Files affected

**New (9):**
```
backend/src/org/org.module.ts
backend/src/org/org.controller.ts
backend/src/org/org.service.ts
backend/src/org/org.service.spec.ts
backend/src/org/dto/invite-member.dto.ts
backend/src/org/dto/update-role.dto.ts
backend/src/org/dto/create-establishment.dto.ts
backend/src/org/dto/update-settings.dto.ts
backend/test/org-administration.e2e-spec.ts
```

**Edited (1):**
```
backend/src/app.module.ts   # add OrgModule to imports
```

## Definition of done

1. `npm run lint` passes in `backend/`.
2. `npm run test` (unit) passes; new spec is part of the suite.
3. `npm run test:e2e` passes; new e2e spec is part of the suite.
4. Local boot via `npm run start:prod` shows the 9 routes mapped in the startup log under `RouterExplorer`.
5. Manual smoke from the running frontend (`http://localhost:5173`) against the four pages — list/create/update/delete actions return the expected toasts and reload state.
6. No changes to `prd` branch; commit on a new branch off `main`, no push, no PR (per `feedback_no_push_during_platform_dev.md`).
