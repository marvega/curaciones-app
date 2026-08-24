
## Style

Be extremely concise. Sacrifice grammar for concision. Tables > prose. Fragments OK.

## Branching model

One production branch: **`main`**. Everything lands there by pull request with CI green
(`backend (build + test)`, `frontend (build + test)`, `mcp (build + test)` — strict, so the
branch must be up to date with `main` before merging).

**Deployment is not automatic.** It runs from `main` with the commands in
`docs/runbooks/`: build and push the images to Artifact Registry, `gcloud run deploy` for
`curaciones-api` and `curaciones-mcp`, and `firebase deploy --only hosting`.

`prd` is **archived**. It points at the single-tenant code that ran before the cutover of
2026-08-24 and receives no commits. The return point for that code is the tag
`prd-gcp-live-2026-08-21`.

### Production

| Piece | Where |
|---|---|
| Frontend | Firebase Hosting, site `curaciones` → https://curaciones.web.app |
| Backend | Cloud Run `curaciones-api`, `us-west1`. Also serves the OAuth Authorization Server |
| MCP | Cloud Run `curaciones-mcp`, `us-west1` |
| Database | Neon Postgres, project `Curaciones`, branch `production` |
| Secrets | Secret Manager, **6 of 6** on the free tier — adding a seventh has a cost |
| Daily cleanup | Cloud Scheduler job `oauth-cleanup`, 03:00 America/Santiago |

`OAUTH_ISSUER` must be exactly the public origin, `https://curaciones.web.app`. The
Authorization Server sits behind Hosting, which forwards only a cookie named `__session`,
so `oidc-provider`'s resume cookie is renamed to it and left unsigned — a signed cookie is
two cookies and only one name survives. Do not restore signing without moving the
Authorization Server off Hosting.

Rollback of the cutover, should it ever be needed:

```bash
firebase hosting:clone curaciones:f3479db990d5f000 curaciones:live
gcloud run services update-traffic curaciones-api --region us-west1 \
  --to-revisions curaciones-api-00001-zjj=100
gcloud run services delete curaciones-mcp --region us-west1
gcloud scheduler jobs pause oauth-cleanup --location us-west1
```

The database is **not** rolled back: the OAuth migrations are additive and the old code
runs on the new schema, so reverting them would discard whatever users wrote in between.

## UI Standards

All new UI in `frontend/src/pages/**` must use primitives from `frontend/src/components/ui/`. Do not reinvent buttons, inputs, search inputs, modals, drawers, tables, file upload zones, tags, code pills, page headers, or skeletons.

### Available primitives

`Button`, `Input`, `SearchInput`, `Select`, `Textarea`, `Checkbox`, `Modal`, `Drawer`, `DataTable`, `FileUpload`, `Tag`, `CodePill`, `EmptyState`, `Card`, `PageHeader`, `Skeleton`. Import via `import { ... } from '../components/ui'`.

### Discovering primitives

- Live gallery (dev only): visit `/dev/ui` while running `npm run dev`.
- Storybook: `cd frontend && npm run storybook`.

### Adding new variants

If a use case isn't covered by an existing primitive, **extend the primitive** rather than writing inline JSX. Add a variant prop or option, write a test, write a story.

### ESLint enforcement

Rule `ui/use-primitives` (in `frontend/eslint-rules/use-primitives.js`) flags raw `<button>`, `<input type="text|search|...">`, `<table>`, `<select>`, `<textarea>` in `src/pages/**`. It is enforced at `error` level — raw `<button>`, `<input type=text>`, `<table>`, etc. in `src/pages/**` will fail lint.

### Whitelist

For legitimate exceptions, use a single-line `// eslint-disable-next-line ui/use-primitives` comment.

### Reference

Design spec: `docs/superpowers/specs/2026-04-28-inventory-ui-redesign-design.md`.
