# Cutover multi-establecimiento — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el código que corre hoy en GCP por la versión multi-establecimiento, con el Authorization Server y el MCP incluidos, en un solo deploy y con rollback de un comando por capa.

**Architecture:** Se consolidan 155 commits en `main`, se portan la infraestructura GCP y dos features que solo existen en producción, y se despliega en paralelo (`curaciones-api-next` + `curaciones-mcp-next` + canal preview de Hosting) para validar el conjunto antes de tocar lo live. Las 6 migraciones OAuth son aditivas, así que el rollback nunca revierte la base de datos.

**Tech Stack:** NestJS 11 + TypeORM + Postgres 18 (Neon), React + Vite, fastify (MCP), Cloud Run, Firebase Hosting, Artifact Registry, Secret Manager, Cloud Scheduler.

**Spec:** `docs/superpowers/specs/2026-08-21-cutover-multiestablecimiento-design.md`

## Global Constraints

- Proyecto GCP `gws-marcelo-2026`, región `us-west1`, cuenta `me@marcelovega.com`.
- `OAUTH_ISSUER` en producción debe ser exactamente `https://curaciones.web.app`. Durante la validación, exactamente el URL del canal preview. Es obligatoria al arrancar: `assertOauthEnv()` lanza antes de abrir el puerto si falta con `NODE_ENV=production`, así que **tiene que ir en el `--set-env-vars` del `deploy`**, nunca solo en un `update` posterior.
- `MCP_RESOURCE_URL` es obligatoria para el MCP (zod, `mcp-server/src/config.ts`) y su valor es el **origen propio** del servicio Cloud Run, que no se conoce hasta que el servicio existe. Los dos deploys del MCP arrancan con un placeholder `https://…invalid` y lo fijan con un `update` inmediatamente después. Debe ser un origen `https` sin path, query ni fragmento.
- Puntos de rollback que **no se pueden perder**: revisión `curaciones-api-00001-zjj`, release de Hosting `f3479db990d5f000`, imagen `api:3dc69f5` (digest `sha256:8c0e4226b6b48bd103ca32a6a15b3960e72cc1d998287a1544a1e5ac488ab115`).
- Secret Manager: máximo **6 secretos** (free tier). Tras agregar `OAUTH_COOKIE_SECRET` queda en 6/6. **No crear un séptimo.**
- Imágenes para Cloud Run: `--platform linux/amd64`. El Mac es arm64 y una imagen arm no arranca en Cloud Run.
- Las 6 migraciones OAuth son aditivas. El rollback **no** revierte la base de datos.
- UI nueva: solo primitivas de `frontend/src/components/ui`. Regla ESLint `ui/use-primitives` en `error`.
- Nunca commit directo a `main` ni a `prd`; solo PR. Sin trailers `Co-authored-by`.
- Node 22 en CI; Postgres 18 para tests.

---

## Fase 0 — Blindaje

### Task 1: Blindar los puntos de rollback

Sin esto, subir dos imágenes nuevas borra `api:3dc69f5` y el rollback del backend falla en el primer arranque en frío.

**Files:**
- Create: `/tmp/artifact-cleanup-policy.json` (temporal, no se commitea)

- [ ] **Step 1: Confirmar la política actual y el digest a proteger**

```bash
gcloud artifacts repositories describe curaciones --location=us-west1 \
  --format='yaml(cleanupPolicies)'
gcloud run services describe curaciones-api --region us-west1 \
  --format='value(spec.template.spec.containers[0].image)'
```

Esperado: `keepCount: 2` con `delete-rest DELETE tagState ANY`, e imagen `...@sha256:8c0e4226b6b48bd103ca32a6a15b3960e72cc1d998287a1544a1e5ac488ab115`.

- [ ] **Step 2: Etiquetar la imagen de producción como punto de rollback**

```bash
gcloud artifacts docker tags add \
  us-west1-docker.pkg.dev/gws-marcelo-2026/curaciones/api:3dc69f5 \
  us-west1-docker.pkg.dev/gws-marcelo-2026/curaciones/api:prd-rollback
```

- [ ] **Step 3: Escribir la política nueva**

```bash
cat > /tmp/artifact-cleanup-policy.json <<'JSON'
[
  {
    "name": "keep-rollback",
    "action": {"type": "Keep"},
    "condition": {"tagState": "TAGGED", "tagPrefixes": ["prd-rollback", "3dc69f5"]}
  },
  {
    "name": "keep-recent",
    "action": {"type": "Keep"},
    "mostRecentVersions": {"keepCount": 5}
  },
  {
    "name": "delete-rest",
    "action": {"type": "Delete"},
    "condition": {"tagState": "ANY"}
  }
]
JSON
```

- [ ] **Step 4: Aplicarla en modo simulación y revisar qué borraría**

```bash
gcloud artifacts repositories set-cleanup-policies curaciones \
  --location=us-west1 --policy=/tmp/artifact-cleanup-policy.json --dry-run
gcloud artifacts repositories describe curaciones --location=us-west1 \
  --format='yaml(cleanupPolicies,cleanupPolicyDryRun)'
```

Esperado: `cleanupPolicyDryRun: true` y las tres políticas presentes. Las políticas `Keep` tienen precedencia sobre `Delete`.

- [ ] **Step 5: Desactivar la simulación**

```bash
gcloud artifacts repositories set-cleanup-policies curaciones \
  --location=us-west1 --policy=/tmp/artifact-cleanup-policy.json --no-dry-run
```

- [ ] **Step 6: Respaldo lógico de la base**

```bash
DB="$(gcloud secrets versions access latest --secret=DATABASE_URL)&sslrootcert=system"
mkdir -p ~/curaciones-backups
pg_dump "$DB" -Fc -f ~/curaciones-backups/pre-cutover-2026-08-21.dump
ls -lh ~/curaciones-backups/pre-cutover-2026-08-21.dump
```

Esperado: archivo de algunos MB. Verificar que se puede leer:

```bash
pg_restore -l ~/curaciones-backups/pre-cutover-2026-08-21.dump | head -20
```

- [ ] **Step 7: Punto de restauración instantáneo en Neon**

```bash
which neonctl && neonctl branches create --name pre-cutover-2026-08-21
```

Si `neonctl` no está instalado, crear el branch desde la consola de Neon (Branches → New branch, nombre `pre-cutover-2026-08-21`). **Es acción manual del dueño.** No continuar sin este punto o sin el dump del paso 6.

- [ ] **Step 8: Etiquetar en git el código que corre en producción**

Hoy solo existe en este Mac. Sin esto no hay forma de reconstruirlo.

```bash
git tag -a prd-gcp-live-2026-08-21 feat/gcp-migration \
  -m "Code running on GCP before the multi-establishment cutover"
git push origin prd-gcp-live-2026-08-21
git ls-remote --tags origin | grep prd-gcp-live
```

Esperado: el tag aparece en el remoto.

---

## Fase 1 — Flancos bloqueantes

### Task 2: Verificar que las tres suites pasan (F2)

`feat/org-admin-tabs` nunca corrió CI. Este es el gate del PR.

- [ ] **Step 1: Arrancar Docker Desktop**

```bash
open -a Docker
until docker info >/dev/null 2>&1; do sleep 3; done; echo "daemon listo"
```

- [ ] **Step 2: Levantar Postgres 18 igual que en CI**

```bash
docker run -d --name curaciones-pg \
  -e POSTGRES_DB=curaciones_test \
  -e POSTGRES_USER=curaciones \
  -e POSTGRES_PASSWORD=curaciones \
  -p 5432:5432 postgres:18-alpine
until docker exec curaciones-pg pg_isready -U curaciones >/dev/null 2>&1; do sleep 2; done
echo "postgres listo"
```

- [ ] **Step 3: Suite del backend**

```bash
cd backend && npm ci
TEST_DATABASE_URL=postgresql://curaciones:curaciones@localhost:5432/curaciones_test \
  npm test -- --ci
```

Esperado: todas las suites en verde. Si falla, **detenerse**: es el checkpoint de F2. Anotar cada fallo y decidir con el dueño si se corrige o se recorta alcance.

- [ ] **Step 4: Build del backend**

```bash
cd backend && npm run build && ls dist/main.js dist/data-source.js
```

Esperado: los dos archivos existen y `dist/` está **plano** (no `dist/src/`).

- [ ] **Step 5: Suite y build del frontend**

```bash
cd frontend && npm ci && npm test && npm run build
```

- [ ] **Step 6: Suite y build del MCP**

```bash
cd mcp-server && npm ci && npm test && npm run build && ls dist/server.js
```

- [ ] **Step 7: Registrar el resultado**

Anotar en el PR (o en un comentario del plan) qué suites pasaron y con qué conteo de tests. No hay commit en esta tarea.

### Task 3: Verificar que la imagen del backend construye y arranca (F1)

**Files:**
- Read: `backend/Dockerfile` (viene del cherry-pick de la Task 4; si esta tarea se ejecuta antes, usar `git show feat/gcp-migration:backend/Dockerfile`)

- [ ] **Step 1: Verificar que el Dockerfile ya está en el árbol**

Esta tarea corre **después** de la Task 4, que trae el Dockerfile por cherry-pick. Escribirlo a mano dejaría el árbol sucio y abortaría ese cherry-pick.

```bash
git status --porcelain backend/Dockerfile backend/.dockerignore
ls -la backend/Dockerfile backend/.dockerignore
```

Esperado: ambos archivos existen y **sin** cambios pendientes. Si faltan, ejecutar la Task 4 primero.

- [ ] **Step 2: Construir para la plataforma de Cloud Run**

```bash
docker build --platform linux/amd64 -t curaciones-api:probe backend/
```

Esperado: build exitoso. Si falla en `npm run build`, es el checkpoint de F1: el layout de `dist/` no calza y hay que revisar el diseño antes de seguir.

- [ ] **Step 3: Verificar que el binario está donde el CMD lo busca**

```bash
docker run --rm --platform linux/amd64 --entrypoint sh curaciones-api:probe \
  -c 'ls -1 dist/main.js dist/data-source.js && ls dist | head -20'
```

Esperado: ambos archivos presentes.

- [ ] **Step 4: Arranque en seco contra la base de tests**

```bash
docker run --rm --platform linux/amd64 \
  --add-host=host.docker.internal:host-gateway \
  -e NODE_ENV=production -e PORT=8080 \
  -e DATABASE_URL=postgresql://curaciones:curaciones@host.docker.internal:5432/curaciones_test \
  -e JWT_SECRET=probe -e JWT_REFRESH_SECRET=probe \
  -e KMS_BACKEND=memory -e KMS_LOCAL_MASTER_KEY=$(openssl rand -hex 32) \
  -e EMAIL_BACKEND=noop -e OAUTH_ISSUER=http://localhost:8080 \
  -e OAUTH_COOKIE_SECRET=probe \
  -p 8080:8080 curaciones-api:probe &
sleep 25 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/health
```

Esperado: `200`. Detener el contenedor después.

- [ ] **Step 5: Limpiar**

```bash
docker rm -f $(docker ps -q --filter ancestor=curaciones-api:probe) 2>/dev/null; true
```

---

## Fase 2 — Consolidación de código

### Task 4: Rama de release y cherry-pick de la infraestructura GCP

**Files:**
- Create: `backend/Dockerfile`, `backend/.dockerignore`, `firebase.json`, `.firebaserc`, `backend/src/common/db-ssl.util.ts`, `backend/src/common/db-ssl.util.spec.ts`, `docs/runbooks/2026-08-20-gcp-migration.md`
- Modify: `backend/src/data-source.ts`, `frontend/package.json`, `.gitignore`

**Interfaces:**
- Produces: `buildDbSslConfig({ nodeEnv, databaseUrl })` en `backend/src/common/db-ssl.util.ts`, consumido por `data-source.ts`.
- Produces: script `build:hosting` en `frontend/package.json`, que fija `VITE_API_URL=/api`.

- [ ] **Step 1: Crear la rama de release desde el objetivo**

```bash
git checkout feat/cutover-multiestablecimiento
git checkout -b release/cutover-2026-08-21
```

La base es `feat/cutover-multiestablecimiento`, no `feat/org-admin-tabs`: la primera contiene todo lo de la segunda **más** los commits del spec y de este plan.

- [ ] **Step 2: Cherry-pick de los 7 commits de infraestructura, en orden**

```bash
git cherry-pick 9640db7 cb102d9 3dc69f5 40e298e 3a7d589 6cea0c6 41cee0f
```

Si hay conflicto en `frontend/package.json` (el objetivo tiene scripts que producción no), resolver **conservando ambos**: los scripts del objetivo más `build:hosting`.

- [ ] **Step 3: Verificar que el TLS quedó cableado**

```bash
grep -n "buildDbSslConfig" backend/src/data-source.ts
grep -rn "rejectUnauthorized" backend/src/data-source.ts || echo "sin rejectUnauthorized: correcto"
```

Esperado: `buildDbSslConfig` presente y **ningún** `rejectUnauthorized: false`.

- [ ] **Step 4: Verificar el script de Hosting**

```bash
node -e "console.log(require('./frontend/package.json').scripts['build:hosting'])"
```

Esperado: `VITE_API_URL=/api npm run build`.

- [ ] **Step 5: Correr el test del util de TLS**

```bash
cd backend && npx jest src/common/db-ssl.util.spec.ts
```

Esperado: PASS.

- [ ] **Step 6: Commit**

Los cherry-picks ya generaron commits. Si hubo resolución de conflictos:

```bash
git add -A && git cherry-pick --continue
```

### Task 5: Cherry-pick de las features que solo existen en producción

**Files:**
- Create: `frontend/src/pages/HelpPage.tsx`, `frontend/public/manual/*.jpg` (17)
- Modify: `frontend/src/components/Layout.tsx`, `frontend/src/App.tsx`, `backend/src/common/schedule.util.ts`

- [ ] **Step 1: Cherry-pick del manual y del slot 16:30**

```bash
git cherry-pick f7489b8 73070b1
```

`Layout.tsx` va a conflictuar: el objetivo agregó navegación de organización y producción agregó el enlace a `/ayuda`. Resolver conservando **ambas** entradas.

- [ ] **Step 2: Verificar que el manual quedó completo**

```bash
ls frontend/public/manual/*.jpg | wc -l
grep -n "HelpPage" frontend/src/App.tsx
grep -n "ayuda" frontend/src/components/Layout.tsx
```

Esperado: 17 imágenes, ruta registrada, enlace en la navegación.

- [ ] **Step 3: Verificar el slot 16:30**

```bash
cd backend && npx jest src/common/schedule.util.spec.ts
```

Esperado: PASS, incluyendo el caso de las 16:30.

- [ ] **Step 4: Build del frontend con los cambios**

```bash
cd frontend && npm run build
```

Esperado: build exitoso, sin errores de TypeScript por el conflicto de `Layout.tsx`.

- [ ] **Step 5: Commit**

```bash
git add -A && git cherry-pick --continue
```

### Task 6: `acceptUrl` en las invitaciones (backend)

Con `EMAIL_BACKEND=noop` el token de invitación no sale del proceso y la invitación es irrecuperable. Este cambio lo devuelve al owner que la creó.

**Files:**
- Modify: `backend/src/auth/invitations.service.ts`, `backend/src/org/org.service.ts`
- Test: `backend/src/org/org.service.spec.ts`

**Interfaces:**
- Produces: `InvitationsService.acceptUrlFor(token: string): string`
- Produces: `OrgService.invite(...): Promise<{ id: string; acceptUrl?: string }>` — `acceptUrl` presente solo cuando `process.env.EMAIL_BACKEND === 'noop'`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `backend/src/org/org.service.spec.ts`, dentro del `describe('OrgService')`:

```typescript
describe('invite', () => {
  const savedInvitation = { id: 'inv-1' } as Invitation;

  beforeEach(() => {
    userRepo.findOne.mockResolvedValue(null);
    invitationsService.create.mockResolvedValue({
      invitation: savedInvitation,
      token: 'tok-abc',
    });
  });

  it('returns the acceptUrl when the email backend is noop', async () => {
    process.env.EMAIL_BACKEND = 'noop';
    process.env.FRONTEND_URL = 'https://curaciones.web.app';

    const result = await service.invite(
      '1',
      { id: 7, username: 'owner' },
      'nuevo@cesfam.cl',
      OrgRole.CLINICIAN,
    );

    expect(result).toEqual({
      id: 'inv-1',
      acceptUrl: 'https://curaciones.web.app/accept-invitation?token=tok-abc',
    });
  });

  it('omits the acceptUrl when a real email backend is configured', async () => {
    process.env.EMAIL_BACKEND = 'resend';

    const result = await service.invite(
      '1',
      { id: 7, username: 'owner' },
      'nuevo@cesfam.cl',
      OrgRole.CLINICIAN,
    );

    expect(result).toEqual({ id: 'inv-1' });
  });
});
```

Añadir `acceptUrlFor: jest.fn()` al mock de `invitationsService` en el `beforeEach` de arriba del archivo, y hacer que devuelva el URL:

```typescript
invitationsService = {
  create: jest.fn(),
  acceptUrlFor: jest.fn(
    (t: string) => `${process.env.FRONTEND_URL}/accept-invitation?token=${t}`,
  ),
};
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

```bash
cd backend && npx jest src/org/org.service.spec.ts -t invite
```

Esperado: FAIL — `invite` devuelve `{ id }` sin `acceptUrl`.

- [ ] **Step 3: Extraer el armado del URL en `InvitationsService`**

En `backend/src/auth/invitations.service.ts`, agregar el método y usarlo en `create()`:

```typescript
  acceptUrlFor(token: string): string {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return `${baseUrl}/accept-invitation?token=${token}`;
  }
```

Y en `create()`, reemplazar el literal por la llamada:

```typescript
        acceptUrl: this.acceptUrlFor(token),
```

- [ ] **Step 4: Devolver el `acceptUrl` desde `OrgService.invite`**

En `backend/src/org/org.service.ts`, cambiar el tipo de retorno y el final del método:

```typescript
  async invite(
    organizationId: string,
    inviter: { id: number; username: string },
    email: string,
    role: OrgRole,
  ): Promise<{ id: string; acceptUrl?: string }> {
```

```typescript
    const { invitation, token } = await this.invitations.create(
      organizationId,
      inviter.id,
      inviter.username,
      email,
      role,
    );
    // With EMAIL_BACKEND=noop nothing is delivered, so the token would be lost
    // and the invitation unusable. Hand it back to the owner who created it.
    if (process.env.EMAIL_BACKEND === 'noop') {
      return { id: invitation.id, acceptUrl: this.invitations.acceptUrlFor(token) };
    }
    return { id: invitation.id };
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

```bash
cd backend && npx jest src/org/org.service.spec.ts
```

Esperado: PASS, incluidos los tests previos del archivo.

- [ ] **Step 6: Commit**

```bash
git add backend/src/auth/invitations.service.ts backend/src/org/org.service.ts \
  backend/src/org/org.service.spec.ts
git commit -m "feat(org): return the invitation acceptUrl when email delivery is noop"
```

### Task 7: Mostrar el `acceptUrl` en la UI

**Files:**
- Modify: `frontend/src/pages/org/MembersPage.tsx:150-162`, `frontend/src/services/api.ts:577`

**Interfaces:**
- Consumes: `OrgService.invite` devolviendo `{ id, acceptUrl? }` (Task 6).

- [ ] **Step 1: Tipar la respuesta en el cliente de API**

En `frontend/src/services/api.ts`, reemplazar la función de invitación:

```typescript
export const inviteMember = async (
  email: string,
  role: string,
): Promise<{ id: string; acceptUrl?: string }> =>
  (await api.post('/org/invitations', { email, role })).data;
```

- [ ] **Step 2: Mostrar el enlace cuando venga**

En `frontend/src/pages/org/MembersPage.tsx`, agregar estado para el enlace junto a los otros `useState` del componente:

```typescript
  const [inviteLink, setInviteLink] = useState<string | null>(null);
```

Y reemplazar el `onClick` del botón de enviar invitación:

```typescript
            onClick={async () => {
              try {
                const res = await inviteMember(email, role);
                if (res.acceptUrl) {
                  setInviteLink(res.acceptUrl);
                  showSuccess('Invitación creada. Copia el enlace y envíaselo.');
                } else {
                  showSuccess('Invitación enviada');
                  setOpen(false);
                }
                setEmail('');
              } catch (e) {
                const err = e as { response?: { data?: { message?: string } } };
                showError(err?.response?.data?.message ?? 'Error');
              }
            }}
```

- [ ] **Step 3: Renderizar el enlace con primitivas**

Dentro del `Modal`, después del botón. Se usa `Input` en modo lectura porque el enlace es largo y `CodePill` está pensado para valores cortos (es un `span` con `text-xs`). `Input` extiende `InputHTMLAttributes` y hace spread de `...rest`, así que `readOnly` y `value` pasan tal cual. La regla ESLint `ui/use-primitives` prohíbe `<input>` crudo aquí:

```tsx
          {inviteLink && (
            <div>
              <Input
                label="Enlace de invitación"
                value={inviteLink}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(inviteLink);
                  showSuccess('Enlace copiado');
                }}
              >
                Copiar enlace
              </Button>
            </div>
          )}
```

`Input` y `Button` ya están importados desde `../../components/ui` en este archivo. Al cerrar el modal, limpiar el estado: en el `onClose` del `Modal`, añadir `setInviteLink(null)`.

- [ ] **Step 4: Verificar tipos y lint**

```bash
cd frontend && npx tsc -b && npx eslint src/pages/org/MembersPage.tsx
```

Esperado: sin errores.

- [ ] **Step 5: Suite del frontend**

```bash
cd frontend && npm test
```

Esperado: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/org/MembersPage.tsx frontend/src/services/api.ts
git commit -m "feat(org): surface the invitation link when email delivery is off"
```

### Task 8: Endpoint de limpieza OAuth invocable por Cloud Scheduler

El `@Cron(EVERY_DAY_AT_3AM)` nunca dispara con scale-to-zero. Se valida el token OIDC que Cloud Scheduler firma, así no hace falta un séptimo secreto.

**Files:**
- Create: `backend/src/oauth/controllers/oauth-cleanup.controller.ts`, `backend/src/oauth/controllers/oauth-cleanup.controller.spec.ts`, `backend/src/oauth/services/google-oidc.verifier.ts`
- Modify: `backend/src/oauth/services/oauth-cleanup.service.ts` (quitar `@Cron`), `backend/src/oauth/oauth.module.ts`, `backend/src/app.module.ts` (quitar `ScheduleModule`)

**Interfaces:**
- Produces: `GoogleOidcVerifier.verify(token: string, audience: string): Promise<{ email?: string }>`
- Produces: `POST /api/internal/oauth-cleanup`, público a nivel de ruta pero exigiendo un token OIDC de Google cuyo `email` coincida con `CLEANUP_SERVICE_ACCOUNT` y cuya `aud` sea `CLEANUP_OIDC_AUDIENCE`.

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/src/oauth/controllers/oauth-cleanup.controller.spec.ts`:

```typescript
import { UnauthorizedException } from '@nestjs/common';
import { OAuthCleanupController } from './oauth-cleanup.controller';

describe('OAuthCleanupController', () => {
  let cleanup: { runDailyCleanup: jest.Mock };
  let verifier: { verify: jest.Mock };
  let controller: OAuthCleanupController;

  beforeEach(() => {
    cleanup = { runDailyCleanup: jest.fn().mockResolvedValue(undefined) };
    verifier = { verify: jest.fn() };
    controller = new OAuthCleanupController(cleanup as never, verifier as never);
    process.env.CLEANUP_OIDC_AUDIENCE = 'https://api.example/api/internal/oauth-cleanup';
    process.env.CLEANUP_SERVICE_ACCOUNT = 'scheduler@proj.iam.gserviceaccount.com';
  });

  it('rejects a request with no bearer token', async () => {
    await expect(controller.run(undefined)).rejects.toThrow(UnauthorizedException);
    expect(cleanup.runDailyCleanup).not.toHaveBeenCalled();
  });

  it('rejects a token from an unexpected service account', async () => {
    verifier.verify.mockResolvedValue({ email: 'someone-else@proj.iam.gserviceaccount.com' });
    await expect(controller.run('Bearer tok')).rejects.toThrow(UnauthorizedException);
    expect(cleanup.runDailyCleanup).not.toHaveBeenCalled();
  });

  it('runs the cleanup for a valid token', async () => {
    verifier.verify.mockResolvedValue({ email: 'scheduler@proj.iam.gserviceaccount.com' });
    await expect(controller.run('Bearer tok')).resolves.toEqual({ status: 'ok' });
    expect(verifier.verify).toHaveBeenCalledWith(
      'tok',
      'https://api.example/api/internal/oauth-cleanup',
    );
    expect(cleanup.runDailyCleanup).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
cd backend && npx jest src/oauth/controllers/oauth-cleanup.controller.spec.ts
```

Esperado: FAIL — el módulo no existe.

- [ ] **Step 3: Implementar el verificador**

Crear `backend/src/oauth/services/google-oidc.verifier.ts`. `jose ^6.2.3` ya es dependencia del backend, así que no se agrega nada:

```typescript
import { Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);

@Injectable()
export class GoogleOidcVerifier {
  async verify(token: string, audience: string): Promise<{ email?: string }> {
    const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
      issuer: 'https://accounts.google.com',
      audience,
    });
    return { email: typeof payload.email === 'string' ? payload.email : undefined };
  }
}
```

- [ ] **Step 4: Implementar el controller**

Crear `backend/src/oauth/controllers/oauth-cleanup.controller.ts`:

```typescript
import {
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../auth/public.decorator';
import { OAuthCleanupService } from '../services/oauth-cleanup.service';
import { GoogleOidcVerifier } from '../services/google-oidc.verifier';

// Invoked by Cloud Scheduler, which signs an OIDC identity token whose
// audience is this endpoint's URL. Validating that token is what authorises
// the call — no shared secret, so no extra Secret Manager slot.
@Controller('api/internal/oauth-cleanup')
export class OAuthCleanupController {
  constructor(
    private readonly cleanup: OAuthCleanupService,
    private readonly verifier: GoogleOidcVerifier,
  ) {}

  @Public()
  @SkipThrottle()
  @Post()
  async run(@Headers('authorization') authorization?: string): Promise<{ status: string }> {
    const match = /^Bearer (.+)$/.exec(authorization ?? '');
    if (!match) throw new UnauthorizedException();

    const audience = process.env.CLEANUP_OIDC_AUDIENCE;
    const expectedAccount = process.env.CLEANUP_SERVICE_ACCOUNT;
    if (!audience || !expectedAccount) throw new UnauthorizedException();

    let email: string | undefined;
    try {
      ({ email } = await this.verifier.verify(match[1], audience));
    } catch {
      throw new UnauthorizedException();
    }
    if (email !== expectedAccount) throw new UnauthorizedException();

    await this.cleanup.runDailyCleanup();
    return { status: 'ok' };
  }
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

```bash
cd backend && npx jest src/oauth/controllers/oauth-cleanup.controller.spec.ts
```

Esperado: PASS, 3 tests.

- [ ] **Step 6: Quitar el cron y registrar las piezas nuevas**

En `backend/src/oauth/services/oauth-cleanup.service.ts`, borrar el decorador `@Cron(CronExpression.EVERY_DAY_AT_3AM)` y el import `{ Cron, CronExpression } from '@nestjs/schedule'`. El método `runDailyCleanup()` queda intacto.

En `backend/src/oauth/oauth.module.ts`, agregar `OAuthCleanupController` al array `controllers` y `GoogleOidcVerifier` al array `providers`, con sus imports.

En `backend/src/app.module.ts`, quitar `ScheduleModule.forRoot()` del array `imports` y su import: ya no queda ningún `@Cron`.

- [ ] **Step 7: Verificar que no quedó ningún cron huérfano**

```bash
cd backend && grep -rn "@Cron\|@Interval\|@Timeout" src || echo "sin crons: correcto"
grep -rn "ScheduleModule" src || echo "sin ScheduleModule: correcto"
```

- [ ] **Step 8: Suite completa del backend**

```bash
cd backend && TEST_DATABASE_URL=postgresql://curaciones:curaciones@localhost:5432/curaciones_test \
  npm test -- --ci
```

Esperado: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/oauth backend/src/app.module.ts
git commit -m "feat(oauth): expose the daily cleanup as a Scheduler-invoked endpoint"
```

### Task 9: Rewrites de Hosting para el Authorization Server

Sin esto, `/oauth/**` y `/.well-known/**` caen en el fallback del SPA y el AS no funciona.

**Files:**
- Modify: `firebase.json`
- Create: `firebase.next.json`

- [ ] **Step 1: Agregar los rewrites del AS en `firebase.json`**

En el array `rewrites`, **antes** del `"source": "**"`, agregar:

```json
      {
        "source": "/oauth/**",
        "run": { "serviceId": "curaciones-api", "region": "us-west1" }
      },
      {
        "source": "/.well-known/**",
        "run": { "serviceId": "curaciones-api", "region": "us-west1" }
      },
```

El orden importa: Firebase evalúa los rewrites de arriba hacia abajo y el comodín `**` captura todo lo que quede.

- [ ] **Step 2: Crear la configuración del canal preview**

```bash
sed 's/"serviceId": "curaciones-api"/"serviceId": "curaciones-api-next"/g' \
  firebase.json > firebase.next.json
grep -c "curaciones-api-next" firebase.next.json
```

Esperado: 3 ocurrencias (`/api/**`, `/oauth/**`, `/.well-known/**`).

- [ ] **Step 3: Validar que ambos JSON son correctos**

```bash
node -e "['firebase.json','firebase.next.json'].forEach(f=>{const j=require('./'+f);console.log(f, j.hosting.rewrites.map(r=>r.source).join(' '))})"
```

Esperado: `/api/** /oauth/** /.well-known/** **` en los dos archivos.

- [ ] **Step 4: Commit**

```bash
git add firebase.json firebase.next.json
git commit -m "feat(deploy): route the OAuth and discovery paths to Cloud Run"
```

### Task 10: Repuntar el respaldo automático a Neon

`scripts/.env.backup` apunta a la base de Render, que ya no existe, y el job de launchd no está instalado. Se arregla ahora para que después del cutover haya respaldos.

**Files:**
- Modify: `scripts/.env.backup` (no versionado; contiene credenciales)
- Read: `scripts/backup-db.sh`, `scripts/com.curaciones.backup.plist`

- [ ] **Step 1: Confirmar que el destino actual está muerto**

```bash
grep -oE "@[a-zA-Z0-9.-]+" scripts/.env.backup
```

Esperado: el host `...oregon-postgres.render.com`.

- [ ] **Step 2: Reemplazar la cadena de conexión por la de Neon**

```bash
DB="$(gcloud secrets versions access latest --secret=DATABASE_URL)"
python3 - "$DB" <<'PY'
import sys, re, pathlib
p = pathlib.Path('scripts/.env.backup')
s = p.read_text()
s = re.sub(r'^DATABASE_URL=.*$', 'DATABASE_URL=' + sys.argv[1], s, flags=re.M)
p.write_text(s)
print('DATABASE_URL actualizado')
PY
grep -oE "@[a-zA-Z0-9.-]+" scripts/.env.backup
```

Esperado: el host `...neon.tech`.

- [ ] **Step 3: Probar el script de respaldo**

```bash
bash scripts/backup-db.sh && ls -lht ~/curaciones-backups | head -3
```

Esperado: un archivo nuevo con fecha de hoy.

- [ ] **Step 4: Instalar el job de launchd**

```bash
cp scripts/com.curaciones.backup.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.curaciones.backup.plist
launchctl list | grep curaciones
```

Esperado: el job aparece listado.

- [ ] **Step 5: Sin commit**

`scripts/.env.backup` está en `.gitignore` por contener credenciales. Verificar:

```bash
git check-ignore -v scripts/.env.backup
git status --porcelain scripts/
```

Esperado: ignorado y sin cambios pendientes.

---

## Fase 3 — PR y CI

### Task 11: PR a `main` con CI verde

- [ ] **Step 1: Verificar que la rama está al día con `origin/main`**

`main` está protegida y la regla de CI es estricta: la rama debe estar al día antes del merge. No se mergea a `main` local — eso violaría la restricción global de no commitear directo.

```bash
git fetch origin
git rev-list --left-right --count origin/main...release/cutover-2026-08-21
```

Esperado: el número de la izquierda en `0`. Si no, rebasar sobre `origin/main` y volver a correr las suites.

- [ ] **Step 2: Push de la rama de release y apertura del PR**

```bash
git checkout release/cutover-2026-08-21
git push -u origin release/cutover-2026-08-21
gh pr create --base main --head release/cutover-2026-08-21 \
  --title "feat: multi-establishment cutover with Authorization Server and MCP" \
  --body "Implements docs/superpowers/specs/2026-08-21-cutover-multiestablecimiento-design.md"
```

- [ ] **Step 3: Esperar los checks requeridos**

```bash
gh pr checks --watch
```

Esperado: `backend (build + test)` y `frontend (build + test)` en verde. La rama debe estar al día con `main` (regla estricta).

- [ ] **Step 4: Merge**

```bash
gh pr merge --squash --delete-branch=false
git checkout main && git pull
```

- [ ] **Step 5: Confirmar el sha que se va a desplegar**

```bash
git rev-parse --short HEAD | tee /tmp/cutover-sha
```

Guardar ese valor: es el tag de las imágenes.

---

## Fase 4 — Despliegue paralelo

### Task 12: Correr las migraciones OAuth contra Neon

> **`sslrootcert=system` sólo vale para clientes libpq.** Los comandos de esta tarea que pasan por el `pg` de Node (`migration:show`, `migration:run`, `audit:verify`) usan el secreto **verbatim**: `pg-connection-string` hace `readFileSync` del valor sin tratar `system` como caso especial, así que añadirlo lanza `ENOENT: open 'system'`. Con `?sslmode=verify-full` a secas, `pg` produce `ssl = {}` y Node aplica verificación de certificado por defecto — que es exactamente lo que se quiere. Los comandos `psql` y `pg_dump` de este plan sí lo llevan, porque libpq lo soporta desde Postgres 16.

Aditivas: crean tablas, tipos e índices `oauth_*` nuevos. El código live las ignora.

- [ ] **Step 1: Medir el estado de la cadena de auditoría antes (F6)**

```bash
cd backend && DATABASE_URL="$(gcloud secrets versions access latest --secret=DATABASE_URL)" \
  npm run audit:verify 2>&1 | tail -20
```

Guardar la salida. Cualquier desajuste que aparezca aquí es **preexistente**, no del cutover.

- [ ] **Step 2: Ver qué migraciones faltan**

```bash
cd backend && DATABASE_URL="$(gcloud secrets versions access latest --secret=DATABASE_URL)" \
  npm run migration:show
```

Esperado: 4 con `[X]` y 6 con `[ ]`.

- [ ] **Step 3: Correrlas**

```bash
cd backend && DATABASE_URL="$(gcloud secrets versions access latest --secret=DATABASE_URL)" \
  npm run migration:run
```

- [ ] **Step 4: Verificar el resultado**

```bash
DB="$(gcloud secrets versions access latest --secret=DATABASE_URL)&sslrootcert=system"
psql "$DB" -Atc "select name from migrations order by timestamp;"
psql "$DB" -Atc "select count(*) from oauth_client;"
psql "$DB" -Atc "select 'patients='||(select count(*) from patients)||' curaciones='||(select count(*) from curaciones);"
```

Esperado: 10 migraciones, `oauth_client` en 0, y **51 pacientes / 809 curaciones intactos**.

- [ ] **Step 5: Confirmar que lo live sigue en pie**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://curaciones.web.app/api/health
```

Esperado: `200`. El código viejo funciona sobre el esquema nuevo.

### Task 13: Secreto del AS y API de Cloud Scheduler

- [ ] **Step 1: Crear `OAUTH_COOKIE_SECRET` (secreto 6 de 6)**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" \
  | gcloud secrets create OAUTH_COOKIE_SECRET --data-file=-
gcloud secrets list --format='value(name)' | wc -l
```

Esperado: 6. **No crear más.**

- [ ] **Step 2: Dar acceso a la cuenta de servicio**

```bash
gcloud secrets add-iam-policy-binding OAUTH_COOKIE_SECRET \
  --member=serviceAccount:curaciones-api@gws-marcelo-2026.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

- [ ] **Step 3: Habilitar Cloud Scheduler**

```bash
gcloud services enable cloudscheduler.googleapis.com
gcloud scheduler jobs list --location=us-west1
```

Esperado: la lista responde vacía en vez de dar error de API deshabilitada.

### Task 14: Construir y publicar las dos imágenes

- [ ] **Step 1: Autorizar docker contra Artifact Registry**

```bash
gcloud auth configure-docker us-west1-docker.pkg.dev --quiet
```

- [ ] **Step 2: Construir la imagen del backend para amd64**

```bash
SHA=$(cat /tmp/cutover-sha)
docker build --platform linux/amd64 \
  -t us-west1-docker.pkg.dev/gws-marcelo-2026/curaciones/api:$SHA backend/
```

- [ ] **Step 3: Construir la imagen del MCP para amd64**

```bash
SHA=$(cat /tmp/cutover-sha)
docker build --platform linux/amd64 \
  -t us-west1-docker.pkg.dev/gws-marcelo-2026/curaciones/mcp:$SHA mcp-server/
```

- [ ] **Step 4: Publicar ambas**

```bash
SHA=$(cat /tmp/cutover-sha)
docker push us-west1-docker.pkg.dev/gws-marcelo-2026/curaciones/api:$SHA
docker push us-west1-docker.pkg.dev/gws-marcelo-2026/curaciones/mcp:$SHA
```

- [ ] **Step 5: Confirmar que la imagen de rollback sobrevivió**

```bash
gcloud artifacts docker tags list \
  us-west1-docker.pkg.dev/gws-marcelo-2026/curaciones/api \
  --format='table(tag,version)'
```

Esperado: los tags `prd-rollback`, `3dc69f5` y el nuevo `$SHA` presentes. Si `prd-rollback` desapareció, **detenerse**: la Task 1 no quedó aplicada y no hay rollback.

### Task 15: Desplegar `curaciones-api-next` y crear el canal preview

Hay una dependencia circular: el canal preview necesita que exista `curaciones-api-next` para poder enrutar hacia él, y el servicio necesita el URL del canal como `OAUTH_ISSUER`. Se resuelve en tres tiempos: servicio con issuer provisional → canal → servicio con issuer definitivo.

- [ ] **Step 1: Desplegar el servicio con su propio URL como issuer provisional**

`OAUTH_ISSUER` va en el **primer** `--set-env-vars`, no solo en el `update` que viene después. `assertOauthEnv()` corre en `main.ts` antes de `NestFactory.create` y lanza si `OAUTH_ISSUER` falta con `NODE_ENV=production`: sin él el contenedor muere al arrancar, la revisión nunca queda healthy, `gcloud run deploy` termina en error y el `update` de la línea siguiente no se alcanza. El valor de arranque es un placeholder bajo `.invalid` (RFC 2606, nunca resuelve) porque el URL real del servicio no existe hasta que el servicio existe; se reemplaza dos comandos más abajo, antes de que llegue tráfico, y otra vez en el Step 4 de esta misma tarea por el URL del canal preview.

```bash
SHA=$(cat /tmp/cutover-sha)
gcloud run deploy curaciones-api-next --region us-west1 \
  --image us-west1-docker.pkg.dev/gws-marcelo-2026/curaciones/api:$SHA \
  --service-account curaciones-api@gws-marcelo-2026.iam.gserviceaccount.com \
  --set-env-vars "NODE_ENV=production,EMAIL_BACKEND=noop,KMS_BACKEND=memory,OWNER_EMAIL=me@marcelovega.com,NODE_OPTIONS=--max-old-space-size=400,OAUTH_ISSUER=https://issuer-placeholder.invalid" \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest,JWT_REFRESH_SECRET=JWT_REFRESH_SECRET:latest,KMS_LOCAL_MASTER_KEY=KMS_LOCAL_MASTER_KEY:latest,HEALTH_TOKEN=HEALTH_TOKEN:latest,OAUTH_COOKIE_SECRET=OAUTH_COOKIE_SECRET:latest" \
  --add-volume "name=uploads,type=cloud-storage,bucket=curaciones-uploads" \
  --add-volume-mount "volume=uploads,mount-path=/app/uploads" \
  --max-instances 2 --allow-unauthenticated --cpu-boost
NEXT_URL=$(gcloud run services describe curaciones-api-next --region us-west1 --format='value(status.url)')
gcloud run services update curaciones-api-next --region us-west1 \
  --update-env-vars "FRONTEND_URL=$NEXT_URL,OAUTH_ISSUER=$NEXT_URL,OAUTH_AUDIENCE=$NEXT_URL"
```

- [ ] **Step 2: Verificar que arrancó y generó la clave de firma**

```bash
NEXT_URL=$(gcloud run services describe curaciones-api-next --region us-west1 --format='value(status.url)')
curl -s -o /dev/null -w "%{http_code}\n" "$NEXT_URL/api/health"
DB="$(gcloud secrets versions access latest --secret=DATABASE_URL)&sslrootcert=system"
psql "$DB" -Atc "select count(*) from oauth_signing_key;"
```

Esperado: `200` y **1** clave de firma — `OAuthBootstrapService` la creó al arrancar.

- [ ] **Step 3: Desplegar el canal preview, que ya puede enrutar al servicio**

El hook `predeploy` construye el frontend con `VITE_API_URL=/api`.

```bash
firebase hosting:channel:deploy cutover-2026-08-21 --project gws-marcelo-2026 \
  --config firebase.next.json --expires 7d 2>&1 | tee /tmp/preview-deploy.txt
grep -oE "https://curaciones--[a-z0-9-]+\.web\.app" /tmp/preview-deploy.txt | head -1 \
  | tee /tmp/preview-url
```

Esperado: un URL en `/tmp/preview-url`. Si el comando falla por restricción de plan (F5), degradar la estrategia: desplegar la revisión sobre `curaciones-api` con `--no-traffic --tag next`, validar por el URL del tag, y anotar el cambio antes de seguir.

- [ ] **Step 4: Fijar el issuer definitivo del canal**

El issuer debe coincidir con el origen público exacto por el que entran los clientes:

```bash
PREVIEW=$(cat /tmp/preview-url)
gcloud run services update curaciones-api-next --region us-west1 \
  --update-env-vars "FRONTEND_URL=$PREVIEW,OAUTH_ISSUER=$PREVIEW,OAUTH_AUDIENCE=$PREVIEW,CLEANUP_OIDC_AUDIENCE=$PREVIEW/api/internal/oauth-cleanup,CLEANUP_SERVICE_ACCOUNT=curaciones-api@gws-marcelo-2026.iam.gserviceaccount.com"
```

- [ ] **Step 5: Verificar el discovery a través del canal**

```bash
PREVIEW=$(cat /tmp/preview-url)
curl -s "$PREVIEW/.well-known/openid-configuration" | python3 -m json.tool | head -15
```

Esperado: JSON cuyo `issuer` es el URL del canal preview, **no** el de `run.app`. Si devuelve el HTML del SPA, los rewrites de la Task 9 no llegaron a `firebase.next.json`.

### Task 16: Desplegar `curaciones-mcp-next`

- [ ] **Step 1: Tomar el `jwks_uri` del discovery, no adivinarlo**

El documento de discovery es la única fuente de verdad de esa ruta:

```bash
PREVIEW=$(cat /tmp/preview-url)
JWKS=$(curl -s "$PREVIEW/.well-known/openid-configuration" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['jwks_uri'])")
echo "$JWKS" | tee /tmp/preview-jwks
```

Esperado: un URL bajo el origen del canal preview. Si sale vacío, el rewrite de `/.well-known/**` no está funcionando y hay que volver a la Task 9.

- [ ] **Step 2: Desplegar el servicio con un `MCP_RESOURCE_URL` provisional**

`MCP_RESOURCE_URL` es obligatorio: el schema zod de `mcp-server/src/config.ts` lo exige y `loadConfig()` lanza `Invalid env: MCP_RESOURCE_URL: Required` antes de abrir el puerto. No se puede omitir y agregarlo después.

Y su valor es el **origen propio** de este servicio — es el identificador RFC 9728 que aparece en `/.well-known/oauth-protected-resource` y en el challenge `WWW-Authenticate` (`src/server.ts`) —, que no se conoce hasta que el servicio existe. Mismo huevo-y-gallina que la Task 15, y se resuelve igual: arrancar con un placeholder bajo `.invalid` (RFC 2606, nunca resuelve), leer el URL asignado y fijarlo. El schema exige `https` con host no-loopback, sin path, query ni fragmento, así que el placeholder debe ser un origen `https` desnudo.

```bash
SHA=$(cat /tmp/cutover-sha); PREVIEW=$(cat /tmp/preview-url); JWKS=$(cat /tmp/preview-jwks)
gcloud run deploy curaciones-mcp-next --region us-west1 \
  --image us-west1-docker.pkg.dev/gws-marcelo-2026/curaciones/mcp:$SHA \
  --service-account curaciones-api@gws-marcelo-2026.iam.gserviceaccount.com \
  --set-env-vars "NODE_ENV=production,LOG_LEVEL=info,BACKEND_URL=$PREVIEW/api,OAUTH_ISSUER=$PREVIEW,OAUTH_JWKS_URL=$JWKS,OAUTH_AUDIENCE=$PREVIEW,MCP_RESOURCE_URL=https://mcp-resource-placeholder.invalid" \
  --max-instances 2 --allow-unauthenticated
```

`BACKEND_URL` apunta al canal preview, no al URL de `run.app`: así el MCP atraviesa el mismo rewrite que el navegador y se valida la ruta real.

- [ ] **Step 3: Fijar `MCP_RESOURCE_URL` al URL real del servicio**

```bash
MCP_URL=$(gcloud run services describe curaciones-mcp-next --region us-west1 \
  --format='value(status.url)' | tee /tmp/mcp-next-url)
gcloud run services update curaciones-mcp-next --region us-west1 \
  --update-env-vars "MCP_RESOURCE_URL=$MCP_URL"
```

Esperado: un URL `https://curaciones-mcp-next-…run.app` en `/tmp/mcp-next-url`. El `update` crea una revisión nueva; hasta que quede healthy el servicio sigue anunciando el placeholder, así que el Step 4 es el que confirma que el valor llegó.

- [ ] **Step 4: Verificar el health y que el recurso anunciado es el propio**

```bash
MCP_URL=$(cat /tmp/mcp-next-url)
curl -s "$MCP_URL/health"; echo
curl -s "$MCP_URL/.well-known/oauth-protected-resource" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['resource'])"
```

Esperado: respuesta JSON de salud, y `resource` **exactamente igual** a `$MCP_URL`. Si sigue diciendo `mcp-resource-placeholder.invalid`, la revisión del Step 3 no tomó tráfico. Si el proceso muere al arrancar, es la validación zod de `mcp-server/src/config.ts`: revisar en los logs qué variable falta.

### Task 17: Verificar el canal preview completo

El frontend ya se desplegó en la Task 15 paso 3. Esta tarea confirma que las tres rutas conviven antes de invertir tiempo en la validación manual.

- [ ] **Step 1: Verificar que el canal sirve y enruta las tres rutas**

```bash
PREVIEW=$(cat /tmp/preview-url)
curl -s -o /dev/null -w "app=%{http_code}\n" "$PREVIEW"
curl -s -o /dev/null -w "api=%{http_code}\n" "$PREVIEW/api/health"
curl -s -o /dev/null -w "oidc=%{http_code}\n" "$PREVIEW/.well-known/openid-configuration"
curl -s -o /dev/null -w "rfc8414=%{http_code}\n" "$PREVIEW/.well-known/oauth-authorization-server"
curl -s -o /dev/null -w "manual=%{http_code}\n" "$PREVIEW/manual/01-login.jpg"
echo "--- jwks debe devolver JSON, no el HTML del SPA:"
curl -s "$PREVIEW/jwks.json" | head -c 120; echo
```

Esperado: todos en `200`, y `jwks.json` devolviendo JSON con `keys`. Si empieza con `<!doctype html`, falta el rewrite de `/jwks.json` y el MCP no podrá verificar ningún token — con un 200 de por medio, así que el código de estado no lo delata.

- [ ] **Step 2: Confirmar que el bundle apunta a `/api` relativo**

```bash
PREVIEW=$(cat /tmp/preview-url)
ASSET=$(curl -s "$PREVIEW" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)
curl -s "$PREVIEW$ASSET" | grep -c "run\.app" || echo "0 = correcto: sin URLs absolutas"
```

Esperado: `0`. Cualquier host `run.app` incrustado significa que el build no usó `build:hosting`, y el frontend rompería al promover.

---

## Fase 5 — Validación

### Task 18: Validación end-to-end en el canal preview

**Checkpoint de aborto sin costo: nada de lo live se ha tocado todavía.** Si algo de esta tarea falla, no se promueve y el impacto en usuarios es cero.

- [ ] **Step 1: Login y datos clínicos**

En el navegador, sobre el URL del canal preview: entrar con las credenciales actuales; abrir la lista de pacientes y confirmar 51; abrir un paciente y verificar que las observaciones se leen como texto y **no** como objeto JSON cifrado; abrir la agenda; abrir el inventario.

- [ ] **Step 2: Administración de organizaciones**

Recorrer las 4 pestañas de `OrgTabs`. Crear una invitación y confirmar que aparece el enlace copiable (Task 7). Abrir ese enlace en una ventana privada y verificar que la pantalla de aceptación carga.

- [ ] **Step 3: Features portadas**

Abrir `/ayuda` y confirmar que las 17 imágenes del manual cargan. En la agenda, confirmar que existe el bloque de las 16:30.

- [ ] **Step 4: PDF de ficha clínica**

Descargar el PDF de un paciente y abrirlo. Verificar que los datos personales aparecen descifrados.

- [ ] **Step 5: Aislamiento entre organizaciones (F4)**

```bash
cd backend && TEST_DATABASE_URL=postgresql://curaciones:curaciones@localhost:5432/curaciones_test \
  npx jest test/org-isolation --ci
```

Esperado: PASS.

- [ ] **Step 6: Flujo OAuth completo**

```bash
PREVIEW=$(cat /tmp/preview-url)
curl -s -X POST "$PREVIEW/oauth/register" -H 'content-type: application/json' \
  -d '{"client_name":"cutover-probe","redirect_uris":["http://127.0.0.1:8765/callback"],"application_type":"native","token_endpoint_auth_method":"none"}' \
  | python3 -m json.tool
```

Esperado: JSON con `client_id`. Con ese cliente, completar en el navegador `authorize` → consentimiento → canje de código por token, y confirmar que el `access_token` recibido lleva `iss` igual al URL del canal preview.

- [ ] **Step 7: Conexión del MCP (F13, nunca ejecutado antes)**

Conectar un cliente MCP al endpoint `POST $MCP_URL/mcp` con el `access_token` del paso anterior. Verificar: se listan las 20 tools; `whoami` devuelve los claims correctos; `search_patients` devuelve resultados reales.

- [ ] **Step 8: Aplicaciones conectadas**

En el navegador, abrir `/account/connected-apps` del canal preview. Esperado: aparece el cliente `cutover-probe` con el consentimiento otorgado en el paso 6. Esto valida que `ConnectedAppsController` quedó montado y sirve la ruta que el frontend conserva.

- [ ] **Step 9: Trazabilidad de las llamadas MCP**

```bash
DB="$(gcloud secrets versions access latest --secret=DATABASE_URL)&sslrootcert=system"
psql "$DB" -Atc "select action, entity, \"createdAt\" from audit_logs order by id desc limit 10;"
```

Esperado: entradas correspondientes a las llamadas del paso anterior.

- [ ] **Step 10: Conexiones a la base bajo dos servicios (F8)**

```bash
DB="$(gcloud secrets versions access latest --secret=DATABASE_URL)&sslrootcert=system"
psql "$DB" -Atc "select count(*) from pg_stat_activity where datname = current_database();"
```

Esperado: bien por debajo del límite de Neon. Anotar el número.

- [ ] **Step 11: Endpoint de limpieza rechaza lo que debe**

```bash
PREVIEW=$(cat /tmp/preview-url)
curl -s -o /dev/null -w "sin token=%{http_code}\n" -X POST "$PREVIEW/api/internal/oauth-cleanup"
curl -s -o /dev/null -w "token basura=%{http_code}\n" -X POST "$PREVIEW/api/internal/oauth-cleanup" \
  -H 'authorization: Bearer no-es-un-token'
```

Esperado: `401` en ambos.

- [ ] **Step 12: Decisión de promoción**

Registrar el resultado de cada paso. **Promover solo si los 11 anteriores pasaron.** Si alguno falló, detenerse aquí y reportar: lo live sigue intacto.

---

## Fase 6 — Promoción

### Task 19: Promover el backend a `curaciones-api`

Desde aquí los usuarios sí se ven afectados. El rollback es la revisión `curaciones-api-00001-zjj`.

- [ ] **Step 1: Anotar la revisión de rollback**

```bash
gcloud run revisions list --service curaciones-api --region us-west1 \
  --format='value(metadata.name)' | tee /tmp/rollback-revision
```

Esperado: contiene `curaciones-api-00001-zjj`.

- [ ] **Step 2: Desplegar la revisión nueva con los env definitivos**

```bash
SHA=$(cat /tmp/cutover-sha)
LIVE=https://curaciones.web.app
gcloud run deploy curaciones-api --region us-west1 \
  --image us-west1-docker.pkg.dev/gws-marcelo-2026/curaciones/api:$SHA \
  --service-account curaciones-api@gws-marcelo-2026.iam.gserviceaccount.com \
  --set-env-vars "NODE_ENV=production,EMAIL_BACKEND=noop,KMS_BACKEND=memory,OWNER_EMAIL=me@marcelovega.com,NODE_OPTIONS=--max-old-space-size=400,FRONTEND_URL=$LIVE,OAUTH_ISSUER=$LIVE,OAUTH_AUDIENCE=$LIVE,CLEANUP_OIDC_AUDIENCE=$LIVE/api/internal/oauth-cleanup,CLEANUP_SERVICE_ACCOUNT=curaciones-api@gws-marcelo-2026.iam.gserviceaccount.com" \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest,JWT_REFRESH_SECRET=JWT_REFRESH_SECRET:latest,KMS_LOCAL_MASTER_KEY=KMS_LOCAL_MASTER_KEY:latest,HEALTH_TOKEN=HEALTH_TOKEN:latest,OAUTH_COOKIE_SECRET=OAUTH_COOKIE_SECRET:latest" \
  --add-volume "name=uploads,type=cloud-storage,bucket=curaciones-uploads" \
  --add-volume-mount "volume=uploads,mount-path=/app/uploads" \
  --max-instances 2 --allow-unauthenticated --cpu-boost
```

- [ ] **Step 3: Verificar que el frontend viejo sigue funcionando con el backend nuevo**

La paginación por cursor es opt-in, así que el SPA actual no envía `?cursor=` y recibe el contrato viejo:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://curaciones.web.app/api/health
curl -s https://curaciones.web.app/.well-known/openid-configuration \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['issuer'])"
```

Esperado: `200`, e `issuer` igual a `https://curaciones.web.app`.

- [ ] **Step 4: Abrir la app en el navegador y comprobar que carga**

Entrar a `https://curaciones.web.app` con el bundle **viejo** todavía servido, hacer login y abrir la lista de pacientes. Si esto falla, rollback inmediato (§Rollback) sin continuar.

### Task 20: Desplegar `curaciones-mcp` definitivo

- [ ] **Step 1: Desplegar apuntando al backend live, con `MCP_RESOURCE_URL` provisional**

`curaciones-mcp` se crea aquí por primera vez (el rollback lo borra, §Rollback), así que su URL no existe todavía y aplica el mismo huevo-y-gallina de la Task 16: `MCP_RESOURCE_URL` es obligatorio por zod, y su valor correcto es el origen propio del servicio. Se arranca con el placeholder y se fija en el Step 2.

```bash
SHA=$(cat /tmp/cutover-sha); LIVE=https://curaciones.web.app
JWKS=$(curl -s "$LIVE/.well-known/openid-configuration" | python3 -c "import sys,json;print(json.load(sys.stdin)['jwks_uri'])")
gcloud run deploy curaciones-mcp --region us-west1 \
  --image us-west1-docker.pkg.dev/gws-marcelo-2026/curaciones/mcp:$SHA \
  --service-account curaciones-api@gws-marcelo-2026.iam.gserviceaccount.com \
  --set-env-vars "NODE_ENV=production,LOG_LEVEL=info,BACKEND_URL=$LIVE/api,OAUTH_ISSUER=$LIVE,OAUTH_JWKS_URL=$JWKS,OAUTH_AUDIENCE=$LIVE,MCP_RESOURCE_URL=https://mcp-resource-placeholder.invalid" \
  --max-instances 2 --allow-unauthenticated
```

- [ ] **Step 2: Fijar `MCP_RESOURCE_URL` al URL real del servicio**

```bash
MCP_URL=$(gcloud run services describe curaciones-mcp --region us-west1 \
  --format='value(status.url)' | tee /tmp/mcp-live-url)
gcloud run services update curaciones-mcp --region us-west1 \
  --update-env-vars "MCP_RESOURCE_URL=$MCP_URL"
```

- [ ] **Step 3: Verificar el health y el recurso anunciado**

```bash
MCP_URL=$(cat /tmp/mcp-live-url)
curl -s "$MCP_URL/health"; echo
curl -s "$MCP_URL/.well-known/oauth-protected-resource" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['resource'])"
```

Esperado: respuesta de salud, y `resource` **exactamente igual** a `$MCP_URL`. Ese es el URL que se configura en los clientes MCP: si `resource` no coincide con el origen por el que el cliente entra, RFC 9728 §3.3 obliga al cliente a rechazar el documento. Si dice `mcp-resource-placeholder.invalid`, la revisión del Step 2 no tomó tráfico.

### Task 21: Job de Cloud Scheduler para la limpieza diaria

- [ ] **Step 1: Crear el job a las 3 AM de Santiago**

```bash
gcloud scheduler jobs create http oauth-cleanup --location us-west1 \
  --schedule "0 3 * * *" --time-zone "America/Santiago" \
  --uri "https://curaciones.web.app/api/internal/oauth-cleanup" \
  --http-method POST \
  --oidc-service-account-email curaciones-api@gws-marcelo-2026.iam.gserviceaccount.com \
  --oidc-token-audience "https://curaciones.web.app/api/internal/oauth-cleanup"
```

- [ ] **Step 2: Ejecutarlo a mano y verificar**

```bash
gcloud scheduler jobs run oauth-cleanup --location us-west1
sleep 20
gcloud scheduler jobs describe oauth-cleanup --location us-west1 \
  --format='yaml(status,lastAttemptTime)'
```

Esperado: último intento exitoso, sin código de error. Si da `401`, revisar que `CLEANUP_OIDC_AUDIENCE` del servicio coincida exactamente con `--oidc-token-audience`.

### Task 22: Frontend nuevo a producción

- [ ] **Step 1: Desplegar**

```bash
firebase deploy --only hosting --project gws-marcelo-2026
```

Usa `firebase.json` (rewrites hacia `curaciones-api`) y el hook `predeploy`.

- [ ] **Step 2: Anotar la release nueva y confirmar que la anterior sigue disponible**

```bash
TOKEN=$(gcloud auth print-access-token)
curl -s -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: gws-marcelo-2026" \
  "https://firebasehosting.googleapis.com/v1beta1/sites/curaciones/releases?pageSize=5" \
  | python3 -c "
import sys,json
for r in json.load(sys.stdin).get('releases',[]):
    print(r.get('releaseTime'), r.get('version',{}).get('name','').split('/')[-1])
"
```

Esperado: la nueva arriba y `f3479db990d5f000` todavía listada como punto de rollback.

### Task 23: Smoke en producción

- [ ] **Step 1: Recorrido funcional**

En `https://curaciones.web.app`: login, lista de pacientes con 51 registros, detalle de un paciente con observaciones legibles, agenda con el bloque 16:30, inventario, las 4 pestañas de organización, `/ayuda` con el manual, y descarga de un PDF.

- [ ] **Step 2: Reconectar el cliente MCP contra el issuer definitivo (F12)**

Los tokens emitidos durante la validación llevaban el issuer del canal preview y ya no valen. Repetir el registro del cliente y el flujo OAuth contra `https://curaciones.web.app`, y confirmar que el MCP responde.

- [ ] **Step 3: Cadena de auditoría después del cutover (F6)**

```bash
cd backend && DATABASE_URL="$(gcloud secrets versions access latest --secret=DATABASE_URL)" \
  npm run audit:verify 2>&1 | tail -20
```

Esperado: el **mismo** estado que en la Task 12 paso 1. Cualquier diferencia nueva sí es atribuible al cutover.

- [ ] **Step 4: Integridad de los datos**

```bash
DB="$(gcloud secrets versions access latest --secret=DATABASE_URL)&sslrootcert=system"
psql "$DB" -Atc "select 'orgs='||(select count(*) from organizations)||' users='||(select count(*) from users)||' patients='||(select count(*) from patients)||' curaciones='||(select count(*) from curaciones)||' appts='||(select count(*) from appointments);"
```

Esperado: al menos 1 org, 4 users, 51 pacientes, 809 curaciones, 823 citas.

- [ ] **Step 5: Ensayo de rollback (criterio 12)**

Sin ejecutarlo, verificar que los tres puntos siguen alcanzables:

```bash
gcloud run revisions describe curaciones-api-00001-zjj --region us-west1 --format='value(metadata.name)'
gcloud artifacts docker tags list us-west1-docker.pkg.dev/gws-marcelo-2026/curaciones/api --format='value(tag)' | grep prd-rollback
```

Esperado: la revisión existe y el tag `prd-rollback` está presente.

### Task 24: Limpiar los recursos de validación

- [ ] **Step 1: Borrar los servicios `-next`**

```bash
gcloud run services delete curaciones-api-next --region us-west1 --quiet
gcloud run services delete curaciones-mcp-next --region us-west1 --quiet
```

- [ ] **Step 2: Borrar el canal preview**

```bash
firebase hosting:channel:delete cutover-2026-08-21 --project gws-marcelo-2026 --force
```

- [ ] **Step 3: Borrar el cliente OAuth de prueba**

```bash
DB="$(gcloud secrets versions access latest --secret=DATABASE_URL)&sslrootcert=system"
psql "$DB" -Atc "delete from oauth_client where \"clientName\" = 'cutover-probe';"
```

- [ ] **Step 4: Bajar el Postgres local**

```bash
docker rm -f curaciones-pg
```

- [ ] **Step 5: Confirmar el inventario final**

```bash
gcloud run services list --format='value(metadata.name)'
gcloud secrets list --format='value(name)' | wc -l
```

Esperado: solo `curaciones-api` y `curaciones-mcp`; 6 secretos.

### Task 25: Cerrar el ciclo de las ramas

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Reescribir el modelo de ramas**

En `CLAUDE.md`, reemplazar la sección "Branching model" completa. Ya no existen dos versiones: `main` es la única rama de producción, `prd` queda archivada como historia.

```markdown
## Branching model

Una sola rama de producción: **`main`**. Recibe todo el trabajo vía PR con CI verde (`backend (build + test)` y `frontend (build + test)`, estrictos: la rama debe estar al día con `main`).

El despliegue **no** es automático. Se hace desde `main` con los comandos del runbook: build y push de las imágenes a Artifact Registry, `gcloud run deploy` de `curaciones-api` y `curaciones-mcp`, y `firebase deploy --only hosting`.

`prd` está **archivada**: apunta al código single-tenant que corría antes del cutover del 2026-08-21. No recibe commits. El punto de retorno de ese código es el tag `prd-gcp-live-2026-08-21`.
```

- [ ] **Step 2: Archivar `prd` en GitHub**

Quitar la protección que impide borrarla no es necesario: se conserva la rama, solo se documenta que está congelada. Verificar que el tag de rollback existe:

```bash
git ls-remote --tags origin | grep prd-gcp-live-2026-08-21
```

- [ ] **Step 3: Commit y PR**

```bash
git checkout -b docs/retire-prd-branch
git add CLAUDE.md
git commit -m "docs(claude): single production branch after the cutover"
git push -u origin docs/retire-prd-branch
gh pr create --base main --title "docs: retire the prd branch after the cutover" \
  --body "The multi-establishment version replaced the legacy app on 2026-08-21."
gh pr checks --watch && gh pr merge --squash
```

- [ ] **Step 4: Verificar los respaldos automáticos**

```bash
launchctl list | grep curaciones
ls -lht ~/curaciones-backups | head -3
```

Esperado: el job cargado y un respaldo reciente.

---

## Rollback

Ejecutar en este orden. No requiere tocar la base de datos.

```bash
# 1. Frontend a la release anterior
firebase hosting:clone curaciones:f3479db990d5f000 curaciones:live --project gws-marcelo-2026

# 2. Backend a la revisión previa al cutover
gcloud run services update-traffic curaciones-api --region us-west1 \
  --to-revisions curaciones-api-00001-zjj=100

# 3. Quitar el MCP, que no existía antes
gcloud run services delete curaciones-mcp --region us-west1 --quiet

# 4. Detener la limpieza programada
gcloud scheduler jobs pause oauth-cleanup --location us-west1

# 5. Verificar
curl -s -o /dev/null -w "%{http_code}\n" https://curaciones.web.app/api/health
```

Los env del Authorization Server viajan en la especificación de la revisión, así que el paso 2 los revierte solo. Las tablas `oauth_*` quedan pobladas y el código viejo las ignora.

**La base de datos no se revierte.** Las 6 migraciones son aditivas y no tocan ninguna tabla de negocio, así que revertirlas perdería todo lo que los usuarios hayan escrito después del cutover. Restaurar desde el branch de Neon o el dump de la Task 1 es solo para corrupción de datos.
