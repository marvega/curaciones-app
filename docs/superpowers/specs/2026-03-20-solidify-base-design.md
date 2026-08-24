# Solidify the Base — Design Spec

**Date:** 2026-03-20
**Status:** Approved
**Scope:** Technical infrastructure improvements for the Curaciones app

## Overview

This spec covers 5 areas of technical improvement to solidify the Curaciones app before adding new clinical features. The app is used by a small clinic (1-3 nurses) and runs on Render with PostgreSQL.

## 1. Exhaustive Testing (TDD)

### Backend Unit Tests
- **Framework:** Jest (bundled with NestJS)
- **Scope:** All services, guards, DTOs, utility functions
- **Approach:** TDD — write tests before implementation for any new code; retrofit tests for existing services
- **Key services to cover:**
  - `AuthService` — login, token generation, validation
  - `PatientsService` — CRUD, discharge/readmission, status history, RUT search
  - `CuracionesService` — CRUD, type validation, edit audit trail
  - `AppointmentsService` — creation, slot availability, second-Friday AM rule, conflict detection
  - `ReportsService` — monthly report with custom cycles, detailed report with filters
  - `CyclesService` — upsert, bulk import, fallback logic
  - `UsersService` — creation, role assignment, password hashing
  - `JwtAuthGuard` and `RolesGuard` — token validation, role checking
  - Schedule utility functions — slot calculation, second Friday detection
- **Note:** Verify `ts-jest` compatibility with Jest 30 before starting. Update `ts-jest` if needed.

### Backend E2E Tests
- **Framework:** Jest + Supertest
- **Database:** Separate PostgreSQL test database (local)
- **Scope:** All API endpoints with full request/response validation
- **Setup:**
  - `.env.test` file with `DATABASE_URL` pointing to local test database (e.g., `postgresql://localhost:5432/curaciones_test`)
  - Test helper `test/setup.ts` that bootstraps the NestJS app with test configuration
  - `synchronize: true` for test DB (auto-creates schema from entities)
  - Test database seeded with fixtures before each test suite
  - Database cleaned between test suites (truncate all tables)
  - Factories for generating test data (patients, curaciones, appointments, users)
  - Throttler disabled in test module to avoid spurious 429s
- **Key flows:**
  - Auth: login success/failure, token expiration, role-based access
  - Patient lifecycle: create → update → discharge → readmit → delete
  - Curacion lifecycle: create (with/without appointment) → edit (admin) → audit trail
  - Appointment scheduling: slot availability, conflict detection, second-Friday rule
  - Reports: monthly with custom cycles, detailed with all filter combinations
  - Admin operations: user management, cycle management

### Frontend Unit Tests
- **Framework:** Vitest + React Testing Library
- **Dependencies to install:** `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`
- **Configuration:**
  - Add `test` config to `vite.config.ts` with `environment: 'jsdom'` and setup files
  - Add `"test": "vitest"` script to `package.json`
- **Scope:** All components, custom hooks, context providers
- **Key areas:**
  - `AuthContext` — login/logout state, token management, role detection
  - Form components — validation, submission, error display
  - Report components — chart rendering with mock data, Excel export
  - Agenda views — day/week/month rendering, navigation
  - Patient components — status badges, action buttons, search

### Frontend E2E Tests
- **Framework:** Playwright
- **Dependencies to install:** `@playwright/test`
- **Configuration:**
  - `playwright.config.ts` with `webServer` config to start both backend and frontend
  - Uses same local test database as backend E2E tests
  - Browser installation: `npx playwright install`
- **Scope:** Critical user flows
- **Key flows:**
  - Login → navigate to patients → create patient → create curacion with appointment
  - Login → agenda → navigate between views → verify appointments
  - Login → reports → filter → verify charts → export Excel
  - Admin: login → manage users → edit curacion → verify audit trail
  - Discharge patient → verify appointment handling → readmit

### CI Pipeline
- **Platform:** GitHub Actions
- **Workflow file:** `.github/workflows/ci.yml`
- **Triggers:** On push and PR to `main`
- **Jobs:**
  - Backend: install → unit tests → e2e tests (with PostgreSQL service container)
  - Frontend: install → unit tests → e2e tests (with Playwright)
- **Deploy gate:** Configure Render to deploy only when CI passes (via GitHub status checks on the `main` branch)

## 2. Swagger / OpenAPI Documentation

### Setup
- `@nestjs/swagger` is already installed in `package.json`
- Configure in `main.ts` with conditional check: enable when `NODE_ENV` is undefined or `'development'`
- Swagger UI available at `/api/docs` in development
- Add `NODE_ENV=development` to local `.env` file

### Implementation
- Add `@ApiTags()` to all controllers
- Add `@ApiOperation()` to all endpoints
- Add `@ApiResponse()` with status codes and descriptions
- Add `@ApiProperty()` to all DTOs (many already use class-validator which auto-maps)
- Add `@ApiBearerAuth()` to protected endpoints
- Group endpoints by resource: Auth, Patients, Curaciones, Appointments, Reports, Cycles, Users

### Schema Generation
- Leverage existing class-validator decorators for automatic schema inference
- Add explicit examples where helpful (RUT format, date formats, enum values)

## 3. Automated Local Backups

### Script
- Bash script: `scripts/backup-db.sh`
- Uses `pg_dump` to dump the production database
- Connection string read from `scripts/.env.backup` (separate from development `.env`)
- `scripts/.env.backup` must be in `.gitignore`
- Output format: compressed SQL (`.sql.gz`)
- Filename pattern: `curaciones-YYYY-MM-DD-HHMMSS.sql.gz`
- Backups stored in `~/curaciones-backups/`
- **Security note:** Production credentials on local machine is an accepted risk for a small clinic app. Keep `.env.backup` separate from development credentials.

### Rotation
- Keep last 14 daily backups
- Script deletes older backups automatically after successful dump

### Scheduling
- macOS `launchd` plist for daily execution
- Plist file: `scripts/com.curaciones.backup.plist`
- Runs daily at a configurable time (default: 08:00)
- Logs output to `~/curaciones-backups/backup.log`

### Setup Instructions
- README section with setup steps for `launchd`
- One-time: `launchctl load` command

## 4. Rate Limiting

### Setup
- Install `@nestjs/throttler`
- Configure globally with sensible defaults
- Disable throttler in test environment (`NODE_ENV=test`) to avoid spurious 429s in E2E tests

### Rules
| Endpoint | Limit | Window | Rationale |
|----------|-------|--------|-----------|
| `POST /api/auth/login` | 5 requests | 60 seconds | Brute force protection |
| All other endpoints | 100 requests | 60 seconds | General abuse protection |

### Implementation
- `ThrottlerModule` configured in `AppModule`
- `@SkipThrottle()` on health endpoint
- Custom throttle decorator for login with stricter limits
- Returns 429 Too Many Requests with retry-after header

## 5. General Audit Log

### Consolidation Strategy
The codebase already has two audit mechanisms:
- `CuracionEdit` — tracks curacion edits with reason, user, timestamp
- `PatientStatusChange` — tracks discharge/readmission with type, user, timestamp

**Decision:** Keep `CuracionEdit` and `PatientStatusChange` as-is. They serve domain-specific purposes with richer context (e.g., `reason` field in CuracionEdit). The general `AuditLog` captures everything else (patient CRUD, appointment CRUD, user management, cycle changes) and provides a unified view. No duplication — the interceptor will skip endpoints that already have their own audit trail (curacion edits and patient status changes).

### Data Model
New entity: `AuditLog`

| Field | Type | Description |
|-------|------|-------------|
| id | number (PK, auto-increment) | Auto-generated |
| userId | number (FK → User) | Who performed the action |
| username | string | Denormalized for quick display |
| action | enum | `CREATE`, `UPDATE`, `DELETE` |
| entity | string | Entity name (e.g., 'Patient', 'Curacion') |
| entityId | number | ID of the affected entity |
| payload | jsonb | Request body snapshot (what was sent) |
| ipAddress | string (nullable) | Request IP |
| createdAt | timestamp | When the action occurred |

**Note on diffs:** The interceptor captures only the request payload (the "after"), not a before/after diff. This avoids the complexity of pre-fetching entity state. For a small clinic app, knowing "who did what and when" with the submitted data is sufficient.

### Implementation
- NestJS interceptor: `AuditLogInterceptor`
- Automatically captures all POST, PUT, DELETE requests
- **Excludes:** `POST /auth/login`, `PUT /curaciones/:id` (has CuracionEdit), `POST /patients/:id/discharge`, `POST /patients/:id/readmit` (have PatientStatusChange)
- Extracts user from JWT token
- Captures request body as `payload`
- Does NOT log GET requests (read-only)

### API
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `GET /api/audit-logs` | GET | Admin | List audit logs with pagination |
| `GET /api/audit-logs?entity=Patient&entityId=xxx` | GET | Admin | Filter by entity |
| `GET /api/audit-logs?userId=xxx` | GET | Admin | Filter by user |
| `GET /api/audit-logs?from=YYYY-MM-DD&to=YYYY-MM-DD` | GET | Admin | Filter by date range |

### Frontend
- Admin-only page at `/audit-log`
- Table view with filters: entity type, user, date range
- Expandable rows showing payload details
- Pagination

## Additional Fix: `synchronize` in Production

While working on the testing infrastructure, fix the current `app.module.ts` to use `synchronize: process.env.NODE_ENV !== 'production'` instead of `synchronize: true`. This prevents accidental schema changes in production.

## Dependencies & Order

```
1. Testing infrastructure (sets up test DB, factories, CI, fix synchronize)
   ↓
2. Swagger (documents existing API, helps with testing)
   ↓
3. Rate limiting (small, independent)
   ↓
4. Audit log (new entity + interceptor + admin page)
   ↓
5. Backups (independent, can be done anytime)
```

Testing comes first because all subsequent features should be built with TDD.

## Out of Scope
- Email/SMS notifications (Enfoque A)
- Photo uploads (Enfoque A)
- PWA capabilities (Enfoque A)
- PDF export (Enfoque A)
- Dashboard improvements (Enfoque A)
- Migration to UUIDs (not needed, keep numeric IDs for consistency)
- `@nestjs/config` ConfigModule (nice-to-have, not blocking)
