# Sub #4 — Autenticación federada por institución

**Fecha:** 2026-08-21
**Estado:** diseño para revisión
**Relación:** depende de Sub #2 (Authorization Server, ya construido). No bloquea ni es bloqueado por el cutover de `2026-08-21-cutover-multiestablecimiento-design.md`.
**Origen:** D6 del umbrella (`2026-04-28-multi-tenant-mcp-platform-umbrella.md`), que lo difirió y decidió OIDC con Microsoft Entra antes que SAML genérico.

## Objetivo

Que cada institución cliente pueda usar su propio proveedor de identidad —una Microsoft Entra, otra Google Workspace, otra su propio OAuth— y que ese mismo mecanismo sirva tanto para entrar a la aplicación web como para autenticarse ante el MCP.

## El principio que hace esto sostenible

**No se construye una integración por proveedor.** Microsoft Entra, Google Workspace y cualquier "OAuth propio" razonable son todos OIDC: el mismo protocolo, distintos valores de configuración. Se construye **un** conector genérico parametrizado por `issuer`, `client_id`, `client_secret` y `scopes`, y cada institución es una fila de configuración. Solo un protocolo distinto —SAML— exigiría un conector aparte, y el umbrella ya decidió no priorizarlo.

De ahí se derivan tres reglas que atraviesan todo el diseño:

1. **Un solo punto de autenticación.** La web, el MCP y cualquier app externa hablan siempre con el Authorization Server propio, nunca con Microsoft o Google directamente. Agregar un proveedor no cambia ninguna aplicación.
2. **La autenticación establece identidad; la membresía otorga acceso.** Son decisiones separadas y se resuelven en momentos distintos.
3. **Nunca se vincula una identidad externa a un usuario existente por coincidencia de correo.** Ver §Seguridad del vínculo.

## Contexto: qué existe hoy

| Pieza | Estado *verificado* |
|---|---|
| Authorization Server propio | **ya construido** (Sub #2): `oidc-provider` con issuer en `OAUTH_ISSUER`, `findAccount` en `AccountAdapterService`, consentimiento en `ConsentController` |
| Punto donde el AS decide quién es el usuario | `consent.controller.ts:231` fija `interaction.result = { login: { accountId } }` |
| Login de la web | `authService.login(usernameOrEmail, password)` (`auth.service.ts:67`) — **agnóstico de organización**: valida credenciales, busca membresías activas y toma `memberships[0]` |
| Sesión del frontend | `localStorage` con claves `curaciones_refresh_token`, access token, `user`, `orgs`, `currentOrg` (`AuthContext.tsx`) |
| Cambio de organización | `POST /api/auth/switch-org` reemite un access token para otra org |
| Identidad del usuario | `User.username`, `passwordHash` **NOT NULL**, `email` **cifrado** (`EncryptedField`), `emailHash` SHA-256 indexado, `emailVerifiedAt` |
| Config por organización | `organizations.settings` es `jsonb`; **no hay** columna de proveedor de auth ni código de federación |

Dos restricciones del modelo actual condicionan el diseño:

- **El correo está cifrado y solo existe un hash del correo completo.** No se puede consultar "qué institución posee `@cesfam-x.cl`". El descubrimiento por dominio necesita una tabla propia con el dominio en claro — el dominio de una institución no es dato sensible.
- **`passwordHash` es NOT NULL.** Un usuario que solo entra por su institución no tiene contraseña, así que la columna debe volverse nullable.

Y una tensión estructural: **hoy el login ocurre antes de saber a qué organización pertenece el usuario**, pero el proveedor de identidad es *por organización*. Hay que resolver a qué IdP delegar antes de autenticar.

## Fase A — el AS como única puerta

No requiere Microsoft ni ningún proveedor externo. Todas las cuentas siguen siendo locales y el AS sigue validando contra la tabla `users`, con el formulario propio. Lo único que cambia es que la web deja de tener su propio login.

### Qué compra y qué no

Compra: un solo punto de autenticación para web, MCP y terceros; sesión unificada (hoy un usuario tendría que autenticarse por separado en la web y ante el MCP); y el terreno listo para la Fase B, que pasa a ser configuración más un conector.

**No** desbloquea nada operativo hoy: el MCP ya funciona contra el AS con cuentas locales. A cambio, toca el camino crítico de login de los usuarios en producción. Es una decisión de cuándo ejecutarla, no de si el diseño es correcto.

### Cambios

| Qué | Dónde |
|---|---|
| `passwordHash` nullable | migración + `user.entity.ts` |
| Cliente OAuth de primera parte para el SPA: cliente público con PKCE, sin secreto, `redirect_uri` en el origen de la app | registro fijo (no vía DCR) |
| Reemplazar el login local del frontend por `authorization_code` + PKCE | `AuthContext.tsx`, `LoginPage.tsx`, `services/api.ts` |
| Rediseñar el cambio de organización | ver abajo |
| Conservar el camino del JWT interno en `MultiAuthGuard` para CLI y scripts | sin cambios; el SPA deja de usarlo |

**Cambio de organización.** Hoy `switch-org` reemite un token en el backend. Bajo el AS la organización queda fijada en el `Grant` (`AccountAdapterService` la lee de `Grant.organizationId`). El rediseño: el selector de organización vive en el paso de interacción del AS, y cambiar de organización dispara una re-autorización silenciosa (`prompt=none`). Funciona sin re-login porque el rewrite de Hosting deja al AS en el **mismo origen** que el SPA, así que las cookies de sesión del AS están disponibles.

### Migración de los usuarios actuales

Los 4 usuarios existentes conservan usuario y contraseña: el AS valida contra la misma tabla con el mismo `bcrypt`. No hay reseteo ni correo de migración. El único efecto visible es que las sesiones activas se invalidan una vez y hay que volver a entrar.

### Riesgos de la Fase A

| ID | Riesgo | Mitigación |
|---|---|---|
| A1 | El login es camino crítico: un fallo en el flujo del AS deja a todos fuera de la aplicación | bandera de configuración para volver al login local sin desplegar, y validación completa en canal preview antes de promover |
| A2 | `prompt=none` depende de cookies del AS en el mismo origen | garantizado por el rewrite de Hosting; si alguna vez el AS se mueve a otro host, esto se rompe y hay que volver a autorización explícita |
| A3 | El manejo de sesión del frontend se reescribe entero | se mantiene el esquema actual de almacenamiento (token en memoria, refresh en `localStorage`) para no ampliar el alcance con cookies `httpOnly` y CSRF |

## Fase B — federación por institución

### Modelo de datos

| Tabla | Contenido | Notas |
|---|---|---|
| `organization_idp` | `organizationId`, `protocol` (`oidc`), `issuer`, `clientId`, `clientSecret`, `scopes`, `claimMappings` jsonb, `status` | el `clientSecret` se cifra con KMS en la propia fila, **no** en Secret Manager: el free tier ya quedará en 6/6 después del cutover, y esto crece por cliente |
| `organization_domain` | `domain` (PK, en claro), `organizationId` | habilita el descubrimiento sin tocar el correo cifrado |
| `user_identity` | `userId`, `provider` (issuer), `externalSub`, `createdAt`, único por (`provider`, `externalSub`) | permite que un usuario tenga contraseña local *y* cuentas externas, y migrar de una a otra |
| `organizations.authPolicy` | `local` \| `federated` \| `both`, default `local` | columna propia, no `settings`, porque se valida en cada autorización |

### Descubrimiento

El usuario escribe su correo en la pantalla de login. El AS extrae el dominio, lo busca en `organization_domain` y decide:

- dominio mapeado a una institución con IdP activo → redirige a ese IdP;
- dominio no mapeado → muestra el formulario local.

Correos personales (Gmail y similares) no se mapean nunca: esos usuarios siguen con login local. Eso también evita el error clásico de mapear un dominio público a una institución.

### Seguridad del vínculo

**Una identidad externa nunca se vincula a un usuario existente por coincidencia de correo.** Un IdP puede afirmar cualquier `email`; aceptar esa afirmación como prueba de identidad permitiría tomar control de una cuenta ajena. El vínculo se crea únicamente:

1. al aceptar una invitación explícita, autenticándose con el IdP en ese acto; o
2. cuando ya existe una fila en `user_identity` con el mismo (`provider`, `externalSub`).

El `sub` del IdP es el identificador estable; el correo es solo un dato de contacto.

### Aprovisionamiento

**Invitación previa obligatoria.** El primer login federado de alguien sin invitación aceptada es rechazado; no se crea el usuario automáticamente. Se descarta el aprovisionamiento automático (JIT) porque significaría que cualquier cuenta del dominio de la institución obtiene acceso a datos clínicos de pacientes sin que nadie lo haya autorizado. El costo asumido es trabajo administrativo por cada alta, que ya es el flujo existente de invitaciones.

### Multi-organización con proveedores distintos

Un usuario puede pertenecer a varias instituciones, cada una con su propio IdP. La regla 2 lo resuelve: la autenticación establece **quién es**, la membresía determina **a qué accede**.

El caso exigente es una institución con `authPolicy = federated`, que quiere que sus datos se toquen solo tras pasar por su IdP. Para soportarlo, el token registra con qué proveedor se autenticó la sesión, y el acceso a datos de esa organización se valida contra ese registro. Un usuario autenticado con el IdP de la institución A puede cambiar a la institución B solo si la política de B lo admite; si B exige su propio IdP, se le pide reautenticarse.

### Riesgos de la Fase B

| ID | Riesgo | Mitigación |
|---|---|---|
| B1 | **Desaprovisionamiento:** si la institución desactiva a alguien en su IdP, Curaciones no se entera y la membresía sigue viva | sesiones cortas para organizaciones federadas y revisión periódica de membresías. SCIM queda fuera de alcance |
| B2 | Un IdP mal configurado por el cliente deja a toda su gente afuera | `authPolicy = both` durante la puesta en marcha, y `local` como camino de rescate |
| B3 | Los secretos de cliente de cada IdP son material sensible en la base | cifrado con KMS por fila, con la misma disciplina de AAD que el resto de campos cifrados |
| B4 | Configuración auto-servicio por el owner de la institución vs configuración manual | se asume manual en la primera versión: son pocos clientes y un error de configuración deja gente fuera |

## Supuestos que tomé (revisar)

Ninguno de estos venía dado; los decidí por tener un default defendible, y quedan marcados para que los confirmes o los cambies:

| # | Supuesto | Por qué |
|---|---|---|
| S1 | Invitación previa obligatoria; sin aprovisionamiento automático | son datos clínicos de pacientes; el acceso lo autoriza una persona, no un dominio de correo |
| S2 | Descubrimiento por dominio de correo, con formulario local como alternativa | encaja con el correo cifrado y no obliga al usuario a saber cómo se llama su institución en el sistema |
| S3 | `authPolicy` con tres valores y `local` por defecto | ninguna institución actual se ve afectada al desplegar |
| S4 | Configuración de IdP manual, no auto-servicio | pocos clientes, y un error de configuración deja gente fuera |
| S5 | La Fase A conserva el esquema de almacenamiento de sesión actual | evita arrastrar cookies `httpOnly` y CSRF a un proyecto que ya reescribe el login |
| S6 | El camino del JWT interno se conserva para CLI y scripts | retirarlo del todo es limpieza posterior, no parte de este diseño |

## Fuera de alcance

SAML. SCIM y desaprovisionamiento automático. Configuración auto-servicio del IdP. Retirar el JWT interno. Multi-factor propio (lo aporta el IdP de la institución cuando existe).

## Criterios de aceptación

**Fase A**

1. Un usuario existente entra a la web con su usuario y contraseña de siempre, ahora a través del AS.
2. Cambiar de organización funciona sin volver a introducir credenciales.
3. Un cliente MCP y la web comparten la misma sesión del AS: autenticarse una vez alcanza para ambos.
4. La bandera de rescate devuelve el login local sin desplegar código.

**Fase B**

5. Una institución de prueba con un IdP OIDC real entra con sus propias cuentas.
6. Un correo de dominio no mapeado sigue llegando al formulario local.
7. Un IdP que afirma el correo de un usuario existente **no** obtiene acceso a esa cuenta.
8. Un login federado sin invitación aceptada es rechazado.
9. Una institución con `authPolicy = federated` rechaza el acceso a sus datos desde una sesión autenticada por otro proveedor.
10. Agregar una segunda institución con otro proveedor OIDC es solo configuración: cero código nuevo.
