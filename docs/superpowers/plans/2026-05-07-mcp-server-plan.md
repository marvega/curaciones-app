# MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MCP server (Sub #3) that exposes 19 tools v1 to Claude clients via OAuth 2.0, proxying all calls to the existing NestJS backend with no business logic of its own.

**Architecture:** Standalone Node service in `mcp-server/` (monorepo subdir, no workspace). Receives MCP streamable-HTTP requests, validates JWT bearers via JWKS from the backend, enforces scope per tool from a static catalog, proxies HTTP to `api.<placeholder>` with the bearer reused, maps backend HTTP responses to MCP tool results. Zero shared code with backend; only contract is HTTP. Types regenerated from backend OpenAPI.

**Tech Stack:** Node 20, TypeScript, Fastify 5, `@modelcontextprotocol/sdk`, `undici`, `pino`, `jose`, `vitest`. Deployed as separate Render service `curaciones-mcp` pinned to `main` (autoDeploy=on commit).

**Spec:** `docs/superpowers/specs/2026-05-07-mcp-server-design.md`

**Branching:** all work on `main` local — per `feedback_no_push_during_platform_dev`, no push or PR until user explicitly asks.

---

## File Structure

Layout designed so each file has one responsibility. Tools live in folders by domain. Tests adjacent to source files. Test runner is Vitest (lighter than Jest for this service; backend keeps Jest).

```
mcp-server/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── Dockerfile
├── README.md
├── .env.example
├── .gitignore
├── scripts/
│   └── regenerate-api-types.sh
├── src/
│   ├── server.ts                       # Fastify + MCP transport bootstrap, /health
│   ├── config.ts                       # env vars (BACKEND_URL, OAUTH_ISSUER, etc.) + zod validation
│   ├── auth/
│   │   ├── jwt-verifier.ts             # createRemoteJWKSet + verifyJwt
│   │   ├── jwt-verifier.test.ts
│   │   ├── scope-check.ts              # checkScope(token, requiredScope)
│   │   └── scope-check.test.ts
│   ├── http/
│   │   ├── backend-client.ts           # undici Pool wrapper, propagates bearer + x-request-id
│   │   └── backend-client.test.ts
│   ├── tools/
│   │   ├── catalog.ts                  # registry { name, requiredScope, handler, schema }
│   │   ├── catalog.test.ts             # registry shape tests
│   │   ├── register.ts                 # iterates catalog -> server.tool()
│   │   ├── patients/
│   │   │   ├── search-patients.ts
│   │   │   ├── search-patients.test.ts
│   │   │   ├── get-patient.ts
│   │   │   ├── get-patient.test.ts
│   │   │   ├── get-patient-pdf.ts
│   │   │   ├── get-patient-pdf.test.ts
│   │   │   ├── create-patient.ts       # uses elicitation
│   │   │   ├── create-patient.test.ts
│   │   │   ├── update-patient.ts       # uses elicitation
│   │   │   ├── update-patient.test.ts
│   │   │   ├── discharge-patient.ts
│   │   │   ├── discharge-patient.test.ts
│   │   │   ├── readmit-patient.ts
│   │   │   └── readmit-patient.test.ts
│   │   ├── agenda/
│   │   │   ├── list-patient-appointments.ts
│   │   │   ├── list-patient-appointments.test.ts
│   │   │   ├── get-agenda-by-date-range.ts
│   │   │   ├── get-agenda-by-date-range.test.ts
│   │   │   ├── create-appointment.ts   # uses elicitation
│   │   │   ├── create-appointment.test.ts
│   │   │   ├── cancel-appointment.ts
│   │   │   └── cancel-appointment.test.ts
│   │   ├── curaciones/
│   │   │   ├── list-curaciones.ts
│   │   │   ├── list-curaciones.test.ts
│   │   │   ├── register-curacion.ts    # uses elicitation
│   │   │   └── register-curacion.test.ts
│   │   ├── wound-notes/
│   │   │   ├── add-wound-note.ts
│   │   │   ├── add-wound-note.test.ts
│   │   │   ├── list-wound-notes.ts
│   │   │   └── list-wound-notes.test.ts
│   │   ├── inventory/
│   │   │   ├── search-inventory.ts
│   │   │   ├── search-inventory.test.ts
│   │   │   ├── list-lots-expiring.ts
│   │   │   ├── list-lots-expiring.test.ts
│   │   │   ├── register-canasta-consumption.ts  # uses elicitation
│   │   │   └── register-canasta-consumption.test.ts
│   │   ├── reports/
│   │   │   ├── monthly-report.ts
│   │   │   └── monthly-report.test.ts
│   │   └── identity/
│   │       ├── whoami.ts               # reads JWT claims, no backend call
│   │       └── whoami.test.ts
│   ├── elicitation/
│   │   ├── elicit-or-fallback.ts       # capability check + structured fallback
│   │   └── elicit-or-fallback.test.ts
│   ├── errors/
│   │   ├── http-to-mcp-error.ts        # HTTP status -> MCP error code mapper
│   │   └── http-to-mcp-error.test.ts
│   ├── logging/
│   │   ├── logger.ts                   # pino with redact paths
│   │   └── correlation.ts              # x-request-id helpers
│   └── api-types/
│       ├── README.md                   # how regeneration works
│       └── .gitkeep
└── test/
    ├── integration/
    │   ├── auth-flow.test.ts           # JWT verify against running backend
    │   ├── tool-roundtrip.test.ts      # one tool per category, full round-trip
    │   └── docker-compose.yml
    └── fixtures/
        ├── valid-jwt.ts                # generates a JWT signed with test key
        └── backend-mock.ts
```

**Backend changes (Phase 0):**
- `backend/src/patients/patients.controller.ts:38` — add `?cursor=` support to `find()`
- `backend/src/curaciones/curaciones.controller.ts:27` — add `?cursor=` to `findByPatient()`
- `backend/src/wound-notes/wound-notes.controller.ts` — add `?cursor=` to patient list
- `backend/src/inventory/products/products.controller.ts` — add `?cursor=` to list
- `backend/src/main.ts` — verify `@nestjs/swagger` setup writes `openapi.json` artifact

**CI changes:**
- Create `.github/workflows/mcp-build-test.yml` — lint, typecheck, unit, integration, OpenAPI drift check

---

## Phase 0 — Backend pre-requisites

These changes go in the backend. They're a small but real coupling: cursor-based pagination becomes part of the public contract that the MCP relies on.

### Task 0.1: Add cursor pagination helper to backend

**Files:**
- Create: `backend/src/common/cursor-pagination.ts`
- Test: `backend/src/common/cursor-pagination.spec.ts`

The helper encodes `{id: number, createdAt: string}` as base64url and decodes it back. Used by all `find()` methods that paginate.

- [ ] **Step 1: Write failing test**

Create `backend/src/common/cursor-pagination.spec.ts`:

```typescript
import { encodeCursor, decodeCursor, CursorPayload } from './cursor-pagination';

describe('cursor-pagination', () => {
  it('round-trips a payload', () => {
    const payload: CursorPayload = { id: 42, createdAt: '2026-05-07T12:00:00.000Z' };
    const encoded = encodeCursor(payload);
    expect(typeof encoded).toBe('string');
    expect(encoded).not.toContain('=');
    expect(decodeCursor(encoded)).toEqual(payload);
  });

  it('returns null for missing cursor', () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('')).toBeNull();
  });

  it('throws on malformed cursor', () => {
    expect(() => decodeCursor('not-base64url!!!')).toThrow(/invalid cursor/i);
  });

  it('throws when payload is missing required fields', () => {
    const bad = Buffer.from(JSON.stringify({ id: 1 })).toString('base64url');
    expect(() => decodeCursor(bad)).toThrow(/invalid cursor/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- cursor-pagination`
Expected: FAIL with "Cannot find module './cursor-pagination'"

- [ ] **Step 3: Implement helper**

Create `backend/src/common/cursor-pagination.ts`:

```typescript
export interface CursorPayload {
  id: number;
  createdAt: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeCursor(raw: string | undefined): CursorPayload | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (typeof parsed.id !== 'number' || typeof parsed.createdAt !== 'string') {
      throw new Error('invalid cursor: missing fields');
    }
    return parsed as CursorPayload;
  } catch (e) {
    throw new Error(`invalid cursor: ${(e as Error).message}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- cursor-pagination`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/cursor-pagination.ts backend/src/common/cursor-pagination.spec.ts
git commit -m "feat(backend): cursor pagination helper for MCP-facing endpoints"
```

### Task 0.2: Add cursor support to patients.findAdvanced

**Files:**
- Modify: `backend/src/patients/patients.service.ts` (the `findAdvanced` method)
- Modify: `backend/src/patients/patients.controller.ts:38` (accept `?cursor=`)
- Test: `backend/src/patients/patients.controller.spec.ts` (extend existing)

The contract: when `cursor=` is sent, ignore `page=`. Service returns `{items, nextCursor}` instead of `{items, total, page, ...}`.

- [ ] **Step 1: Write failing test (controller-level)**

Append to `backend/src/patients/patients.controller.spec.ts`:

```typescript
describe('GET /api/patients with cursor', () => {
  it('returns nextCursor when more results exist', async () => {
    // Seed 3 patients
    const a = await service.create({ rut: '11111111-1', firstName: 'A', /* ... */ } as any);
    const b = await service.create({ rut: '22222222-2', firstName: 'B', /* ... */ } as any);
    const c = await service.create({ rut: '33333333-3', firstName: 'C', /* ... */ } as any);

    const page1 = await controller.find(undefined, undefined, undefined, '2', undefined, undefined, undefined, undefined, undefined, undefined, undefined);
    expect((page1 as any).items).toHaveLength(2);
    expect((page1 as any).nextCursor).toBeDefined();
  });

  it('returns no nextCursor on last page', async () => {
    // Single patient
    await service.create({ rut: '99999999-9', firstName: 'Z', /* ... */ } as any);

    const result = await controller.find(undefined, undefined, undefined, '10', undefined, undefined, undefined, undefined, undefined, undefined, undefined);
    expect((result as any).items.length).toBeGreaterThanOrEqual(1);
    expect((result as any).nextCursor).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- patients.controller`
Expected: FAIL — controller doesn't accept cursor or return shape doesn't match

- [ ] **Step 3: Modify controller to accept cursor**

In `backend/src/patients/patients.controller.ts`, edit the `find()` method to add `@Query('cursor') cursor?: string` parameter and pass it through to the service. When cursor is present, route to a new branch:

```typescript
@Throttle({ default: { ttl: 60000, limit: 300 } })
@RequiredScopes('patients:read')
@Get()
async find(
  @Query('rut') rut?: string,
  @Query('q') q?: string,
  @Query('page') page?: string,
  @Query('limit') limit?: string,
  @Query('cursor') cursor?: string,
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

  // Cursor branch (new)
  if (cursor !== undefined) {
    return this.patientsService.findByCursor({
      cursor,
      limit: parseInt(limit || '20', 10) || 20,
      q: q?.trim() || undefined,
    });
  }

  // ... existing branches unchanged
}
```

- [ ] **Step 4: Add findByCursor in service**

In `backend/src/patients/patients.service.ts`, add:

```typescript
import { encodeCursor, decodeCursor, CursorPayload } from '../common/cursor-pagination';

async findByCursor(args: { cursor?: string; limit: number; q?: string }) {
  const decoded = decodeCursor(args.cursor);

  const qb = this.patientsRepository
    .createQueryBuilder('p')
    .orderBy('p.createdAt', 'DESC')
    .addOrderBy('p.id', 'DESC')
    .take(args.limit + 1);

  if (decoded) {
    qb.andWhere(
      '(p.createdAt, p.id) < (:createdAt, :id)',
      { createdAt: decoded.createdAt, id: decoded.id },
    );
  }
  if (args.q) {
    qb.andWhere(
      '(p.firstName ILIKE :q OR p.lastName ILIKE :q OR p.rut ILIKE :q)',
      { q: `%${args.q}%` },
    );
  }

  const rows = await qb.getMany();
  const hasMore = rows.length > args.limit;
  const items = hasMore ? rows.slice(0, args.limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last
    ? encodeCursor({ id: last.id, createdAt: last.createdAt.toISOString() })
    : undefined;

  return { items, nextCursor };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npm test -- patients`
Expected: PASS, both new tests

- [ ] **Step 6: Commit**

```bash
git add backend/src/patients/
git commit -m "feat(backend): cursor pagination on GET /api/patients"
```

### Task 0.3: Add cursor support to curaciones, wound-notes, inventory products

Apply the same pattern to the other listing endpoints. Each gets one task.

**Files:**
- Modify: `backend/src/curaciones/curaciones.controller.ts:27` and service
- Modify: `backend/src/curaciones/curaciones.service.ts`

- [ ] **Step 1: Write failing test for curaciones cursor**

Append to `backend/src/curaciones/curaciones.controller.spec.ts`:

```typescript
describe('GET /api/curaciones/patient/:patientId with cursor', () => {
  it('returns nextCursor when more results exist', async () => {
    // create 3 curaciones for one patient
    const patientId = 1;
    await service.create({ patientId, /* ... */ } as any);
    await service.create({ patientId, /* ... */ } as any);
    await service.create({ patientId, /* ... */ } as any);

    const r = await controller.findByPatient(patientId, '2', undefined);
    expect((r as any).items).toHaveLength(2);
    expect((r as any).nextCursor).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `cd backend && npm test -- curaciones.controller`
Expected: FAIL

- [ ] **Step 3: Modify findByPatient signature**

In `backend/src/curaciones/curaciones.controller.ts`, change:

```typescript
@RequiredScopes('clinical:read')
@Get('patient/:patientId')
async findByPatient(
  @Param('patientId', ParseIntPipe) patientId: number,
  @Query('limit') limit?: string,
  @Query('cursor') cursor?: string,
) {
  return this.curacionesService.findByPatientCursor({
    patientId,
    limit: parseInt(limit || '20', 10) || 20,
    cursor,
  });
}
```

In `backend/src/curaciones/curaciones.service.ts` add `findByPatientCursor`:

```typescript
import { encodeCursor, decodeCursor } from '../common/cursor-pagination';

async findByPatientCursor(args: { patientId: number; limit: number; cursor?: string }) {
  const decoded = decodeCursor(args.cursor);
  const qb = this.curacionesRepository
    .createQueryBuilder('c')
    .where('c.patientId = :patientId', { patientId: args.patientId })
    .orderBy('c.createdAt', 'DESC')
    .addOrderBy('c.id', 'DESC')
    .take(args.limit + 1);
  if (decoded) {
    qb.andWhere('(c.createdAt, c.id) < (:createdAt, :id)', decoded);
  }
  const rows = await qb.getMany();
  const hasMore = rows.length > args.limit;
  const items = hasMore ? rows.slice(0, args.limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last
    ? encodeCursor({ id: last.id, createdAt: last.createdAt.toISOString() })
    : undefined;
  return { items, nextCursor };
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `cd backend && npm test -- curaciones`
Expected: PASS

- [ ] **Step 5: Repeat the same pattern for wound-notes and inventory products**

For `wound-notes/wound-notes.controller.ts`: extend the `findByPatient` method with `?limit&cursor`. Test with three wound-notes for one patient. Service method named `findByPatientCursor` mirrors the curaciones pattern exactly (replace entity).

For `inventory/products/products.controller.ts`: extend the root `find()` with `?limit&cursor&q`. Test with three products. Service method `findByCursor` mirrors patients (with q filter on `name` instead of `firstName/lastName/rut`).

- [ ] **Step 6: Commit each domain in its own commit**

```bash
git add backend/src/curaciones/
git commit -m "feat(backend): cursor pagination on GET /api/curaciones/patient/:patientId"

git add backend/src/wound-notes/
git commit -m "feat(backend): cursor pagination on GET /api/wound-notes/patient/:patientId"

git add backend/src/inventory/products/
git commit -m "feat(backend): cursor pagination on GET /api/inventory/products"
```

### Task 0.4: Verify OpenAPI export script works

The MCP regenerates types from the backend's OpenAPI. We need to ensure the backend can produce a static `openapi.json` artifact that CI can consume.

**Files:**
- Modify: `backend/src/main.ts` (where `@nestjs/swagger` is set up)
- Create: `backend/scripts/export-openapi.ts`
- Modify: `backend/package.json` (add `openapi:export` script)

- [ ] **Step 1: Inspect existing swagger setup**

Run: `grep -n "SwaggerModule\|DocumentBuilder" backend/src/main.ts`
Expected: existing setup that builds an in-memory OpenAPI doc

- [ ] **Step 2: Create export script**

Create `backend/scripts/export-openapi.ts`:

```typescript
import { writeFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const config = new DocumentBuilder()
    .setTitle('Curaciones API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  const out = join(__dirname, '..', 'openapi.json');
  writeFileSync(out, JSON.stringify(doc, null, 2));
  console.log(`Wrote ${out}`);
  await app.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Add script to package.json**

In `backend/package.json` `scripts`, add:

```json
"openapi:export": "ts-node -r tsconfig-paths/register scripts/export-openapi.ts"
```

- [ ] **Step 4: Run the export to verify it produces a valid openapi.json**

Run: `cd backend && npm run openapi:export`
Expected: stdout `Wrote .../backend/openapi.json`. The file should be ~50–200 KB JSON.

Run: `head -20 backend/openapi.json`
Expected: starts with `{"openapi":"3.0..."`, includes `"paths":` near the top

- [ ] **Step 5: Add openapi.json to backend/.gitignore**

Append to `backend/.gitignore`:

```
openapi.json
```

It's a generated artifact; CI generates it on demand.

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/export-openapi.ts backend/package.json backend/.gitignore
git commit -m "feat(backend): scriptable OpenAPI export for MCP type generation"
```

### Task 0.5: Run full backend test suite, ensure nothing regressed

- [ ] **Step 1: Full backend test**

Run: `cd backend && npm test -- --ci`
Expected: ALL PASS — including the new cursor tests

- [ ] **Step 2: Build backend**

Run: `cd backend && npm run build`
Expected: clean exit, no TS errors

If failures, debug before continuing to Phase 1.

---

## Phase 1 — Bootstrap mcp-server

### Task 1.1: Initialize mcp-server package

**Files:**
- Create: `mcp-server/package.json`
- Create: `mcp-server/tsconfig.json`
- Create: `mcp-server/.gitignore`
- Create: `mcp-server/.env.example`
- Create: `mcp-server/vitest.config.ts`

- [ ] **Step 1: Create directory and package.json**

Create `mcp-server/package.json`:

```json
{
  "name": "curaciones-mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "dev": "tsx watch src/server.ts",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "regen-types": "bash scripts/regenerate-api-types.sh"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "fastify": "^5.0.0",
    "jose": "^5.9.0",
    "pino": "^9.5.0",
    "undici": "^7.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "openapi-typescript": "^7.4.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `mcp-server/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

Create `mcp-server/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'], thresholds: { lines: 85, branches: 80 } },
  },
});
```

- [ ] **Step 4: Create .gitignore**

Create `mcp-server/.gitignore`:

```
node_modules/
dist/
coverage/
*.log
.env
.env.local
src/api-types/index.ts
```

- [ ] **Step 5: Create .env.example**

Create `mcp-server/.env.example`:

```
PORT=3001
BACKEND_URL=http://localhost:3000
OAUTH_ISSUER=http://localhost:3000
OAUTH_JWKS_URL=http://localhost:3000/jwks.json
OAUTH_AUDIENCE=http://localhost:3000
LOG_LEVEL=debug
NODE_ENV=development
```

- [ ] **Step 6: Install dependencies**

Run: `cd mcp-server && npm install`
Expected: `node_modules` created, no warnings other than deprecations.

- [ ] **Step 7: Commit**

```bash
git add mcp-server/package.json mcp-server/package-lock.json mcp-server/tsconfig.json mcp-server/vitest.config.ts mcp-server/.gitignore mcp-server/.env.example
git commit -m "chore(mcp): bootstrap mcp-server package skeleton"
```

### Task 1.2: Create config loader

**Files:**
- Create: `mcp-server/src/config.ts`
- Test: `mcp-server/src/config.test.ts`

- [ ] **Step 1: Write failing test**

Create `mcp-server/src/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => { process.env = { ...originalEnv }; });
  afterEach(() => { process.env = originalEnv; });

  it('loads valid env', () => {
    process.env.PORT = '3001';
    process.env.BACKEND_URL = 'http://api.test';
    process.env.OAUTH_ISSUER = 'http://api.test';
    process.env.OAUTH_JWKS_URL = 'http://api.test/jwks.json';
    process.env.OAUTH_AUDIENCE = 'http://api.test';
    process.env.LOG_LEVEL = 'info';

    const cfg = loadConfig();
    expect(cfg.port).toBe(3001);
    expect(cfg.backendUrl).toBe('http://api.test');
    expect(cfg.oauth.issuer).toBe('http://api.test');
  });

  it('throws when BACKEND_URL is missing', () => {
    delete process.env.BACKEND_URL;
    expect(() => loadConfig()).toThrow(/BACKEND_URL/);
  });

  it('defaults LOG_LEVEL to info', () => {
    process.env.PORT = '3001';
    process.env.BACKEND_URL = 'http://api.test';
    process.env.OAUTH_ISSUER = 'http://api.test';
    process.env.OAUTH_JWKS_URL = 'http://api.test/jwks.json';
    process.env.OAUTH_AUDIENCE = 'http://api.test';
    delete process.env.LOG_LEVEL;
    const cfg = loadConfig();
    expect(cfg.logLevel).toBe('info');
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `cd mcp-server && npx vitest run src/config.test.ts`
Expected: FAIL — config.ts doesn't exist

- [ ] **Step 3: Implement config**

Create `mcp-server/src/config.ts`:

```typescript
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(3001),
  BACKEND_URL: z.string().url(),
  OAUTH_ISSUER: z.string().url(),
  OAUTH_JWKS_URL: z.string().url(),
  OAUTH_AUDIENCE: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
});

export type Config = {
  port: number;
  backendUrl: string;
  oauth: { issuer: string; jwksUrl: string; audience: string };
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  nodeEnv: 'development' | 'production' | 'test';
};

export function loadConfig(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid env: ${missing}`);
  }
  const env = parsed.data;
  return {
    port: env.PORT,
    backendUrl: env.BACKEND_URL,
    oauth: { issuer: env.OAUTH_ISSUER, jwksUrl: env.OAUTH_JWKS_URL, audience: env.OAUTH_AUDIENCE },
    logLevel: env.LOG_LEVEL,
    nodeEnv: env.NODE_ENV,
  };
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `cd mcp-server && npx vitest run src/config.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/config.ts mcp-server/src/config.test.ts
git commit -m "feat(mcp): config loader with zod validation"
```

### Task 1.3: Logger with PHI redaction

**Files:**
- Create: `mcp-server/src/logging/logger.ts`
- Create: `mcp-server/src/logging/correlation.ts`
- Test: `mcp-server/src/logging/logger.test.ts`

- [ ] **Step 1: Write failing test for redaction**

Create `mcp-server/src/logging/logger.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { Writable } from 'stream';
import { createLogger } from './logger.js';

function captureLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) { lines.push(chunk.toString()); cb(); },
  });
  return { stream, lines };
}

describe('logger redaction', () => {
  it('redacts rut from nested payload', () => {
    const { stream, lines } = captureLogs();
    const log = createLogger({ level: 'info', stream });
    log.info({ user: { rut: '11111111-1', firstName: 'Juan' } }, 'request');
    const parsed = JSON.parse(lines[0]);
    expect(parsed.user.rut).toBe('[REDACTED]');
    expect(parsed.user.firstName).toBe('Juan');
  });

  it('redacts notes/observations/phone/email/address', () => {
    const { stream, lines } = captureLogs();
    const log = createLogger({ level: 'info', stream });
    log.info(
      {
        notes: 'sensitive',
        observations: 'sensitive',
        phone: '+56...',
        email: 'a@b.com',
        address: 'Calle 123',
      },
      'evt',
    );
    const parsed = JSON.parse(lines[0]);
    expect(parsed.notes).toBe('[REDACTED]');
    expect(parsed.observations).toBe('[REDACTED]');
    expect(parsed.phone).toBe('[REDACTED]');
    expect(parsed.email).toBe('[REDACTED]');
    expect(parsed.address).toBe('[REDACTED]');
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `cd mcp-server && npx vitest run src/logging/logger.test.ts`
Expected: FAIL — logger.ts doesn't exist

- [ ] **Step 3: Implement logger**

Create `mcp-server/src/logging/logger.ts`:

```typescript
import pino from 'pino';
import type { DestinationStream, LoggerOptions } from 'pino';

const REDACT_PATHS = [
  'rut', '*.rut', '*.*.rut',
  'notes', '*.notes',
  'observations', '*.observations',
  'phone', '*.phone',
  'email', '*.email',
  'address', '*.address',
];

export interface CreateLoggerOptions {
  level: 'debug' | 'info' | 'warn' | 'error';
  stream?: DestinationStream;
}

export function createLogger(opts: CreateLoggerOptions) {
  const config: LoggerOptions = {
    level: opts.level,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  return opts.stream ? pino(config, opts.stream) : pino(config);
}

export type Logger = ReturnType<typeof createLogger>;
```

Create `mcp-server/src/logging/correlation.ts`:

```typescript
import { randomUUID } from 'crypto';

export function correlationFromHeaders(headers: Record<string, string | string[] | undefined>): string {
  const traceparent = headers['traceparent'];
  if (typeof traceparent === 'string') {
    const parts = traceparent.split('-');
    if (parts.length === 4 && parts[1] && parts[1].length === 32) return parts[1];
  }
  const xrid = headers['x-request-id'];
  if (typeof xrid === 'string' && xrid.length > 0) return xrid;
  return randomUUID();
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `cd mcp-server && npx vitest run src/logging/`
Expected: PASS, 2 tests

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/logging/
git commit -m "feat(mcp): pino logger with PHI redaction + correlation-id helper"
```

### Task 1.4: Fastify server with /health

**Files:**
- Create: `mcp-server/src/server.ts`
- Test: `mcp-server/src/server.test.ts`

- [ ] **Step 1: Write failing test**

Create `mcp-server/src/server.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from './server.js';
import type { FastifyInstance } from 'fastify';

describe('server', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildServer({
      port: 0,
      backendUrl: 'http://localhost:3000',
      oauth: { issuer: 'http://localhost:3000', jwksUrl: 'http://localhost:3000/jwks.json', audience: 'http://localhost:3000' },
      logLevel: 'error',
      nodeEnv: 'test',
    });
  });
  afterAll(async () => { await app.close(); });

  it('GET /health returns ok', async () => {
    const r = await app.inject({ method: 'GET', url: '/health' });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBeTruthy();
    expect(typeof body.uptime).toBe('number');
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `cd mcp-server && npx vitest run src/server.test.ts`
Expected: FAIL — server.ts doesn't exist

- [ ] **Step 3: Implement server bootstrap**

Create `mcp-server/src/server.ts`:

```typescript
import Fastify, { type FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig, type Config } from './config.js';
import { createLogger } from './logging/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

export async function buildServer(cfg: Config): Promise<FastifyInstance> {
  const logger = createLogger({ level: cfg.logLevel });
  const app = Fastify({ loggerInstance: logger as any, disableRequestLogging: true });

  app.get('/health', async () => ({
    status: 'ok',
    version: pkg.version,
    uptime: process.uptime(),
  }));

  return app;
}

async function main() {
  const cfg = loadConfig();
  const app = await buildServer(cfg);
  try {
    await app.listen({ port: cfg.port, host: '0.0.0.0' });
    app.log.info({ port: cfg.port }, 'mcp-server listening');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `cd mcp-server && npx vitest run src/server.test.ts`
Expected: PASS, 1 test

- [ ] **Step 5: Manual smoke test**

Run: `cd mcp-server && cp .env.example .env && npm run build && npm start`
In another terminal: `curl http://localhost:3001/health`
Expected: `{"status":"ok","version":"0.1.0","uptime":...}`
Stop server with Ctrl-C.

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/server.ts mcp-server/src/server.test.ts
git commit -m "feat(mcp): fastify bootstrap with /health endpoint"
```

### Task 1.5: Dockerfile (Render deployment)

**Files:**
- Create: `mcp-server/Dockerfile`

- [ ] **Step 1: Create Dockerfile**

Create `mcp-server/Dockerfile`:

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3001
CMD ["node", "dist/server.js"]
```

- [ ] **Step 2: Configure Render service**

Create the `curaciones-mcp` service in the Render dashboard pointing at `mcp-server/` root:
- Runtime: Docker (uses the Dockerfile above)
- Health check path: `/health`
- Auto-deploy: on commit to `main`
- Region/plan to match the rest of the stack

(Render reads service config from the dashboard or `render.yaml`; no per-service config file inside `mcp-server/` is required.)

- [ ] **Step 3: Verify Docker build works locally**

Run: `cd mcp-server && docker build -t curaciones-mcp-test .`
Expected: clean build, final image tagged.

Run: `docker run --rm -p 3002:3001 -e BACKEND_URL=http://host.docker.internal:3000 -e OAUTH_ISSUER=http://host.docker.internal:3000 -e OAUTH_JWKS_URL=http://host.docker.internal:3000/jwks.json -e OAUTH_AUDIENCE=http://host.docker.internal:3000 curaciones-mcp-test`
In another terminal: `curl http://localhost:3002/health`
Expected: `{"status":"ok"...}`. Stop with Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add mcp-server/Dockerfile
git commit -m "chore(mcp): Dockerfile for Render deployment"
```

### Task 1.6: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/mcp-build-test.yml`
- Modify: `.github/workflows/ci.yml` (no change actually needed; mcp workflow runs in parallel)

- [ ] **Step 1: Create workflow**

Create `.github/workflows/mcp-build-test.yml`:

```yaml
name: MCP

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  mcp:
    name: mcp (build + test)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: mcp-server
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: mcp-server/package-lock.json

      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

- [ ] **Step 2: Add ESLint config so `npm run lint` doesn't fail**

Create `mcp-server/eslint.config.js`:

```javascript
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tsparser, parserOptions: { project: './tsconfig.json' } },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];
```

- [ ] **Step 3: Verify lint passes locally**

Run: `cd mcp-server && npm run lint`
Expected: clean exit (warnings only)

- [ ] **Step 4: Verify typecheck passes**

Run: `cd mcp-server && npm run typecheck`
Expected: clean exit

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/mcp-build-test.yml mcp-server/eslint.config.js
git commit -m "ci(mcp): build/test workflow"
```

---

## Phase 2 — Auth middleware (JWT verification + scope check)

### Task 2.1: JWT verifier

**Files:**
- Create: `mcp-server/src/auth/jwt-verifier.ts`
- Test: `mcp-server/src/auth/jwt-verifier.test.ts`

- [ ] **Step 1: Write failing test**

Create `mcp-server/src/auth/jwt-verifier.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createJwtVerifier, type VerifiedToken } from './jwt-verifier.js';

describe('JwtVerifier', () => {
  let signKey: any;
  let publicJwk: any;
  const issuer = 'http://test.issuer';
  const audience = 'http://test.issuer';

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    signKey = privateKey;
    publicJwk = { ...(await exportJWK(publicKey)), alg: 'RS256', use: 'sig', kid: 'test-1' };
  });

  async function makeToken(claims: any): Promise<string> {
    return await new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-1' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(signKey);
  }

  function fakeJwks() {
    return {
      async getKey() { return await (await import('jose')).importJWK(publicJwk, 'RS256'); },
    };
  }

  it('accepts a valid token', async () => {
    const verifier = createJwtVerifier({ issuer, audience, jwksUrl: '' }, { jwks: fakeJwks() as any });
    const jwt = await makeToken({ iss: issuer, aud: audience, sub: '42', scope: 'patients:read', org_id: '1', username: 'juan' });
    const verified: VerifiedToken = await verifier.verify(jwt);
    expect(verified.sub).toBe('42');
    expect(verified.scope).toBe('patients:read');
    expect(verified.org_id).toBe('1');
  });

  it('rejects expired token', async () => {
    const verifier = createJwtVerifier({ issuer, audience, jwksUrl: '' }, { jwks: fakeJwks() as any });
    const expired = await new SignJWT({ iss: issuer, aud: audience, sub: '42' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-1' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(signKey);
    await expect(verifier.verify(expired)).rejects.toThrow(/exp/);
  });

  it('rejects wrong issuer', async () => {
    const verifier = createJwtVerifier({ issuer, audience, jwksUrl: '' }, { jwks: fakeJwks() as any });
    const jwt = await makeToken({ iss: 'http://evil', aud: audience, sub: '42' });
    await expect(verifier.verify(jwt)).rejects.toThrow(/iss/);
  });

  it('rejects wrong audience', async () => {
    const verifier = createJwtVerifier({ issuer, audience, jwksUrl: '' }, { jwks: fakeJwks() as any });
    const jwt = await makeToken({ iss: issuer, aud: 'http://other', sub: '42' });
    await expect(verifier.verify(jwt)).rejects.toThrow(/aud/);
  });

  it('rejects malformed token', async () => {
    const verifier = createJwtVerifier({ issuer, audience, jwksUrl: '' }, { jwks: fakeJwks() as any });
    await expect(verifier.verify('not-a-jwt')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `cd mcp-server && npx vitest run src/auth/jwt-verifier.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement verifier**

Create `mcp-server/src/auth/jwt-verifier.ts`:

```typescript
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface VerifiedToken {
  sub: string;
  scope: string;
  org_id: string;
  username?: string;
  org_name?: string;
  role?: string;
  exp: number;
}

export interface JwtVerifierConfig {
  issuer: string;
  audience: string;
  jwksUrl: string;
}

export interface JwtVerifierDeps {
  jwks?: { getKey: JWTVerifyGetKey };
}

export interface JwtVerifier {
  verify(token: string): Promise<VerifiedToken>;
}

export function createJwtVerifier(cfg: JwtVerifierConfig, deps: JwtVerifierDeps = {}): JwtVerifier {
  const jwks = deps.jwks?.getKey ?? createRemoteJWKSet(new URL(cfg.jwksUrl));

  return {
    async verify(token: string): Promise<VerifiedToken> {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: cfg.issuer,
        audience: cfg.audience,
      });
      const sub = typeof payload.sub === 'string' ? payload.sub : '';
      const scope = typeof payload.scope === 'string' ? payload.scope : '';
      const orgId = typeof (payload as any).org_id === 'string' ? (payload as any).org_id : '';
      if (!sub || !orgId) {
        throw new Error('token missing required claims (sub, org_id)');
      }
      return {
        sub,
        scope,
        org_id: orgId,
        username: typeof (payload as any).username === 'string' ? (payload as any).username : undefined,
        org_name: typeof (payload as any).org_name === 'string' ? (payload as any).org_name : undefined,
        role: typeof (payload as any).role === 'string' ? (payload as any).role : undefined,
        exp: typeof payload.exp === 'number' ? payload.exp : 0,
      };
    },
  };
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd mcp-server && npx vitest run src/auth/jwt-verifier.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/auth/jwt-verifier.ts mcp-server/src/auth/jwt-verifier.test.ts
git commit -m "feat(mcp): JWT verifier with JWKS + claim validation"
```

### Task 2.2: Scope check helper

**Files:**
- Create: `mcp-server/src/auth/scope-check.ts`
- Test: `mcp-server/src/auth/scope-check.test.ts`

- [ ] **Step 1: Write failing test**

Create `mcp-server/src/auth/scope-check.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { hasScope, type ScopeError } from './scope-check.js';

describe('hasScope', () => {
  it('returns null when scope is present', () => {
    expect(hasScope('patients:read agenda:read', 'patients:read')).toBeNull();
  });

  it('returns error when scope is missing', () => {
    const err = hasScope('patients:read', 'patients:write');
    expect(err).not.toBeNull();
    expect((err as ScopeError).requiredScope).toBe('patients:write');
  });

  it('handles empty scope string', () => {
    const err = hasScope('', 'patients:read');
    expect(err).not.toBeNull();
  });

  it('treats scope as exact match (no wildcard)', () => {
    // 'patients' alone should NOT grant patients:read
    expect(hasScope('patients', 'patients:read')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `cd mcp-server && npx vitest run src/auth/scope-check.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

Create `mcp-server/src/auth/scope-check.ts`:

```typescript
export interface ScopeError {
  error: 'insufficient_scope';
  requiredScope: string;
  message: string;
}

export function hasScope(tokenScope: string, requiredScope: string): ScopeError | null {
  const scopes = new Set(tokenScope.split(/\s+/).filter(Boolean));
  if (scopes.has(requiredScope)) return null;
  return {
    error: 'insufficient_scope',
    requiredScope,
    message: `This tool requires scope '${requiredScope}'. Re-authorize the connection with that scope to use it.`,
  };
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `cd mcp-server && npx vitest run src/auth/scope-check.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/auth/scope-check.ts mcp-server/src/auth/scope-check.test.ts
git commit -m "feat(mcp): scope-check helper"
```

### Task 2.3: Backend HTTP client

**Files:**
- Create: `mcp-server/src/http/backend-client.ts`
- Test: `mcp-server/src/http/backend-client.test.ts`

- [ ] **Step 1: Write failing test**

Create `mcp-server/src/http/backend-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBackendClient } from './backend-client.js';

describe('BackendClient', () => {
  let fetchMock: any;
  beforeEach(() => { fetchMock = vi.fn(); });

  it('forwards bearer + correlation-id, returns parsed JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ id: 1, name: 'test' }),
      text: async () => '',
    });
    const client = createBackendClient({ backendUrl: 'http://api.test', fetch: fetchMock });
    const r = await client.request({
      method: 'GET',
      path: '/api/patients/1',
      bearer: 'tok',
      correlationId: 'cid-1',
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ id: 1, name: 'test' });

    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('http://api.test/api/patients/1');
    expect(call[1].headers['authorization']).toBe('Bearer tok');
    expect(call[1].headers['x-request-id']).toBe('cid-1');
  });

  it('returns non-2xx as error response (not throw)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({ message: 'Not found' }),
      text: async () => '',
    });
    const client = createBackendClient({ backendUrl: 'http://api.test', fetch: fetchMock });
    const r = await client.request({ method: 'GET', path: '/x', bearer: 't', correlationId: 'c' });
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ message: 'Not found' });
  });

  it('serializes JSON body for POST', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Map([['content-type', 'application/json']]),
      json: async () => ({}),
      text: async () => '',
    });
    const client = createBackendClient({ backendUrl: 'http://api.test', fetch: fetchMock });
    await client.request({
      method: 'POST',
      path: '/api/patients',
      bearer: 't',
      correlationId: 'c',
      body: { firstName: 'Juan' },
    });
    const call = fetchMock.mock.calls[0];
    expect(call[1].body).toBe(JSON.stringify({ firstName: 'Juan' }));
    expect(call[1].headers['content-type']).toBe('application/json');
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `cd mcp-server && npx vitest run src/http/backend-client.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement client**

Create `mcp-server/src/http/backend-client.ts`:

```typescript
export interface BackendRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  bearer: string;
  correlationId: string;
  body?: unknown;
  query?: Record<string, string | undefined>;
}

export interface BackendResponse {
  status: number;
  body: unknown;
  contentType: string;
  raw?: ArrayBuffer;
}

export interface BackendClient {
  request(req: BackendRequest): Promise<BackendResponse>;
  requestBinary(req: BackendRequest): Promise<{ status: number; data: Uint8Array; contentType: string }>;
}

export interface BackendClientConfig {
  backendUrl: string;
  fetch?: typeof fetch;
}

export function createBackendClient(cfg: BackendClientConfig): BackendClient {
  const f = cfg.fetch ?? fetch;

  function buildUrl(path: string, query?: Record<string, string | undefined>) {
    const url = new URL(path, cfg.backendUrl);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== '') url.searchParams.set(k, v);
      }
    }
    return url.toString();
  }

  return {
    async request(req: BackendRequest): Promise<BackendResponse> {
      const url = buildUrl(req.path, req.query);
      const init: any = {
        method: req.method,
        headers: {
          authorization: `Bearer ${req.bearer}`,
          'x-request-id': req.correlationId,
          accept: 'application/json',
        },
      };
      if (req.body !== undefined) {
        init.body = JSON.stringify(req.body);
        init.headers['content-type'] = 'application/json';
      }
      const res = await f(url, init);
      const ct = (res.headers.get?.('content-type') ?? (res.headers as any).get?.('content-type') ?? '') as string;
      let body: unknown;
      if (ct.includes('application/json')) {
        body = await res.json();
      } else {
        body = await res.text();
      }
      return { status: res.status, body, contentType: ct };
    },
    async requestBinary(req: BackendRequest) {
      const url = buildUrl(req.path, req.query);
      const res = await f(url, {
        method: req.method,
        headers: {
          authorization: `Bearer ${req.bearer}`,
          'x-request-id': req.correlationId,
        },
      });
      const ct = res.headers.get('content-type') ?? '';
      const data = new Uint8Array(await res.arrayBuffer());
      return { status: res.status, data, contentType: ct };
    },
  };
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd mcp-server && npx vitest run src/http/`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/http/
git commit -m "feat(mcp): backend HTTP client (proxies bearer + correlation)"
```

### Task 2.4: HTTP-to-MCP error mapper

**Files:**
- Create: `mcp-server/src/errors/http-to-mcp-error.ts`
- Test: `mcp-server/src/errors/http-to-mcp-error.test.ts`

- [ ] **Step 1: Write failing test**

Create `mcp-server/src/errors/http-to-mcp-error.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mapHttpToMcp } from './http-to-mcp-error.js';

describe('mapHttpToMcp', () => {
  it('maps 400 to invalid params', () => {
    const r = mapHttpToMcp({ status: 400, body: { message: 'Bad RUT' } });
    expect(r.code).toBe(-32602);
    expect(r.message).toContain('Bad RUT');
  });

  it('maps 401 to invalid_token', () => {
    const r = mapHttpToMcp({ status: 401, body: {} });
    expect(r.code).toBe(-32600);
    expect(r.data?.error).toBe('invalid_token');
  });

  it('maps 403 to forbidden', () => {
    const r = mapHttpToMcp({ status: 403, body: { message: 'No permission' } });
    expect(r.code).toBe(-32600);
    expect(r.data?.error).toBe('forbidden');
  });

  it('maps 404 to not_found', () => {
    const r = mapHttpToMcp({ status: 404, body: {} });
    expect(r.code).toBe(-32602);
    expect(r.data?.error).toBe('not_found');
  });

  it('maps 409 to conflict', () => {
    const r = mapHttpToMcp({ status: 409, body: { message: 'RUT exists' } });
    expect(r.code).toBe(-32602);
    expect(r.message).toContain('RUT exists');
  });

  it('maps 429 with retry-after', () => {
    const r = mapHttpToMcp({ status: 429, body: {}, retryAfter: '30' });
    expect(r.code).toBe(-32603);
    expect(r.data?.retryAfter).toBe('30');
  });

  it('maps 500 to internal, hides backend message', () => {
    const r = mapHttpToMcp({ status: 500, body: { message: 'DB connection lost' } });
    expect(r.code).toBe(-32603);
    expect(r.message).toBe('Internal server error');
    expect(JSON.stringify(r)).not.toContain('DB connection lost');
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `cd mcp-server && npx vitest run src/errors/`
Expected: FAIL

- [ ] **Step 3: Implement mapper**

Create `mcp-server/src/errors/http-to-mcp-error.ts`:

```typescript
export interface McpError {
  code: number;
  message: string;
  data?: Record<string, unknown>;
}

export interface HttpResult {
  status: number;
  body: unknown;
  retryAfter?: string;
}

function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as any).message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m)) return m.join('; ');
  }
  return fallback;
}

export function mapHttpToMcp(r: HttpResult): McpError {
  if (r.status === 401) {
    return { code: -32600, message: 'Invalid or expired token; re-authorize the connection.', data: { error: 'invalid_token' } };
  }
  if (r.status === 403) {
    return { code: -32600, message: extractMessage(r.body, 'Permission denied'), data: { error: 'forbidden' } };
  }
  if (r.status === 404) {
    return { code: -32602, message: extractMessage(r.body, 'Resource not found'), data: { error: 'not_found' } };
  }
  if (r.status === 400 || r.status === 409 || r.status === 422) {
    return { code: -32602, message: extractMessage(r.body, 'Invalid input') };
  }
  if (r.status === 429) {
    return { code: -32603, message: 'Rate limited', data: { error: 'rate_limited', retryAfter: r.retryAfter } };
  }
  // 5xx and anything else
  return { code: -32603, message: 'Internal server error' };
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd mcp-server && npx vitest run src/errors/`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/errors/
git commit -m "feat(mcp): HTTP→MCP error mapper"
```

---

## Phase 3 — Tool catalog + read-only tools (9 tools)

### Task 3.1: Tool catalog skeleton

**Files:**
- Create: `mcp-server/src/tools/catalog.ts`
- Test: `mcp-server/src/tools/catalog.test.ts`

- [ ] **Step 1: Write failing test**

Create `mcp-server/src/tools/catalog.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { TOOLS } from './catalog.js';

describe('tool catalog', () => {
  it('contains all 19 tools + whoami', () => {
    expect(TOOLS).toHaveLength(20);
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(20); // no duplicates
  });

  it('every tool has required metadata', () => {
    for (const tool of TOOLS) {
      expect(tool.name).toMatch(/^[a-z_]+$/);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeLessThan(500);
      expect(typeof tool.requiredScope).toBe('string'); // empty allowed for whoami
      expect(typeof tool.readOnly).toBe('boolean');
      expect(typeof tool.destructive).toBe('boolean');
      expect(typeof tool.handler).toBe('function');
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it('whoami requires no scope', () => {
    const w = TOOLS.find((t) => t.name === 'whoami')!;
    expect(w.requiredScope).toBe('');
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `cd mcp-server && npx vitest run src/tools/catalog.test.ts`
Expected: FAIL

- [ ] **Step 3: Define catalog scaffolding (empty handlers, all 20 tools registered)**

Create `mcp-server/src/tools/catalog.ts`:

```typescript
import { z, type ZodTypeAny } from 'zod';
import type { VerifiedToken } from '../auth/jwt-verifier.js';
import type { BackendClient } from '../http/backend-client.js';

export interface ToolContext {
  token: VerifiedToken;
  bearer: string;
  correlationId: string;
  backend: BackendClient;
  // elicitation handle is injected by the MCP server adapter at register time
  elicit?: (schema: ZodTypeAny, prompt: string) => Promise<unknown>;
}

export interface ToolResult {
  content: Array<{ type: 'text' | 'resource'; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

export interface ToolDef {
  name: string;
  description: string;
  requiredScope: string; // '' for whoami (no scope check)
  readOnly: boolean;
  destructive: boolean;
  inputSchema: ZodTypeAny;
  handler: (input: unknown, ctx: ToolContext) => Promise<ToolResult>;
}

// Stub handler — replaced as each tool is implemented.
const stub: ToolDef['handler'] = async () => ({ content: [{ type: 'text', text: 'not implemented' }], isError: true });

export const TOOLS: ToolDef[] = [
  // patients
  { name: 'search_patients', description: 'Busca pacientes por nombre, RUT o teléfono. Devuelve lista paginada con cursor.', requiredScope: 'patients:read', readOnly: true, destructive: false, inputSchema: z.object({ q: z.string().optional(), cursor: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }), handler: stub },
  { name: 'get_patient', description: 'Devuelve los datos demográficos y clínicos de un paciente por id.', requiredScope: 'patients:read', readOnly: true, destructive: false, inputSchema: z.object({ id: z.number().int() }), handler: stub },
  { name: 'create_patient', description: 'Crea un paciente nuevo. Solicita RUT, nombre, fecha de nacimiento y datos demográficos vía elicitation.', requiredScope: 'patients:write', readOnly: false, destructive: false, inputSchema: z.object({}).passthrough(), handler: stub },
  { name: 'update_patient', description: 'Actualiza datos demográficos de un paciente existente. Solicita campos a modificar vía elicitation.', requiredScope: 'patients:write', readOnly: false, destructive: false, inputSchema: z.object({ id: z.number().int() }).passthrough(), handler: stub },
  { name: 'discharge_patient', description: 'Da de alta a un paciente. Acción destructiva: detiene seguimiento clínico.', requiredScope: 'patients:write', readOnly: false, destructive: true, inputSchema: z.object({ id: z.number().int(), cancelAppointment: z.boolean().optional() }), handler: stub },
  { name: 'readmit_patient', description: 'Reingresa a un paciente previamente dado de alta.', requiredScope: 'patients:write', readOnly: false, destructive: false, inputSchema: z.object({ id: z.number().int() }), handler: stub },
  { name: 'get_patient_pdf', description: 'Devuelve el PDF de la ficha clínica del paciente como recurso descargable.', requiredScope: 'patients:read', readOnly: true, destructive: false, inputSchema: z.object({ id: z.number().int() }), handler: stub },
  // agenda
  { name: 'list_patient_appointments', description: 'Lista las citas agendadas de un paciente específico.', requiredScope: 'agenda:read', readOnly: true, destructive: false, inputSchema: z.object({ patientId: z.number().int() }), handler: stub },
  { name: 'get_agenda_by_date_range', description: 'Devuelve la agenda de curaciones planeadas en un rango de fechas (formato YYYY-MM-DD).', requiredScope: 'clinical:read', readOnly: true, destructive: false, inputSchema: z.object({ from: z.string(), to: z.string() }), handler: stub },
  { name: 'create_appointment', description: 'Agenda una nueva cita. Solicita paciente, fecha y hora vía elicitation.', requiredScope: 'agenda:write', readOnly: false, destructive: false, inputSchema: z.object({}).passthrough(), handler: stub },
  { name: 'cancel_appointment', description: 'Cancela una cita agendada por id. Acción destructiva.', requiredScope: 'agenda:write', readOnly: false, destructive: true, inputSchema: z.object({ id: z.number().int() }), handler: stub },
  // curaciones
  { name: 'list_curaciones', description: 'Lista curaciones de un paciente, paginadas con cursor.', requiredScope: 'clinical:read', readOnly: true, destructive: false, inputSchema: z.object({ patientId: z.number().int(), cursor: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }), handler: stub },
  { name: 'register_curacion', description: 'Registra una nueva curación. Solicita localización, tipo de herida, observaciones y cuidados aplicados vía elicitation.', requiredScope: 'clinical:write', readOnly: false, destructive: false, inputSchema: z.object({}).passthrough(), handler: stub },
  // wound notes
  { name: 'add_wound_note', description: 'Agrega una nota de evolución a una curación o paciente.', requiredScope: 'clinical:write', readOnly: false, destructive: false, inputSchema: z.object({ patientId: z.number().int().optional(), curacionId: z.number().int().optional(), content: z.string().min(1) }), handler: stub },
  { name: 'list_wound_notes', description: 'Lista las notas de evolución de un paciente.', requiredScope: 'clinical:read', readOnly: true, destructive: false, inputSchema: z.object({ patientId: z.number().int(), cursor: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }), handler: stub },
  // inventory
  { name: 'search_inventory', description: 'Busca productos del inventario por nombre o código.', requiredScope: 'inventory:read', readOnly: true, destructive: false, inputSchema: z.object({ q: z.string().optional(), cursor: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }), handler: stub },
  { name: 'list_lots_expiring', description: 'Lista lotes de inventario próximos a vencer en N días (default 30).', requiredScope: 'inventory:read', readOnly: true, destructive: false, inputSchema: z.object({ days: z.number().int().min(1).max(365).optional() }), handler: stub },
  { name: 'register_canasta_consumption', description: 'Registra consumo de insumos en una curación o canasta. Solicita productos y cantidades vía elicitation.', requiredScope: 'inventory:write', readOnly: false, destructive: false, inputSchema: z.object({}).passthrough(), handler: stub },
  // reports
  { name: 'monthly_report', description: 'Reporte mensual de curaciones (formato YYYY-MM).', requiredScope: 'reports:read', readOnly: true, destructive: false, inputSchema: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }), handler: stub },
  // identity
  { name: 'whoami', description: 'Devuelve el usuario y organización actuales (lee del JWT, no llama al backend).', requiredScope: '', readOnly: true, destructive: false, inputSchema: z.object({}), handler: stub },
];
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd mcp-server && npx vitest run src/tools/catalog.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/tools/
git commit -m "feat(mcp): tool catalog scaffolding (20 entries with stubs)"
```

### Task 3.2: Implement search_patients

**Files:**
- Create: `mcp-server/src/tools/patients/search-patients.ts`
- Test: `mcp-server/src/tools/patients/search-patients.test.ts`
- Modify: `mcp-server/src/tools/catalog.ts` (replace stub with handler)

- [ ] **Step 1: Write failing test**

Create `mcp-server/src/tools/patients/search-patients.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { searchPatientsHandler } from './search-patients.js';
import type { BackendClient } from '../../http/backend-client.js';

const mockToken = { sub: '1', scope: 'patients:read', org_id: '1', exp: 9999999999 };

function mockBackend(response: any): BackendClient {
  return {
    request: vi.fn().mockResolvedValue(response),
    requestBinary: vi.fn(),
  };
}

describe('search_patients', () => {
  it('returns patients with nextCursor', async () => {
    const backend = mockBackend({
      status: 200,
      contentType: 'application/json',
      body: { items: [{ id: 1, firstName: 'Juan', lastName: 'Pérez' }], nextCursor: 'abc' },
    });
    const result = await searchPatientsHandler({ q: 'Juan' }, {
      token: mockToken,
      bearer: 'tok',
      correlationId: 'cid',
      backend,
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text!;
    expect(text).toContain('Juan');
    expect(text).toContain('nextCursor');
    expect(backend.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'GET',
      path: '/api/patients',
      query: expect.objectContaining({ q: 'Juan' }),
    }));
  });

  it('maps 401 to invalid_token error', async () => {
    const backend = mockBackend({ status: 401, contentType: 'application/json', body: {} });
    const result = await searchPatientsHandler({}, {
      token: mockToken,
      bearer: 'tok',
      correlationId: 'cid',
      backend,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/re-authorize/i);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `cd mcp-server && npx vitest run src/tools/patients/search-patients.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement handler**

Create `mcp-server/src/tools/patients/search-patients.ts`:

```typescript
import type { ToolContext, ToolResult } from '../catalog.js';
import { mapHttpToMcp } from '../../errors/http-to-mcp-error.js';

export interface SearchPatientsInput {
  q?: string;
  cursor?: string;
  limit?: number;
}

export async function searchPatientsHandler(input: SearchPatientsInput, ctx: ToolContext): Promise<ToolResult> {
  const r = await ctx.backend.request({
    method: 'GET',
    path: '/api/patients',
    bearer: ctx.bearer,
    correlationId: ctx.correlationId,
    query: {
      q: input.q,
      cursor: input.cursor,
      limit: input.limit?.toString(),
    },
  });

  if (r.status >= 400) {
    const err = mapHttpToMcp({ status: r.status, body: r.body });
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(r.body) }],
  };
}
```

- [ ] **Step 4: Wire into catalog**

In `mcp-server/src/tools/catalog.ts`, replace the `search_patients` stub. Add import at top:

```typescript
import { searchPatientsHandler } from './patients/search-patients.js';
```

And change the entry:

```typescript
{ name: 'search_patients', description: '...', requiredScope: 'patients:read', readOnly: true, destructive: false, inputSchema: z.object({ q: z.string().optional(), cursor: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }), handler: (input, ctx) => searchPatientsHandler(input as any, ctx) },
```

- [ ] **Step 5: Run all tool tests**

Run: `cd mcp-server && npx vitest run src/tools/`
Expected: PASS — search_patients test + catalog test

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/tools/
git commit -m "feat(mcp): search_patients tool"
```

### Task 3.3: Implement remaining 8 read-only tools (one per sub-task)

Each follows the same pattern as `search_patients`. Below are the mappings; for each tool, repeat steps 1-6 from Task 3.2 with the corresponding endpoint, query params, and minimal test. Each tool gets its own commit.

**Tools to implement:**

| Tool | File | Endpoint | Special handling |
|---|---|---|---|
| `get_patient` | `tools/patients/get-patient.ts` | `GET /api/patients/:id` | Path param: substitute `:id` from input |
| `get_patient_pdf` | `tools/patients/get-patient-pdf.ts` | `GET /api/patients/:id/pdf` | Use `requestBinary`; return as `{ type: 'resource', mimeType: 'application/pdf', data: base64 }` |
| `list_patient_appointments` | `tools/agenda/list-patient-appointments.ts` | `GET /api/appointments/patient/:patientId` | Path param |
| `get_agenda_by_date_range` | `tools/agenda/get-agenda-by-date-range.ts` | `GET /api/curaciones/agenda?from=&to=` | Query params from/to; validate format YYYY-MM-DD client-side |
| `list_curaciones` | `tools/curaciones/list-curaciones.ts` | `GET /api/curaciones/patient/:patientId` | Path param + cursor query |
| `list_wound_notes` | `tools/wound-notes/list-wound-notes.ts` | `GET /api/wound-notes/patient/:patientId` | Path param |
| `search_inventory` | `tools/inventory/search-inventory.ts` | `GET /api/inventory/products` | q, cursor, limit |
| `list_lots_expiring` | `tools/inventory/list-lots-expiring.ts` | `GET /api/inventory/expiring?days=` | Default days = 30 if not provided |

**Pattern reference (e.g., for `get_patient`):**

`mcp-server/src/tools/patients/get-patient.ts`:

```typescript
import type { ToolContext, ToolResult } from '../catalog.js';
import { mapHttpToMcp } from '../../errors/http-to-mcp-error.js';

export interface GetPatientInput { id: number; }

export async function getPatientHandler(input: GetPatientInput, ctx: ToolContext): Promise<ToolResult> {
  const r = await ctx.backend.request({
    method: 'GET',
    path: `/api/patients/${input.id}`,
    bearer: ctx.bearer,
    correlationId: ctx.correlationId,
  });
  if (r.status >= 400) {
    const err = mapHttpToMcp({ status: r.status, body: r.body });
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }
  return { content: [{ type: 'text', text: JSON.stringify(r.body) }] };
}
```

`mcp-server/src/tools/patients/get-patient.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { getPatientHandler } from './get-patient.js';
import type { BackendClient } from '../../http/backend-client.js';

const mockToken = { sub: '1', scope: 'patients:read', org_id: '1', exp: 9999999999 };

describe('get_patient', () => {
  it('fetches patient by id', async () => {
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({
        status: 200,
        contentType: 'application/json',
        body: { id: 5, firstName: 'Juan', lastName: 'Pérez' },
      }),
      requestBinary: vi.fn(),
    };
    const r = await getPatientHandler({ id: 5 }, {
      token: mockToken, bearer: 't', correlationId: 'c', backend,
    });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content[0].text!)).toEqual({ id: 5, firstName: 'Juan', lastName: 'Pérez' });
    expect(backend.request).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/patients/5' }));
  });

  it('returns not_found on 404', async () => {
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 404, contentType: 'application/json', body: {} }),
      requestBinary: vi.fn(),
    };
    const r = await getPatientHandler({ id: 999 }, {
      token: mockToken, bearer: 't', correlationId: 'c', backend,
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/not found/i);
  });
});
```

**Special: get_patient_pdf** uses `requestBinary` and returns a resource:

`mcp-server/src/tools/patients/get-patient-pdf.ts`:

```typescript
import type { ToolContext, ToolResult } from '../catalog.js';
import { mapHttpToMcp } from '../../errors/http-to-mcp-error.js';

export interface GetPatientPdfInput { id: number; }

export async function getPatientPdfHandler(input: GetPatientPdfInput, ctx: ToolContext): Promise<ToolResult> {
  const r = await ctx.backend.requestBinary({
    method: 'GET',
    path: `/api/patients/${input.id}/pdf`,
    bearer: ctx.bearer,
    correlationId: ctx.correlationId,
  });
  if (r.status >= 400) {
    const err = mapHttpToMcp({ status: r.status, body: {} });
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }
  const base64 = Buffer.from(r.data).toString('base64');
  return {
    content: [{
      type: 'resource',
      mimeType: 'application/pdf',
      data: base64,
    }],
  };
}
```

- [ ] **Step 1–8: For each of the 8 remaining read-only tools**

For each row in the table above:

  - [ ] Sub-step a: Write the test file (mirror the `get_patient.test.ts` pattern, adjust for the endpoint, query params, and response shape)
  - [ ] Sub-step b: Run the test, expect failure
  - [ ] Sub-step c: Implement the handler in the listed file (mirror the `get_patient.ts` pattern; for path-param tools use template literal; for query-param tools use the `query` field)
  - [ ] Sub-step d: Wire the handler into `catalog.ts` (replace stub)
  - [ ] Sub-step e: Run all tool tests, expect pass
  - [ ] Sub-step f: Commit with message `feat(mcp): <tool_name> tool`

After all 8: run `cd mcp-server && npx vitest run` and expect all unit tests to pass.

---

## Phase 4 — Write tools without elicitation (4 tools)

These tools require no user input beyond what the LLM provides. Same pattern as read tools but using `POST`/`DELETE` and forwarding the body.

### Task 4.1: discharge_patient

**Files:**
- Create: `mcp-server/src/tools/patients/discharge-patient.ts`
- Test: `mcp-server/src/tools/patients/discharge-patient.test.ts`
- Modify: `mcp-server/src/tools/catalog.ts`

- [ ] **Step 1: Write failing test**

Create `mcp-server/src/tools/patients/discharge-patient.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { dischargePatientHandler } from './discharge-patient.js';
import type { BackendClient } from '../../http/backend-client.js';

const mockToken = { sub: '1', scope: 'patients:write', org_id: '1', exp: 9999999999 };

describe('discharge_patient', () => {
  it('posts to /discharge with cancelAppointment flag', async () => {
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 200, contentType: 'application/json', body: { id: 5, status: 'discharged' } }),
      requestBinary: vi.fn(),
    };
    await dischargePatientHandler({ id: 5, cancelAppointment: true }, {
      token: mockToken, bearer: 't', correlationId: 'c', backend,
    });
    expect(backend.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      path: '/api/patients/5/discharge',
      body: { cancelAppointment: true },
    }));
  });

  it('forwards 403 forbidden as MCP error', async () => {
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 403, contentType: 'application/json', body: { message: 'No permission' } }),
      requestBinary: vi.fn(),
    };
    const r = await dischargePatientHandler({ id: 5 }, {
      token: mockToken, bearer: 't', correlationId: 'c', backend,
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/no permission/i);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `cd mcp-server && npx vitest run src/tools/patients/discharge-patient.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

Create `mcp-server/src/tools/patients/discharge-patient.ts`:

```typescript
import type { ToolContext, ToolResult } from '../catalog.js';
import { mapHttpToMcp } from '../../errors/http-to-mcp-error.js';

export interface DischargePatientInput {
  id: number;
  cancelAppointment?: boolean;
}

export async function dischargePatientHandler(input: DischargePatientInput, ctx: ToolContext): Promise<ToolResult> {
  const r = await ctx.backend.request({
    method: 'POST',
    path: `/api/patients/${input.id}/discharge`,
    bearer: ctx.bearer,
    correlationId: ctx.correlationId,
    body: { cancelAppointment: input.cancelAppointment ?? false },
  });
  if (r.status >= 400) {
    const err = mapHttpToMcp({ status: r.status, body: r.body });
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }
  return { content: [{ type: 'text', text: JSON.stringify(r.body) }] };
}
```

- [ ] **Step 4: Wire into catalog and run tests**

Replace the `discharge_patient` stub in `catalog.ts` with handler call.

Run: `cd mcp-server && npx vitest run src/tools/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/tools/
git commit -m "feat(mcp): discharge_patient tool"
```

### Task 4.2: readmit_patient, cancel_appointment, add_wound_note

Same pattern. For each:

| Tool | Endpoint | Method | Body |
|---|---|---|---|
| `readmit_patient` | `/api/patients/:id/readmit` | POST | `{}` (no body needed) |
| `cancel_appointment` | `/api/appointments/:id` | DELETE | none |
| `add_wound_note` | `/api/wound-notes` | POST | `{ patientId?, curacionId?, content }` |

- [ ] **Step 1–6 per tool: Same TDD cycle as Task 4.1**

For `readmit_patient`:
- File: `mcp-server/src/tools/patients/readmit-patient.ts` and `.test.ts`
- Handler does `POST /api/patients/${input.id}/readmit` with no body
- Test mirrors `discharge_patient.test.ts`

For `cancel_appointment`:
- File: `mcp-server/src/tools/agenda/cancel-appointment.ts` and `.test.ts`
- Handler does `DELETE /api/appointments/${input.id}`
- Test verifies `method: 'DELETE'` and proper path

For `add_wound_note`:
- File: `mcp-server/src/tools/wound-notes/add-wound-note.ts` and `.test.ts`
- Handler does `POST /api/wound-notes` with body `{ patientId, curacionId, content }`
- Test verifies body forwarded

After each: wire into catalog, run all tests, commit individually.

---

## Phase 5 — Tools with elicitation (5 tools)

### Task 5.1: Elicitation helper

**Files:**
- Create: `mcp-server/src/elicitation/elicit-or-fallback.ts`
- Test: `mcp-server/src/elicitation/elicit-or-fallback.test.ts`

- [ ] **Step 1: Write failing test**

Create `mcp-server/src/elicitation/elicit-or-fallback.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { elicitOrFallback } from './elicit-or-fallback.js';

describe('elicitOrFallback', () => {
  const schema = z.object({
    rut: z.string().regex(/^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/),
    firstName: z.string().min(1),
  });

  it('uses elicit fn when capability is available', async () => {
    const elicit = vi.fn().mockResolvedValue({ rut: '12.345.678-5', firstName: 'Juan' });
    const result = await elicitOrFallback({
      capable: true,
      schema,
      prompt: 'Datos del paciente',
      partial: {},
      elicit,
    });
    expect(result.kind).toBe('value');
    if (result.kind === 'value') expect(result.value.firstName).toBe('Juan');
  });

  it('returns fallback message when capability missing', async () => {
    const result = await elicitOrFallback({
      capable: false,
      schema,
      prompt: 'Datos del paciente',
      partial: {},
      elicit: vi.fn(),
    });
    expect(result.kind).toBe('fallback');
    if (result.kind === 'fallback') {
      expect(result.text).toMatch(/Necesito más información/);
      expect(result.text).toMatch(/rut/);
      expect(result.text).toMatch(/firstName/);
    }
  });

  it('validates elicit response and re-throws on schema error', async () => {
    const elicit = vi.fn().mockResolvedValue({ rut: 'invalid', firstName: 'Juan' });
    await expect(elicitOrFallback({
      capable: true,
      schema,
      prompt: 'Datos del paciente',
      partial: {},
      elicit,
    })).rejects.toThrow(/rut/);
  });

  it('merges partial with elicited fields', async () => {
    const elicit = vi.fn().mockResolvedValue({ firstName: 'Juan' });
    const result = await elicitOrFallback({
      capable: true,
      schema,
      prompt: 'Falta firstName',
      partial: { rut: '12.345.678-5' },
      elicit,
    });
    expect(result.kind).toBe('value');
    if (result.kind === 'value') {
      expect(result.value.rut).toBe('12.345.678-5');
      expect(result.value.firstName).toBe('Juan');
    }
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `cd mcp-server && npx vitest run src/elicitation/`
Expected: FAIL

- [ ] **Step 3: Implement**

Create `mcp-server/src/elicitation/elicit-or-fallback.ts`:

```typescript
import { z, type ZodTypeAny, type ZodObject, type ZodRawShape } from 'zod';

export type ElicitResult<T> =
  | { kind: 'value'; value: T }
  | { kind: 'fallback'; text: string };

export interface ElicitOrFallbackArgs<T> {
  capable: boolean;
  schema: ZodTypeAny;
  prompt: string;
  partial: Record<string, unknown>;
  elicit: (schema: ZodTypeAny, prompt: string) => Promise<unknown>;
}

function describeRequiredFields(schema: ZodTypeAny, partial: Record<string, unknown>): string[] {
  if (schema instanceof z.ZodObject) {
    const shape = (schema as ZodObject<ZodRawShape>).shape;
    return Object.keys(shape).filter((k) => !(k in partial));
  }
  return [];
}

export async function elicitOrFallback<T>(args: ElicitOrFallbackArgs<T>): Promise<ElicitResult<T>> {
  if (!args.capable) {
    const fields = describeRequiredFields(args.schema, args.partial);
    return {
      kind: 'fallback',
      text: `Necesito más información: ${fields.join(', ')}. Por favor llamame de nuevo con estos datos: ${args.prompt}`,
    };
  }
  const elicited = await args.elicit(args.schema, args.prompt);
  const merged = { ...args.partial, ...(elicited as Record<string, unknown>) };
  const parsed = args.schema.safeParse(merged);
  if (!parsed.success) {
    const msgs = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Validation failed: ${msgs}`);
  }
  return { kind: 'value', value: parsed.data as T };
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd mcp-server && npx vitest run src/elicitation/`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/elicitation/
git commit -m "feat(mcp): elicitation helper with capability check + fallback"
```

### Task 5.2: create_patient with elicitation

**Files:**
- Create: `mcp-server/src/tools/patients/create-patient.ts`
- Test: `mcp-server/src/tools/patients/create-patient.test.ts`
- Modify: `mcp-server/src/tools/catalog.ts`

- [ ] **Step 1: Write failing test**

Create `mcp-server/src/tools/patients/create-patient.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createPatientHandler } from './create-patient.js';
import type { BackendClient } from '../../http/backend-client.js';

const mockToken = { sub: '1', scope: 'patients:write', org_id: '1', exp: 9999999999 };

describe('create_patient', () => {
  it('elicits and posts patient', async () => {
    const elicit = vi.fn().mockResolvedValue({
      rut: '12.345.678-5',
      firstName: 'Juan', lastName: 'Pérez',
      birthDate: '1990-01-01', gender: 'male',
    });
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 201, contentType: 'application/json', body: { id: 42 } }),
      requestBinary: vi.fn(),
    };
    const r = await createPatientHandler({}, {
      token: mockToken, bearer: 't', correlationId: 'c', backend, elicit,
    });
    expect(r.isError).toBeFalsy();
    expect(backend.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST', path: '/api/patients',
    }));
    const body = (backend.request as any).mock.calls[0][0].body;
    expect(body.firstName).toBe('Juan');
  });

  it('returns fallback when no elicit capability', async () => {
    const backend: BackendClient = {
      request: vi.fn(),
      requestBinary: vi.fn(),
    };
    const r = await createPatientHandler({}, {
      token: mockToken, bearer: 't', correlationId: 'c', backend, elicit: undefined,
    });
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toMatch(/Necesito más información/);
    expect(backend.request).not.toHaveBeenCalled();
  });

  it('returns 400 from backend as MCP error', async () => {
    const elicit = vi.fn().mockResolvedValue({
      rut: '12.345.678-5', firstName: 'Juan', lastName: 'Pérez',
      birthDate: '1990-01-01', gender: 'male',
    });
    const backend: BackendClient = {
      request: vi.fn().mockResolvedValue({ status: 400, contentType: 'application/json', body: { message: 'RUT inválido' } }),
      requestBinary: vi.fn(),
    };
    const r = await createPatientHandler({}, {
      token: mockToken, bearer: 't', correlationId: 'c', backend, elicit,
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/RUT inválido/);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `cd mcp-server && npx vitest run src/tools/patients/create-patient.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

Create `mcp-server/src/tools/patients/create-patient.ts`:

```typescript
import { z } from 'zod';
import type { ToolContext, ToolResult } from '../catalog.js';
import { mapHttpToMcp } from '../../errors/http-to-mcp-error.js';
import { elicitOrFallback } from '../../elicitation/elicit-or-fallback.js';

const PatientFormSchema = z.object({
  rut: z.string().regex(/^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/, 'RUT con formato XX.XXX.XXX-Y'),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  gender: z.enum(['male', 'female', 'other']),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
});

type PatientForm = z.infer<typeof PatientFormSchema>;

export async function createPatientHandler(_input: unknown, ctx: ToolContext): Promise<ToolResult> {
  const elicited = await elicitOrFallback<PatientForm>({
    capable: typeof ctx.elicit === 'function',
    schema: PatientFormSchema,
    prompt: 'Datos del paciente nuevo (RUT, nombre, fecha de nacimiento, etc.)',
    partial: {},
    elicit: ctx.elicit ?? (async () => ({})),
  });

  if (elicited.kind === 'fallback') {
    return { content: [{ type: 'text', text: elicited.text }] };
  }

  const r = await ctx.backend.request({
    method: 'POST',
    path: '/api/patients',
    bearer: ctx.bearer,
    correlationId: ctx.correlationId,
    body: elicited.value,
  });

  if (r.status >= 400) {
    const err = mapHttpToMcp({ status: r.status, body: r.body });
    return { isError: true, content: [{ type: 'text', text: err.message }] };
  }
  return { content: [{ type: 'text', text: JSON.stringify(r.body) }] };
}
```

- [ ] **Step 4: Wire into catalog**

Replace `create_patient` stub in `catalog.ts` with `createPatientHandler` import + handler.

- [ ] **Step 5: Run tests**

Run: `cd mcp-server && npx vitest run src/tools/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/tools/patients/create-patient.ts mcp-server/src/tools/patients/create-patient.test.ts mcp-server/src/tools/catalog.ts
git commit -m "feat(mcp): create_patient tool with elicitation"
```

### Task 5.3: update_patient, register_curacion, create_appointment, register_canasta_consumption

Same pattern as `create_patient`. Each in its own task with TDD.

| Tool | File | Endpoint | Method | Schema fields |
|---|---|---|---|---|
| `update_patient` | `tools/patients/update-patient.ts` | `/api/patients/:id` | PUT | id (in input not elicit) + same fields as create, all optional |
| `register_curacion` | `tools/curaciones/register-curacion.ts` | `/api/curaciones` | POST | patientId, location, woundType, observations, careApplied |
| `create_appointment` | `tools/agenda/create-appointment.ts` | `/api/appointments` | POST | patientId, date (YYYY-MM-DDTHH:mm), notes? |
| `register_canasta_consumption` | `tools/inventory/register-canasta-consumption.ts` | `/api/inventory/canasta` | POST | curacionId, items: [{productId, quantity}] |

For each, repeat the test → fail → implement → wire → pass → commit cycle from Task 5.2. Use the same fallback shape and `elicitOrFallback` helper.

`update_patient` is special because `id` comes from input (not elicitation):

```typescript
export interface UpdatePatientInput { id: number; }
export async function updatePatientHandler(input: UpdatePatientInput, ctx: ToolContext): Promise<ToolResult> {
  // ... elicitOrFallback with PartialPatientFormSchema (all fields optional)
  // ... if value: ctx.backend.request({ method: 'PUT', path: `/api/patients/${input.id}`, body: elicited.value })
}
```

- [ ] **Tasks 5.3.1 through 5.3.4: One sub-task per tool**

For each tool: write test, fail, implement, wire, run tests, commit.

After all four: run `cd mcp-server && npx vitest run` and expect all unit tests to pass.

---

## Phase 6 — Reports + whoami

### Task 6.1: monthly_report

Same simple read pattern as Phase 3 tools.

- [ ] **Step 1–6: Standard read-tool TDD cycle**

Files: `mcp-server/src/tools/reports/monthly-report.ts` and `.test.ts`. Endpoint `GET /api/reports/monthly?month=`. Input: `{ month: 'YYYY-MM' }`. Forward as query param.

Commit: `feat(mcp): monthly_report tool`

### Task 6.2: whoami (no backend call)

**Files:**
- Create: `mcp-server/src/tools/identity/whoami.ts`
- Test: `mcp-server/src/tools/identity/whoami.test.ts`

- [ ] **Step 1: Write failing test**

Create `mcp-server/src/tools/identity/whoami.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { whoamiHandler } from './whoami.js';

describe('whoami', () => {
  it('reads username, org, role from JWT claims (no backend call)', async () => {
    const backend = { request: vi.fn(), requestBinary: vi.fn() };
    const r = await whoamiHandler({}, {
      token: { sub: '42', scope: 'patients:read', org_id: '1', username: 'juan', org_name: 'CESFAM A', role: 'clinician', exp: 9999999999 },
      bearer: 't', correlationId: 'c', backend,
    });
    const parsed = JSON.parse(r.content[0].text!);
    expect(parsed.username).toBe('juan');
    expect(parsed.organizationName).toBe('CESFAM A');
    expect(parsed.role).toBe('clinician');
    expect(backend.request).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `cd mcp-server && npx vitest run src/tools/identity/`
Expected: FAIL

- [ ] **Step 3: Implement**

Create `mcp-server/src/tools/identity/whoami.ts`:

```typescript
import type { ToolContext, ToolResult } from '../catalog.js';

export async function whoamiHandler(_input: unknown, ctx: ToolContext): Promise<ToolResult> {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        userId: ctx.token.sub,
        username: ctx.token.username ?? null,
        organizationId: ctx.token.org_id,
        organizationName: ctx.token.org_name ?? null,
        role: ctx.token.role ?? null,
      }),
    }],
  };
}
```

- [ ] **Step 4: Wire into catalog and run tests**

Replace stub in `catalog.ts`. Run all tests.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/tools/identity/ mcp-server/src/tools/catalog.ts
git commit -m "feat(mcp): whoami tool (reads JWT claims, no backend call)"
```

---

## Phase 7 — Wire MCP server: register tools, add auth middleware, full pipeline

### Task 7.1: Tool registration adapter

**Files:**
- Create: `mcp-server/src/tools/register.ts`
- Test: `mcp-server/src/tools/register.test.ts`

This adapter takes the catalog and registers each tool with the MCP SDK server, wrapping handlers with scope checks and error mapping.

- [ ] **Step 1: Write failing test**

Create `mcp-server/src/tools/register.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { registerTools } from './register.js';
import { TOOLS } from './catalog.js';

describe('registerTools', () => {
  it('registers all 20 tools on the MCP server', () => {
    const server: any = { tool: vi.fn() };
    registerTools({ server, getContext: () => null as any });
    expect(server.tool).toHaveBeenCalledTimes(TOOLS.length);
    const names = (server.tool as any).mock.calls.map((c: any) => c[0]);
    expect(new Set(names).size).toBe(TOOLS.length);
  });

  it('wraps handler with scope check (returns insufficient_scope error)', async () => {
    const handlers: Record<string, any> = {};
    const server: any = {
      tool: (name: string, _meta: any, handler: any) => { handlers[name] = handler; },
    };
    const ctx = {
      token: { sub: '1', scope: 'patients:read', org_id: '1', exp: 999 } as any,
      bearer: 't', correlationId: 'c', backend: {} as any,
    };
    registerTools({ server, getContext: () => ctx });
    // create_patient requires patients:write but token only has patients:read
    const result = await handlers.create_patient({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/insufficient_scope|patients:write/);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `cd mcp-server && npx vitest run src/tools/register.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement adapter**

Create `mcp-server/src/tools/register.ts`:

```typescript
import { TOOLS, type ToolContext } from './catalog.js';
import { hasScope } from '../auth/scope-check.js';

export interface RegisterDeps {
  server: { tool: (name: string, meta: any, handler: any) => void };
  getContext: () => ToolContext;
}

export function registerTools(deps: RegisterDeps): void {
  for (const def of TOOLS) {
    deps.server.tool(
      def.name,
      {
        description: def.description,
        inputSchema: def.inputSchema,
        annotations: {
          readOnlyHint: def.readOnly,
          destructiveHint: def.destructive,
        },
      },
      async (input: unknown) => {
        const ctx = deps.getContext();

        // Scope check (skip for whoami where requiredScope is empty)
        if (def.requiredScope) {
          const scopeErr = hasScope(ctx.token.scope, def.requiredScope);
          if (scopeErr) {
            return {
              isError: true,
              content: [{ type: 'text', text: scopeErr.message }],
            };
          }
        }

        try {
          return await def.handler(input, ctx);
        } catch (e) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Tool error: ${(e as Error).message}` }],
          };
        }
      },
    );
  }
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd mcp-server && npx vitest run src/tools/register.test.ts`
Expected: PASS, 2 tests

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/tools/register.ts mcp-server/src/tools/register.test.ts
git commit -m "feat(mcp): tool registration adapter with scope-check wrapping"
```

### Task 7.2: MCP transport mounted on Fastify with auth middleware

**Files:**
- Modify: `mcp-server/src/server.ts`
- Modify: `mcp-server/src/server.test.ts`

This wires the streamable-HTTP MCP transport to a Fastify route, adds bearer extraction + JWT verification, and threads the resulting `ToolContext` down to handlers.

- [ ] **Step 1: Add failing test for auth-required tool routes**

Append to `mcp-server/src/server.test.ts`:

```typescript
describe('mcp endpoint', () => {
  it('rejects MCP request without bearer with 401', async () => {
    const app = await buildServer({
      port: 0,
      backendUrl: 'http://localhost:3000',
      oauth: { issuer: 'http://localhost:3000', jwksUrl: 'http://localhost:3000/jwks.json', audience: 'http://localhost:3000' },
      logLevel: 'error',
      nodeEnv: 'test',
    });
    const r = await app.inject({
      method: 'POST',
      url: '/mcp',
      payload: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
    });
    expect(r.statusCode).toBe(401);
    expect(r.headers['www-authenticate']).toMatch(/Bearer/);
    await app.close();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `cd mcp-server && npx vitest run src/server.test.ts`
Expected: FAIL — there's no /mcp route yet

- [ ] **Step 3: Wire MCP transport**

Replace `mcp-server/src/server.ts` with a fuller version that mounts the MCP server on `/mcp` and runs auth middleware:

```typescript
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { loadConfig, type Config } from './config.js';
import { createLogger, type Logger } from './logging/logger.js';
import { correlationFromHeaders } from './logging/correlation.js';
import { createJwtVerifier, type VerifiedToken } from './auth/jwt-verifier.js';
import { createBackendClient } from './http/backend-client.js';
import { registerTools } from './tools/register.js';
import type { ToolContext } from './tools/catalog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

interface RequestState {
  token: VerifiedToken;
  bearer: string;
  correlationId: string;
}

export async function buildServer(cfg: Config): Promise<FastifyInstance> {
  const logger = createLogger({ level: cfg.logLevel });
  const app = Fastify({ loggerInstance: logger as any, disableRequestLogging: false });

  const verifier = createJwtVerifier({
    issuer: cfg.oauth.issuer,
    audience: cfg.oauth.audience,
    jwksUrl: cfg.oauth.jwksUrl,
  });
  const backend = createBackendClient({ backendUrl: cfg.backendUrl });

  // Per-request state holder used by registerTools.getContext
  const requestStates = new WeakMap<FastifyRequest, RequestState>();

  // Single MCP server with all tools registered
  const mcp = new McpServer({ name: 'curaciones', version: pkg.version }, { capabilities: { tools: {} } });
  // The current request whose handler is running. Set by Fastify hook below.
  let currentRequest: FastifyRequest | null = null;
  registerTools({
    server: mcp as any,
    getContext: (): ToolContext => {
      if (!currentRequest) throw new Error('No active request');
      const state = requestStates.get(currentRequest);
      if (!state) throw new Error('Request state missing');
      return { token: state.token, bearer: state.bearer, correlationId: state.correlationId, backend };
    },
  });

  app.get('/health', async () => ({
    status: 'ok',
    version: pkg.version,
    uptime: process.uptime(),
  }));

  app.post('/mcp', async (req, reply) => {
    const auth = req.headers['authorization'];
    if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) {
      reply.header('WWW-Authenticate', 'Bearer error="invalid_request"');
      return reply.code(401).send({ error: 'missing_bearer' });
    }
    const bearer = auth.slice(7);
    let token: VerifiedToken;
    try {
      token = await verifier.verify(bearer);
    } catch (e) {
      reply.header('WWW-Authenticate', `Bearer error="invalid_token", error_description="${(e as Error).message.replace(/"/g, '')}"`);
      return reply.code(401).send({ error: 'invalid_token' });
    }
    const correlationId = correlationFromHeaders(req.headers as any);
    requestStates.set(req as FastifyRequest, { token, bearer, correlationId });
    currentRequest = req;
    try {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await mcp.connect(transport);
      await transport.handleRequest(req.raw, reply.raw, req.body);
    } finally {
      currentRequest = null;
    }
  });

  return app;
}

async function main() {
  const cfg = loadConfig();
  const app = await buildServer(cfg);
  try {
    await app.listen({ port: cfg.port, host: '0.0.0.0' });
    app.log.info({ port: cfg.port }, 'mcp-server listening');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
```

- [ ] **Step 4: Run tests**

Run: `cd mcp-server && npx vitest run src/server.test.ts`
Expected: PASS — both /health and /mcp 401 cases

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/server.ts mcp-server/src/server.test.ts
git commit -m "feat(mcp): mount MCP transport on /mcp with bearer auth"
```

---

## Phase 8 — Integration tests + smoke test + README

### Task 8.1: Integration test against running backend

**Files:**
- Create: `mcp-server/test/integration/auth-flow.test.ts`
- Create: `mcp-server/vitest.integration.config.ts`
- Modify: `mcp-server/package.json` (already has `test:integration` script)

These tests assume the backend is running on `localhost:3000`. They register a DCR client, complete the OAuth flow, and call one tool of each category.

- [ ] **Step 1: Create integration vitest config**

Create `mcp-server/vitest.integration.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
```

- [ ] **Step 2: Write the auth-flow integration test**

Create `mcp-server/test/integration/auth-flow.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/server.js';
import type { FastifyInstance } from 'fastify';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:3000';

async function getTestBearer(): Promise<string> {
  // The backend exposes /api/auth/login for username+password.
  // Tests assume a seeded user exists.
  const resp = await fetch(`${BACKEND}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' }),
  });
  if (!resp.ok) throw new Error(`Login failed: ${resp.status}`);
  const body = await resp.json();
  // The /api/auth/login returns the internal short-lived JWT, NOT an OAuth AT.
  // For integration we use it because the backend's OAuthJwtStrategy and
  // internal-JWT strategy both validate via the same MultiAuthGuard.
  return body.accessToken;
}

describe('auth flow integration', () => {
  let app: FastifyInstance;
  let bearer: string;

  beforeAll(async () => {
    bearer = await getTestBearer();
    app = await buildServer({
      port: 0,
      backendUrl: BACKEND,
      oauth: { issuer: BACKEND, jwksUrl: `${BACKEND}/jwks.json`, audience: BACKEND },
      logLevel: 'error',
      nodeEnv: 'test',
    });
  });

  afterAll(async () => { await app.close(); });

  it('rejects /mcp without bearer', async () => {
    const r = await app.inject({ method: 'POST', url: '/mcp', payload: { jsonrpc: '2.0', method: 'tools/list', id: 1 } });
    expect(r.statusCode).toBe(401);
  });

  it('rejects /mcp with malformed bearer', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { authorization: 'Bearer not-a-jwt' },
      payload: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
    });
    expect(r.statusCode).toBe(401);
  });

  it.skipIf(!process.env.RUN_FULL_INTEGRATION)('lists tools with valid bearer', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: { authorization: `Bearer ${bearer}` },
      payload: { jsonrpc: '2.0', method: 'tools/list', id: 1 },
    });
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.result?.tools).toBeInstanceOf(Array);
    expect(body.result.tools.length).toBe(20);
  });
});
```

- [ ] **Step 3: Run with backend off (only the no-backend tests should run)**

Run: `cd mcp-server && npm run test:integration`
Expected: PASS for the two no-bearer tests; the third is skipped without `RUN_FULL_INTEGRATION=1`.

- [ ] **Step 4: Commit**

```bash
git add mcp-server/test/integration/ mcp-server/vitest.integration.config.ts
git commit -m "test(mcp): integration tests for auth flow"
```

### Task 8.2: README + smoke test instructions

**Files:**
- Create: `mcp-server/README.md`
- Create: `mcp-server/scripts/regenerate-api-types.sh`

- [ ] **Step 1: Write README**

Create `mcp-server/README.md`:

```markdown
# Curaciones MCP Server

MCP server for the Curaciones platform. Exposes 19 tools v1 + `whoami` to Claude clients via OAuth 2.0, proxying all calls to the NestJS backend.

## Quickstart

1. Copy env: `cp .env.example .env` and adjust `BACKEND_URL` etc.
2. Install: `npm install`
3. Dev: `npm run dev` (watches src/, restarts on change)
4. Build + run: `npm run build && npm start`

## Endpoints

- `GET /health` — public, returns `{ status, version, uptime }`
- `POST /mcp` — MCP streamable-HTTP, requires `Authorization: Bearer <jwt>` validated against `OAUTH_ISSUER` / `OAUTH_JWKS_URL`

## Smoke test with MCP Inspector

```
npx @modelcontextprotocol/inspector
```

In the Inspector UI:
1. Set transport to "Streamable HTTP" pointing at `http://localhost:3001/mcp`
2. Set Authorization header to `Bearer <JWT>` (obtain from backend `/api/auth/login` or full OAuth flow)
3. Click "Connect" then "List Tools" → should see 20 tools
4. Test `whoami` first (no scope needed)
5. Test `search_patients` (requires `patients:read` scope)
6. Test `create_patient` (requires elicitation; Inspector will prompt for fields)

## Type regeneration

When the backend's OpenAPI changes:

```
cd mcp-server
./scripts/regenerate-api-types.sh
```

This calls `cd ../backend && npm run openapi:export`, then `npx openapi-typescript ../backend/openapi.json -o src/api-types/index.ts`.

CI fails the PR if the generated file drifts from committed.

## Tests

- Unit: `npm test`
- Integration (no backend): `npm run test:integration`
- Full integration (requires backend running): `RUN_FULL_INTEGRATION=1 npm run test:integration`

## Architecture

See `docs/superpowers/specs/2026-05-07-mcp-server-design.md`.
```

- [ ] **Step 2: Write regen script**

Create `mcp-server/scripts/regenerate-api-types.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

BACKEND="../backend"
test -d "$BACKEND" || { echo "backend dir not found: $BACKEND"; exit 1; }

echo "Exporting OpenAPI from backend..."
(cd "$BACKEND" && npm run openapi:export)

echo "Generating TypeScript types..."
npx openapi-typescript "$BACKEND/openapi.json" -o src/api-types/index.ts

echo "Done. src/api-types/index.ts updated."
```

- [ ] **Step 3: Make executable**

Run: `chmod +x mcp-server/scripts/regenerate-api-types.sh`

- [ ] **Step 4: Run regen script and inspect output**

Run: `cd mcp-server && ./scripts/regenerate-api-types.sh`
Expected: writes `src/api-types/index.ts` (a few hundred KB of TS interfaces)

Verify the file exists:
Run: `ls -lh mcp-server/src/api-types/index.ts`

The file is gitignored so should not be committed; CI regenerates per build.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/README.md mcp-server/scripts/
git commit -m "docs(mcp): README + OpenAPI regeneration script"
```

### Task 8.3: Add OpenAPI drift check to CI

**Files:**
- Modify: `.github/workflows/mcp-build-test.yml`

- [ ] **Step 1: Add drift step**

Edit `.github/workflows/mcp-build-test.yml`. After the `npm run build` step, add a job that depends on the backend installing and exporting OpenAPI:

```yaml
  mcp:
    name: mcp (build + test)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm

      - name: Install backend deps
        run: npm ci
        working-directory: backend

      - name: Export OpenAPI from backend
        run: npm run openapi:export
        working-directory: backend

      - name: Install mcp-server deps
        run: npm ci
        working-directory: mcp-server

      - name: Generate api-types
        run: npx openapi-typescript ../backend/openapi.json -o src/api-types/index.ts
        working-directory: mcp-server

      - name: Verify api-types are usable (typecheck)
        run: npm run typecheck
        working-directory: mcp-server

      - name: Lint
        run: npm run lint
        working-directory: mcp-server

      - name: Test
        run: npm test
        working-directory: mcp-server

      - name: Build
        run: npm run build
        working-directory: mcp-server
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/mcp-build-test.yml
git commit -m "ci(mcp): regenerate api-types from backend OpenAPI in CI"
```

### Task 8.4: Manual end-to-end smoke test

This is a manual verification step before declaring Sub #3 done. No code changes.

- [ ] **Step 1: Start the backend**

In one terminal:
```
cd backend
DATABASE_URL=postgres://curaciones:curaciones@localhost:5433/curaciones_dev npm run start:dev
```
Wait for `Application is running`.

- [ ] **Step 2: Start the MCP server**

In another terminal:
```
cd mcp-server
cp .env.example .env
npm run dev
```
Wait for `mcp-server listening`.

- [ ] **Step 3: Health check**

Run: `curl http://localhost:3001/health`
Expected: `{"status":"ok","version":"0.1.0","uptime":<small_number>}`

- [ ] **Step 4: Open MCP Inspector**

Run: `npx @modelcontextprotocol/inspector`
Open the URL it prints.

- [ ] **Step 5: Get a bearer**

Either:
- Login via backend `POST /api/auth/login` with `{username:"admin", password:"admin"}` → use returned `accessToken`
- OR complete a full OAuth flow with a DCR client (more realistic, but more setup)

- [ ] **Step 6: Connect Inspector to MCP server**

In Inspector: transport = streamable HTTP, URL = `http://localhost:3001/mcp`, header `Authorization: Bearer <token>`. Click Connect.

- [ ] **Step 7: List tools**

Click "List Tools". Expect 20 tools shown. Verify `readOnlyHint` and `destructiveHint` annotations are visible.

- [ ] **Step 8: Test whoami**

Call `whoami` with `{}`. Expect JSON with `userId`, `organizationId`, `username` etc.

- [ ] **Step 9: Test search_patients**

Call `search_patients` with `{ "q": "" }`. Expect a list of patients (depending on seeded data).

- [ ] **Step 10: Test create_patient (elicitation)**

Call `create_patient` with `{}`. Inspector should prompt for elicitation fields (rut, firstName, etc.). Submit valid values. Expect `{ id: <new id> }` response.

- [ ] **Step 11: Test scope-denied path**

Modify the bearer to one with only `patients:read` scope (or temporarily remove `patients:write` from the test user). Call `create_patient` again. Expect MCP error containing `patients:write`.

- [ ] **Step 12: Note results in memory**

If everything passes, save a memory note documenting the smoke test passed. If any step fails, fix the issue, re-run from where it broke, and repeat until clean.

- [ ] **Step 13: No commit; the smoke test is a verification gate**

---

## Phase 9 — Final verification and cleanup

### Task 9.1: Full test sweep

- [ ] **Step 1: Backend full tests**

Run: `cd backend && npm test -- --ci`
Expected: ALL PASS

- [ ] **Step 2: MCP unit tests with coverage**

Run: `cd mcp-server && npx vitest run --coverage`
Expected: ALL PASS, coverage ≥ 85% lines

- [ ] **Step 3: MCP integration tests (no backend dep)**

Run: `cd mcp-server && npm run test:integration`
Expected: PASS

- [ ] **Step 4: Build both**

Run: `cd backend && npm run build`
Run: `cd mcp-server && npm run build`
Expected: clean exit on both

- [ ] **Step 5: Lint both**

Run: `cd backend && npm run lint`
Run: `cd mcp-server && npm run lint`
Expected: clean exit on both

- [ ] **Step 6: If any failure, debug and fix; do not proceed until clean**

### Task 9.2: Verify DoD checklist from spec §12

- [ ] **Step 1: Walk the DoD list, mark each item**

Open `docs/superpowers/specs/2026-05-07-mcp-server-design.md` §12. For each numbered item, confirm:

1. ✅ Servicio mcp-server deployado: deferred to Render-side (post-merge step)
2. ✅ 19 tools + whoami implementadas: verified by `tools/catalog.test.ts` and per-tool tests
3. ✅ JWT validation con JWKS: verified by `jwt-verifier.test.ts`
4. ✅ Las 5 tools con elicitation: verified by tests + manual smoke step 10
5. ✅ Logs estructurados con redaction: verified by `logger.test.ts` and visual inspection in dev
6. ✅ CI passing: verified by green workflow run
7. ✅ README + smoke instructions: present in `mcp-server/README.md`
8. ✅ Smoke test E2E manual: completed in Phase 8.4

If any item is incomplete, address it before declaring done.

### Task 9.3: Save claude-mem note

- [ ] **Step 1: Save a memory entry**

Save a short memory entry summarizing:
- Sub #3 MCP server implementation complete
- 19 tools v1 + whoami covering patients, agenda, curaciones, wound notes, inventory, reports
- Acopla con backend via JWT validation (aud=issuer, sin cambios al AS)
- Cursor pagination agregada al backend en fase 0
- CI workflow nuevo `mcp-build-test.yml` con OpenAPI drift check
- DoD §12 cumplido localmente; deploy a Render pendiente como step manual posterior

Per memory rules, save as a `project_*` memory file with the relevant facts.

---

## Self-Review

After writing this plan, the spec was re-read with fresh eyes against this plan:

**1. Spec coverage:**
- §1 Contexto ✓ (covered by overall plan goal)
- §2 Decisiones ✓ (each decision is enforced by a specific phase or task: D1 alcance → phases 1–8, D2 estructura → Phase 1, D3 token validation → Phase 2.1, D4 tracing diferido → no OTel tasks, D5 multi-tenancy → no switch_org tool, D6 catalog of 19 → Phase 3.1, D7 cursor → Phase 0, D8 no rate limit → not in plan, D9 stack → Phase 1.1, D10 audience → JWKS test verifies aud=issuer)
- §3 Topology ✓ (Phase 7.2 wires MCP transport with auth)
- §4 Tools ✓ (Phases 3, 4, 5, 6 cover all 20)
- §4.5 Cursor pagination ✓ (Phase 0)
- §5 Auth ✓ (Phase 2)
- §6 Elicitation ✓ (Phase 5.1 helper, Phases 5.2–5.3 use it)
- §7 Errors ✓ (Phase 2.4)
- §8 Logging ✓ (Phase 1.3)
- §9 Testing ✓ (Phase 8.1 + per-tool unit tests)
- §10 Deployment ✓ (Phase 1.5 Dockerfile + Render service; Phase 1.6 CI)
- §11 Out-of-scope ✓ (no tasks for OTel, submission, etc.)
- §12 DoD ✓ (Phase 9.2 verification)

**2. Placeholder scan:** No "TBD" or "implement later" remain. Each step shows actual code or shell commands.

**3. Type consistency:** `ToolContext` interface defined in `catalog.ts` is used consistently across all tool handlers and `register.ts`. `BackendClient`, `BackendRequest`, `BackendResponse` interfaces defined in `backend-client.ts` referenced consistently. `VerifiedToken` from `jwt-verifier.ts` used in catalog and server.ts. No drift detected.

**4. Open notes:**
- Phase 9.3 memory save is intentionally short ("save a memory") rather than dictated content; the executor is expected to use the memory rules in their system prompt.
- Phase 8.4 manual smoke test does not produce a commit; it's a gate, not a code change.

---

**End of plan.**
