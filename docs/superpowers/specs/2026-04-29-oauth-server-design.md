# Sub-proyecto #2 — OAuth 2.0 Authorization Server

**Fecha:** 2026-04-29
**Estado:** Borrador para revisión
**Spec padre (umbrella):** [`2026-04-28-multi-tenant-mcp-platform-umbrella.md`](./2026-04-28-multi-tenant-mcp-platform-umbrella.md)
**Bloquea a:** Sub #3 — MCP Server
**Depende de:** Sub #1 — Multi-tenancy foundation (mergeado a `main` en `6bada78`)

---

## 1. Contexto y objetivo

Sub #1 dejó la app multi-tenant con JWT interno (HS256, 4 h) usado por la SPA. Sub #2 agrega un **OAuth 2.0 / OIDC Authorization Server embebido en el backend NestJS** para que clientes externos (en primer término el MCP server de Sub #3, también MCP Inspector y eventualmente otros clientes del Anthropic Directory) accedan a los recursos del backend bajo el control granular del usuario.

El AS expone los endpoints estándar (CIMD, DCR, authorize, token, revoke, jwks, userinfo), un consent screen renderizado por el SPA, y una página "Aplicaciones conectadas" en Mi cuenta. El access token es JWT firmado RS256 que carga la organización elegida por el usuario en el consent, lo que permite que todo el stack multi-tenancy actual (`OrgScopedQueryFilter`, audit log con hash chain, KMS) funcione sin cambios.

### Definition of Done

- MCP Inspector externo se registra vía DCR, completa el flow OAuth con consent, recibe AT+RT y consume un endpoint protegido por scope.
- Refresh rotation funciona; reuse detection mata la family entera.
- Revocación (CLI + UI "Aplicaciones conectadas") corta acceso inmediato a endpoints write y a más tardar en 10 min en reads (TTL del JWT).
- `oauth-coverage.spec.ts` pasa: cada endpoint tenanted tiene `@RequiredScopes` o `@NoOAuthAccess`.
- OWASP top 10 + RFC 6749 attack checklist documentado y firmado en `docs/runbooks/oauth-security-review.md`.
- `docs/runbooks/oauth-developer-guide.md` documenta endpoints, scopes y troubleshooting.

### Estimación

1.5 – 2 semanas con un dev senior full-time, tests incluidos.

---

## 2. Decisiones (resumen ejecutivo)

| # | Tema | Decisión |
|---|---|---|
| L1 | Librería OAuth | `oidc-provider` (panva). Trae built-in PKCE, DCR, CIMD, JWKS, /userinfo, refresh rotation con reuse detection, consent flows pluggables. |
| L2 | Formato access token | JWT RS256 firmado + `/jwks.json` público. Validación local en clientes (incluido MCP server) sin roundtrip. `jti` deny-list pequeña consultada solo en endpoints write para revocación crítica inmediata. |
| L3 | Multi-org | Token bound a UNA org elegida por el usuario en el consent. Si quiere usar otra org, re-autoriza. Reutiliza todo el stack multi-tenancy actual sin cambios. |
| L4 | DCR | Open registration + rate limit estricto por IP + validación de redirect_uris. Cumple MCP spec / Anthropic Directory sin coordinación previa. Purga de huérfanos por cron. |
| L5 | Scopes | 10 scopes con split read/write consistente: `patients:read`/`write`, `clinical:read`/`write`, `agenda:read`/`write`, `inventory:read`/`write`, `reports:read`, `org:admin`. |
| L6 | TTLs | AT 10 min · RT sliding 30 d / absolute 180 d · authorization_code 60 s · reuse detection on. |
| L7 | Consent | Persistente all-or-nothing. Si scopes y client+org coinciden con grant activo, silent approve. Scopes adicionales gatillan re-prompt sólo de los nuevos. |
| L8 | Keys RSA | Tabla `oauth_signing_key` con private key cifrada con `KmsService` (mismo del Sub #1). Una `active`, varias `retired` siguen en JWKS. Rotación por CLI. |
| L9 | OIDC features | Habilitadas: emitimos `id_token` cuando el cliente pide scope `openid`; exponemos `/oauth/userinfo`. Útil para que Claude muestre "conectado como X". |
| L10 | Revocation endpoint (RFC 7009) | Habilitado. Introspection (RFC 7662) **deshabilitada** en v1 por no tener consumidor. |
| L11 | Auth methods de cliente | `client_secret_basic` + `client_secret_post` + `none` (PKCE-only para public clients tipo Claude Desktop). `client_secret_jwt` y `private_key_jwt` quedan para v2. |

---

## 3. Arquitectura

### 3.1 Ubicación en el monorepo

El AS vive **embebido** en el backend NestJS como `backend/src/oauth/`. No es microservicio aparte: comparte DB, KMS, AuditLog y middleware de org context con el resto del backend.

```
backend/src/oauth/
├── oauth.module.ts
├── oidc-provider.factory.ts             # construye instancia oidc-provider
├── adapters/
│   ├── postgres.adapter.ts              # interfaz Adapter de oidc-provider sobre TypeORM
│   └── account.adapter.ts               # User+Membership → Account
├── entities/
│   ├── oauth-client.entity.ts
│   ├── oauth-grant.entity.ts
│   ├── oauth-token.entity.ts
│   ├── oauth-signing-key.entity.ts
│   └── oauth-revocation.entity.ts       # jti deny-list
├── controllers/
│   ├── oauth-discovery.controller.ts    # /.well-known/* + /jwks.json
│   ├── oauth-authorize.controller.ts
│   ├── oauth-token.controller.ts        # /oauth/token, /oauth/revoke
│   ├── oauth-register.controller.ts     # DCR (RFC 7591/7592)
│   └── oauth-userinfo.controller.ts
├── consent/
│   ├── consent.controller.ts            # GET/POST /oauth/consent/:uid
│   └── consent.service.ts
├── connected-apps/
│   ├── connected-apps.controller.ts     # /api/account/connected-apps
│   └── connected-apps.service.ts
├── guards/
│   ├── oauth-jwt.guard.ts
│   ├── oauth-scope.guard.ts
│   └── multi-auth.guard.ts              # OR de [JwtAuthGuard, OAuthJwtGuard]
├── strategies/
│   └── oauth-jwt.strategy.ts
├── services/
│   ├── oauth-bootstrap.service.ts       # genera primera key
│   ├── oauth-signing-key.service.ts
│   ├── oauth-grant.service.ts
│   └── oauth-revocation.service.ts
├── decorators/
│   ├── required-scopes.decorator.ts
│   └── no-oauth-access.decorator.ts
└── cli/
    └── oauth-rotate-keys.ts
```

### 3.2 Integración con la app actual

- El `JwtAuthGuard` interno sigue protegiendo endpoints del SPA con el JWT corto interno (HS256, 4 h). No se toca.
- Domain controllers (Patients, Curaciones, Agenda, Inventory, etc.) reemplazan `@UseGuards(JwtAuthGuard)` por `@UseGuards(MultiAuthGuard)` y reciben `@RequiredScopes('...')` en cada handler.
- `MultiAuthGuard` corre `JwtAuthGuard` y `OAuthJwtGuard` en orden y acepta el primero que matche. Distinción por `iss`: JWT interno usa `curaciones-internal`, OAuth usa la URL pública del backend.
- `OAuthScopeGuard` se monta como global guard pero es no-op si el request no llegó por OAuth (`req.user.tokenSource !== 'oauth'`).
- Audit log: el `AuditLogInterceptor` global ya captura todo. Por OAuth registramos además entradas específicas (`oauth.consent.granted`, `oauth.grant.revoked`, `oauth.client.registered`, `oauth.key.rotated`, etc.) en endpoints del módulo.

### 3.3 Routing

```
api.<placeholder>.com
  /.well-known/oauth-authorization-server
  /.well-known/openid-configuration
  /jwks.json
  /oauth/register
  /oauth/register/:client_id           (RFC 7592 management)
  /oauth/authorize
  /oauth/consent/:interactionUid       (interno, llamado por el SPA)
  /oauth/token
  /oauth/revoke
  /oauth/userinfo
  /api/account/connected-apps
  /api/account/connected-apps/:grantId

<placeholder>.com (SPA)
  /account/oauth/consent?interaction=<uid>
  /account/connected-apps
```

---

## 4. Modelo de datos

Cinco tablas nuevas. Una sola migration `2026-04-29-oauth-server.ts`. No toca tablas existentes.

### 4.1 `oauth_client`

Cliente OAuth. **Global** (no por org) — un cliente puede ser usado por usuarios de múltiples orgs.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `clientId` | text unique | público; opaque random ~32 chars |
| `clientSecretHash` | text nullable | bcrypt; null si público (`token_endpoint_auth_method = none`) |
| `clientName` | text | de DCR `client_name` |
| `clientUri` | text nullable | landing page |
| `logoUri` | text nullable | mostrado en consent |
| `policyUri`, `tosUri` | text nullable | mostrados en consent |
| `redirectUris` | text[] | HTTPS obligatorio salvo localhost |
| `grantTypes` | text[] | `authorization_code`, `refresh_token` |
| `responseTypes` | text[] | `code` |
| `scope` | text | scopes solicitados al registrarse (default + max) |
| `tokenEndpointAuthMethod` | enum | `client_secret_basic` \| `client_secret_post` \| `none` |
| `applicationType` | enum | `web` \| `native` |
| `softwareId`, `softwareVersion` | text nullable | de DCR |
| `metadata` | jsonb | extras de DCR |
| `firstAuthorizedAt` | timestamptz nullable | NULL si nunca autorizado por usuario; sirve para purga |
| `registrationAccessTokenHash` | text | bcrypt; emitido en POST /oauth/register para management |
| `createdByIp` | text | audit del registro |
| `createdAt`, `updatedAt` | timestamptz | |

### 4.2 `oauth_grant`

Consent persistente. Una fila por `(client, user, org, scope-set)`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `clientId` | text FK → oauth_client.clientId | |
| `userId` | int FK → users.id | |
| `organizationId` | uuid FK → organizations.id | el token quedará bound a esta org |
| `scopes` | text[] | exactamente los autorizados |
| `revokedAt` | timestamptz nullable | |
| `expiresAt` | timestamptz | mismo que RT absolute (180 d) |
| `lastUsedAt` | timestamptz nullable | actualizado en cada refresh exchange |
| `createdAt`, `updatedAt` | timestamptz | |
| índice único | `(clientId, userId, organizationId)` filtrado por `revokedAt IS NULL` | un grant activo por triple |

### 4.3 `oauth_token`

Persistencia genérica de tokens y artifacts internos de oidc-provider.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | text PK | jti del JWT u opaque del code/refresh/interaction |
| `kind` | enum | `access` \| `refresh` \| `authorization_code` \| `interaction` \| `session` \| `registration_access_token` |
| `payload` | jsonb | shape interno de oidc-provider |
| `grantId` | uuid nullable | FK lógica para revocación en cascada |
| `clientId` | text | denormalizado para queries |
| `userId` | int nullable | |
| `organizationId` | uuid nullable | |
| `expiresAt` | timestamptz | TTL definido por kind |
| `consumed` | boolean | reuse detection: si true y se intenta usar de nuevo, mata la family |
| `createdAt` | timestamptz | |

### 4.4 `oauth_signing_key`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | usado como `kid` en JWT header y JWKS |
| `algorithm` | text | `RS256` |
| `publicKeyPem` | text | público, expuesto en /jwks.json |
| `privateKeyEncrypted` | bytea | cifrado con `KmsService.encrypt` (envelope encryption) |
| `status` | enum | `active` \| `retired` \| `revoked` |
| `activatedAt`, `retiredAt`, `revokedAt` | timestamptz nullable | |
| `retireScheduledAt` | timestamptz nullable | cuándo pasa de retired → revoked |
| `createdAt` | timestamptz | |

Una sola key `active` a la vez. `retired` siguen en `/jwks.json` (validan tokens vivos). `revoked` salen de JWKS y matan tokens firmados con ellas.

### 4.5 `oauth_revocation`

jti deny-list para revocación inmediata individual.

| Campo | Tipo | Notas |
|---|---|---|
| `jti` | text PK | |
| `userId` | int | quién revocó |
| `reason` | text | `user_revoked` \| `admin_revoked` \| `compromise` |
| `expiresAt` | timestamptz | mismo que `exp` del JWT — purgable después |
| `createdAt` | timestamptz | |

Consultada solo en endpoints **write** para no penalizar reads.

---

## 5. Endpoints OAuth

### 5.1 Catálogo

| Método | Path | Descripción |
|---|---|---|
| GET | `/.well-known/oauth-authorization-server` | RFC 8414 (CIMD) |
| GET | `/.well-known/openid-configuration` | OIDC discovery |
| GET | `/jwks.json` | claves públicas activas + retired |
| POST | `/oauth/register` | DCR (RFC 7591) |
| GET, PUT, DELETE | `/oauth/register/:client_id` | DCR management (RFC 7592), autenticado con `registration_access_token` |
| GET | `/oauth/authorize` | inicia flow; redirige al SPA si requiere consent |
| GET | `/oauth/consent/:uid` | interno; el SPA lee datos del consent |
| POST | `/oauth/consent/:uid` | interno; el SPA envía decisión y recibe URL de redirect al cliente |
| POST | `/oauth/token` | code → tokens y refresh → tokens |
| POST | `/oauth/revoke` | RFC 7009 |
| GET | `/oauth/userinfo` | OIDC userinfo |
| GET | `/api/account/connected-apps` | grants del usuario |
| DELETE | `/api/account/connected-apps/:grantId` | revoca grant + tokens en cascada |

### 5.2 Discovery payload

```json
{
  "issuer": "https://api.<placeholder>.com",
  "authorization_endpoint": "https://api.<placeholder>.com/oauth/authorize",
  "token_endpoint": "https://api.<placeholder>.com/oauth/token",
  "userinfo_endpoint": "https://api.<placeholder>.com/oauth/userinfo",
  "jwks_uri": "https://api.<placeholder>.com/jwks.json",
  "registration_endpoint": "https://api.<placeholder>.com/oauth/register",
  "revocation_endpoint": "https://api.<placeholder>.com/oauth/revoke",
  "scopes_supported": ["openid", "offline_access", "patients:read", "patients:write", "clinical:read", "clinical:write", "agenda:read", "agenda:write", "inventory:read", "inventory:write", "reports:read", "org:admin"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post", "none"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "subject_types_supported": ["public"],
  "service_documentation": "https://<placeholder>.com/docs/oauth"
}
```

> `openid` y `offline_access` no son scopes funcionales — `openid` activa la emisión de `id_token`, `offline_access` activa la emisión de refresh token.

### 5.3 Flow `authorization_code` con PKCE

```
Cliente (Claude)                Backend NestJS                       SPA (frontend)
     │                                │                                   │
     │ 1. GET /.well-known/oauth-authorization-server                     │
     ├──────────────────────────────▶│                                   │
     │◀── metadata.json ─────────────┤                                   │
     │                                │                                   │
     │ 2. POST /oauth/register {client_name, redirect_uris, ...}         │
     ├──────────────────────────────▶│                                   │
     │◀── {client_id, client_secret?, registration_access_token} ────────┤
     │                                │                                   │
     │ 3. Redirect user agent a /oauth/authorize?response_type=code      │
     │    &client_id=...&redirect_uri=...&scope=patients:read+...        │
     │    &state=xyz&code_challenge=...&code_challenge_method=S256       │
     ├──────────────────────────────▶│                                   │
     │                                │ 4. ¿Usuario logueado en SPA?     │
     │                                │    NO  → 302 a /login?return=... │
     │                                │    SÍ  → ¿grant válido existente │
     │                                │           para (client, user,    │
     │                                │           selected_org, scopes)? │
     │                                │       SÍ → silently approve →    │
     │                                │            issue code → 302      │
     │                                │            cliente con code      │
     │                                │       NO → 302 SPA               │
     │                                │            /account/oauth/       │
     │                                │            consent?interaction=  │
     │                                │            :uid                  │
     │                                │                                   │
     │                                │ 5. SPA renderiza ConsentScreen   │
     │                                │◀── GET /oauth/consent/:uid ───────┤
     │                                │── {client, scopes, orgs[]} ──────▶│
     │                                │                                   │
     │                                │   Usuario elige org del switcher  │
     │                                │   y aprueba/rechaza               │
     │                                │                                   │
     │                                │◀── POST /oauth/consent/:uid ──────┤
     │                                │      {organizationId, approved}   │
     │                                │── {redirectTo: "<cliente>?       │
     │                                │      code=...&state=..."}       ──▶│
     │                                │                                   │
     │◀── 302 redirect del SPA ───────────────────────────────────────────┤
     │                                                                    │
     │ 6. POST /oauth/token                                               │
     │    grant_type=authorization_code                                   │
     │    code=...&code_verifier=...&client_id=...&client_secret=...      │
     ├──────────────────────────────▶│                                   │
     │                                │ Valida code (TTL 60s, una vez,    │
     │                                │ PKCE match), emite AT (JWT 10min) │
     │                                │ + RT (180d abs / 30d sliding)     │
     │◀── {access_token, refresh_token, id_token?, token_type, expires_in}│
     │                                                                    │
     │ 7. Llamada a recurso con Authorization: Bearer <AT>                │
     │    GET /api/patients (scope patients:read)                         │
     ├──────────────────────────────▶│                                   │
     │                                │ OAuthJwtGuard valida firma RS256  │
     │                                │ contra JWKS local (cacheada)      │
     │                                │ + chequea jti deny-list si write  │
     │                                │ + OAuthScopeGuard valida scope    │
     │                                │ + AuditLogInterceptor registra    │
     │◀── 200 + payload ──────────────┤                                   │
```

### 5.4 Refresh + reuse detection

```
POST /oauth/token  grant_type=refresh_token  refresh_token=R1
  → Backend marca R1 como consumed=true
  → Emite R2 (rotación) + AT2
  → Si más tarde llega refresh_token=R1 de nuevo → reuse detection:
       revoca R2, R3...Rn (toda la family) y el grant entero.
       Cliente debe re-pasar por /oauth/authorize.
```

### 5.5 Claims del access token (JWT)

```json
{
  "iss": "https://api.<placeholder>.com",
  "aud": ["api.<placeholder>.com"],
  "sub": "12",
  "client_id": "abc...",
  "scope": "patients:read clinical:read agenda:read",
  "org_id": "uuid-acme",
  "org_name": "CESFAM Acme",
  "role": "Admin",
  "establishment_ids": ["uuid-est-1", "uuid-est-2"],
  "iat": 1714000000,
  "exp": 1714000600,
  "jti": "uuid-...",
  "kid_header": "uuid-key"
}
```

### 5.6 Claims del id_token (cuando se pide scope `openid`)

```json
{
  "iss": "https://api.<placeholder>.com",
  "aud": "<client_id>",
  "sub": "12",
  "iat": 1714000000,
  "exp": 1714000600,
  "auth_time": 1714000000,
  "username": "marcelo",
  "name": "Marcelo Vega",
  "org_id": "uuid-acme",
  "org_name": "CESFAM Acme",
  "role": "Admin"
}
```

### 5.7 `/oauth/userinfo`

GET con Bearer AT → retorna mismos claims de identidad que el id_token (sin `iat/exp/aud/iss`). Útil para clientes que perdieron el id_token o que pidieron solo OAuth (sin scope `openid`).

---

## 6. Scopes y enforcement

### 6.1 Matriz scope → endpoints

| Scope | Cubre |
|---|---|
| `patients:read` | GET `/api/patients`, `/api/patients/:id`, `/api/patients/search`, `/api/patients/:id/curaciones` |
| `patients:write` | POST/PATCH/DELETE `/api/patients/*` (incluye discharge, readmission) |
| `clinical:read` | GET `/api/curaciones/*`, `/api/wound-notes/*`, `/api/wound-photos/*`, `/api/cycles/*` |
| `clinical:write` | POST/PATCH/DELETE de los anteriores |
| `agenda:read` | GET `/api/appointments/*`, `/api/dashboard/pendientes` |
| `agenda:write` | POST/PATCH/DELETE `/api/appointments/*` |
| `inventory:read` | GET `/api/inventory/products`, `/lots`, `/stock-counts`, `/canasta` |
| `inventory:write` | POST/PATCH/DELETE de los anteriores + adjustments |
| `reports:read` | GET `/api/reports/*` (mensual, detallado, audit-log export) |
| `org:admin` | `/api/organizations/*`, `/api/establishments/*`, `/api/users/*` (gestión miembros, roles, invitaciones) |

Reglas:

- Endpoint **read** acepta su `*:read` o el `*:write` correspondiente (write implica read).
- Endpoints **shared** (ej. `/api/auth/me`) accesibles con cualquier AT válido — solo retornan info del usuario y org bound al token.
- Endpoints fuera de la matriz (`/api/auth/login`, `/api/auth/switch-org`, `/api/auth/refresh`, etc.) **no son accesibles vía OAuth**. Marcados con `@NoOAuthAccess`.

### 6.2 Implementación

`OAuthJwtGuard` (passport):

1. Extrae Bearer del header `Authorization`.
2. Valida firma RS256 contra JWKS local (cache 5 min).
3. Valida `iss`, `aud`, `exp`.
4. Cargá `User` y `OrganizationMembership` activos para `(sub, org_id)`. Si membership revocada → 401.
5. Setea `req.user` con shape compatible con JWT interno + `req.user.scopes` y `req.user.tokenSource: 'oauth'`.
6. Para endpoints write (HTTP method en `POST|PATCH|PUT|DELETE`): chequea `oauth_revocation` por `jti`. Si está → 401.

`OAuthScopeGuard` (decorator-driven):

```ts
@RequiredScopes('patients:write')
@Post()
createPatient(...) { ... }
```

- Lee scopes requeridos del decorator vía `Reflector`.
- Si `req.user.tokenSource !== 'oauth'`, no aplica.
- Si scope ausente → 403 con body RFC 6750: `{"error": "insufficient_scope", "scope": "patients:write"}` y header `WWW-Authenticate: Bearer error="insufficient_scope" scope="patients:write"`.

`MultiAuthGuard`:

```ts
@UseGuards(MultiAuthGuard)
@UseGuards(OAuthScopeGuard)
@RequiredScopes('patients:read')
@Get()
list(@CurrentUser() user) { ... }
```

Corre `JwtAuthGuard` y `OAuthJwtGuard` en orden. El primero que matche gana. Distinción por `iss`.

### 6.3 Cobertura

`oauth-coverage.spec.ts` itera todos los routers vía NestJS reflection y falla si:

- Un endpoint domain (excluye `/api/auth/*`, `/api/health`, etc.) carece de `@RequiredScopes` y `@NoOAuthAccess`.

Esto previene que un endpoint nuevo se quede accesible vía OAuth sin scope check.

---

## 7. Consent screen + multi-org

### 7.1 Flujo SPA

Ruta nueva: `/account/oauth/consent` (autenticada con JWT interno). Si llega sin sesión, redirige a `/login?return=...` y vuelve.

Loader llama `GET /oauth/consent/:interactionUid`:

```json
{
  "client": {
    "name": "Claude (Anthropic)",
    "logoUri": "https://...",
    "policyUri": "https://...",
    "tosUri": "https://...",
    "redirectUri": "https://claude.ai/api/oauth/callback"
  },
  "scopes": [
    {"id": "patients:read", "label": "Leer pacientes", "description": "Buscar y consultar pacientes y su historial."},
    {"id": "clinical:write", "label": "Editar fichas clínicas", "description": "Crear y editar curaciones y notas de heridas."}
  ],
  "user": {"id": 12, "username": "marcelo", "fullName": "Marcelo Vega"},
  "organizations": [
    {"id": "uuid-acme", "name": "CESFAM Acme", "role": "Admin"},
    {"id": "uuid-beta", "name": "Clínica Beta", "role": "Clinician"}
  ],
  "preselectedOrganizationId": "uuid-acme"
}
```

### 7.2 Layout

```
┌──────────────────────────────────────────────────────┐
│  [logo cliente]  Claude (Anthropic) quiere conectarse│
│                  con tu cuenta de <Producto>         │
│                                                      │
│  Conectar a:                                         │
│  ╔══════════════════════════════════╗ ▼              │
│  ║ CESFAM Acme — Admin              ║                │
│  ╚══════════════════════════════════╝                │
│                                                      │
│  Esta app podrá:                                     │
│  ✓ Leer pacientes                                    │
│      Buscar y consultar pacientes y su historial.    │
│  ✓ Editar fichas clínicas                            │
│      Crear y editar curaciones y notas de heridas.   │
│  ✓ Leer agenda                                       │
│      Ver citas y disponibilidad.                     │
│                                                      │
│  Podés revocar el acceso en cualquier momento desde  │
│  Mi cuenta › Aplicaciones conectadas.                │
│                                                      │
│  [Política de privacidad del cliente]                │
│  [Términos del cliente]                              │
│                                                      │
│            [ Cancelar ]   [ Autorizar ]              │
└──────────────────────────────────────────────────────┘
```

Reglas UX:

- Si `client.logoUri` está y dominio no es localhost, lo mostramos. Si no, fallback con icono genérico + warning sutil "Aplicación no verificada" cuando `firstAuthorizedAt = null`.
- Selector de organización = mismo `OrgSwitcher` del header. Si el usuario está en una sola org, se renderiza como texto estático.
- Construido con primitives existentes (`Card`, `Button`, etc.) siguiendo el design system del proyecto.

### 7.3 Submit

`POST /oauth/consent/:uid` con `{ "approved": true, "organizationId": "uuid-acme" }`:

1. Valida que el usuario tenga membership activa en `organizationId`.
2. Crea/reactiva row en `oauth_grant` con `(clientId, userId, organizationId, scopes)` + `expiresAt = now + 180d`.
3. Llama `oidcProvider.interactionFinished(...)`; oidc-provider responde con la URL de redirect.
4. Devuelve `{ "redirectTo": "..." }` al SPA → `window.location.assign(redirectTo)`.
5. Audit log: `action=oauth.consent.granted`, `entityType=OAuthGrant`, `before=null`, `after={clientId, scopes, organizationId}`.

Si `approved=false`: oidc-provider redirige al cliente con `error=access_denied&state=...`.

### 7.4 Cancel implícito

Si el usuario navega fuera, el `interaction` expira a los 10 min. Cliente recibe error genérico de timeout.

### 7.5 Edge: usuario sin orgs

Imposible vía la app actual (todo user tiene al menos una membership). Si llega a pasar → consent muestra "No perteneces a ninguna organización; contactá a un administrador" + Cancelar.

---

## 8. UI "Aplicaciones conectadas"

Ruta SPA: `/account/connected-apps`. Acceso desde menú "Mi cuenta" y desde footer del consent screen.

### 8.1 Endpoints

| Método | Path | Body / Query | Respuesta |
|---|---|---|---|
| GET | `/api/account/connected-apps` | — | `[{grantId, client: {name, logoUri, policyUri}, organizationId, organizationName, scopes, lastUsedAt, createdAt, expiresAt}]` |
| DELETE | `/api/account/connected-apps/:grantId` | — | 204; revoca grant + cascade |

JWT interno, `userId` del token debe matchear `oauth_grant.userId`. Audit log en cada DELETE.

`lastUsedAt` se actualiza en cada refresh exchange via callback de oidc-provider.

### 8.2 Layout

```
┌─────────────────────────────────────────────────────────┐
│  Aplicaciones conectadas                                │
│  ─────────────────────────────────────────────          │
│  Estas aplicaciones pueden acceder a tu cuenta.         │
│  Revocar el acceso es inmediato.                        │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ [logo] Claude (Anthropic)                         │  │
│  │        Conectada a CESFAM Acme · 5 scopes         │  │
│  │        Último uso: hace 2 horas                   │  │
│  │        Conectada el 2026-04-15                    │  │
│  │                                            [Revocar]│  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  Si no ves una app que esperabas, asegurate de estar    │
│  en la organización correcta. Cada conexión está        │
│  asociada a una organización específica.                │
└─────────────────────────────────────────────────────────┘
```

Reglas:

- Mostrar **todos** los grants del usuario, sin filtrar por org actual. Cada card indica explícitamente la org (un usuario puede haber conectado la misma app a dos orgs distintas).
- "Revocar" abre `useConfirm()` modal: "Vas a revocar el acceso de Claude a CESFAM Acme. Esto cierra cualquier sesión activa de la app inmediatamente. ¿Confirmás?".
- Después de confirmar: DELETE → toast de éxito → recarga lista.
- Empty state: "No tenés aplicaciones conectadas. Cuando una app pida acceso a tu cuenta, podrás verla acá."

Primitives: `Card`, `Button`, `EmptyState`, `Skeleton`, `useConfirm`, `useToast`, `PageHeader`. Sin `<table>`.

### 8.3 Cascada de revocación

Backend al revocar:

1. Marca `oauth_grant.revokedAt = now`.
2. Marca todos `oauth_token.expiresAt = now()` con `grantId = :id`.
3. Inserta en `oauth_revocation` los `jti` de los AT vivos (TTL = `exp` original) para corte inmediato en endpoints write.
4. AuditLog `action=oauth.grant.revoked` con detalle.

---

## 9. Rate limiting + abuse protection

`@nestjs/throttler` (ya instalado, in-memory por instancia). Redis-backed queda fuera de scope (v2 cuando haya > 1 instancia).

### 9.1 Capas

| Capa | Llave | Límite | Aplica a |
|---|---|---|---|
| Por IP en `/oauth/register` | `ip` | 10 / hora | DCR spam |
| Por IP en `/oauth/token` | `ip` | 60 / minuto | password-spray-style en code exchange |
| Por IP en `/oauth/authorize` | `ip` | 30 / minuto | enumeration de clients |
| Por OAuth client en `/oauth/token` | `clientId` | 600 / minuto | cliente compromiso o malformado |
| Por (clientId, userId) en `/api/*` con AT OAuth | `clientId:userId` | 300 / minuto | una app no agota la org |
| Por OAuth client global en `/api/*` | `clientId` | 1200 / minuto | un cliente no agota recursos compartidos |
| Por scope destructivo (`*:write`, `org:admin`) en `/api/*` | `clientId:userId:scope` | 60 / minuto | escrituras más caras y peligrosas |

### 9.2 Implementación

`OAuthClientThrottlerGuard` extiende `ThrottlerGuard`, override `getTracker` según la regla. El `OAuthScopeGuard` ya conoce qué scope se está consumiendo y deja la info disponible para que el throttler lea.

oidc-provider tiene rate limiting interno; lo deshabilitamos para que solo aplique el nuestro.

### 9.3 Respuesta

```
HTTP/1.1 429 Too Many Requests
Retry-After: 30

{ "error": "rate_limited", "retryAfter": 30, "scope": "patients:write" }
```

### 9.4 Audit anómalo

Si un client recibe `429` más de 10 veces en 5 min, generamos `audit_log` con `action=oauth.client.rate_limit_breach`. No suspende automáticamente.

### 9.5 Validación de redirect_uri en DCR

- HTTPS obligatorio salvo `http://localhost`, `http://127.0.0.1`, `http://[::1]` (cualquier puerto, dev local).
- Sin fragments (`#`).
- Sin wildcards.
- Exact match en `/oauth/authorize` (no prefix).

### 9.6 Purga de huérfanos

Cron diario (NestJS scheduler):

- `oauth_client` con `firstAuthorizedAt = NULL` y `createdAt < now - 30d` → eliminar.
- `oauth_token` con `expiresAt < now - 7d` → purgar.
- `oauth_revocation` con `expiresAt < now` → purgar.
- `oauth_grant` con `revokedAt < now - 90d` → archivar (campo `archivedAt`, oculto de listados pero retenido para audit).

---

## 10. Key management

### 10.1 Bootstrap

`OAuthBootstrapService` corre al primer arranque con OAuth habilitado:

1. Si hay row con `status='active'`, no hace nada.
2. Genera RSA 2048 con `crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })`.
3. Cifra `privateKey.export({type:'pkcs8', format:'pem'})` con `KmsService.encrypt(plainBuffer)`.
4. Inserta row con `status='active'`, `algorithm='RS256'`, `kid=uuid()`, `activatedAt=now()`.
5. Audit log `action=oauth.key.created`.

Test E2E lo cubre.

### 10.2 Servicio

`OAuthSigningKeyService`:

- `getActiveKey()`: cache en memoria, refresh cada 5 min. Devuelve `{kid, privateKey, publicKey}`.
- `getAllPublishableKeys()`: cache para `/jwks.json` (incluye `active` + `retired`).
- `invalidate()`: reset de cache, llamable desde el CLI.

oidc-provider acepta `jwks` config dinámica → le pasamos el resultado en el factory.

### 10.3 CLI de rotación

```
npm run oauth:rotate-keys [--force] [--retire-after-days=7] [--dry-run] [--reason="..."]
```

Algoritmo:

1. `BEGIN TRANSACTION`.
2. Genera nueva RSA 2048.
3. Cifra y inserta row con `status='active'`.
4. Update key activa anterior → `status='retired'`, `retiredAt=now()`, `retireScheduledAt = now + retireAfterDays`.
5. Audit log `action=oauth.key.rotated`.
6. `COMMIT`.
7. Notifica via señal a la(s) instancia(s) del backend para invalidar cache. Mecanismo: endpoint `POST /api/admin/oauth/keys/refresh`, autenticado con JWT interno + role `Owner` global (el mismo CLI hace login con un usuario admin de servicio configurado en env). Best-effort: si falla, los 5 min de polling lo recogen.

Cron diario: keys con `status='retired'` y `retireScheduledAt < now()` → `status='revoked'` + remove de JWKS. Audit log por cada una.

### 10.4 Política

- **Programada:** cada 90 días (manual en v1 vía CLI, automatizable en v2).
- **De emergencia:** `npm run oauth:rotate-keys --force --retire-after-days=0 --reason="compromise"`. Mata todos los AT firmados con la key vieja inmediatamente.

### 10.5 Algoritmo

RS256 con RSA 2048. Razones:

- Soporte universal de OAuth/JWT clients (incluido Anthropic).
- 2048 mínimo aceptable hoy y suficiente para TTLs cortos.
- ES256 sería más rápido / compacto pero soporte universal RS256 gana en v1. Migración futura es posible (dual-issue).

---

## 11. Testing strategy

### 11.1 Unit (`*.spec.ts`)

| Archivo | Cubre |
|---|---|
| `oauth-signing-key.service.spec.ts` | Bootstrap genera primera key; cache invalidation; getActiveKey vs getAllPublishableKeys |
| `consent.service.spec.ts` | Crea grant nuevo; reactiva grant revocado si scopes coinciden; falla si user no tiene membership en la org elegida |
| `oauth-scope.guard.spec.ts` | `*:write` implica `*:read`; insufficient_scope devuelve body + WWW-Authenticate correctos; tokenSource interno bypassa el guard |
| `oauth-jwt.strategy.spec.ts` | Valida firma con kid activo; rechaza kid `revoked`; chequea jti deny-list solo en write; setea req.user con shape compatible JWT interno |
| `postgres-adapter.spec.ts` | Adapter interface (upsert, find, findByUserCode, findByUid, consume, destroy, revokeByGrantId) |
| `oauth-coverage.spec.ts` | Test estático de gobernanza |

### 11.2 Integration / E2E (`test/oauth/*.e2e-spec.ts`)

DB real (`pretest:e2e` corre migrations).

| Archivo | Escenario |
|---|---|
| `oauth-discovery.e2e-spec.ts` | `.well-known/*` y `/jwks.json` con active key |
| `oauth-dcr.e2e-spec.ts` | POST register válido/inválido; rate limit 429; PUT/DELETE management |
| `oauth-flow-happy-path.e2e-spec.ts` | DCR → authorize → consent silent → token → /api/patients OK |
| `oauth-flow-consent.e2e-spec.ts` | Primera autorización requiere consent; aprobar/rechazar |
| `oauth-flow-pkce.e2e-spec.ts` | Sin verifier falla; verifier incorrecto falla; S256 OK; plain rechazado |
| `oauth-flow-refresh.e2e-spec.ts` | Refresh válido; reuse mata family; sliding extiende; absolute corta |
| `oauth-multi-org.e2e-spec.ts` | Token bound a org A no ve org B; segunda autorización a otra org genera grant independiente |
| `oauth-scopes.e2e-spec.ts` | Solo read no permite write; insufficient_scope correcto; org:admin no permite read de pacientes |
| `oauth-revocation.e2e-spec.ts` | DELETE corta writes inmediato; reads fallan al expirar JWT (10 min) |
| `oauth-key-rotation.e2e-spec.ts` | Rota K1→K2; K1 sigue válido hasta retiro; revoke de K1 invalida tokens K1 |
| `oauth-rate-limits.e2e-spec.ts` | Cada layer dispara 429 al N+1; Retry-After header |
| `oauth-isolation.e2e-spec.ts` | Espejo de `org-isolation.spec.ts` con tokens OAuth |

### 11.3 Conformance (manual + scripted)

Pre-merge gate, no en CI por ahora:

1. **MCP Inspector** (Anthropic) corre full flow contra dev. Si falla, no se mergea.
2. Cliente OAuth genérico (`test/oauth/conformance.ts`) valida:
   - JWT claims requeridos (iss, sub, aud, exp, iat, jti, scope)
   - JWKS responde con `cache-control: max-age=3600`
   - Errors siguen RFC 6749 / 6750 (`error`, `error_description`, `error_uri` opcional)
   - PKCE S256 obligatorio (plain rechazado)
3. **OWASP top 10 + RFC 6749 attack checklist** documentado en `docs/runbooks/oauth-security-review.md`. Items:
   - redirect_uri exact match (no prefix bypass)
   - state parameter propagado correctamente
   - code single-use (consumed flag)
   - JWT `aud` enforced
   - Sin info leak de existencia de clients (DCR siempre 200/400 genéricos)

### 11.4 Cobertura objetivo

- Unit: ≥ 90% lines en `backend/src/oauth/`.
- Integration: cada endpoint OAuth con happy + error path mínimo.
- Coverage gate: `oauth-coverage.spec.ts` debe pasar sin skips.

---

## 12. Roadmap (hitos)

| # | Hito | Entregable |
|---|---|---|
| 1 | Esqueleto + DB | Module montado, 5 tablas + migration, entities, OAuthBootstrapService genera primera key. Tests: bootstrap. |
| 2 | Adapter Postgres + oidc-provider factory | Adapter sobre TypeORM, provider configurado con scopes y claims OIDC custom. Tests: adapter unit. |
| 3 | Discovery + JWKS | `.well-known/*` + `/jwks.json`. Tests: e2e discovery. |
| 4 | DCR endpoint | POST/GET/PUT/DELETE `/oauth/register` con validación + rate limit IP. Tests: e2e DCR. |
| 5 | Authorize + consent flow | `/oauth/authorize` + ConsentScreen + `/oauth/consent`; silent-approve si grant existe. Tests: e2e consent + happy path. |
| 6 | Token + PKCE + refresh rotation | `/oauth/token` con grants; PKCE S256 obligatorio; reuse detection. Tests: e2e PKCE, refresh, multi-org. |
| 7 | Scope enforcement | Guards + decorators + matriz aplicada en domain controllers; `oauth-coverage.spec.ts` pasa. Tests: e2e scopes, isolation. |
| 8 | Revocation + connected-apps UI | `/oauth/revoke` + `/api/account/connected-apps` + página SPA con confirm. Tests: e2e revocation. |
| 9 | /userinfo + id_token | OIDC `openid` scope emite id_token; `/oauth/userinfo` correcto. Tests: e2e claims. |
| 10 | Rate limiting | OAuthClientThrottlerGuard con todas las capas. Tests: e2e rate limits. |
| 11 | Key rotation CLI + cron de purga | `npm run oauth:rotate-keys` con flags; cron diario. Tests: e2e key rotation. |
| 12 | Conformance + security review | MCP Inspector pasa flow en staging; OWASP checklist en `docs/runbooks/oauth-security-review.md`; conformance script pasa; `docs/runbooks/oauth-developer-guide.md`. |

### 12.1 Pre-merge migration drill

Aunque no hay data legacy, antes de merge corremos las migrations contra clone de prod en staging para validar performance de los índices nuevos en tablas pobladas vecinas. Documentado en runbook.

---

## 13. Out-of-scope (v1)

| Tema | Razón / cuándo |
|---|---|
| Listado admin "qué apps tienen acceso a mi org" | v2; user-side connected-apps cubre el principal caso de uso |
| Revocación automática por anomaly detection | v2; rate-limit-breach genera audit log para review manual |
| Token introspection endpoint (RFC 7662) | No lo necesita ningún cliente actual; agregamos cuando aparezca consumidor |
| `client_secret_jwt` y `private_key_jwt` auth methods | v2 |
| Redis-backed throttler | Cuando haya > 1 instancia o carga lo justifique |
| Pre-registro de clients first-party | v1 todos vía DCR |
| Per-user scope downgrade en consent (checkboxes) | v2; v1 es all-or-nothing |
| Refresh token TTL configurable por client | v2 |
| OAuth como cliente (SSO Microsoft Entra) | Diferido a v2 según D6 del umbrella |
| Webhooks de eventos OAuth | v2 |
| Apps verificadas / badge oficial | v2 |
| Login con Google / GitHub para nuestros propios usuarios | Fuera de scope total |

---

## 14. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| oidc-provider integration con NestJS no es trivial | Media | Medio | Spike de 1 día al inicio del hito 2; si falla, fallback a `@node-oauth/oauth2-server` (decisión documentada antes del hito 3) |
| Endpoint coverage con `@RequiredScopes` se filtra | Media | Crítico | Test estático `oauth-coverage.spec.ts` falla CI si endpoint nuevo no tiene marcador |
| Conflict entre MultiAuthGuard y guards existentes (roles, throttler) | Baja | Medio | Spec define orden: MultiAuth → ScopeGuard → RolesGuard → ThrottlerGuard. Test e2e cubre cada combinación |
| MCP Inspector falla por detalle de CIMD | Baja | Medio | Hito 12 lo prueba antes de release |
| Bug criptográfico en PKCE / signing | Baja | Crítico | Mitigado por usar oidc-provider battle-tested; OWASP checklist como gate |
| Performance de RS256 sign en /token bajo carga | Baja | Bajo | RS256 con RSA 2048 ~1ms por firma; no es cuello en v1 |

---

## 15. Decisiones diferidas a Sub #3

- Lista exacta de las 18 tools v1 del MCP server.
- Estrategia de paginación en tools (cursor vs offset).
- Schemas JSON exactos de cada tool.
- Comportamiento del MCP frente a `insufficient_scope` (¿pide al usuario re-autorizar con scope ampliado, o reporta failure?).
