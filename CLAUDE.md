
## Branching model

Two long-lived branches with distinct purposes — never conflate them.

| Branch | Purpose | Render auto-deploys? |
|---|---|---|
| **`prd`** | Live single-tenant app currently in production. Receives **bug fixes only**. | Yes — both `curaciones-app` (frontend) and `curaciones-api` (backend) deploy on every commit to `prd`. |
| **`main`** | Integration branch for the **new multi-establishment / commercial platform** (Sub #1 multi-tenancy, Sub #2 OAuth, Sub #3 MCP). | No. Does not auto-deploy anywhere. |

### Where to branch from

- **Hotfix for the live app** (a bug a current user reports): branch off `prd` → PR to `prd` → after merge & smoke test, cherry-pick the squash commit to `main` so `main` keeps tracking PRD's bugfix history.
- **New multi-establishment / OAuth / MCP / platform work**: branch off `main` → PR to `main`. Never to `prd`. Only promote to `prd` when the multi-tenant version is ready to replace what's live.

### Enforcement

Both `prd` and `main` are GitHub-protected:
- No direct pushes (PR-only, applies to admins too)
- No force-pushes, no deletions
- `main` additionally requires `backend (build + test)` and `frontend (build + test)` GitHub Actions checks (strict — the PR branch must be up to date with `main` before merge)
- `prd` does not gate on CI yet; tests must pass locally before merging. When the GH Actions workflow is extended to also trigger on PRs to `prd`, swap Render's trigger to "After CI Checks Pass" and add the same required checks here.

### Render

Both services are pinned to `prd` with `autoDeploy=on commit`. Don't suggest changing them. Every commit to `prd` ships within ~2 minutes — never merge to `prd` something that hasn't been validated locally.

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
