# Exposición de credenciales en el repositorio público

**Fecha del hallazgo:** 2026-08-24
**Severidad:** alta
**Estado:** código corregido; **rotación de contraseñas pendiente del dueño**

## Qué pasó

Las contraseñas de producción de los usuarios `admin` y `cynthia` estaban escritas
como literales en `backend/src/users/users.service.ts`, dentro del método `seed()`.
El repositorio `marvega/curaciones-app` es **público**, así que cualquiera podía
leerlas. Están en el historial de git desde el commit `ea96d82`.

Esas dos cuentas tienen rol Owner sobre una organización con 51 fichas clínicas.

La misma contraseña aparecía además en tres archivos más:

| Archivo | Uso |
|---|---|
| `frontend/e2e/auth.setup.ts` | login del setup de Playwright |
| `backend/test/throttler.e2e-spec.ts` | dos logins del spec de rate limiting |
| `docs/superpowers/plans/2026-03-20-solidify-base-plan.md` | fragmentos de ejemplo |

## Cómo se encontró

No por una auditoría de seguridad. Durante el cutover multi-establecimiento, un
implementador notó que un script de mantenimiento arrancaba `AppModule`, y que
`BootstrapService.onModuleInit` llama a `UsersService.seed()`, que **inserta filas
de usuarios**. Al verificar si las corridas de `audit:verify` contra producción
habían insertado algo, apareció el literal.

**No se insertó ningún usuario.** `seed()` era inocuo porque comprobaba la
existencia previa, y `admin` y `cynthia` ya existían. Se confirmó contando filas:
4 usuarios, con fechas de creación de febrero y julio.

## Exposición adicional

`POST /api/users/seed` no tiene guard de autenticación y es alcanzable desde
internet. Se comprobó en producción: devuelve `201 {"created":0}`. Es inocuo
mientras `seed()` no cree nada, pero es superficie pública innecesaria.

## Qué se corrigió en el código

- `seed()` ya no contiene credenciales. Lee `SEED_USERNAME` y `SEED_PASSWORD` y
  no hace nada si no están definidas, así que en un despliegue existente es
  inerte. Sólo resuelve el arranque de la primera cuenta, cuando todavía no
  existe nadie que pueda invitar.
- El spec del throttler crea sus propios usuarios en la base de tests en vez de
  autenticarse con cuentas reales.
- El setup de Playwright toma las credenciales de `E2E_USERNAME` y `E2E_PASSWORD`
  y falla explícitamente si no están.
- El plan histórico queda con los valores redactados.
- El endpoint de bootstrap conserva su acceso anónimo —no hay nadie como quien
  autenticarse antes del primer usuario— con un comentario que explica qué lo
  hace seguro y qué lo volvería peligroso.

## Qué NO cierra esto

**Quitar la credencial del código no invalida la credencial.** Hay que rotar las
contraseñas de `admin` y `cynthia`. Es la única acción que cierra el problema.

El historial de git sigue conteniendo los literales en `ea96d82` y `9e36aad`.
Reescribirlo exigiría un force-push a `main` y a `prd`, ambas ramas protegidas
contra eso, y aun así:

- GitHub conserva los commits accesibles por su SHA hasta que su recolector pase
  o hasta pedir una purga explícita a soporte;
- cualquier fork o clon existente los conserva;
- los espejos y cachés de terceros no se ven afectados por un force-push.

Por eso la rotación no es opcional ni posterior: es *la* mitigación. La reescritura
del historial es limpieza cosmética que sólo tiene sentido después de rotar, y es
una decisión del dueño por el costo que implica.

## Acciones pendientes del dueño

1. **Rotar la contraseña de `admin` y la de `cynthia`.** Prioridad inmediata.
2. Decidir si el repositorio debe seguir siendo público.
3. Decidir si vale reescribir el historial, sabiendo lo que no logra.
