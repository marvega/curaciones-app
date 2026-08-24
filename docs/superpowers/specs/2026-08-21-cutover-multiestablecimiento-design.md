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
| 2 | El **Authorization Server OAuth se despliega**. El login del SPA sigue usando el JWT interno | el MCP no puede funcionar sin el AS; ver §Authorization Server y MCP |
| 3 | Administración de organizaciones entra **completa**; `invite()` devuelve `acceptUrl` cuando `EMAIL_BACKEND=noop` | ver §Invitaciones sin email |
| 4 | Cutover **paralelo total**: servicio `curaciones-api-next` + canal preview de Hosting | valida el par frontend+backend antes de tocar nada live |
| 5 | PR de los 155 commits a `main` con CI verde; `prd` se archiva después del cutover | consumado el cutover ya no existen dos versiones |
| 6 | **MCP server dentro del alcance**, como segundo servicio Cloud Run | decisión del dueño |
| 7 | Core, Authorization Server y MCP entran en **un solo deploy** | decisión del dueño, tomada sobre la alternativa de tres etapas escalonadas. Consecuencia asumida: el rollback pasa a ser todo-o-nada y la validación del paso 13 crece |
| 8 | Tras validar, la imagen nueva se despliega como revisión de `curaciones-api` y se borra `curaciones-api-next` | evita quedar con un servicio llamado "next" en producción de forma permanente |
| 9 | Federación de identidad por institución (SSO) **fuera de alcance**, con spec propio (Sub #4) | ver §Relación con Sub #4 |

### Authorization Server y MCP

El MCP no puede funcionar sin el Authorization Server. No es preferencia de diseño: `mcp-server/src/auth/jwt-verifier.ts` verifica exclusivamente con `createRemoteJWKSet` contra un `issuer` y `audience` fijos, y el JWT interno del SPA es HS256 con secreto compartido — incompatible con JWKS. El umbrella ya lo consigna: `Sub #1 → Sub #2 (OAuth) → bloquea → Sub #3 (MCP)`.

La auth del SPA no cambia. `MultiAuthGuard` (`backend/src/oauth/guards/multi-auth.guard.ts:36`) enruta por el claim `iss`: tokens del issuer OAuth van al guard OAuth, el resto cae al JWT interno. Los dos caminos conviven sin refactorizar nada.

Desplegar el AS reintroduce cuatro requisitos que el alcance sin OAuth había eliminado:

| # | Requisito | Detalle |
|---|---|---|
| R1 | Rewrites en `firebase.json` para `/oauth/**`, **`/jwks.json`** y las dos rutas de discovery → Cloud Run | hoy solo `/api/**` está enrutado. `/jwks.json` vive en la **raíz** (`oidc-provider.factory.ts:171`), así que sin su rewrite `createRemoteJWKSet` del MCP recibe el HTML del SPA y **toda** autenticación MCP falla, detrás de un HTTP 200 |
| R2 | `OAUTH_ISSUER` y `OAUTH_AUDIENCE` como env de Cloud Run | el issuer debe ser el origen público exacto: `https://curaciones.web.app` |
| R3 | `OAUTH_COOKIE_SECRET` en Secret Manager | pasa a ser el secreto **6 de 6** del free tier. No quedan cupos |
| R4 | Endpoint protegido para `OAuthCleanupService.runDailyCleanup()` + Cloud Scheduler | el `@Cron(EVERY_DAY_AT_3AM)` no dispara con scale-to-zero. La API de Cloud Scheduler **no está habilitada** en el proyecto. El endpoint valida el token OIDC de identidad del job |

Superficie que se abre a propósito: `POST /oauth/register` (Dynamic Client Registration) es `@Public()` con throttle de 10/hora, y el URL de Cloud Run tiene `allUsers` como invoker. Es el mecanismo por el que un cliente MCP se registra, así que queda expuesto por diseño. Ver riesgo F11.

Las rutas `/account/connected-apps` y `/account/oauth/consent` (`frontend/src/App.tsx:68-69`) se conservan: con el AS desplegado tienen backend detrás.

**Despliegue del MCP:** segundo servicio Cloud Run `curaciones-mcp`, imagen desde `mcp-server/Dockerfile` (`CMD node dist/server.js`), rutas `POST /mcp` y `GET /health` sobre fastify. Env: `BACKEND_URL`, `OAUTH_ISSUER`, `OAUTH_JWKS_URL`, `OAUTH_AUDIENCE`, `LOG_LEVEL`, `NODE_ENV`. **No requiere secretos** — todos sus valores son URLs públicas, así que no compite por el cupo de Secret Manager. El servicio no toca Postgres: proxy-ea al backend con el access token del usuario, y el `AuditLogInterceptor` del backend registra cada llamada.

### Relación con Sub #4

Lo que el dueño busca a mediano plazo es que cada institución entre con su propio proveedor de identidad —una con Microsoft Entra, otra con Google, otra con su propio OAuth—, y que ese mismo mecanismo sirva para autenticarse ante el MCP. Eso es un subsistema que hoy **no existe**: `organizations` no tiene columna de proveedor de auth y no hay código de federación. El umbrella lo tiene como D6, diferido, con la decisión de que sería OIDC con Microsoft Entra antes que SAML genérico.

Este cutover no cierra esa puerta, y conviene registrar por qué:

- Microsoft Entra, Google Workspace y "su propio OAuth" son todos **OIDC**. Se construye **un** conector genérico parametrizado por `issuer` / `client_id` / `client_secret` / `scopes`, no una integración por proveedor.
- El punto de enganche ya existe: `consent.controller.ts:231` fija `interaction.result = { login: { accountId } }`. Un login federado redirige al IdP externo y, al volver, resuelve el `user.id` local y fija el mismo `accountId`.
- La configuración por institución cabe en `organizations.settings`, que ya es `jsonb` — sin migración de esquema.
- Falta por construir: mapeo de identidad externa (`issuer` + `sub`) → `user.id`, descubrimiento de organización por dominio de correo, política de aprovisionamiento (en salud, invitación previa antes que creación automática) y política por institución (`local` / `oidc` / ambas).
- **El trabajo mayor de Sub #4 es migrar el login del SPA al AS.** Mientras el SPA use su JWT propio, el SSO sirve al MCP y a apps externas, pero no a un funcionario que entra a la web con su cuenta institucional.

Sub #4 tiene spec propio, en elaboración por decisión del dueño.

Las 6 migraciones OAuth se corren en el paso 7 de la secuencia.

### Invitaciones sin email

`invite()` devuelve solo `{ id }` y `NoopEmailService` loguea únicamente destinatario y asunto — el token de invitación nunca sale del proceso. Una invitación creada desde la UI en producción es hoy **irrecuperable**. El único camino operable es el CLI, que sí lo imprime (`admin-create-org.ts:67`).

Resend no es alternativa a corto plazo: exige dominio verificado para enviar a terceros y la decisión es quedarse en `*.web.app`.

Cambio: cuando `EMAIL_BACKEND=noop`, `POST /api/org/invitations` devuelve también el `acceptUrl` para que el owner lo comparta por su cuenta. El token queda en una respuesta HTTP, visible solo para el owner autenticado que la generó.

## Alcance

**Dentro:** backend y frontend multi-establecimiento; los 9 endpoints `/api/org/*` y las 4 páginas de `OrgTabs`; paginación por cursor; migraciones OAuth; **Authorization Server operativo**; **MCP server como segundo servicio Cloud Run**; Cloud Scheduler para la limpieza diaria; infra GCP portada; features de producción ausentes en `main`.

**Fuera:** dominio propio; envío real de email; federación de identidad por institución (Sub #4); migración del login del SPA al AS (parte de Sub #4).

## Cambios de código

| Qué | Dónde | Origen |
|---|---|---|
| Infra GCP | `backend/Dockerfile`, `backend/.dockerignore`, `firebase.json`, `.firebaserc`, `backend/src/common/db-ssl.util.ts` (+spec) y su wiring en `data-source.ts`, `frontend/package.json → build:hosting` | cherry-pick de `feat/gcp-migration` (7 commits) |
| Manual de usuario `/ayuda` | `frontend/src/pages/HelpPage.tsx`, `frontend/public/manual/*.jpg` (17), `Layout.tsx` | cherry-pick `f7489b8` |
| Slot de agenda 16:30 | `backend/src/common/schedule.util.ts` | cherry-pick `73070b1` |
| Rewrites `/oauth/**` y `/.well-known/**` (R1) | `firebase.json`, `firebase.next.json` | nuevo |
| Endpoint protegido de limpieza + validación del token OIDC del job (R4) | `backend/src/oauth/services/oauth-cleanup.service.ts` (quitar `@Cron`), controller nuevo | nuevo, ~30 líneas |
| `acceptUrl` en invitaciones | `backend/src/org/org.service.ts`, `backend/src/auth/invitations.service.ts` + test | nuevo, ~10 líneas |
| `FRONTEND_URL` → `https://curaciones.web.app`; `OAUTH_ISSUER`, `OAUTH_AUDIENCE` (R2) | env de Cloud Run | comando |
| `OAUTH_COOKIE_SECRET` (R3) | Secret Manager, secreto 6/6 | comando |
| Build y despliegue del MCP | `mcp-server/Dockerfile` ya existe; servicio `curaciones-mcp` | comandos |
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
6. Build y push de **dos** imágenes: `api:<sha>` y `mcp:<sha>`.
7. Correr las 6 migraciones OAuth contra Neon como **paso explícito de operador** (`DATABASE_URL=<neon> npm run migration:run`). No se delega al arranque del contenedor: el `CMD` es `node dist/main`, y cambiarlo a `start:prod` haría que cada arranque en frío intente migrar, con dos instancias posibles compitiendo. El código live ignora las tablas nuevas.
8. Habilitar la API de Cloud Scheduler y crear el secreto `OAUTH_COOKIE_SECRET`.
9. Desplegar `curaciones-api-next` con la misma config, secretos y bucket, y `OAUTH_ISSUER` apuntando al **URL del canal preview**.
10. Desplegar `curaciones-mcp-next` apuntando a `curaciones-api-next`.
11. Canal preview de Hosting con un `firebase.next.json` cuyos rewrites de `/api/**`, `/oauth/**` y `/.well-known/**` apuntan a `curaciones-api-next`.
12. Deploy del frontend nuevo al canal preview.
13. **Validación end-to-end en el canal preview** — login, pacientes, curaciones, agenda, inventario, `/org/*`, `/ayuda`, PDF de ficha, cadena de auditoría, **flujo OAuth completo** (DCR → authorize → consent → token → refresh) y **conexión de un cliente MCP** con lectura de paciente. **Checkpoint de aborto sin costo**: nada de lo live se ha tocado.
14. Promover: desplegar la imagen nueva como revisión de `curaciones-api`, pasar tráfico al 100% y fijar los env definitivos (`FRONTEND_URL` y `OAUTH_ISSUER` en `https://curaciones.web.app`).
15. Desplegar `curaciones-mcp` definitivo apuntando a `curaciones-api`.
16. Crear el job de Cloud Scheduler contra el endpoint de limpieza y verificarlo con una invocación manual.
17. Deploy del frontend a live con `firebase.json` apuntando a `curaciones-api`.
18. Smoke en live, incluida la reconexión del cliente MCP contra el issuer definitivo.
19. Limpieza: borrar `curaciones-api-next`, `curaciones-mcp-next` y el canal preview.
20. Post-cutover: archivar `prd`, reescribir el modelo de ramas en `CLAUDE.md`, reactivar los backups.

El `OAUTH_ISSUER` cambia entre el canal preview y el destino final, porque el issuer debe coincidir con el origen público exacto. Los tokens emitidos durante la validación quedan inválidos tras la promoción; es esperado y por eso el smoke del paso 18 incluye reconectar el cliente MCP.

El orden backend→frontend no es arbitrario. La paginación por cursor es **opt-in**: solo cambia la forma de la respuesta si el cliente manda `?cursor=` (`patients.controller.ts:73`), así que el frontend actual tolera el backend nuevo. Lo inverso no: el frontend nuevo llamaría a `/api/org/*`.

## Plan de rollback

| Capa | Acción | Tiempo |
|---|---|---|
| Frontend | `firebase hosting:clone curaciones:f3479db990d5f000 curaciones:live` | segundos |
| Backend | `gcloud run services update-traffic curaciones-api --to-revisions curaciones-api-00001-zjj=100 --region us-west1` | segundos |
| MCP | `gcloud run services delete curaciones-mcp --region us-west1` — el servicio no existía antes, así que borrarlo restituye el estado previo | segundos |
| Cloud Scheduler | `gcloud scheduler jobs pause` (o delete) del job de limpieza | segundos |
| Imagen | garantizada por el blindaje #1 | — |
| Código | `git tag prd-gcp-live-2026-08-21` | — |

Los env del Authorization Server (`OAUTH_ISSUER`, `OAUTH_AUDIENCE`, `OAUTH_COOKIE_SECRET`) forman parte de la especificación de la revisión de Cloud Run, así que volver a la revisión `00001` los revierte en el mismo comando. Los clientes OAuth registrados y los tokens emitidos quedan huérfanos en tablas que el código viejo ignora; el `oauth_client` sin `firstAuthorizedAt` se limpia a los 30 días.

La decisión 7 (un solo deploy) hace que el rollback sea **todo-o-nada**: no hay forma de conservar el core multi-establecimiento y descartar solo el AS o solo el MCP, porque viajan en la misma imagen. Es la contrapartida asumida al elegir una sola ventana.

**La base de datos no se revierte, y es deliberado.** Las 6 migraciones son aditivas y no tocan ninguna tabla de negocio, así que el código viejo funciona sin cambios sobre el esquema nuevo. El rollback conserva todo lo que los usuarios hayan escrito. Restaurar la base queda reservado a corrupción, desde el branch de Neon o el dump del blindaje #2.

Puntos de decisión:

| Momento | Si falla |
|---|---|
| Paso 2 (build/suite) | revisar el diseño; nada desplegado |
| Paso 7 (migraciones) | son aditivas: el código live sigue funcionando sobre el esquema parcial. Revertir con los `down()` solo si quedó a medias |
| Paso 13 (validación en preview) | no promover; impacto en usuarios cero |
| Después del paso 17 | rollback de todas las capas, ~1 minuto |

## Riesgos y flancos

Declarados aquí por decisión explícita: se verifican durante la ejecución, no antes de escribir este documento. F1 y F2 son los únicos capaces de cambiar el diseño y por eso son el checkpoint del paso 2.

| ID | Flanco | Impacto | Mitigación |
|---|---|---|---|
| F1 | ¿Construye el `Dockerfile` de producción contra el árbol de `main`? | riesgo reducido por inspección: `tsconfig.build.json` del objetivo excluye `scripts`, así que `dist/` queda plano y `node dist/main` resuelve. Queda confirmar con un build real | checkpoint del paso 2 |
| F2 | ¿Pasa la suite de `feat/org-admin-tabs`? Nunca corrió CI | **bloqueante**: es el gate del PR | checkpoint del paso 2; si falla, se recorta alcance |
| F3 | ~~`mcp-server/` en el contexto de build~~ **cerrado**: el contexto es `backend/` y el Dockerfile solo copia `package*.json`, los tsconfig, `nest-cli.json` y `src` | — | — |
| F4 | `org-scope.subscriber` vs los endpoints `/api/org/*`, que usan `runWithBypass` | aislamiento entre organizaciones | test de aislamiento en el paso 13 |
| F5 | ¿Canales preview de Hosting en plan Spark? El multisite exige Blaze; los canales no deberían | la estrategia de cutover paralelo depende de esto | verificar en el paso 11; si no, degradar a revisión sin tráfico |
| F6 | Desajuste de hash en la cadena de auditoría ya registrado en esta base en agosto | atribuir al cutover un defecto preexistente | medir antes del paso 7 y después del paso 18 |
| F7 | Neon free suspende el compute a los 5 minutos de inactividad, y la conexión es directa (sin pooler) | **doble arranque en frío**: Cloud Run + Neon | aceptado; si molesta, `-pooler` en `DATABASE_URL` |
| F8 | Dos servicios sobre la misma base: `DB_POOL_MAX=3` × `maxScale=2` × 2 servicios = hasta 12 conexiones | dentro de los límites de Neon free | monitorear en el paso 13 |
| F9 | Dos servicios montando el mismo bucket gcsfuse | irrelevante hoy: `wound_photos = 0` | — |
| F10 | Secret Manager queda en **6/6** al agregar `OAUTH_COOKIE_SECRET` | sin cupo libre; rotar un secreto crea una versión nueva y **sale del free tier** | el MCP no requiere secretos; si hiciera falta un séptimo, consolidar varios en un JSON |
| F11 | `POST /oauth/register` queda público por diseño (throttle 10/hora), y el URL de Cloud Run tiene `allUsers` | registro de clientes OAuth por terceros | es el mecanismo que usa el cliente MCP. Monitorear `oauth_client` con `firstAuthorizedAt IS NULL`; la limpieza los borra a los 30 días |
| F12 | El `OAUTH_ISSUER` del canal preview difiere del definitivo | los tokens de la validación quedan inválidos tras la promoción | esperado; el smoke del paso 18 reconecta el cliente MCP |
| F13 | El smoke interactivo del MCP **nunca se ejecutó** (pendiente desde 2026-05-07) | 20 tools sin verificación end-to-end contra un cliente real | pasos 13 y 18; es la parte más incierta de la validación |
| F14 | La decisión de un solo deploy vuelve el rollback todo-o-nada | no se puede descartar solo el AS o solo el MCP | asumido explícitamente en la decisión 7 |

## Criterios de aceptación

1. `https://curaciones.web.app` sirve la versión multi-establecimiento y `/api/health` responde 200.
2. Login con las credenciales actuales funciona; los 4 usuarios existentes conservan su acceso.
3. Los 51 pacientes, 809 curaciones y 823 citas están íntegros y legibles (sin `EncryptedField` crudo en la UI).
4. Las 4 páginas de `OrgTabs` responden y `POST /api/org/invitations` devuelve un `acceptUrl` usable.
5. `/ayuda` sirve el manual y la agenda ofrece el slot 16:30.
6. `https://curaciones.web.app/.well-known/openid-configuration` responde con `issuer` igual a `https://curaciones.web.app`.
7. Flujo OAuth completo verificado: registro dinámico de cliente, autorización, consentimiento, emisión de token y refresh.
8. Un cliente MCP se conecta, lista las 20 tools y una lectura de paciente devuelve datos correctos.
9. Las llamadas del MCP quedan registradas en `audit_logs`.
10. El job de Cloud Scheduler ejecuta la limpieza diaria, verificado con una invocación manual.
11. La cadena de auditoría tiene el mismo estado que antes del cutover (F6).
12. El rollback fue ensayado: la revisión `00001` y la release `f3479db990d5f000` siguen alcanzables.
13. `prd` archivada y `CLAUDE.md` describiendo una sola rama de producción.
