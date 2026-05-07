# OAuth Server (Sub #2) — Completion summary

**Estado:** ✅ Completo. Todas las phases (0–14) integradas en `main`.
**Última verificación local:** 2026-05-07 — backend 223/227 tests, frontend 97/97, builds + lint clean.

---

## Qué se entregó

| Phase | Resultado |
|---|---|
| 0 — Pre-flight | oidc-provider + jose instalados, baseline tsc OK |
| 1 — Migration + entities | 5 tablas OAuth, entities + módulo wirado |
| 2 — Bootstrap + signing key service | RSA 2048 al boot, cache 5min, KMS-encriptada |
| 3 — Postgres adapter + provider factory | Adapter de oidc-provider con TypeORM |
| 4 — Account adapter + Discovery + JWKS | `/.well-known/openid-configuration`, `/oauth/jwks` |
| 5 — DCR endpoint | `/oauth/register` (Dynamic Client Registration) |
| 6 — Authorize + Consent flow | SPA consent page, scope display, decline flow |
| 7 — Token + PKCE + refresh rotation | `authorization_code` + PKCE, refresh con rotación |
| 8 — Scope enforcement + multi-auth en domain controllers | `OAuthScopeGuard`, decoradores de scope, multi-auth con HS256 interno |
| 9 — Connected apps + revocation | `GET/DELETE /api/account/connected-apps`, denylist en grants revocados |
| 10 — Userinfo + audit log hooks | `/oauth/userinfo`, eventos de register/consent/revoke en audit chain |
| 11 — Rate limiting + cron de purga | Per-client throttle guard, cron diario de cleanup |
| 12 — Key rotation CLI | `oauth:rotate-keys` con retire window |
| 13 — Conformance + security review + docs | Conformance runner, OWASP checklist, developer guide público |
| 14 — Final integration | Todo en main, post-merge hardening + lint cleanup |

## Artefactos en main

- **Spec:** `docs/superpowers/specs/2026-04-29-oauth-server-design.md`
- **Plan:** `docs/superpowers/plans/2026-04-29-oauth-server-plan.md`
- **Developer guide:** `docs/runbooks/oauth-developer-guide.md`
- **Security review runbook:** `docs/runbooks/oauth-security-review.md`
- **Conformance runner:** `backend/test/oauth/conformance/` (manual gate)
- **Código:** `backend/src/oauth/**`, frontend connected-apps + consent SPA pages
- **Migración:** `MultiTenancyOauth1714410000000` (5 tablas: client, grant, token, signing_key, revocation)

## Hallazgos sistémicos persistentes (referencia para Sub #3 MCP)

1. **`organizationId` es `bigint`/`string`**, no UUID — patrón heredado de Sub #1.
2. **`KmsService` real:** `encrypt(plaintext: string, aad: string, organizationId: string)`. Para keys globales OAuth se usa `OAUTH_KMS_ORG_ID = 'oauth-system'`. Ver `oauth-bootstrap.service.ts`.
3. **JWT access tokens son stateless** (oidc-provider con `accessTokenFormat: 'jwt'`); la cascade de revocación se hace via `grant.oidcGrantId` → `oauth_token.grantId`.
4. **Denylist solo en writes:** `OAuthJwtStrategy.validate()` consulta `oauth_revocation` solo en POST/PUT/PATCH/DELETE; reads pasan hasta natural expiry.
5. **Naming convention:** índices `IDX_…` y `UQ_…` (uppercase), no `idx_…`.

## Branches/PRs huérfanas en GitHub (cleanup pendiente)

- **PR #26** (`docs/oauth-server-spec` → main) — OPEN, contiene solo el spec. Spec ya fue traído manualmente a main; el PR puede cerrarse.
- **`origin/feat/oauth-server`** — branch de la feature, ya mergeada via merge commit `35f7b31`. Puede borrarse.
- **`origin/docs/oauth-server-spec`** — fuente del spec, puede borrarse tras cerrar PR #26.

## Próximo paso

**Sub #3 — MCP server.** Requiere brainstorming + spec + plan nuevos. La spec del umbrella (`2026-04-28-multi-tenant-mcp-platform-umbrella.md`) tiene las decisiones estratégicas pre-pinned para MCP.
