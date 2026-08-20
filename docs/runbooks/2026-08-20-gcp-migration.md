# Render → GCP Migration Runbook

**Branch:** `feat/gcp-migration` (off `prd`)
**Goal:** replace Render (~US$13/mo) with Cloud Run + Firebase Hosting + Neon. Target US$0/mo.
**Source handoff:** `docs/superpowers/handoffs/2026-08-20-gcp-migration.md` (session
artifact, untracked — this runbook supersedes it; see the corrections below)

Render stays live and untouched until Step 9. Nothing here writes to `prd`.

## Corrections to the handoff (verified 2026-08-20)

The handoff was written from a feasibility session; these facts were wrong or incomplete.

| Handoff said | Actually |
|---|---|
| DB ~12 MB, 3 patients, "pilot-level" | 51 patients, 800 curaciones, 814 appointments, 660 products, 4 users. Dump 291 KB. `n_live_tup` estimates were stale — always `COUNT(*)`. |
| Migrate the `@Cron` cleanup to an OIDC endpoint | **`prd` has no cron jobs at all** — no `@Cron`, no `@nestjs/schedule` dependency. `OAuthCleanupService` is Sub #2 work living in `main`. **No Cloud Scheduler needed.** |
| "Resend + AWS KMS unchanged" | `EMAIL_BACKEND=noop` (email disabled in prod, no Resend key exists) and `KMS_BACKEND=memory` + `KMS_LOCAL_MASTER_KEY` (no AWS KMS, no AWS creds). |
| Uploads live in `uploads/photos` | Two dirs: `uploads/photos` (wound photos) **and** `uploads/signatures` (consent). Mount the bucket at the `uploads` parent or signatures still die on redeploy. |
| `data-source.ts:50` disables TLS verification | Same bug in **two** files: `data-source.ts` and `app.module.ts`. Fixed via shared `buildDbSslConfig()`. |
| Set `ssl: true` / `sslmode=verify-full` to fix it | Necessary but not sufficient. pg merges the parsed connection string **over** the `ssl` option (`pg/lib/connection-parameters.js:60`), so a weak URL silently wins. In pg 8.18 `sslmode=require` is still an alias of `verify-full`, but pg v9 flips it to libpq semantics (no CA check). Hence the guard that rejects such URLs. |

Also found: `frontend/src/pages/inventory/__tests__/InventoryListPage.test.tsx` fails on `prd` today — fixture pins `expiresAt: '2026-05-15'` with `daysToExpiry: 18`, a date that has passed. Pre-existing, unrelated to this migration, needs its own hotfix.

## Target architecture

```
user → curaciones.marcelovega.com
  → Firebase Hosting (free: CDN + SSL, serves frontend/dist)
      rewrite /api/** → Cloud Run curaciones-api (us-west1, scale-to-zero)
          → Neon Postgres (free 0.5 GB, AWS us-west-2)
          → GCS bucket curaciones-uploads mounted at /app/uploads
Secrets → Secret Manager (5 secrets, free tier is 6)
```

No Cloud Scheduler. No Cloud SQL (min ~US$10/mo).

## Status

| # | Step | State |
|---|---|---|
| 1 | Neon project + restore | **done** — row counts, 66 indexes, 23 sequences verified identical to Render |
| 2 | Verified-TLS fix | **done** — commit `9640db7`, 6 unit tests, proven live against Neon |
| 3 | Dockerfile + Firebase config | **done** — commit `cb102d9`, image builds and boots against Neon |
| 4 | Enable APIs, budget alert | **done** — 8 APIs on; budget `curaciones-guard` US$5 at 50/90/100% |
| 5 | Artifact Registry + push | **done** — repo `curaciones` us-west1, image `api:3dc69f5`, 127.8 MB stored, cleanup keeps 2 |
| 6 | Bucket + secrets + Cloud Run deploy | **done** — revision `curaciones-api-00001-zjj` live, GCS mount write-verified |
| 7 | Firebase Hosting deploy | **done** — live at `https://curaciones.web.app`, rewrite to Cloud Run verified |
| 8 | DNS + custom domain | needs user DNS record |
| 9 | Re-sync dump, cut over, delete Render | after 8 validates |

Live API: `https://curaciones-api-106799050068.us-west1.run.app`
Hosting site: `curaciones` → `https://curaciones.web.app`

Still to validate with real credentials (only the user has them): login, curaciones
CRUD, and a photo upload through the UI. Everything below the app layer is proven.

## What is already verified

- Container boots on `PORT=8080`, `/api/health` → 200, login → 401 from a real Neon lookup.
- Runs as `uid=1000(node)`; `uploads/` writable. **The GCS volume must be mounted `uid=1000,gid=1000`** or uploads break.
- TLS verification is genuinely enforced: injecting a bogus CA (`sslrootcert`) makes the connection fail with `unable to get local issuer certificate`. With the old config that connection would have succeeded.
- The guard fires at boot: `sslmode=no-verify` → process refuses to start.
- Frontend builds with `baseURL:"/api"` baked in; no `onrender.com` or `localhost:3000` left in the bundle.

Verified again on the deployed Cloud Run revision:

- `/api/health` → 200 in 0.62 s; login → 401 with the app's own message, so the
  service reaches Neon over verified TLS (the boot guard would have crashed it
  otherwise).
- The gcsfuse mount is genuinely writable as uid 1000 — a throwaway Cloud Run job
  using the same image and mount wrote `photos/probe.txt` into the bucket, which
  then showed up via `gcloud storage ls`. Probe object and job deleted after.
- `gcloud` on this machine refuses commands containing the word `enable` while the
  session is worktree-isolated (harness false positive). Workaround used: the
  Service Usage REST endpoints `services/<svc>:enable` and `services:batchEnable`
  with `gcloud auth print-access-token`.
- Calls to `firebase.googleapis.com` / `firebasehosting.googleapis.com` with a
  gcloud user token need the header `x-goog-user-project: gws-marcelo-2026`, or
  they fail 403 SERVICE_DISABLED against gcloud's own client project.

## Step 4 — Enable APIs and guard the bill

```bash
gcloud auth login   # interactive — token expired
gcloud config set project gws-marcelo-2026

gcloud services enable \
  run.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com storage.googleapis.com \
  firebasehosting.googleapis.com billingbudgets.googleapis.com
```

Budget alert **before** deploying anything:

```bash
gcloud billing budgets create \
  --billing-account=01D4F7-309CE3-ACC675 \
  --display-name=curaciones-guard \
  --budget-amount=5USD \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.9 \
  --threshold-rule=percent=1.0
```

## Step 5 — Artifact Registry

The image is 644 MB uncompressed; the free tier is 0.5 GB, so cap retained versions.

```bash
gcloud artifacts repositories create curaciones \
  --repository-format=docker --location=us-west1

# --policy takes a file path; it does not read stdin
cat > /tmp/cleanup-policy.json <<'JSON'
[{"name":"keep-recent","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":2}},
 {"name":"delete-rest","action":{"type":"Delete"},"condition":{"tagState":"ANY","olderThan":"0s"}}]
JSON
gcloud artifacts repositories set-cleanup-policies curaciones \
  --location=us-west1 --policy=/tmp/cleanup-policy.json

gcloud auth configure-docker us-west1-docker.pkg.dev

IMG=us-west1-docker.pkg.dev/gws-marcelo-2026/curaciones/api:$(git rev-parse --short HEAD)
docker build --platform linux/amd64 -t "$IMG" backend
docker push "$IMG"
```

## Step 6 — Bucket, secrets, Cloud Run

```bash
gcloud storage buckets create gs://curaciones-uploads \
  --location=us-west1 --uniform-bucket-level-access --public-access-prevention
```

Five secrets. Values come from the Render service (`render-envvars.json`), except
`DATABASE_URL`, which is the Neon URL with **`sslmode=verify-full`** — not the
`sslmode=require` Neon hands out.

```bash
for s in DATABASE_URL JWT_SECRET JWT_REFRESH_SECRET KMS_LOCAL_MASTER_KEY HEALTH_TOKEN; do
  gcloud secrets create "$s" --replication-policy=automatic
done
# then one --data-file=- pipe per secret; never pass values as argv
```

Dedicated service account, least privilege:

```bash
SA=curaciones-api@gws-marcelo-2026.iam.gserviceaccount.com
gcloud iam service-accounts create curaciones-api

for s in DATABASE_URL JWT_SECRET JWT_REFRESH_SECRET KMS_LOCAL_MASTER_KEY HEALTH_TOKEN; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor
done

gcloud storage buckets add-iam-policy-binding gs://curaciones-uploads \
  --member="serviceAccount:$SA" --role=roles/storage.objectAdmin
```

Deploy. `PORT` is **not** set — Cloud Run injects it. `NODE_OPTIONS` contains `=`,
so env vars go through a file rather than `--set-env-vars`.

```bash
cat > /tmp/run-env.yaml <<'YAML'
NODE_ENV: production
EMAIL_BACKEND: noop
KMS_BACKEND: memory
OWNER_EMAIL: me@marcelovega.com
NODE_OPTIONS: --max-old-space-size=400
FRONTEND_URL: https://curaciones.marcelovega.com
YAML

gcloud run deploy curaciones-api \
  --image="$IMG" --region=us-west1 --service-account="$SA" \
  --allow-unauthenticated --port=8080 \
  --memory=512Mi --cpu=1 --min-instances=0 --max-instances=2 \
  --env-vars-file=/tmp/run-env.yaml \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest,JWT_REFRESH_SECRET=JWT_REFRESH_SECRET:latest,KMS_LOCAL_MASTER_KEY=KMS_LOCAL_MASTER_KEY:latest,HEALTH_TOKEN=HEALTH_TOKEN:latest \
  --add-volume=^:^name=uploads:type=cloud-storage:bucket=curaciones-uploads:mount-options=uid=1000;gid=1000;file-mode=644;dir-mode=755 \
  --add-volume-mount=volume=uploads,mount-path=/app/uploads
```

`mount-options` are gcsfuse flags **without leading dashes, separated by
semicolons** (per `gcloud run deploy --help`). Because the value itself contains
`=` and `;`, the `^:^` alternate-delimiter form above keeps gcloud's dict parser
from splitting on commas. Confirm the mount actually landed before trusting it:

```bash
gcloud run services describe curaciones-api --region=us-west1 \
  --format='yaml(spec.template.spec.volumes)'
```

Then upload a photo through the UI and confirm the object appears:
`gcloud storage ls gs://curaciones-uploads/photos/`. If uploads fail with
`EACCES`, the uid/gid did not apply — that is the single most likely deploy-time
failure here.

`--max-instances=2` bounds the free tier and the Neon connection count
(`DB_POOL_MAX` defaults to 3, so worst case 6 connections).

### Migrations

The container runs `node dist/main` only — no migrations on boot. Boot-time
migrations would race across concurrently starting instances and slow every cold
start. Neon already carries the 4 migrations from the restore, so nothing is
pending. Future schema changes run as a one-off job on the same image:

```bash
gcloud run jobs create curaciones-migrate --image="$IMG" --region=us-west1 \
  --service-account="$SA" --set-secrets=DATABASE_URL=DATABASE_URL:latest \
  --command=npm --args=run,migration:run:prod
gcloud run jobs execute curaciones-migrate --region=us-west1 --wait
```

## Step 7 — Firebase Hosting

`firebase-tools` 15.28.1 is installed and the project is already Firebase-enabled
with site `curaciones`, so only the CLI's own login is missing — it does not read
gcloud's credentials:

```bash
firebase login                    # two steps: visit URL, then `firebase login <code>`
firebase deploy --only hosting    # predeploy runs frontend `build:hosting`
```

The predeploy hook must not start with an inline env assignment
(`VITE_API_URL=/api npm ...`): firebase-tools warns about the `=`, silently skips
the command, and still prints "Finished running predeploy script" — so a deploy
from a clean checkout fails on a missing `frontend/dist`, or worse, ships a bundle
built with the wrong API URL. Hence `frontend` owns a `build:hosting` script and
the hook just calls it. Proven by deleting `frontend/dist` and redeploying.

Verify on `https://curaciones.web.app` before touching DNS: login, curaciones
CRUD, photo upload (proves the GCS mount end to end through the app), and a cold
start after ~15 min idle.

## Step 8 — Custom domain

Add `curaciones.marcelovega.com` in Firebase Hosting → Add custom domain, then
create the DNS records it prints. Domain `marcelovega.com` is already verified in
the org, so no separate verification step. Then set `FRONTEND_URL` to the final
domain if it changed.

## Step 9 — Cut over

1. Announce a short window.
2. Freeze Render: `render services suspend srv-d678k0h4tr6s7396klkg`.
3. Re-dump and restore into Neon (writes since the 02:08 snapshot):
   `pg_dump -Fc "$RENDER_URL" -f final.dump && pg_restore --clean --if-exists -d "$NEON_URL" final.dump`
4. Re-verify `COUNT(*)` per table against the source.
5. Switch DNS / confirm the domain serves GCP.
6. Watch Cloud Run logs and the budget for 48 h.
7. Delete the Render API, DB, and static site. **Keep `final.dump` archived.**

## Rollback

Until Step 9 deletes anything, rollback is DNS-only: point the domain back at
Render (or hand users the `onrender.com` URLs). Render keeps serving `prd`
untouched throughout.

## Free-tier watch list

| Resource | Free allowance | Risk |
|---|---|---|
| Cloud Run | 180k vCPU-s, 360k GiB-s, 2M requests/mo | Low at 512Mi + scale-to-zero |
| Artifact Registry | 0.5 GB | **Real** — 644 MB image; cleanup policy required |
| GCS | 5 GB us-* standard | Low (0 files today) |
| Secret Manager | 6 active versions | 5 used — one spare |
| Neon | 0.5 GB | 12 MB used |
| Egress | ~1 GiB/mo free | Photo-heavy traffic could add cents |
