# Plataforma Multi-Tenant + OAuth + MCP — Spec Umbrella

**Fecha:** 2026-04-28
**Estado:** Borrador para revisión
**Tipo:** Umbrella (descompone en 3 sub-specs)
**Branding:** El dominio `curaciones.com` se usa como *placeholder*. La marca/dominio comercial final está pendiente de decisión y no debe asumirse fija en los sub-specs.

---

## 1. Contexto y objetivo

Curaciones es hoy una app web de gestión clínica de curaciones avanzadas (NestJS + Postgres + React) usada internamente. Queremos llevarla a un producto comercial multi-tenant que pueda ser adoptado por múltiples CESFAMs y centros médicos privados, y que exponga un MCP server publicable en el Anthropic Directory para que profesionales de salud puedan operar la app desde Claude.

Este documento descompone el trabajo en **tres sub-proyectos secuenciales con dependencias claras** y fija las decisiones estratégicas que cruzan los tres. Cada sub-proyecto tendrá su propio spec hijo con detalle técnico.

### Objetivo de negocio

Un usuario de un CESFAM puede:

1. Registrarse en `<placeholder>.com`, crear su organización, invitar al equipo
2. Usar la app web como hoy (con datos aislados de otras orgs)
3. Conectar su cuenta de Claude vía OAuth desde Claude.ai / Desktop / Code
4. Ejecutar acciones (crear paciente, registrar curación, consultar agenda, generar reporte) desde Claude conversacionalmente

---

## 2. Decisiones estratégicas

| # | Decisión | Elección |
|---|---|---|
| D1 | Distribución | SaaS hosteado por nosotros + listado en Anthropic Directory |
| D2 | Compliance posture | **L2** — Listo para auditoría privada (cifrado at-rest, audit log inmutable con hash chain, KMS, retention policies, DPA firmable, export por paciente). L3 (compliance MINSAL chileno, normativa específica a validar con asesoría legal) explícito en roadmap. |
| D3 | Modelo de tenancy | Jerárquico: `Organization → Establishment` |
| D4 | Roles | 4 fijos por organización: Owner, Admin, Clinician, Receptionist |
| D5 | Identity v1 | Username/password con bcrypt + JWT corto interno + OAuth 2.0 para integraciones externas |
| D6 | SSO empresarial | **Diferido a v2.** Cuando aplique, será principalmente OIDC con Microsoft (Azure AD / Entra ID), que es lo que usan los CESFAMs y centros médicos chilenos. SAML genérico no se prioriza. |
| D7 | Idioma / región | Español Chile, RUT como ID nacional, datos en UTC. i18n diferida. |
| D8 | Stack runtime | NestJS + TypeORM + Postgres para sub-proyectos #1 y #2; Node + TypeScript SDK MCP para #3. Sin reescritura de stack. |
| D9 | Hosting v1 | Railway como dev/staging y placeholder de prod. Migración a infra controlable (AWS/GCP) cuando salgamos del pilot. |

---

## 3. Arquitectura de alto nivel

### 3.1 Topología de servicios

```
┌──────────────────────────────────────────────────────────────────┐
│                            Internet                               │
└──────────────────────────────────────────────────────────────────┘
       │                     │                          │
       │ Claude.ai           │ Web app                  │ Directory
       │ Claude Desktop      │ (<placeholder>.com)      │ submission
       │ Claude Code         │                          │
       ▼                     ▼                          │
┌──────────────────┐    ┌──────────────────┐            │
│ MCP Server       │    │ Frontend SPA     │            │
│ mcp.<placeholder>│    │ React + Vite     │            │
│   (Sub #3)       │    │                  │            │
│                  │    │  Pages, OAuth    │            │
│ - HTTP stream    │    │  consent screen, │            │
│ - 18 tools v1    │    │  org switcher    │            │
│ - elicitation    │    └────────┬─────────┘            │
│ - OTel tracing   │             │                      │
└────────┬─────────┘             │                      │
         │                       │                      │
         │  (Bearer access_token, scoped a org)         │
         │                       │                      │
         ▼                       ▼                      │
┌─────────────────────────────────────────────────┐     │
│  curaciones backend  (api.<placeholder>)        │     │
│  ┌──────────────────────────────────────────┐   │     │
│  │  OAuth 2.0 Authorization Server (Sub #2) │◄──┼─────┘
│  │  /.well-known/oauth-authorization-server │   │
│  │  /oauth/authorize  /oauth/token          │   │
│  │  /oauth/register   (DCR + CIMD)          │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │  Multi-tenancy core  (Sub #1)            │   │
│  │  Organization, Establishment,            │   │
│  │  Membership, Role,                       │   │
│  │  OrgScopedQueryFilter (TypeORM           │   │
│  │  subscriber), audit log w/ hash chain    │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │  Domain modules (existentes, retro-      │   │
│  │  adaptados con organizationId):          │   │
│  │  Patients, Agenda, Curaciones,           │   │
│  │  Inventory, Canasta, WoundNotes,         │   │
│  │  Reports, Users                          │   │
│  └──────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
              ┌────────────────┐         ┌─────────┐
              │  Postgres      │         │  KMS    │
              │  (multi-tenant)│ ──keys──│ AWS/GCP │
              │  pgcrypto      │         └─────────┘
              └────────────────┘
```

### 3.2 Reglas de comunicación

1. **Frontend nunca habla con MCP.** El MCP es solo para clientes externos (Claude). La web app habla directo a `api.<placeholder>` con su JWT corto interno.
2. **MCP nunca habla con Postgres directamente.** El MCP solo proxy-ea a `api.<placeholder>` con el access token del usuario. Toda lógica de negocio y autorización vive en el backend; no se duplica.
3. **OAuth Authorization Server vive embebido** en el backend NestJS como módulo separado (`backend/src/oauth/`). No es un microservicio aparte.
4. **Audit log se escribe en el backend.** Cada call MCP termina ejecutando un endpoint del backend → el `AuditLogInterceptor` global ya captura todo. El MCP no escribe audit propio.
5. **Trazabilidad cruza el grafo entero**: header `traceparent` viaja Claude → MCP → API → Postgres. Un span único por request del usuario.

### 3.3 Dominios DNS (placeholders)

| DNS | Servicio | Por qué separado |
|---|---|---|
| `<placeholder>.com` | Frontend SPA | Marketing + app |
| `api.<placeholder>.com` | Backend NestJS (incluye OAuth) | Aislamiento de cookies, CSP estricto |
| `mcp.<placeholder>.com` | MCP server | Aislamiento de incidentes + URL limpia para directorio |

> **Nota de branding:** el dominio comercial final está pendiente de decisión. Los sub-specs deben referenciar dominios como variables, no como literales.

---

## 4. Descomposición en sub-proyectos

```
Sub #1: Multi-tenancy foundation  ──bloquea──▶  Sub #2: OAuth Server  ──bloquea──▶  Sub #3: MCP Server
```

### Sub-proyecto #1 — Multi-tenancy foundation

**Spec hijo:** `docs/superpowers/specs/YYYY-MM-DD-multi-tenancy-foundation-design.md` (a escribir).

**Alcance:**

- Tablas: `Organization`, `Establishment`, `OrganizationMembership` (`userId`, `organizationId`, `role`), `UserEstablishmentAssignment`
- Migración de datos legacy: todas las entidades existentes movidas a una org "default" + establishment "principal"
- JWT extendido: `userId`, `username`, `organizationId` activa, `role`, `establishmentIds`
- `POST /api/auth/switch-org` para que un usuario miembro de varias orgs cambie de contexto
- `OrgScopedQueryFilter`: TypeORM subscriber automático que inyecta `WHERE organizationId = :current` en todas las entities tagged. Queries sin contexto fallan loud, no return-empty silencioso.
- Cada entity tenanted lleva un decorator `@OrgScoped()` que registra el filtro automáticamente
- UI "Mi organización": miembros, invitaciones por email, gestión de establecimientos, switcher en header
- Audit log con hash chain append-only (extiende el `AuditLogInterceptor` actual)
- Encryption at rest con KMS para `Patient.rut`, `WoundNote.notes`, `Curacion.observations`

**Definition of Done:**

- Dos organizaciones coexisten en la misma DB sin que ninguna vea datos de la otra
- Un usuario miembro de ambas puede cambiar de contexto y los datos siguen aislados
- Audit log es íntegro y verificable (alterar un row rompe la cadena)
- Test suite incluye `org-isolation.spec.ts` que verifica aislamiento por cada entity tenanted

**Estimación:** 2–3 semanas.

### Sub-proyecto #2 — OAuth 2.0 Authorization Server

**Spec hijo:** `docs/superpowers/specs/YYYY-MM-DD-oauth-server-design.md` (a escribir).

**Alcance:**

- Tablas: `OAuthClient`, `OAuthAuthorizationCode`, `OAuthAccessToken`, `OAuthRefreshToken`, `OAuthConsent`
- Endpoint `/.well-known/oauth-authorization-server` (CIMD, RFC 8414)
- Endpoint `/oauth/register` (DCR, RFC 7591)
- Endpoint `/oauth/authorize` con consent screen renderizado por el frontend SPA
- Endpoint `/oauth/token` (`authorization_code` + `refresh_token` grant types)
- PKCE obligatorio (S256)
- Modelo de scopes (lista exacta TBD en sub-spec): mínimo `patients:read`, `patients:write`, `agenda:rw`, `clinical:rw`, `inventory:read`, `inventory:write`, `reports:read`, `org:admin`
- Enforcement: cada endpoint protegido valida scope; fail returns RFC-compliant `error: insufficient_scope`
- UI "Aplicaciones conectadas" en Mi cuenta: listar apps autorizadas, revocar
- Rate limiting por OAuth client (separado del rate limiting por usuario existente)
- Librería: usar `@node-oauth/oauth2-server` o `oidc-provider`, NO implementar RFC desde cero

**Definition of Done:**

- MCP Inspector externo se registra vía DCR, completa el flow OAuth, recibe access+refresh tokens
- Refresh token rota correctamente; revocación corta acceso inmediato
- Pen-test pasado (al menos checklist OWASP top 10 + RFC 6749 attack vectors)

**Estimación:** 1.5–2 semanas.

### Sub-proyecto #3 — MCP Server

**Spec hijo:** `docs/superpowers/specs/YYYY-MM-DD-mcp-server-design.md` (a escribir).

**Alcance:**

- Servicio Node + TypeScript SDK MCP separado (`mcp-server/` en monorepo)
- Transport: streamable-HTTP (no SSE legacy)
- OAuth integration: lee CIMD del backend, valida access tokens vía introspection o JWT verification (TBD en sub-spec)
- 18 tools v1 (lista exacta TBD en sub-spec, scoped a Patients, Agenda, Curaciones, Inventory, Canasta read, WoundNotes, Reports)
- Annotations obligatorias: `readOnlyHint`, `destructiveHint`, descripciones < 500 chars
- Elicitation con capability check + fallback de texto plano
- OpenTelemetry tracing: span propagation Claude → MCP → API → DB
- Logs estructurados (pino) con redaction de PHI
- Submission al Anthropic Directory + landing page pública
- Pre-submission checklist completo (read/write split, name limits, prompt-injection rules)

**Definition of Done:**

- Usuario en Claude.ai busca, conecta, autoriza, ejecuta tool sobre sus datos
- Aparece publicado en el directorio
- Trace de una request aparece como span único en Jaeger/Tempo

**Estimación:** 1–1.5 semanas.

---

## 5. Cross-cutting concerns

### 5.1 Audit logging granular y append-only

Toda mutación (crear paciente, registrar curación, modificar wound note, cambio de rol, otorgamiento de scope OAuth, etc.) genera entrada en `AuditLog` con: `userId`, `organizationId`, `establishmentId`, `entityType`, `entityId`, `action`, `before` JSON, `after` JSON, `ip`, `userAgent`, `timestamp`, `hashChain`.

`hashChain` = SHA-256 del row anterior + payload del actual. Verificable independientemente. **Requerido por L2.**

Extiende el `AuditLogInterceptor` global existente, no reemplaza.

### 5.2 Encryption at rest con KMS

Postgres con `pgcrypto` para campos sensibles. Claves rotables vía AWS KMS o GCP KMS (decisión de ops). La aplicación nunca tiene la clave en plaintext — usa el envelope encryption pattern. **Requerido por L2.**

Campos cifrados (lista mínima v1):
- `Patient.rut`
- `WoundNote.notes`
- `Curacion.observations`

(Campos adicionales se evaluarán durante implementación de #1.)

### 5.3 Observabilidad unificada

- **Logs:** pino estructurado, JSON, con redaction de PHI por whitelist de campos
- **Métricas:** Prometheus-compatible (RED method: rate, errors, duration por endpoint y por tool)
- **Tracing:** OpenTelemetry con W3C trace context. Cruza Claude → MCP → API → Postgres en un span único

### 5.4 Rate limiting & abuse protection

- Por usuario (ya existe vía `PerUserThrottlerGuard`)
- Por organización (nuevo, evita que una org agote el cupo global)
- Por OAuth client (nuevo, esencial cuando se publique en directorio)
- Por scope (los scopes destructivos como `patients:write` con límites más bajos que `patients:read`)

### 5.5 Data residency placeholder

Hoy Railway no garantiza residencia en CL. **Spec asume hosting en US/EU para v1**, con compromiso explícito de migración a CL antes de cualquier cliente público chileno cuya normativa requiera residencia local. Las normativas específicas (Ley 19.628, MINSAL, FONASA, etc.) deben validarse con asesoría legal antes de comprometer L3. Documentar este gap en el contrato/DPA con cláusula de servicio explícita: "no apto para datos sujetos a residencia local hasta versión L3".

---

## 6. Roadmap

| Hito | Sub | Entregable |
|---|---|---|
| 1.1 | #1 | Tablas base + migrations |
| 1.2 | #1 | Datos legacy migrados a org/establishment "default" |
| 1.3 | #1 | JWT extendido + switching de org |
| 1.4 | #1 | `OrgScopedQueryFilter` automático en todas las entities |
| 1.5 | #1 | UI "Mi organización" |
| 1.6 | #1 | Audit log con hash chain |
| 1.7 | #1 | Encryption at rest con KMS |
| 2.1 | #2 | Tablas OAuth + migrations |
| 2.2 | #2 | CIMD + DCR endpoints |
| 2.3 | #2 | `/oauth/authorize` + consent screen |
| 2.4 | #2 | `/oauth/token` con grants y refresh |
| 2.5 | #2 | Modelo de scopes + enforcement |
| 2.6 | #2 | UI "Aplicaciones conectadas" |
| 2.7 | #2 | Rate limiting por OAuth client |
| 3.1 | #3 | Bootstrap MCP service |
| 3.2 | #3 | OAuth integration |
| 3.3 | #3 | 18 tools v1 con annotations |
| 3.4 | #3 | Elicitation + fallback |
| 3.5 | #3 | OTel tracing end-to-end |
| 3.6 | #3 | Documentación pública |
| 3.7 | #3 | Submission al directorio |

**Estimación total hasta directorio:** ~5–6 semanas con un dev senior. No incluye iteraciones de QA en pilot ni eventual migración a infra L3.

---

## 7. Out-of-scope

| Tema | Por qué se difiere |
|---|---|
| Billing / suscripciones / Stripe | Hasta tener pilot con clientes reales no sabemos pricing. v1 = pilot gratuito invite-only. |
| Custom roles configurables | YAGNI. Los 4 roles cubren ~95% de casos. |
| SSO empresarial (Microsoft Entra OIDC) | Diferido a v2. Cuando aplique, principalmente Azure AD / Entra ID, no SAML. |
| Migración a infraestructura L3 | Requiere clientes pagando que lo justifiquen. Path documentado. |
| MCPB (bundled local server) | Producto SaaS hosteado; bundling local no aporta. |
| Widgets MCP | v2. v1 usa elicitation para input estructurado simple. |
| Internacionalización | Producto pensado para Chile en v1. |
| Paciente compartido cross-org | YAGNI. Workaround: re-crear paciente en la otra org. |
| API pública REST/GraphQL para terceros (no-MCP) | El MCP cubre 90% de casos. Si un cliente pide API directa, abrir endpoints específicos vía OAuth. |
| Webhooks salientes | v2. |
| Auditor read-only role | v2. Difícil de justificar antes de tener clientes que lo pidan. |

---

## 8. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Migración de datos legacy se rompe en prod | Media | Alto | Migration corre primero contra dump de prod restaurado en staging; validación post-migration con queries de integridad antes de cutover; ventana de rollback con backup pre-migration. |
| TypeORM subscriber filtra mal y filtra datos cross-org | Media | Crítico | Tests automáticos por cada entity tenanted que verifican aislamiento. Regla pre-merge: cada entity nueva debe tener `@OrgScoped()` decorator + test de aislamiento. |
| OAuth implementación tiene CVE típico (PKCE débil, redirect_uri laxo, code reuse) | Media | Crítico | Usar librería battle-tested (`@node-oauth/oauth2-server` o `oidc-provider`). Pen-test antes de directorio. |
| Anthropic rechaza el connector en review | Baja-Media | Medio | Submit early con MCP Inspector validation y todas las annotations. Pre-submission checklist como gate antes de aplicar. |
| Performance del MCP bajo carga del directorio | Baja en v1 | Medio | Rate limiting agresivo por OAuth client. OTel tracing detecta cuellos de botella. |
| Compliance gap descubierto post-pilot | Media | Alto | L2 honesto en DPA + roadmap a L3 documentado. Cláusula de servicio explícita. |
| Backend monolítico se vuelve cuello de botella | Baja en v1 | Medio | Cuando aparezca, extraer OAuth como microservicio. La separación modular en NestJS lo permite. |

---

## 9. Decisiones diferidas a sub-specs

Estas no se preempt-deciden en este umbrella; cada sub-spec las resuelve con información detallada:

- Formato exacto del access token (JWT firmado vs opaque + introspection) → spec #2
- Lista exacta de scopes y granularidad → spec #2
- Lista exacta de las 18 tools v1, schemas JSON, descripciones → spec #3
- Estrategia de paginación en tools (cursor vs offset) → spec #3
- Plataforma definitiva de hosting prod (Railway vs AWS vs GCP) → decisión de ops, no de spec
- Branding y dominio comercial final → decisión de producto, no de spec
