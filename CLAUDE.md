
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
