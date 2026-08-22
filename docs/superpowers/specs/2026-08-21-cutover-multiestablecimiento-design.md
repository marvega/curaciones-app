# Cutover a la versión multi-establecimiento

**Fecha:** 2026-08-21
**Estado:** diseño aprobado, pendiente de plan de implementación
**Rama de trabajo:** `feat/cutover-multiestablecimiento` (desde `feat/org-admin-tabs`)

## Objetivo

Reemplazar el código que hoy corre en GCP por la versión multi-establecimiento, para dejar de sostener dos versiones del producto. La ventana elegida es un fin de semana sin tráfico.

Todo dato marcado como *medido* en este documento fue verificado en vivo el 2026-08-21, no inferido.

## Contexto: el estado real de las ramas

El modelo de ramas documentado en `CLAUDE.md` describe `prd` como la app single-tenant legacy y `main` como la versión multi-establecimiento. El repositorio no coincide con esa descripción:

| Hecho *medido* | Consecuencia |
|---|---|
| `prd` **ya contiene** la fundación multi-tenancy (Sub #1, commit `6bada78`, 2026-04-29) | el delta de esquema entre las dos versiones es mucho menor de lo que sugiere el modelo |
| Lo que corre en producción **no es `prd`**: es `feat/gcp-migration` (7 commits sobre `origin/prd`, **nunca pusheada**) | el código en producción existe únicamente en este Mac |
| El objetivo real es `feat/org-admin-tabs` = `main` local + 22 commits de org-admin, **155 commits sobre `origin/main`** | `origin/main` está 133 commits atrás del `main` local |
| Punto de divergencia `prd` / `main`: `8d2af59` (2026-04-29) | |
| `origin/prd` tiene 4 commits ausentes de `origin/main`: `73070b1` (slot 16:30), `f7489b8` (manual `/ayuda`), `6d8d050` (docs), `104bbdc` (fix de descifrado) | los tres primeros hay que portarlos; `104bbdc` ya está en el objetivo (verificado en `patients.service.ts:100`) |

Delta de esquema entre lo live y el objetivo: **6 migraciones OAuth, todas aditivas**. Crean tablas, tipos e índices `oauth_*` nuevos; ninguna toca una tabla de negocio. Los `DROP` viven solo en los `down()`. **No hay backfill ni transformación de datos.**

## Estado medido de producción

### Infraestructura

| Recurso | Valor |
|---|---|
| Proyecto GCP | `gws-marcelo-2026` (cuenta `me@marcelovega.com`) |
| Cloud Run | `curaciones-api`, `us-west1`, revisión única `curaciones-api-00001-zjj` |
| Imagen | `us-west1-docker.pkg.dev/gws-marcelo-2026/curaciones/api:3dc69f5`<br>digest `sha256:8c0e4226b6b48bd103ca32a6a15b3960e72cc1d998287a1544a1e5ac488ab115` |
| Escalado | `maxScale=2`, sin `minScale` (scale-to-zero), `startup-cpu-boost` |
| Env planos | `NODE_ENV=production`, `EMAIL_BACKEND=noop`, `KMS_BACKEND=memory`, `OWNER_EMAIL=me@marcelovega.com`, `NODE_OPTIONS=--max-old-space-size=400`, `FRONTEND_URL=https://curaciones.marcelovega.com` |
| Secretos | `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `KMS_LOCAL_MASTER_KEY`, `HEALTH_TOKEN` (5 de 6 del free tier) |
| Volumen | gcsfuse, bucket `curaciones-uploads`, montado en `/app/uploads` |
| IAM | `allUsers` → `roles/run.invoker` (**el URL de Cloud Run es público**) |
| Artifact Registry | repo `curaciones`, 127.8 MB, 3 versiones. Política: `keep-recent keepCount=2` + `delete-rest DELETE tagState=ANY` |
| Firebase Hosting | site `curaciones` → `https://curaciones.web.app`. Releases: `f3479db990d5f000` (live, 2026-08-20T07:04:33Z), `54d049e82621f63d` |
| Cloud Scheduler API | **no habilitada** |
| `curaciones.marcelovega.com` | **no resuelve** (sin registro DNS) |

### Base de datos

| Métrica | Valor |
|---|---|
| Neon | `ep-withered-cell-af9ykahb.c-2.us-west-2.aws.neon.tech`, `sslmode=verify-full`, **conexión directa (sin pooler)** |
| Tamaño | 11 MB |
| Migraciones aplicadas | `InitialBaseline`, `InventoryFoundation`, `CanastaResetAndAutomappedFlag`, `MultiTenancyFoundation` (4) |
| Filas | 1 org · 4 users · 51 pacientes · 809 curaciones · 823 citas · 685 audit_logs · 0 wound_photos |
| Última escritura | `audit_logs.createdAt` máximo = 2026-08-21 19:26:34 |
| Pool | `DB_POOL_MAX` no seteado → default 3 (`app.module.ts:89`) |

El `CMD` del Dockerfile es `node dist/main`, **no** `npm run start:prod`. El contenedor de producción **no corre migraciones al arrancar**, contra lo que afirmaba el handoff de agosto. Las 4 migraciones presentes llegaron con el restore del dump de Render. Las 6 migraciones OAuth exigen por tanto un paso explícito de operador.

El handoff de agosto consignaba 3 pacientes; esa medición correspondía a la base de Render ya obsoleta. La producción real tiene 809 curaciones y actividad del día del cutover.

## Decisiones

| # | Decisión | Fundamento |
|---|---|---|
| 1 | Dominio: se mantiene `curaciones.web.app` | decisión del dueño; sin dominio propio |
| 2 | Auth: se mantiene el JWT actual. OAuth entra como **módulo reducido** | ver §OAuth reducido |
| 3 | Administración de organizaciones entra **completa**; `invite()` devuelve `acceptUrl` cuando `EMAIL_BACKEND=noop` | ver §Invitaciones sin email |
| 4 | Cutover **paralelo total**: servicio `curaciones-api-next` + canal preview de Hosting | valida el par frontend+backend antes de tocar nada live |
| 5 | PR de los 155 commits a `main` con CI verde; `prd` se archiva después del cutover | consumado el cutover ya no existen dos versiones |
| 6 | MCP server **fuera de alcance** | depende del JWKS del Authorization Server, que no se despliega |
| 7 | Tras validar, la imagen nueva se despliega como revisión de `curaciones-api` y se borra `curaciones-api-next` | evita quedar con un servicio llamado "next" en producción de forma permanente |

### OAuth reducido

Mantener la auth actual **no requiere refactorizar nada**: `MultiAuthGuard` (`backend/src/oauth/guards/multi-auth.guard.ts:36`) enruta por el claim `iss` y cae al JWT interno cuando el token no viene del issuer OAuth. Sin clientes registrados, el login se comporta igual que hoy.

El problema no es funcional sino de superficie: `POST /oauth/register` (Dynamic Client Registration) es `@Public()` con throttle de 10/hora, y el URL de Cloud Run tiene `allUsers` como invoker. No alcanza con omitir el rewrite en Hosting — `https://curaciones-api-….run.app/oauth/register` quedaría abierto.

`OAuthModule` es `@Global()` y exporta los guards que usan 6 controllers clínicos, así que desmontarlo entero obligaría a refactorizar el path de autenticación de endpoints clínicos justo antes del cutover. Se opta por el módulo reducido:

| Se conserva | Se quita |
|---|---|
| `MultiAuthGuard`, `OAuthJwtGuard`, `OAuthScopeGuard`, `OAuthJwtStrategy` | los 5 controllers OAuth (`Discovery`, `Register`, `Authorize`, `Token`, `Consent`) |
| decoradores `RequiredScopes`, `NoOAuthAccess` | `OidcProviderSingleton` (inicializa oidc-provider en el boot) |
| `APP_GUARD` `OAuthClientThrottlerGuard` — inocuo: sin tokens OAuth cae al throttling normal | `OAuthBootstrapService` (genera una clave RSA en cada arranque) |
| | `AccountAdapterService`, `OAuthCleanupService`, `ConnectedAppsController` |

Efectos colaterales positivos: desaparecen tres gaps que el diseño original tenía que resolver — los rewrites de `/oauth/**` y `/.well-known/**`, la habilitación de Cloud Scheduler para el `@Cron(EVERY_DAY_AT_3AM)` de `OAuthCleanupService`, y el secreto `OAUTH_COOKIE_SECRET` (que habría consumido el último cupo del free tier).

Las 6 migraciones OAuth **se corren igual**, para no divergir el historial de migraciones. Quedan 5 tablas vacías.

Consecuencia en el frontend: las rutas `/account/connected-apps` y `/account/oauth/consent` (`frontend/src/App.tsx:68-69`) quedarían apuntando a endpoints inexistentes. Se retiran del router junto con su entrada de navegación.

### Invitaciones sin email

`invite()` devuelve solo `{ id }` y `NoopEmailService` loguea únicamente destinatario y asunto — el token de invitación nunca sale del proceso. Una invitación creada desde la UI en producción es hoy **irrecuperable**. El único camino operable es el CLI, que sí lo imprime (`admin-create-org.ts:67`).

Resend no es alternativa a corto plazo: exige dominio verificado para enviar a terceros y la decisión es quedarse en `*.web.app`.

Cambio: cuando `EMAIL_BACKEND=noop`, `POST /api/org/invitations` devuelve también el `acceptUrl` para que el owner lo comparta por su cuenta. El token queda en una respuesta HTTP, visible solo para el owner autenticado que la generó.

## Alcance

**Dentro:** backend y frontend multi-establecimiento; los 9 endpoints `/api/org/*` y las 4 páginas de `OrgTabs`; paginación por cursor; migraciones OAuth; módulo OAuth reducido; infra GCP portada; features de producción ausentes en `main`.

**Fuera:** MCP server; Authorization Server OAuth operativo; dominio propio; envío real de email; Cloud Scheduler.

## Cambios de código

| Qué | Dónde | Origen |
|---|---|---|
| Infra GCP | `backend/Dockerfile`, `backend/.dockerignore`, `firebase.json`, `.firebaserc`, `backend/src/common/db-ssl.util.ts` (+spec) y su wiring en `data-source.ts`, `frontend/package.json → build:hosting` | cherry-pick de `feat/gcp-migration` (7 commits) |
| Manual de usuario `/ayuda` | `frontend/src/pages/HelpPage.tsx`, `frontend/public/manual/*.jpg` (17), `Layout.tsx` | cherry-pick `f7489b8` |
| Slot de agenda 16:30 | `backend/src/common/schedule.util.ts` | cherry-pick `73070b1` |
| Módulo OAuth reducido | `backend/src/oauth/oauth.module.ts`, `backend/src/app.module.ts` | nuevo, ~30 líneas |
| Retirar rutas OAuth del frontend | `frontend/src/App.tsx`, `Layout.tsx` | nuevo |
| `acceptUrl` en invitaciones | `backend/src/org/org.service.ts`, `backend/src/auth/invitations.service.ts` + test | nuevo, ~10 líneas |
| `FRONTEND_URL` → `https://curaciones.web.app` | env de Cloud Run | comando |
| Repuntar backups a Neon | `scripts/.env.backup` — hoy apunta a la base de Render **muerta** | nuevo |
| Reescribir el modelo de ramas | `CLAUDE.md` | post-cutover |

El wiring de TLS es obligatorio: el objetivo todavía tiene `ssl: { rejectUnauthorized: false }` (`data-source.ts:50`), que deshabilita la verificación del certificado.

## Blindaje previo

Antes de construir cualquier imagen:

| # | Acción | Por qué |
|---|---|---|
| 1 | `keepCount` 2 → 5 en la cleanup policy, y tag `prd-rollback` sobre `3dc69f5` | con `keepCount=2`, `delete-rest DELETE tagState=ANY` y 3 versiones ya presentes, subir dos imágenes nuevas **borra la imagen de producción**. La revisión `00001` la referencia por digest, así que el rollback fallaría en el primer arranque en frío |
| 2 | `pg_dump` completo de Neon | el último respaldo es del 2026-05-08; el job de launchd no está instalado |
| 3 | Branch de Neon como punto de restauración | rollback de datos instantáneo si hubiera corrupción |
| 4 | `git tag prd-gcp-live-2026-08-21` sobre `feat/gcp-migration` + push | el código que corre en producción **solo existe en este Mac** |

## Secuencia de cutover

1. Blindaje (§anterior).
2. Verificar los flancos bloqueantes F1 y F2 (§Riesgos) — **checkpoint**: si el contenedor no arranca contra el árbol de `main`, el diseño se revisa antes de seguir.
3. Consolidar en `main` local: merge de `feat/org-admin-tabs`, cherry-picks de infra y features, cambios de código.
4. CI local en verde (backend requiere Postgres; ni Docker ni `postgres` local están corriendo hoy).
5. PR a `main`, CI de GitHub Actions en verde, merge.
6. Build y push de la imagen `api:<sha>`.
7. Correr las 6 migraciones OAuth contra Neon como **paso explícito de operador** (`DATABASE_URL=<neon> npm run migration:run`). No se delega al arranque del contenedor: el `CMD` es `node dist/main`, y cambiarlo a `start:prod` haría que cada arranque en frío intente migrar, con dos instancias posibles compitiendo. El código live ignora las tablas nuevas.
8. Desplegar `curaciones-api-next` con la misma config, secretos y bucket.
9. Canal preview de Hosting con un `firebase.next.json` cuyo rewrite apunta a `curaciones-api-next`.
10. Deploy del frontend nuevo al canal preview.
11. **Validación end-to-end en el canal preview** — login, pacientes, curaciones, agenda, inventario, `/org/*`, `/ayuda`, PDF de ficha, verificación de la cadena de auditoría. **Checkpoint de aborto sin costo**: nada de lo live se ha tocado.
12. Promover: desplegar la imagen nueva como revisión de `curaciones-api` y pasar tráfico al 100%. Corregir `FRONTEND_URL` en el mismo comando.
13. Deploy del frontend a live con `firebase.json` apuntando a `curaciones-api`.
14. Smoke en live.
15. Limpieza: borrar `curaciones-api-next` y el canal preview.
16. Post-cutover: archivar `prd`, reescribir el modelo de ramas en `CLAUDE.md`, reactivar los backups.

El orden backend→frontend no es arbitrario. La paginación por cursor es **opt-in**: solo cambia la forma de la respuesta si el cliente manda `?cursor=` (`patients.controller.ts:73`), así que el frontend actual tolera el backend nuevo. Lo inverso no: el frontend nuevo llamaría a `/api/org/*`.

## Plan de rollback

| Capa | Acción | Tiempo |
|---|---|---|
| Frontend | `firebase hosting:clone curaciones:f3479db990d5f000 curaciones:live` | segundos |
| Backend | `gcloud run services update-traffic curaciones-api --to-revisions curaciones-api-00001-zjj=100 --region us-west1` | segundos |
| Imagen | garantizada por el blindaje #1 | — |
| Código | `git tag prd-gcp-live-2026-08-21` | — |

**La base de datos no se revierte, y es deliberado.** Las 6 migraciones son aditivas y no tocan ninguna tabla de negocio, así que el código viejo funciona sin cambios sobre el esquema nuevo. El rollback conserva todo lo que los usuarios hayan escrito. Restaurar la base queda reservado a corrupción, desde el branch de Neon o el dump del blindaje #2.

Puntos de decisión:

| Momento | Si falla |
|---|---|
| Paso 2 (build/suite) | revisar el diseño; nada desplegado |
| Paso 7 (migraciones) | son aditivas: el código live sigue funcionando sobre el esquema parcial. Revertir con los `down()` solo si quedó a medias |
| Paso 11 (validación en preview) | no promover; impacto en usuarios cero |
| Después del paso 13 | rollback de las dos capas, ~1 minuto |

## Riesgos y flancos

Declarados aquí por decisión explícita: se verifican durante la ejecución, no antes de escribir este documento. F1 y F2 son los únicos capaces de cambiar el diseño y por eso son el checkpoint del paso 2.

| ID | Flanco | Impacto | Mitigación |
|---|---|---|---|
| F1 | ¿Construye el `Dockerfile` de producción contra el árbol de `main`? | riesgo reducido por inspección: `tsconfig.build.json` del objetivo excluye `scripts`, así que `dist/` queda plano y `node dist/main` resuelve. Queda confirmar con un build real | checkpoint del paso 2 |
| F2 | ¿Pasa la suite de `feat/org-admin-tabs`? Nunca corrió CI | **bloqueante**: es el gate del PR | checkpoint del paso 2; si falla, se recorta alcance |
| F3 | ~~`mcp-server/` en el contexto de build~~ **cerrado**: el contexto es `backend/` y el Dockerfile solo copia `package*.json`, los tsconfig, `nest-cli.json` y `src` | — | — |
| F4 | `org-scope.subscriber` vs los endpoints `/api/org/*`, que usan `runWithBypass` | aislamiento entre organizaciones | test de aislamiento en el paso 11 |
| F5 | ¿Canales preview de Hosting en plan Spark? El multisite exige Blaze; los canales no deberían | la estrategia de cutover paralelo depende de esto | verificar en el paso 9; si no, degradar a revisión sin tráfico |
| F6 | Desajuste de hash en la cadena de auditoría ya registrado en esta base en agosto | atribuir al cutover un defecto preexistente | medir antes del paso 7 y después del paso 14 |
| F7 | Neon free suspende el compute a los 5 minutos de inactividad, y la conexión es directa (sin pooler) | **doble arranque en frío**: Cloud Run + Neon | aceptado; si molesta, `-pooler` en `DATABASE_URL` |
| F8 | Dos servicios sobre la misma base: `DB_POOL_MAX=3` × `maxScale=2` × 2 servicios = hasta 12 conexiones | dentro de los límites de Neon free | monitorear en el paso 9 |
| F9 | Dos servicios montando el mismo bucket gcsfuse | irrelevante hoy: `wound_photos = 0` | — |
| F10 | Secret Manager 5/6 | el módulo reducido evita `OAUTH_COOKIE_SECRET`, así que no se agregan secretos | — |

## Criterios de aceptación

1. `https://curaciones.web.app` sirve la versión multi-establecimiento y `/api/health` responde 200.
2. Login con las credenciales actuales funciona; los 4 usuarios existentes conservan su acceso.
3. Los 51 pacientes, 809 curaciones y 823 citas están íntegros y legibles (sin `EncryptedField` crudo en la UI).
4. Las 4 páginas de `OrgTabs` responden y `POST /api/org/invitations` devuelve un `acceptUrl` usable.
5. `/ayuda` sirve el manual y la agenda ofrece el slot 16:30.
6. Ningún endpoint `/oauth/*` responde en el URL directo de Cloud Run.
7. La cadena de auditoría tiene el mismo estado que antes del cutover (F6).
8. El rollback fue ensayado: la revisión `00001` y la release `f3479db990d5f000` siguen alcanzables.
9. `prd` archivada y `CLAUDE.md` describiendo una sola rama de producción.
