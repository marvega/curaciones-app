# MCP Server (Sub #3) — Design

**Fecha:** 2026-05-07
**Estado:** Aprobado para escritura de plan
**Sub-spec hijo de:** `docs/superpowers/specs/2026-04-28-multi-tenant-mcp-platform-umbrella.md`
**Alcance:** Hitos 3.1–3.5 del roadmap del umbrella (bootstrap, OAuth integration, 18 tools v1, elicitation, logging). **No incluye** submission al directorio ni landing page pública (3.6–3.7), que van en sub-spec aparte.
**Branding:** dominios como variables. `<placeholder>.com` se usa hasta que producto cierre el dominio comercial.

---

## 1. Contexto y objetivo

Curaciones tiene Sub #1 (multi-tenancy) y Sub #2 (OAuth Authorization Server) listos en `main`. Falta el último componente del umbrella: un servidor MCP que permita a profesionales de salud operar la app desde Claude.ai / Desktop / Code conversacionalmente.

Este sub-spec define el servicio MCP que un cliente Claude conecta vía OAuth, validando bearer tokens emitidos por el AS de Sub #2 y proxy-eando 18 tools v1 al backend NestJS existente.

---

## 2. Decisiones tomadas

| # | Decisión | Elección | Razón |
|---|---|---|---|
| D1 | Alcance del spec | Hitos 3.1–3.5 (sin submission ni landing) | Submission tiene gates de marketing/legal distintos; mejor sub-spec aparte |
| D2 | Estructura del repo | Subdir autónomo `mcp-server/` con package.json propio, deploy Render separado | Failure isolation real, evolución independiente del backend, costo bajo de mantener tipos vía OpenAPI export |
| D3 | Token validation | JWT verification con JWKS público | El AS de Sub #2 ya emite JWT firmados con clave pública; introspection deshabilitada; passthrough simple |
| D4 | Tracing distribuido | **Diferido** a sub-spec "Observabilidad" posterior. v1 usa pino + correlation-id | El backend hoy no tiene OTel; instrumentar ambos lados infla el spec ~30%. Logs + correlation cubren 80% del valor de debugging |
| D5 | Multi-tenancy | Org se ata al grant OAuth (consent del Sub #2 ya pregunta cuál); JWT lleva `org_id`; MCP no expone tool `switch_org` | Mantiene la regla "MCP no autoriza, solo proxy-ea"; un grant = una org es la línea OAuth limpia |
| D6 | Lista de tools | 18 + `whoami` (extra), derivadas de los controllers existentes | Cubre todos los dominios del umbrella sin invadir flujos admin |
| D7 | Paginación | Cursor-based en todas las tools de listado | Estable bajo writes concurrentes; UX MCP espera "siguiente" no "página N". Requiere agregar soporte cursor en backend como pre-requisito |
| D8 | Rate limiting en MCP | Ninguno propio | Se confía en rate limit por OAuth client del backend (Sub #2). Si la carga del directorio lo amerita, se agrega después |
| D9 | Stack runtime | Node 20 + TS + `@modelcontextprotocol/sdk` + Fastify + `undici` + `pino` + `jose` | Liviano, alineado con conventions del SDK MCP, sin frameworks pesados |
| D10 | Audience claim | MCP valida `aud=OAUTH_ISSUER` (lo que el AS ya emite vía resource indicators RFC 8707). No se cambia el AS | Una sola audience entre backend y MCP simplifica la cadena. El MCP es proxy del backend; no hay separación de privilegios entre los dos resources que justifique audiences distintos. Token confusion no aplica en este modelo |

---

## 3. Topología y boundaries

### 3.1 Diagrama

```
Claude.ai/Desktop/Code ──MCP request + Bearer──▶  mcp.<placeholder> (Fastify)
                                                       │
                                                       │ 1. JWT verify (firma vs JWKS de api)
                                                       │ 2. Claims: iss, aud=mcp-server, exp, nbf
                                                       │ 3. Scope check vs catálogo de tools
                                                       │ 4. Genera o propaga correlation-id
                                                       ▼
                                                api.<placeholder>/<endpoint>
                                                       │  Bearer reenviado tal cual
                                                       │  Header: x-request-id
                                                       ▼
                                                Backend NestJS (existing)
                                                  - OAuthJwtStrategy valida JWT (igual que web)
                                                  - OrgScopedQueryFilter aplica WHERE org_id
                                                  - AuditLogInterceptor registra
                                                  - Devuelve JSON
```

### 3.2 Responsabilidades

| Capa | Responsabilidad |
|---|---|
| **MCP server** | Recibir MCP requests; validar bearer (firma + claims); validar scope contra catálogo; serializar al endpoint del backend; reenviar bearer + correlation-id; mapear response/error a MCP tool result |
| **Backend NestJS** | Toda la lógica de negocio, autorización fina, persistencia, audit log, RBAC, OrgScopedQueryFilter |

### 3.3 Lo que el MCP NUNCA hace

- Tocar Postgres directo
- Escribir audit propio (el backend lo hace via interceptor global)
- Cachear datos de negocio
- Evaluar permisos por su cuenta (org membership, RBAC)
- Transformar payloads más allá del shape MCP

### 3.4 Acoplamiento de código

Cero código compartido entre MCP y backend. Solo contrato HTTP. Tipos del API se generan en `mcp-server/src/api-types/` corriendo `openapi-typescript` contra el OpenAPI export del backend (`@nestjs/swagger`). CI step: si el OpenAPI cambia y los tipos del MCP no se regeneran, falla el PR (ver §8).

### 3.5 Stack

| Componente | Choice |
|---|---|
| Runtime | Node 20 + TypeScript |
| MCP SDK | `@modelcontextprotocol/sdk` (oficial, TS) |
| Transport | streamable-HTTP (no SSE legacy) |
| HTTP framework | Fastify |
| HTTP client al backend | `undici` con keep-alive pool |
| Logger | `pino` con redaction |
| JWT verification | `jose` (verifyJwt + remoteJWKSet) |
| Test runner | Vitest |

---

## 4. Tools v1

### 4.1 Catálogo

19 tools + `whoami` (extra, sin contar). Subimos de 18 a 19 al separar agenda por paciente vs agenda por rango de fecha (que mapean a endpoints distintos en el backend: `appointments` vs `curaciones/agenda`). Naming en inglés (convención MCP). Descripciones en código se escribirán en español para alinear con clínicos chilenos. Cada una mapea 1:1 a un endpoint REST existente.

| # | Tool | Endpoint backend | Scope | readOnly | destructive |
|---|---|---|---|---|---|
| 1 | `search_patients` | `GET /api/patients?q=&cursor=` | `patients:read` | ✓ | ✗ |
| 2 | `get_patient` | `GET /api/patients/:id` | `patients:read` | ✓ | ✗ |
| 3 | `create_patient` | `POST /api/patients` | `patients:write` | ✗ | ✗ |
| 4 | `update_patient` | `PUT /api/patients/:id` | `patients:write` | ✗ | ✗ |
| 5 | `discharge_patient` | `POST /api/patients/:id/discharge` | `patients:write` | ✗ | ✓ |
| 6 | `readmit_patient` | `POST /api/patients/:id/readmit` | `patients:write` | ✗ | ✗ |
| 7 | `list_patient_appointments` | `GET /api/appointments/patient/:patientId` | `agenda:read` | ✓ | ✗ |
| 8 | `get_agenda_by_date_range` | `GET /api/curaciones/agenda?from=&to=` | `clinical:read` | ✓ | ✗ |
| 9 | `create_appointment` | `POST /api/appointments` | `agenda:write` | ✗ | ✗ |
| 10 | `cancel_appointment` | `DELETE /api/appointments/:id` | `agenda:write` | ✗ | ✓ |
| 11 | `list_curaciones` | `GET /api/curaciones/patient/:patientId` | `clinical:read` | ✓ | ✗ |
| 12 | `register_curacion` | `POST /api/curaciones` | `clinical:write` | ✗ | ✗ |
| 13 | `get_patient_pdf` | wrappea `GET /api/patients/:id/pdf` (PDF de ficha clínica del paciente; modalidad final — URL temporal vs MCP resource binary — se decide en plan) | `patients:read` | ✓ | ✗ |
| 14 | `add_wound_note` | `POST /api/wound-notes` | `clinical:write` | ✗ | ✗ |
| 15 | `list_wound_notes` | `GET /api/wound-notes/patient/:patientId` | `clinical:read` | ✓ | ✗ |
| 16 | `search_inventory` | `GET /api/inventory/products?q=&cursor=` | `inventory:read` | ✓ | ✗ |
| 17 | `list_lots_expiring` | `GET /api/inventory/expiring?days=` | `inventory:read` | ✓ | ✗ |
| 18 | `register_canasta_consumption` | `POST /api/inventory/canasta` | `inventory:write` | ✗ | ✗ |
| 19 | `monthly_report` | `GET /api/reports/monthly?month=` | `reports:read` | ✓ | ✗ |
| — | `whoami` | reads from JWT claims (no backend call) | (todo grant) | ✓ | ✗ |

### 4.2 Cobertura por dominio

- Patients: 7 (search, get, create, update, discharge, readmit, pdf)
- Agenda: 4 (list_patient_appointments, get_agenda_by_date_range, create, cancel)
- Curaciones: 2 (list, register)
- Wound notes: 2
- Inventory: 3 (read products, read lots, write canasta)
- Reports: 1
- Identity: 1 (whoami, no cuenta)

### 4.3 Tools que requieren elicitation

Cinco tools toman input estructurado interactivo (ver §6):

- `create_patient` — campos validados (RUT con dígito verificador, fecha nac., demografía)
- `update_patient` — selección de campo a modificar + valor nuevo
- `register_curacion` — localización, tipo de herida, observaciones, cuidados aplicados
- `create_appointment` — fecha/hora con validación de disponibilidad
- `register_canasta_consumption` — productos del catálogo + cantidades

### 4.4 Annotations obligatorias por tool

Cada tool en el catálogo declara:
- `name` (kebab_case por convención MCP, < 64 chars)
- `description` (< 500 chars, en español, con propósito + ejemplos comunes)
- `inputSchema` (JSON Schema)
- `readOnlyHint` (boolean)
- `destructiveHint` (boolean)

Detalles de schemas viven en el plan de implementación, no acá.

### 4.5 Paginación

Todas las tools de listado (`search_*`, `list_*`) usan **cursor-based pagination**:

- Backend agrega soporte `?cursor=<opaque>` (pre-requisito; ver fase 0 del plan)
- MCP retorna `nextCursor` en la respuesta cuando hay más resultados
- El agente Claude pasa el `nextCursor` en la siguiente llamada para paginar

Razón: estable bajo writes concurrentes; UX agéntica espera "siguiente página" más que "página N de M".

### 4.6 Lo que NO está en v1 (intencional)

| Omitido | Por qué |
|---|---|
| `delete_patient` | El backend no soporta hard-delete (solo discharge). Coherente con compliance L2 |
| `update_curacion` / `delete_curacion` | Append-only por diseño clínico (auditabilidad) |
| `detailed_report` | El reporte mensual cubre el caso conversacional; el detallado es export pesado, mejor desde web |
| `manage_inventory_codes` / `categories` / `lots/reception` | Operaciones de admin de catálogo + recepción no son flujos conversacionales (requieren tablas grandes y validación visual) |
| `manage_users` / `org_admin` tools | Diferido v2: requiere scope `org:admin` y flujos sensibles (invitaciones, roles) |
| `wound_photos` upload | MCP image upload no maduro; usar web |
| `audit_log` lookup | Lookup de audit desde agente externo es éticamente cuestionable; lo dejamos solo en web |
| Tool `switch_org` | Innecesario por diseño OAuth (un grant = una org; cambiar org = re-autorizar) |

---

## 5. Auth flow (JWKS + scopes)

### 5.1 Validación del bearer (en cada MCP request)

1. Extraer `Authorization: Bearer <jwt>` del request.
2. Verificar firma usando JWKS público publicado por backend en `GET /jwks.json` (Sub #2 ya lo expone).
3. Verificar claims:
   - `iss` == `OAUTH_ISSUER` (env)
   - `aud` == `OAUTH_ISSUER` (lo que el AS ya emite vía RFC 8707 resource indicators)
   - `exp` > now, `nbf` <= now
4. JWKS caching: `jose.createRemoteJWKSet` con auto-refresh, TTL 5 min, fetch background si expira durante request.
5. Si falla cualquier paso → MCP responde con `WWW-Authenticate: Bearer error="invalid_token"` (RFC 6750).

### 5.2 Scope enforcement

- El JWT trae claim `scope` (string space-separated, ej. `"patients:read agenda:rw"`).
- Catálogo en `src/tools/catalog.ts`: estructura `{ name, requiredScope, handler }`.
- Antes de ejecutar handler, middleware verifica `requiredScope ∈ token.scope`. Si no → error MCP `-32600` con `data.error: "insufficient_scope"`, `data.requiredScope: "X"` y mensaje human-readable.

### 5.3 Org claim handling

- El claim `org_id` del JWT se loguea (correlation) y se reenvía implícitamente al backend (vía el bearer mismo).
- **El MCP NO autoriza por org_id**. El backend ya valida org membership en cada request via `OAuthJwtStrategy` y aplica `OrgScopedQueryFilter`.

### 5.4 Audience: por qué `aud=issuer` y no `aud=mcp-server`

El AS de Sub #2 ya emite ATs en formato JWT con `aud=issuer` vía `oidc-provider` resource indicators (RFC 8707). El backend valida ese mismo `aud=issuer` en `OAuthJwtStrategy`. El MCP hace lo mismo: valida `aud=OAUTH_ISSUER`.

Razón de no usar `aud=mcp-server` separado: el MCP es solo proxy del backend, no un resource server con privilegios distintos. Cualquier AT válido para el backend (`patients:read` etc.) sirve igual contra el MCP. Token confusion no aplica acá. Mantener una sola audience evita complicar el AS con claims multi-aud y evita el riesgo de degradar la validación en el backend.

**Esto significa que NO hay fase 0 de "ajustar AS" en el plan**: el MCP se acopla al AT que el AS ya emite hoy.

---

## 6. Elicitation pattern

Patrón estándar para las 5 tools que requieren input interactivo:

1. Tool handler verifica capability via `server.getClientCapabilities()`.
2. Si cliente soporta elicitation → envía schema JSON, espera respuesta del usuario, valida, ejecuta.
3. Si NO soporta → fallback estructurado: tool retorna `isError: false` con contenido de tipo "Necesito más información: [campos requeridos con tipos]. Llamame de nuevo con estos datos." El agente Claude puede leer y continuar via texto.

Schemas detallados por tool viven en el plan de implementación.

---

## 7. Errores y rate limiting

### 7.1 Mapeo backend → MCP

| Backend HTTP | MCP error code | Notes |
|---|---|---|
| 400 | `-32602` (invalid params) | mensaje del backend al cliente |
| 401 (token inválido) | `-32600` con `WWW-Authenticate: Bearer` | "re-autoriza" |
| 403 (scope/RBAC) | `-32600` con `data.error: "forbidden"` | mensaje del backend |
| 404 | `-32602` con `data.error: "not_found"` | "no se encontró X" |
| 409 (conflict) | `-32602` | mensaje del backend |
| 429 | `-32603` con `Retry-After` propagated | "rate limit, reintenta en N seg" |
| 5xx | `-32603` (internal) | mensaje genérico al cliente; error real en logs |

### 7.2 Rate limiting

Ningún rate limit propio en el MCP. Se confía en el rate limit por OAuth client que el backend ya implementa (Sub #2). Si la carga del directorio lo amerita en producción, se agrega token-bucket en MCP en una iteración posterior. No prematuro.

---

## 8. Logging + correlation-id

- **Logger:** pino JSON estructurado, `info` en prod, `debug` en dev.
- **Correlation-id:** UUID v4 generado por el MCP si no llega `traceparent` en el request; reenviado al backend en header `x-request-id`. El backend ya escribe ese header en sus logs.
- **Redaction:** lista explícita en pino: `rut`, `notes`, `observations`, `phone`, `email`, `address`. Implementada via `pino` redact paths.
- **Eventos a loguear:** request entrante (tool name, user, org, correlation), response (status, duration), errores (stack solo en debug).
- **No loguear:** payload completo de request/response. Solo metadatos.
- **Out-of-scope confirmado:** OTel, exporters, collectors, spans distribuidos. → sub-spec "Observabilidad" posterior.

---

## 9. Testing

### 9.1 Niveles

- **Unit:** handlers de tools, JWT verifier, scope checker, error mapper, redaction. Vitest. Cobertura objetivo >85%.
- **Integration:** MCP server contra backend dev local levantado. Round-trip completo: token → tool → backend → response. Cliente: `@modelcontextprotocol/inspector` o cliente MCP test programático.
- **E2E manual pre-merge:** levantar backend + MCP localmente, conectar con MCP Inspector via OAuth flow real, ejecutar 3 tools (1 read, 1 write, 1 con elicitation), verificar logs.

### 9.2 CI

Workflow nuevo `.github/workflows/mcp-build-test.yml` paralelo a backend/frontend. Steps:
- lint
- typecheck
- unit tests
- integration tests con backend en docker compose (postgres + nest backend)
- OpenAPI drift check: regenera tipos desde OpenAPI del backend, falla si hay diff sin commitear

Required check para PRs a `main`.

---

## 10. Deployment + secrets

### 10.1 Servicio Render nuevo: `curaciones-mcp`

| Setting | Valor |
|---|---|
| Repo source | monorepo (mismo que backend/frontend) |
| Root directory | `mcp-server/` |
| Build | `npm ci && npm run build` |
| Start | `node dist/server.js` |
| Branch | `main` con `autoDeploy=on commit` |
| Health check | `GET /health` (público, sin auth, devuelve `{status:"ok", version, uptime}`) |
| Custom domain | `mcp.<placeholder>` |

### 10.2 Variables de entorno

| Var | Ejemplo | Descripción |
|---|---|---|
| `PORT` | `3001` | provisto por Render |
| `BACKEND_URL` | `https://api.<placeholder>` | base URL del backend |
| `OAUTH_ISSUER` | `https://api.<placeholder>` | claim `iss` esperado |
| `OAUTH_JWKS_URL` | `https://api.<placeholder>/jwks.json` | endpoint JWKS |
| `OAUTH_AUDIENCE` | `https://api.<placeholder>` | claim `aud` esperado (igual al issuer; el AS lo emite así vía RFC 8707) |
| `LOG_LEVEL` | `info` | nivel de pino |
| `NODE_ENV` | `production` | |

### 10.3 Sin secrets

El MCP no firma ni descifra nada; solo verifica firmas con clave pública. Cero riesgo de leakage de credenciales si el contenedor cae.

### 10.4 CORS

Restricto a orígenes MCP conocidos (`https://claude.ai`, `https://*.anthropic.com`) en headers de preflight. Streamable-HTTP no requiere CORS para el flow principal pero sí para discovery.

---

## 11. Out-of-scope (explícitos)

| Tema | Cuándo |
|---|---|
| OTel / tracing distribuido | Sub-spec "Observabilidad" posterior |
| Submission al Anthropic Directory | Sub-spec "MCP submission + landing page" |
| Landing page pública del producto | Mismo sub-spec submission |
| MCPB (bundled local server) | Producto SaaS hosteado, no aplica |
| Widgets MCP / UI resources | v2 — v1 usa elicitation simple |
| Tool `switch_org` | Innecesario por diseño OAuth |
| Tools de admin (users, roles, invitations) | v2, requiere scope `org:admin` |
| Hard-delete patient/curacion | El backend no lo soporta por diseño compliance |
| Wound photo upload | MCP image upload no maduro |
| Detailed report tool | Reporte mensual cubre conversacional |
| Rate limiting propio en MCP | Si el backend rate limit no alcanza, se agrega después |

---

## 12. Definition of Done

Sub #3 cerrado cuando:

1. Servicio `mcp-server` deployado en Render en `mcp.<placeholder>`, accesible vía streamable-HTTP.
2. Las 19 tools v1 + `whoami` implementadas, cada una con scope check, mapping al backend, error handling per §7.
3. JWT validation con JWKS público (`/jwks.json` del backend) funcional; MCP valida firma + `iss` + `aud=OAUTH_ISSUER` + `exp/nbf`. Sin cambios en el AS.
4. Las 5 tools con elicitation funcionan en cliente que la soporta (verificado con MCP Inspector) y degradan correctamente en cliente que no.
5. Logs estructurados con redaction de PHI; correlation-id propagated end-to-end Claude→MCP→API.
6. CI passing: unit tests, integration tests contra backend dev, OpenAPI drift check, lint, typecheck.
7. Documentación interna: `mcp-server/README.md` con cómo correr local + smoke test manual con MCP Inspector.
8. Smoke test E2E manual: registrar un MCP client via DCR, completar OAuth flow, ejecutar `search_patients` + `register_curacion` (con elicitation) + `monthly_report` desde el Inspector.

**No incluye:** submission al Anthropic Directory, landing page pública, OTel.

---

## 13. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Drift entre tipos del backend (OpenAPI) y MCP | Media | Medio | OpenAPI drift check obligatorio en CI |
| Token confusion (AT emitido para otro client se usa contra el MCP) | Baja | Medio | Por diseño no aplica (MCP es proxy, mismo resource que backend); igual el MCP valida iss + aud + firma + exp |
| Tool con elicitation falla en cliente sin capability | Media | Bajo | Fallback de texto plano implementado y testeado |
| Migración a paginación cursor rompe consumidores existentes | Baja | Medio | Cursor agregado como param opcional; offset sigue funcionando para web |
| Carga del directorio satura el backend | Baja en v1 | Medio | Rate limit por OAuth client (existente) absorbe el primer hit; agregamos MCP-side si no alcanza |
| MCP devuelve PHI en logs | Media | Crítico | Lista de redaction explícita en pino; test que verifica redaction |
| Cambio de claims en AS rompe el MCP en prod | Baja | Alto | Integration tests cubren el flow completo; required check antes de merge |

---

## 14. Roadmap del sub-spec (high-level)

| Fase | Entregable |
|---|---|
| 0 | Pre-requisitos en backend: paginación cursor en endpoints de listado + OpenAPI export verificado (sin cambios en el AS) |
| 1 | Bootstrap `mcp-server/`: Fastify + MCP SDK + health endpoint + Dockerfile + CI workflow |
| 2 | Auth middleware: JWT verification con JWKS + scope catalog + error mapping |
| 3 | Tools read-only sin paginación cursor del lado MCP (9 tools): search_patients, get_patient, list_patient_appointments, get_agenda_by_date_range, list_curaciones, list_wound_notes, search_inventory, list_lots_expiring, get_patient_pdf |
| 4 | Tools write sin elicitation (4 tools): discharge_patient, readmit_patient, cancel_appointment, add_wound_note |
| 5 | Tools con elicitation (5 tools): create_patient, update_patient, register_curacion, create_appointment, register_canasta_consumption |
| 6 | Reports (monthly_report) + whoami |
| 7 | Logging + redaction + correlation-id end-to-end |
| 8 | Documentación interna + smoke test manual + Render deploy a `mcp.<placeholder>` |

Detalles de cada fase + checks de verificación viven en el plan de implementación (writing-plans).
