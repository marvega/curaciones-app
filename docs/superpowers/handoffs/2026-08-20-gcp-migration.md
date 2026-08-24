# Handoff — Migrate Curaciones from Render to GCP free tier

**Date:** 2026-08-20
**Branch base:** `prd` (the deployed legacy version — see "Two app versions" below)
**Goal:** Replace Render (~US$13/mo) with GCP free tier + Neon. Target cost: US$0/mo.
**Origin:** Feasibility session in `~/dev/claude/varios` (2026-08-20). All facts below were verified live, not assumed.

## Verified current state (Render)

| Resource | ID / detail | Plan | Cost |
|---|---|---|---|
| API `curaciones-api` | `srv-d678k0h4tr6s7396klkg`, Oregon, Node, branch `prd`, autodeploy on commit | starter | US$7/mo |
| DB `curaciones-db` | `dpg-d678jm94tr6s7396kfmg-a`, Postgres **18**, Oregon | basic_256mb (1 GB disk) | US$6/mo |
| Frontend `curaciones-app` | `srv-d678jm14tr6s7396kfjg`, static, branch `prd` | free | $0 |

- **DB size: 12 MB** (`pg_database_size`). Top tables: audit_logs 75, curaciones 62, appointments 59 rows. 3 patients — pilot-level usage.
- **wound_photos: 0 rows; server `uploads/` dir = 12 KB (empty).** Nothing to migrate for photos.
- Latent bug on Render: no persistent disk in render.yaml → any uploaded photo dies on redeploy. Fixed by design in target architecture.
- Render CLI v2.14 logged in. SSH key `~/.ssh/id_ed25519.pub` registered in Render account (2026-08-20): `ssh srv-d678k0h4tr6s7396klkg@ssh.oregon.render.com` works (ignore harmless `bad signature for ED25519 host key` warning).

## Verified current state (GCP)

- `gcloud` (SDK 565) authenticated as `me@marcelovega.com`; active project **`gws-marcelo-2026`** (empty, billing-linked).
- Billing account "Mi cuenta de facturación" (`01D4F7-309CE3-ACC675`): Active, **$0 spend**, org `marcelovega.com`.
- Domain `marcelovega.com` verified (Google Workspace legacy free org) → Cloud Run / Firebase custom-domain mapping skips verification.
- GCP free tier is identical for all account types (per official docs) — no special Workspace quota. Decision to use GCP is on merit: best free container platform as of Aug 2026 (Fly/Railway killed free tiers; Render free sleeps 15 min w/ 30–60 s cold starts; Oracle halved Always Free without notice in Jun 2026; Koyeb free Postgres = 5 h compute/mo).

## Target architecture (all decided)

```
user → curaciones.marcelovega.com (DNS)
  → Firebase Hosting (free: CDN+SSL, serves frontend/dist)
      rewrite /api/** → Cloud Run (us-west1, NestJS container, scale-to-zero)
          → Neon Postgres (free 0.5 GB, AWS us-west-2 Oregon) via DATABASE_URL (TLS)
          → GCS bucket mounted as volume at uploads/photos (free 5 GB)
          → Resend + AWS KMS unchanged
Cloud Scheduler (free ≤3 jobs) —3AM HTTP→ Cloud Run cleanup endpoint
Secrets → GCP Secret Manager (free ≤6 secrets)
```

Rationale for DB outside GCP: Cloud SQL min ~US$10/mo; Neon free covers 12 MB × 40. Rejected alternative: self-managed Postgres on free e2-micro VM (ops burden unacceptable for clinical data).

## Required code/config changes

1. **Dockerfile** for `backend/` (multi-stage, `node dist/main`). `start:prod` already runs migrations on boot — keep.
2. **Cron → endpoint**: `OAuthCleanupService.runDailyCleanup()` (`backend/src/oauth/services/oauth-cleanup.service.ts:25`, `@Cron(EVERY_DAY_AT_3AM)`) won't fire on scale-to-zero. Expose as protected endpoint (validate Cloud Scheduler OIDC identity token), drop the decorator. ~20 lines.
3. **Uploads**: keep `UPLOAD_DIR = uploads/photos` code as-is; mount GCS bucket as Cloud Run volume at that path.
4. **Env/secrets**: `DATABASE_URL` (Neon), `FRONTEND_URL`, JWT/Resend/KMS keys → Secret Manager. **Fix `data-source.ts:50`**: `ssl: { rejectUnauthorized: false }` disables TLS verification (MITM risk). Neon serves publicly-trusted certs, so switch to verified TLS (`ssl: true` / `sslmode=verify-full`) as part of this migration.
5. **Firebase Hosting**: serve `frontend/dist`, rewrite `/api/**` → Cloud Run service. Kills the current two-domain CORS setup; `VITE_API_URL` becomes relative.

## Migration sequence (Render stays intact until validated)

1. User creates Neon account (free, region **AWS us-west-2 Oregon**) — only step Claude cannot do (credentials).
2. `pg_dump` from Render (`render psql curaciones-db` / connection string) → restore into Neon. Verify row counts.
3. Enable APIs; build+deploy Cloud Run (`gcloud run deploy` from source or Artifact Registry), wire secrets, GCS volume.
4. Cloud Scheduler job (3 AM America/Santiago-equivalent in UTC) with OIDC → cleanup endpoint.
5. Firebase Hosting init + rewrites + deploy frontend.
6. Map `curaciones.marcelovega.com` (user adds DNS record).
7. Validate end-to-end (login, curaciones CRUD, photo upload, cleanup trigger, cold-start UX).
8. Freeze Render DB (final re-sync dump if writes happened), switch users, then suspend/delete Render services.

## Two app versions — IMPORTANT

- **Deployed/legacy = branch `prd`** (Render autodeploys it). Still receives maintenance + improvements. **Migrate this one.**
- **Multi-establishment version** = `main` + unmerged `feat/org-administration-endpoints`, `feat/org-admin-tabs` (current checkout). See `docs/runbooks/2026-04-28-multi-tenancy-migration.md` and earlier handoffs.
- Infra must not block the multi-org future: name resources app-level (`curaciones-api`, bucket `curaciones-uploads`), not org-level; both versions share the same infra shape.

## Known trade-offs (already accepted by Marcelo)

- Cold start: a few seconds on first request after idle. If it ever hurts: min-instances (~US$3–5/mo) or `southamerica-west1` (Santiago, paid tier) — still < Render cost.
- Free egress ~1 GiB/mo; photo-heavy traffic could add cents.

## Side pendings (not blocking)

- Orphan GCP project **`OpenClaw`** (`gen-lang-client-0634946449`) billing-linked, created by AI Studio Gemini API key; openclaw was uninstalled from the Mac → revoke key at aistudio.google.com/apikey or shut the project down.
- Create GCP **budget alert** (e.g. US$5/mo) — recommended before deploying.
- Billing account shows 3 status-check recommendations in console (unreviewed).
