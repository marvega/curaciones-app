# Multi-Tenancy Migration Runbook

**Estimated window:** 30-60 min
**Rollback target:** `pre-migration-<timestamp>.dump`

## Pre-flight (T-30m)

1. Announce maintenance to user.
2. Confirm Resend API key in Railway env: `RESEND_API_KEY`, `EMAIL_FROM`.
3. Confirm AWS env: `KMS_CMK_ARN`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
4. Verify staging migration test green in CI.

## Step 1 — Stop traffic

```bash
railway service pause backend
```

## Step 2 — Fresh dump

```bash
pg_dump -Fc "$DATABASE_URL_PROD" > pre-migration-$(date +%Y%m%d-%H%M%S).dump
```

Confirm file size > 0 and listable:

```bash
pg_restore --list pre-migration-*.dump | head
```

## Step 3 — Run schema migration

```bash
DATABASE_URL=$DATABASE_URL_PROD npm --prefix backend run migration:run
```

Expected: `MultiTenancyFoundation1714400000000` applied successfully.

## Step 4 — Run encryption batch

```bash
DATABASE_URL=$DATABASE_URL_PROD KMS_BACKEND=aws npm --prefix backend run encryption:backfill
```

Expected: log lines `[enc] patients.rut: N processed`, etc.

## Step 5 — Verify audit chain

```bash
DATABASE_URL=$DATABASE_URL_PROD npm --prefix backend run audit:verify -- --org 1
```

Expected: `[audit:verify] OK — N rows verified for org 1`.

## Step 6 — Resume traffic

```bash
railway service resume backend
```

## Step 7 — Smoke test

- Login with owner email.
- Open patient list; open one patient (verify rut decrypts).
- Add a curación.
- Visit `/account/sessions` — current session listed.
- Visit `/audit-log` — recent rows present.

## Rollback (only if any of 4-7 fails)

```bash
railway service pause backend
pg_restore --clean --if-exists -d "$DATABASE_URL_PROD" pre-migration-*.dump
railway service resume backend
git push --force origin <previous-deploy-sha>:main   # only if you really must
```

Then restore frontend via the same revert.
