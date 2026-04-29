# OAuth Server — Resume guide para próxima sesión

**Fecha de pausa:** 2026-04-29
**Última sesión:** Phases 0-2 completas. Pausa solicitada por el usuario.

---

## Cómo retomar (en una sesión fresca)

1. Abrir Claude Code en `/Users/marcelo/dev/claude/curaciones/`. La memoria de auto-load incluirá el archivo apuntando a este resume.
2. Decir algo como: *"Retomo Sub #2 OAuth server desde Phase 3. Lee `.worktrees/oauth-server/docs/superpowers/plans/2026-04-29-oauth-server-RESUME.md` y arranca."*
3. Continuar el ciclo subagent-driven-development desde donde quedó.

**Worktree path:** `/Users/marcelo/dev/claude/curaciones/.worktrees/oauth-server`
**Branch:** `feat/oauth-server` (tracks `origin/main`)
**Plan:** `docs/superpowers/plans/2026-04-29-oauth-server-plan.md`
**Spec:** `docs/superpowers/specs/2026-04-29-oauth-server-design.md` (en PR #26 a main)

---

## Estado actual (lo que está hecho)

| Phase | Estado | Notas |
|---|---|---|
| 0 — Pre-flight | ✅ | Worktree creado, oidc-provider + jose instalados, baseline tsc OK |
| 1 — Migration + entities | ✅ | 5 tablas creadas en DB, 5 entities, módulo wirado, índices renombrados a `IDX_…`/`UQ_…`, FK omissions documentadas, `TypeOrmModule` re-exportado |
| 2 — Bootstrap + signing key service | ✅ | 8/8 unit tests, OAuthBootstrapService genera RSA 2048 al boot, OAuthSigningKeyService cachea con TTL 5min + Object.freeze + order DESC by activatedAt |
| 3 — Postgres adapter + oidc-provider factory | ⏳ Próxima | |
| 4 — Account adapter + Discovery + JWKS | ⏳ | |
| 5 — DCR endpoint | ⏳ | |
| 6 — Authorize + Consent flow | ⏳ | |
| 7 — Token + PKCE + refresh rotation | ⏳ | |
| 8 — Scope enforcement + multi-auth en domain controllers | ⏳ | |
| 9 — Connected apps + revocation | ⏳ | |
| 10 — userinfo + audit log hooks | ⏳ | |
| 11 — Rate limiting + cron de purga | ⏳ | |
| 12 — Key rotation CLI | ⏳ | |
| 13 — Conformance + security review + docs | ⏳ | |
| 14 — Final integration + PR | ⏳ | |

## Commits realizados en `feat/oauth-server`

```
647982a fix(oauth): freeze cached signing keys + order publishable keys by activatedAt
62b10b2 feat(oauth): signing key service with 5min cache
36f5768 feat(oauth): bootstrap service generates initial signing key
18216ac fix(oauth): use @CreateDateColumn on revocation + re-export TypeOrmModule
ca94f07 fix(oauth): declare missing IDX_oauth_grant_user and IDX_oauth_client_first_authorized in entities
258f30d feat(oauth): register OAuthModule with entities
d973c52 feat(oauth): Grant, Token, SigningKey, Revocation entities
99d7053 feat(oauth): OAuthClient entity
d5a01a2 feat(oauth): add oidc-provider dependency
eb756aa chore(oauth): align index naming + document deliberate FK omissions
64185c2 docs(oauth): fix plan to use bigint organizationId + adjusted migration timestamp
fffd615 feat(oauth): migration creating 5 OAuth tables
```

(en `main`, fuera del feature branch:)
- `851fec0 docs: OAuth 2.0 Authorization Server implementation plan (Sub #2)` — el plan vive en main por error operativo (commit accidental sin verificar branch). El usuario lo aceptó. Ver feedback memory `feedback_verify_branch_before_commit.md`.

## PR abierto

- **PR #26:** `docs/oauth-server-spec` → `main`. Solo contiene la spec. **Plan NO está en este PR** — vive en main por separado.

---

## Hallazgos sistémicos importantes (NO repetir investigación)

### 1. Tipo `organizationId` es `bigint`, no `uuid`

`organizations.id` en este codebase es `bigserial` → `bigint` en SQL, `string` en TS. NO es uuid como algunos lugares del spec sugerían. **El plan ya fue corregido** (commit `64185c2`). Cualquier task futura que toque `organizationId` debe usar `bigint`/`string`.

### 2. Contrato real de `KmsService`

El plan asumía `encrypt(Buffer): Promise<Buffer>`. **Lo real:**

```typescript
// backend/src/kms/kms.service.ts
export const KMS_SERVICE = Symbol('KMS_SERVICE');
export interface KmsService {
  encrypt(plaintext: string, aad: string, organizationId: string): Promise<EncryptedField>;
  decrypt(field: EncryptedField, aad: string, organizationId: string): Promise<string>;
  rotateDek(organizationId: string): Promise<void>;
}
```

**Patrón ya implementado** en `backend/src/oauth/services/oauth-bootstrap.service.ts`:

- Inyección: `@Inject(KMS_SERVICE) private readonly kms: KmsService`
- OrgId sintético para keys globales: `OAUTH_KMS_ORG_ID = 'oauth-system'` (exportado del bootstrap)
- AAD por kid: `signingKeyAad(kid)` helper exportado del bootstrap
- Pre-allocación de UUID: `randomUUID()` antes del encrypt para que AAD pueda incluir el kid
- Storage shape: `Buffer.from(JSON.stringify(field), 'utf8')` en columna `bytea`; el inverse en `signing-key.service.ts:resolve()`

**Phase 12 (CLI rotate-keys) reutilizará este patrón.** El plan original tenía `kms.encrypt(privPem)` con buffers; usar el patrón real.

### 3. Naming convention de índices

Repo usa `IDX_…` (uppercase) y `UQ_…` para unique. Todo el plan original tenía `idx_…` (lowercase). **Migration corregida** (commit `eb756aa`); entities usan los mismos nombres.

### 4. Migration timestamp adjusted

Plan original: `1714400000000`. Real: `1714410000000` (colisionaba con `MultiTenancyFoundation1714400000000` en main). Plan ya corregido.

### 5. KMS env vars necesarias para boot real

Si necesitás bootear la app para verificación manual:
```
KMS_BACKEND=memory
KMS_LOCAL_MASTER_KEY=<64 hex chars>
```
en `backend/.env`. Sin esto el boot falla con `KMS_CMK_ARN not configured`. El `.env` actual del worktree NO los tiene.

### 6. `KmsModule` es `@Global()`

`backend/src/kms/kms.module.ts` es global, así que importarlo en `oauth.module.ts` es redundante pero defensivo. Lo dejamos importado explícito.

### 7. Verificar branch antes de cada commit

Por experiencia mala en esta sesión: en sesiones largas con múltiples PRs mergeándose, el current branch puede saltar a `main`. **Siempre** correr `git branch --show-current` antes de `git commit` en sesiones largas. Memoria persistente en `feedback_verify_branch_before_commit.md`.

---

## Cómo arrancar Phase 3 (Postgres adapter + oidc-provider factory)

### Pasos

1. Verificar setup:
   ```bash
   cd /Users/marcelo/dev/claude/curaciones/.worktrees/oauth-server
   git branch --show-current  # debe ser feat/oauth-server
   git log --oneline -3       # debe mostrar 647982a en HEAD
   ```

2. Despachar implementer subagent para Phase 3 (Tasks 3.1 + 3.2 + 3.3 — pueden ir juntas, son adapter + tests + factory).

3. Plan section: líneas 1037-1434 aprox (`## Phase 3 — Postgres adapter + oidc-provider factory`).

4. Recordar al despachar: usar `model="opus"` (memoria hard rule), pasar full text inline, mencionar los hallazgos #2 (KMS contract) por si el factory necesita pasar deps relacionadas.

### Riesgos conocidos en Phase 3

- **`oidc-provider` integration con NestJS no es trivial** — el riesgo #1 del spec. Si el subagent reporta BLOCKED, considerar fallback a `@node-oauth/oauth2-server` (decisión documentada antes del hito 3 según el plan).
- **TypeORM Adapter signature de oidc-provider es estricta** — castear a `any` es aceptable según el plan. La interfaz `Adapter` de oidc-provider tiene métodos `upsert`/`find`/`findByUserCode`/`findByUid`/`consume`/`destroy`/`revokeByGrantId`. Algunos no aplican (e.g. `findByUserCode` para device flow que no usamos) — devuelven `undefined`.

### Después de Phase 3

Phase 4 wirea el provider singleton + Discovery endpoints. Phase 5 = DCR. Phase 6 = consent (la más compleja UX-wise, requiere SPA pages).

Si llegás hasta Phase 7 inclusive (Token + PKCE + refresh) tenés un OAuth server funcional end-to-end. Phases 8-14 son enforcement, UI, tooling y docs.

---

## Ciclo recomendado por phase

Por cada phase (especialmente las grandes):

1. **Implementer subagent (model=opus)** con full text del plan inline.
2. **Spec reviewer subagent (model=opus)** — verifica correspondencia plan ↔ código.
3. **Code quality reviewer (subagent_type=superpowers:code-reviewer, model=opus)** — verifica calidad.
4. Aplicar fixes (controller-level si son triviales, o nuevo dispatch si son grandes).
5. `TaskUpdate` la phase a completed; arrancar la siguiente.

**Tip:** combinar tasks relacionadas en un solo dispatch (e.g. todas las tasks de Phase 6 = consent flow) reduce overhead. La skill subagent-driven-development dice "no parallel" pero "combinar secuenciales en un dispatch" es válido.

---

## Estado del Phase 0 — Tasks 0.4 (e2e bootstrap) DEFERRED

El subagent de Phase 2 difirió el e2e test del bootstrap porque requiere setup de env vars (`KMS_BACKEND=memory`, `KMS_LOCAL_MASTER_KEY`). El `.env` del worktree no los tiene. Considerar incluir esto en Phase 4 cuando ya tengamos endpoints OAuth listos para test E2E real.

---

## Comandos útiles para retomar

```bash
# Ir al worktree
cd /Users/marcelo/dev/claude/curaciones/.worktrees/oauth-server

# Verificar estado
git branch --show-current
git log --oneline -5
git status

# Correr unit tests del módulo OAuth
cd backend
npx jest src/oauth/

# Compile check
npx tsc --noEmit -p tsconfig.json

# Boot completo (requiere KMS env)
# KMS_BACKEND=memory KMS_LOCAL_MASTER_KEY=$(openssl rand -hex 32) npm run start:dev
```

---

## Nota de proceso

Este worktree **NO debe mergearse a main todavía**. Sub #2 va a quedar como un único PR grande al final (Phase 14). El plan que vive en main fue commiteado por error en esta sesión pero no afecta funcionalidad — el feature trabaja en su branch hasta estar completo.
