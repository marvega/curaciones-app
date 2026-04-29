# Sub #1 — Multi-Tenancy Foundation

**Fecha:** 2026-04-28
**Estado:** Borrador para revisión
**Tipo:** Spec hijo
**Spec padre (umbrella):** `docs/superpowers/specs/2026-04-28-multi-tenant-mcp-platform-umbrella.md`
**Branding:** dominio `<placeholder>` se usa hasta decidir branding final.

---

## 1. Contexto y dependencias

Este sub-proyecto introduce multi-tenancy en el backend NestJS+TypeORM+Postgres. Sin esto, los sub-proyectos #2 (OAuth) y #3 (MCP) no pueden existir — un access token OAuth carece de significado si los datos no están aislados por organización.

### 1.1 Hallazgos del codebase actual relevantes para el diseño

| Hallazgo | Impacto |
|---|---|
| Solo `Lot` y `StockCount` tienen `establishmentId`. Patient, Curacion, Appointment, WoundPhoto, WoundNote, ConsentSignature, Product, Canasta, MonthlyCycle son globales. | Migración masiva: 11 entities ganan `organizationId NOT NULL`; `Lot` y `StockCount` ya derivan vía `establishmentId` |
| Existe entity `Establishment` (`establishments/establishment.entity.ts:4`) sin organizationId. | Sub-ordinamos a Organization, no la creamos |
| No hay password reset, signup público, logout, refresh tokens ni email infra. | Lifecycle completo de auth se construye en este sub-proyecto |
| No hay KMS / cifrado at-rest. Solo bcrypt para passwords. | Toda la stack de cifrado L2 se introduce acá |
| `AuditLog` actual es rudimentario: solo POST/PUT/DELETE, sin before/after, sin user-agent, sin requestId, sin hash chain. | Refactor significativo para L2 |
| Migrations se aplican vía `npm run start:prod` antes del boot. | Mecanismo OK, no se modifica |

### 1.2 Decisiones estratégicas (heredadas del umbrella + refinadas en brainstorming)

| Tema | Elección |
|---|---|
| Provisión de orgs | CLI script `npm run admin:create-org` (sin endpoint HTTP en v1) |
| Org activa | Firmada en JWT; `POST /api/auth/switch-org` re-emite token con otra org |
| Auth lifecycle | Completo: invitation, password reset, change, refresh rotativo, logout, logout-all, sessions |
| Email provider | Resend (gratis hasta 3k/mes, swappable vía interface) |
| Cifrado at-rest | AWS KMS con envelope encryption |
| Catálogo | Per-org (Product, ProductCode, CanastaCategory, MonthlyCycle todos llevan organizationId) |
| Migración prod | Datos actuales → Org #1 ("Curaciones Demo") con el user actual como Owner |

---

## 2. Data model

### 2.1 Tablas nuevas

**Organization** (tenant root)

```
id              bigserial PK
name            varchar(200) NOT NULL
rut             varchar(20)  NULL
status          enum('active','suspended','archived') DEFAULT 'active'
tier            enum('free','pilot','paid') DEFAULT 'pilot'
settings        jsonb DEFAULT '{}'
createdAt, updatedAt, deletedAt
```

**OrganizationMembership** (M:N user ↔ org con rol)

```
id              bigserial PK
userId          int NOT NULL → users(id)
organizationId  bigint NOT NULL → organization(id)
role            enum('owner','admin','clinician','receptionist') NOT NULL
status          enum('active','revoked') DEFAULT 'active'
invitedAt       timestamptz NULL
acceptedAt      timestamptz NULL
revokedAt       timestamptz NULL
UNIQUE(userId, organizationId)
```

**UserEstablishmentAssignment** (qué establishments puede operar el user)

```
userId          int NOT NULL → users(id)
establishmentId bigint NOT NULL → establishment(id)
createdAt
PRIMARY KEY (userId, establishmentId)
```

**RefreshToken** (sesiones server-side rotables)

```
jti             uuid PK
userId          int NOT NULL → users(id)
organizationId  bigint NOT NULL
tokenHash       char(64) NOT NULL  -- SHA-256 del token plaintext
deviceLabel     varchar(200) NULL
ipAddress       varchar(45) NULL
userAgent       text NULL
issuedAt        timestamptz NOT NULL
lastUsedAt      timestamptz NOT NULL
expiresAt       timestamptz NOT NULL
revokedAt       timestamptz NULL
rotatedFromJti  uuid NULL          -- chain para detectar reuse attack
INDEX (userId, revokedAt)
```

**Invitation** (a usuarios que aún no tienen cuenta)

```
id              bigserial PK
organizationId  bigint NOT NULL → organization(id)
email           varchar(320) NOT NULL
role            enum(...) NOT NULL
invitedById     int NOT NULL → users(id)
tokenHash       char(64) NOT NULL
expiresAt       timestamptz NOT NULL  -- default now + 7d
acceptedAt      timestamptz NULL
cancelledAt     timestamptz NULL
PARTIAL UNIQUE (organizationId, email) WHERE acceptedAt IS NULL AND cancelledAt IS NULL
```

**PasswordResetToken**

```
id              bigserial PK
userId          int NOT NULL → users(id)
tokenHash       char(64) NOT NULL
expiresAt       timestamptz NOT NULL  -- default now + 1h
usedAt          timestamptz NULL
INDEX (userId, usedAt)
```

### 2.2 Cambios a tablas existentes

```
-- Establishment ahora pertenece a org
establishment
  ADD COLUMN organizationId bigint NOT NULL → organization(id)

-- User: email, verificación, rotación de pwd; quitar role (vive en membership)
users
  ADD COLUMN email             varchar(320) UNIQUE
  ADD COLUMN emailHash         char(64)     -- SHA-256(lower(email)) para búsqueda
  ADD COLUMN emailVerifiedAt   timestamptz
  ADD COLUMN passwordChangedAt timestamptz
  DROP COLUMN role

-- 11 entities sin tenant key actual ganan organizationId NOT NULL
patient, patient_status_change, curacion, curacion_edit,
appointment, wound_photo, wound_note, consent_signature,
product, canasta_category, monthly_cycle

ALTER TABLE <each>
  ADD COLUMN organizationId bigint NOT NULL → organization(id)
  CREATE INDEX (organizationId)
  -- Composite: (organizationId, [existing-filter-column])

-- lot, stock_count ya tienen establishmentId; el filtro por org
-- deriva vía establishment.organizationId. No agregamos columna.
-- lot_movement, product_code, canasta_category_product derivan
-- por FK al padre tenanted; tampoco agregamos columna.

-- AuditLog extendido para hash chain + L2
audit_log
  ADD COLUMN organizationId   bigint → organization(id)
  ADD COLUMN establishmentId  bigint NULL
  ADD COLUMN userAgent        text   NULL
  ADD COLUMN requestId        uuid   NULL
  ADD COLUMN beforeJson       jsonb  NULL
  ADD COLUMN afterJson        jsonb  NULL
  ADD COLUMN payloadHash      char(64) NOT NULL
  ADD COLUMN prevHash         char(64) NULL
  ADD COLUMN chainHash        char(64) NOT NULL
  CREATE INDEX (organizationId, id)
```

### 2.3 IDs invariantes

`User.id`, `Establishment.id`, `Patient.id`, `Curacion.id`, etc. **no cambian**. La migración solo agrega `organizationId`. APIs públicas mantienen sus paths.

---

## 3. Auth y sesión

### 3.1 Access token (JWT, 4h)

```
{
  sub: <userId>,
  username,
  email,
  organizationId,
  organizationName,        -- evita roundtrip de display
  role,                    -- en esa org
  establishmentIds: [...],
  iat, exp,
  jti,
  passwordChangedAt        -- si pwdChangedAt cambia post-emisión, este token muere
}
```

Validación en cada request:

1. Firma válida
2. `exp > now`
3. `User.passwordChangedAt <= jwt.passwordChangedAt`
4. `OrganizationMembership(userId, organizationId, status='active')` existe

Cualquier check falla → 401. Frontend interceptor reintenta vía refresh.

### 3.2 Refresh token (JWT corto firmado, 30d, almacenado server-side)

```
{ sub, jti, type: "refresh", exp }
```

- Row en `RefreshToken` con `tokenHash`
- **Rotación obligatoria**: cada `POST /auth/refresh` invalida el viejo y emite nuevo. `rotatedFromJti` apunta al previo.
- **Detección de reuse attack**: si llega refresh con `jti` ya `revoked` y con `rotatedTo` registrado → robado y reusado. Acción: revocar TODA la cadena familiar, forzar logout global del user, alertar.
- `deviceLabel`: derivado de `User-Agent` + IP (geolocation aprox.).

### 3.3 Endpoints (12)

| Método | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/api/auth/login` | none | `{ usernameOrEmail, password }` | `{ accessToken, refreshToken, user, organizations[] }` |
| POST | `/api/auth/refresh` | refresh | `{ refreshToken }` | `{ accessToken, refreshToken }` (rotated) |
| POST | `/api/auth/logout` | access | `{ refreshToken }` | 204 |
| POST | `/api/auth/logout-all` | access | none | 204 (revoca todos los refresh del user) |
| GET | `/api/auth/sessions` | access | none | `[{ jti, deviceLabel, lastUsedAt, current }]` |
| DELETE | `/api/auth/sessions/:jti` | access | none | 204 |
| POST | `/api/auth/switch-org` | access | `{ organizationId }` | `{ accessToken }` (refresh sigue válido) |
| POST | `/api/auth/forgot-password` | none | `{ email }` | 204 (siempre — anti-enumeration) |
| POST | `/api/auth/reset-password` | reset token | `{ token, newPassword }` | `{ accessToken, refreshToken }` (login auto) |
| POST | `/api/auth/change-password` | access | `{ currentPassword, newPassword }` | 204 (toca `passwordChangedAt`) |
| POST | `/api/auth/invitations/preview` | none | `{ token }` | `{ organizationName, role, email, valid }` |
| POST | `/api/auth/invitations/accept` | none | `{ token, password, fullName }` | `{ accessToken, refreshToken }` |

### 3.4 Tokens opacos para invite + reset

Para invitation y password reset, en vez de JWT pesado: `crypto.randomBytes(32).toString('base64url')`. Hash en DB (`tokenHash`), plaintext sólo en email. Single-use (`usedAt`/`acceptedAt`), revocable trivialmente.

### 3.5 `passwordChangedAt` invariante

En `change-password`, `forgot/reset`, `logout-all` → `User.passwordChangedAt = now()`. Cualquier access JWT con `passwordChangedAt < User.passwordChangedAt` se rechaza. Da revocación efectiva inmediata sin blacklist.

---

## 4. Aislamiento por org + audit log con hash chain

### 4.1 OrgScopedQueryFilter

Decorator `@OrgScoped()` en cada entity tenanted + TypeORM subscriber global.

```typescript
const orgContext = new AsyncLocalStorage<{ organizationId: number; bypass?: boolean }>();

@Injectable()
export class OrgContextMiddleware implements NestMiddleware {
  use(req, res, next) {
    const orgId = req.user?.organizationId;
    if (!orgId) return next();              // public endpoint
    orgContext.run({ organizationId: orgId }, next);
  }
}

@EventSubscriber()
export class OrgScopeSubscriber implements EntitySubscriberInterface {
  beforeQuery(event: QueryEvent) {
    const ctx = orgContext.getStore();
    if (!ctx || ctx.bypass) return;
    if (entityIsOrgScoped(event.target)) {
      event.queryBuilder.andWhere(`${alias}.organizationId = :ctxOrgId`, {
        ctxOrgId: ctx.organizationId
      });
    }
  }

  beforeInsert(event: InsertEvent<any>) {
    const ctx = orgContext.getStore();
    if (entityIsOrgScoped(event.entity) && !event.entity.organizationId) {
      if (!ctx?.organizationId) throw new Error('No org context for tenanted entity insert');
      event.entity.organizationId = ctx.organizationId;
    }
  }
}
```

**Reglas de oro:**

- Sin contexto + entity tenanted = error loud (no return silent empty), salvo `bypass:true`
- Cada entity nueva debe sumar `@OrgScoped()` o estar whitelisted explícitamente
- Test obligatorio por entity: `tests/org-isolation/<entity>.spec.ts`

**Escape hatch para CLI / migrations:**

```typescript
await orgContext.run({ organizationId: 0, bypass: true }, async () => {
  // admin operation
});
```

### 4.2 Audit log con hash chain (append-only verificable)

Extiende la tabla actual (no V2). Algoritmo:

```typescript
function computePayloadHash(row: AuditLogRow): string {
  return sha256(JSON.stringify({
    userId: row.userId,
    organizationId: row.organizationId,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    beforeJson: row.beforeJson,
    afterJson: row.afterJson,
    createdAt: row.createdAt.toISOString(),
    requestId: row.requestId
  }));
}

function computeChainHash(prevHash: string | null, payloadHash: string): string {
  return sha256((prevHash ?? 'GENESIS') + payloadHash);
}
```

**Insert con lock pessimista** (evita race):

```typescript
await dataSource.transaction(async (tx) => {
  const last = await tx.query(
    `SELECT chainHash FROM audit_log
       WHERE organizationId = $1
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
    [orgId]
  );
  const prevHash = last[0]?.chainHash ?? null;
  const payloadHash = computePayloadHash(row);
  const chainHash   = computeChainHash(prevHash, payloadHash);
  await tx.insert(AuditLog, { ...row, prevHash, payloadHash, chainHash });
});
```

**Cadena por org**, no global. Razones:

- Compartir cadena global → alterar un row en org A invalida la cadena de org B (cross-tenant fragility)
- En auditoría, importa la integridad **dentro de la org**

### 4.3 CLI `audit-verify`

```bash
npm run audit:verify -- --org 7
```

Recorre `audit_log` de la org en orden de `id`, recomputa `chainHash`, compara. Discrepancia = tampering. Cron mensual + on-demand.

### 4.4 Qué se audita

Mantener el `AuditLogInterceptor` actual extendido:

- Captura before/after para UPDATEs (snapshot pre-update vía `findOne`, body crudo después)
- Captura POST/PUT/DELETE como hoy
- **Suma**: eventos custom vía decorator `@AuditEvent('user.login.success')` para login exitoso/fallido, switch-org, refresh-rotation, password change, invitation accept/decline, role change

---

## 5. Cifrado at-rest con AWS KMS

### 5.1 Patrón envelope encryption

```
KMS  CMK
  │ GenerateDataKey → { plaintext, ciphertext }
  ▼
App
  cifrar(field, AES-256-GCM(plaintext_DEK, IV, AAD))
  guardar en DB: { ciphertext_field, ciphertext_DEK, IV, GCM-tag, AAD }
  descartar plaintext_DEK
```

### 5.2 Formato de campo cifrado

```typescript
type EncryptedField = {
  v: 1;        // schema version
  k: string;   // base64 encrypted DEK
  iv: string;  // base64 GCM nonce (12 bytes)
  c: string;   // base64 ciphertext
  t: string;   // base64 GCM auth tag (16 bytes)
  aad: string; // ej "Patient.rut:42" (previene swap attacks)
};
```

### 5.3 Campos cifrados en v1

| Campo | Razón |
|---|---|
| `Patient.rut` | PII identificador nacional |
| `Patient.address` | PII direccional |
| `Patient.phone` | PII de contacto |
| `Curacion.observations` | Texto libre clínico |
| `WoundNote.notes` | Texto libre clínico |
| `User.email` | PII (queries por `emailHash` indexado) |

**Caveat — `User.email`**: para login lookup usamos `emailHash = SHA-256(lower(email))` indexado, búsqueda por hash. Email mismo cifrado para mostrar.

### 5.4 Performance: cache de DEK

Una DEK por org, cacheada in-memory por hora.

- Startup → no precarga (lazy)
- Primera escritura/lectura de la org → genera DEK, cachea
- TTL 1h → genera nueva (vieja sigue descifrando rows que la usaron)
- Cold path: ~50-200ms KMS roundtrip; hot path: <5ms in-memory

Trade-off: DEK plaintext vive en memoria de la app por ~1h. Mitigación: rotación.

### 5.5 KmsService interface

```typescript
export interface KmsService {
  encrypt(plaintext: string, aad: string): Promise<EncryptedField>;
  decrypt(field: EncryptedField, aad: string): Promise<string>;
  rotateDek(): Promise<void>;
}

export class AwsKmsService implements KmsService { /* ... */ }
export class InMemoryKmsService implements KmsService { /* tests only */ }
```

### 5.6 Rotación

- **CMK**: AWS KMS automático (anual)
- **DEK**: cada hora vía cache TTL
- **Re-encryption job**: futuro, no v1

### 5.7 Error handling

- KMS down → 503 en endpoints que requieren cifrar (escribir paciente). Lecturas con cache hit siguen.
- KMS audit log: cada llamada queda en CloudTrail, AAD identifica contexto.

---

## 6. Provisión, invitaciones, UI

### 6.1 CLI `admin:create-org`

```bash
npm run admin:create-org -- \
  --name "CESFAM Lo Espejo" \
  --owner-email "director@cesfamloespejo.cl" \
  --owner-name "Dra. Patricia Soto" \
  --tier pilot \
  --establishment "Sede principal"
```

Transacción:

1. Crea `Organization`
2. Crea `Establishment`
3. Crea `Invitation` con role='owner', token random, expira en 7d
4. Manda email vía Resend con link `https://<placeholder>/accept-invitation?token=<plaintext>`

Sin endpoint HTTP. Solo desde container o local con `DATABASE_URL` apuntando a prod.

### 6.2 Flujo de invitación (Owner inicial Y miembros posteriores)

```
1. Invitation creada (CLI o /org/invitations endpoint si Owner/Admin invita)
2. Email Resend con link de un solo uso (7d expiry)
3. /accept-invitation?token=...
4. POST /api/auth/invitations/preview → muestra org+rol al user
5. Form: { fullName, password (min 12), confirmPassword }
   Si email ya tiene User → "Iniciá sesión y aceptá desde tu cuenta"
6. POST /api/auth/invitations/accept
   - Crea User si no existe (emailVerifiedAt=now)
   - Crea OrganizationMembership(userId, orgId, role)
   - Marca Invitation.acceptedAt
   - Emite accessToken + refreshToken
   - Audit log: 'user.invited.accepted'
7. Frontend redirige a /agenda
```

### 6.3 UI nueva (frontend)

| Vista | Descripción | Path |
|---|---|---|
| Org switcher (header) | Dropdown entre logo y user menu, cambia org | layout |
| Sesiones activas | Listar devices, revocar individual, cerrar otras | `/account/sessions` |
| Cambiar contraseña | Form simple | `/account/change-password` |
| Olvidé mi contraseña | Pública, en login | `/forgot-password` |
| Reset password | Llega por email | `/reset-password?token=...` |
| Aceptar invitación | Llega por email | `/accept-invitation?token=...` |
| Mi organización → Miembros | Solo Owner/Admin: invitar, cambiar rol, revocar | `/org/members` |
| Mi organización → Invitaciones pendientes | Listar, reenviar, cancelar | `/org/invitations` |
| Mi organización → Establecimientos | CRUD + asignar usuarios | `/org/establishments` |
| Mi organización → Información | Nombre, RUT, settings | `/org/settings` |
| Tag visual de org | "Curaciones · CESFAM Lo Espejo" en header | layout |

UI sigue las primitivas existentes (`frontend/src/components/ui/`).

### 6.4 Email templates (Resend)

`backend/src/email/templates/` con `react-email`:

1. `invitation.tsx`
2. `password-reset.tsx`
3. `password-changed.tsx` (alerta de seguridad)

Layout compartido `<EmailLayout>` con branding placeholder.

### 6.5 Permisos por rol

Decorator `@RequireRole('owner','admin')` evalúa contra el JWT.

Matrix simplificada (apéndice exhaustivo en plan de implementación):

| Acción | Owner | Admin | Clinician | Receptionist |
|---|---|---|---|---|
| Mi cuenta | ✓ | ✓ | ✓ | ✓ |
| Org settings (incluye billing) | ✓ | — | — | — |
| Members invite/revoke | ✓ | ✓ | — | — |
| Establishments CRUD | ✓ | ✓ | — | — |
| Patient CRUD | ✓ | ✓ | ✓ | ✓ |
| Appointment CRUD | ✓ | ✓ | ✓ | ✓ |
| Curacion CRUD | ✓ | ✓ | ✓ | — |
| WoundNote write | ✓ | ✓ | ✓ | — |
| WoundNote read | ✓ | ✓ | ✓ | — |
| Inventory products write | ✓ | ✓ | — | — |
| Inventory lots read | ✓ | ✓ | ✓ | ✓ |
| Inventory reception | ✓ | ✓ | ✓ | — |
| Stock counts | ✓ | ✓ | ✓ | — |
| Canasta CRUD | ✓ | ✓ | — | — |
| Reports read | ✓ | ✓ | ✓ | ✓ |
| Audit log read | ✓ | ✓ | — | — |

---

## 7. Migración de datos + testing

### 7.1 Estrategia de migración: ventana corta + bloque

Razón: pocas writes concurrentes (1 user activo). Online migration (dual-write) no se justifica. Ventana 30-60 min.

**Runbook:**

```
0. Pre-flight: backup verificado restaurable, snapshot Railway, anuncio al user
1. Stop backend (Railway pause)
2. Dump fresco: pg_dump -Fc > pre-migration-<timestamp>.dump
3. Apply migration 1714400000000-MultiTenancyFoundation.ts:
   a. CREATE TABLES: organization, organization_membership,
      user_establishment_assignment, refresh_token, invitation,
      password_reset_token
   b. ALTER TABLE add columns nullable (organizationId) a las 11 entities tenanted directas
   c. INSERT default Org #1 'Curaciones Demo' tier=pilot status=active
   d. INSERT default Establishment(org=1, name='Sede principal') si no existían
      o UPDATE establishment SET organizationId=1 WHERE organizationId IS NULL
   e. UPDATE all tenanted rows SET organizationId=1 WHERE organizationId IS NULL
   f. ALTER COLUMN organizationId SET NOT NULL en cada
   g. CREATE INDEX (organizationId) en cada
   h. INSERT OrganizationMembership(userId=<existing>, orgId=1, role='owner', acceptedAt=now)
   i. UPDATE users SET email=<marcelo's email>, emailVerifiedAt=now WHERE id=<existing>
   j. ALTER users DROP COLUMN role
   k. AuditLog: re-compute hashChain en orden ASC, set organizationId=1
   l. Encrypt sensitive fields (Patient.rut, Curacion.observations, WoundNote.notes,
      Patient.address, Patient.phone, User.email) — primer cifrado batch
4. Boot backend con nueva versión
5. Smoke test: login, ver paciente, agregar curacion, audit-verify --org 1
6. OK → restoration anunciada. Falla → restore pg_dump + revert deploy
```

**Re-cifrado batch (paso l):**

- `bypass:true` context, leer cada row, cifrar el campo, UPDATE
- Chunks de 500 rows con commit por chunk
- Idempotente: skip si ya cifrado (formato JSON con `v:1`)
- Estimación: ~1000 pacientes × 5 fields × 50ms KMS = ~5 min

**Hash chain rebuild (paso k):**

- Loop ordenado por `id` ASC, recompute `prevHash, payloadHash, chainHash`, UPDATE
- Una transacción large
- Estimación: <1s para audit logs típicos

**Rollback:**

1. Pause backend
2. `pg_restore pre-migration-<timestamp>.dump` overwrite
3. Revert deploy a commit anterior
4. Resume backend

### 7.2 Frontend post-migración

Backwards-compatible. JWT trae campos extra (`organizationId`, `role`). Endpoints no cambian de path. Cambios visibles: aparece org switcher (única opción "Curaciones Demo") + Mi cuenta → Sesiones.

### 7.3 Estrategia de testing

#### Suite 1 — Org isolation

Por cada entity tenanted (11 con `organizationId` directo + 2 derivadas vía `establishmentId`), `tests/org-isolation/<entity>.spec.ts`:

- 2 orgs, 2 users, listado isolation
- 404 al fetch by id de otra org
- 404 al update de otra org
- 404 al delete de otra org

Pre-merge gate: PR que agrega entity tenanted sin test de aislamiento → CI falla.

#### Suite 2 — Auth lifecycle

Cubre: invitation flow, login, refresh rotation, refresh-reuse-attack detection, logout-all, switch-org, password reset, change-password, sesiones list/revoke.

#### Suite 3 — Audit hash chain

- `audit-verify` corre limpio en BD post-suite-1
- Tampering detection: UPDATE manual a un audit row → verify lo detecta
- Hash chain por org: alterar org A no rompe org B

#### Suite 4 — KMS encryption

- KmsService mock + assertion de que `Patient.rut` nunca aparece plaintext en DB
- Swap test: copiar ciphertext de pacienteA a pacienteB → decrypt falla por AAD mismatch

#### Suite 5 — Migration end-to-end

- CI levanta Postgres con dump de staging (copia sanitizada de prod)
- Run migration completa
- Smoke test full suite
- Run `audit-verify`

### 7.4 Definition of Done

- [ ] Migration corre limpio en CI con dump de prod restaurado
- [ ] Suite Org isolation: 100% de entities tenanted con tests
- [ ] Suite Auth lifecycle: 12 endpoints cubiertos
- [ ] `audit-verify --org 1` corre limpio post-migration
- [ ] AWS KMS conectado, DEK cache funcional, rotación documentada
- [ ] Org #1 demo operacional, user actual logueable
- [ ] Frontend muestra org switcher, sesiones, mi organización
- [ ] CLI `admin:create-org` documentado en README
- [ ] Pen-test interno básico: 3 users de 3 orgs, intentar leak cross-tenant en cada endpoint

---

## 8. Decisiones diferidas al plan de implementación

- Estructura exacta de carpetas para módulos NestJS nuevos (`oauth/` no aplica acá; sí `organizations/`, `memberships/`, `email/`, `kms/`)
- Estrategia exacta de naming de migrations TypeORM (timestamp prefix ya en uso)
- Detalles UI fina: copy de invitación email, microcopy de errores, validaciones de form (Zod schemas)
- Implementación específica de Resend templates (MJML + react-email)
- Configuración de IAM en AWS para el `KmsUser` que la app usará
- Cómo se almacenan AWS credentials en Railway env (rotación, restricción a operaciones KMS)
- Lista exacta endpoint↔rol matrix (apéndice del plan)
