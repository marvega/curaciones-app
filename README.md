# Curaciones

Sistema de gestión de curaciones para clínica. Backend NestJS + frontend React.

## Stack

| Componente | Tecnología |
|---|---|
| Backend | NestJS 10, TypeORM, PostgreSQL |
| Frontend | React 18, Vite, react-router-dom |
| Auth | JWT (passport-jwt) |
| Deploy | Render (backend + DB), Railway (frontend) |

## Local dev

```bash
# DB (Docker, Postgres 18)
docker run -d --name curaciones-db \
  -p 5433:5432 \
  -e POSTGRES_USER=curaciones \
  -e POSTGRES_PASSWORD=curaciones \
  -e POSTGRES_DB=curaciones \
  postgres:18-alpine

# Backend
cd backend && npm install && npm run start:dev

# Frontend
cd frontend && npm install && npm run dev
```

Backend en `localhost:3000/api`, frontend en `localhost:5173`.

## Tests

```bash
cd backend
npm test                            # unit
npm run test:e2e -- --runInBand     # e2e (requiere Postgres en :5433)
```

E2E necesita la DB `curaciones_test`:
```bash
docker exec curaciones-db psql -U curaciones -d postgres -c "CREATE DATABASE curaciones_test;"
```

## Configuración por env vars

Backend lee de `backend/.env` (dev) o env del host (prod).

### Generales

| Variable | Default | Descripción |
|---|---|---|
| `NODE_ENV` | — | `production`, `test`, o vacío (dev) |
| `DATABASE_URL` | — | URL de PostgreSQL |
| `JWT_SECRET` | `curaciones-secret-key-change-in-production` | Secret de firma JWT. **Obligatorio en prod** |
| `PORT` | `3000` | Puerto HTTP |
| `FRONTEND_URL` | — | URL del frontend (CORS) |

### Rate limiting (throttler)

El throttler usa **`PerUserThrottlerGuard`**: rastrea por `userId` extraído del JWT cuando el request está autenticado, y por IP cuando no. Esto evita que múltiples usuarios detrás del mismo NAT (típico en una clínica) compartan el mismo bucket.

| Variable | Default prod | Default dev/test | Descripción |
|---|---|---|---|
| `THROTTLE_DEFAULT_LIMIT` | `200` | `10000` | Requests por minuto por usuario autenticado (o por IP si no auth) |
| `THROTTLE_LOGIN_LIMIT` | `5` | `10000` | Intentos de `/auth/login` por minuto por IP |

Tuning sin redeploy: setear estas vars en el dashboard de Render y reiniciar el servicio. Subir si hay reportes de 429 con uso normal; bajar si hay sospecha de abuso.

### Estructura del guard

`backend/src/common/per-user-throttler.guard.ts` — extiende `ThrottlerGuard` y sobreescribe `getTracker()`:

- `Authorization: Bearer <jwt>` válido → tracker = `user:<sub>`
- Token inválido / expirado / ausente → tracker = `req.ip`

Se aplica como `APP_GUARD` global desde `app.module.ts`.

## Deploy

| Servicio | Plataforma | Branch |
|---|---|---|
| Backend | Render | `main` (auto-deploy) |
| Frontend | Railway | `main` (auto-deploy) |
| DB | Render Postgres | — |
