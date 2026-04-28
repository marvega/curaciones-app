# Sistema de Diseño + Rediseño Inventario + Barrido UI

**Fecha:** 2026-04-28
**Autor:** Marcelo + Claude
**Estado:** Borrador para revisión

## Contexto

El módulo de inventario de insumos médicos (sub-rutas `/inventory/*`, mergeado a `main` en commit `09f822e` y siguientes) se construyó funcionalmente correcto pero visualmente inconsistente con el resto de la aplicación. Las páginas usan estilos hardcoded en lugar de los patrones ya establecidos en `PatientsListPage` (clases utility `.card`, `.btn-primary`, `.form-control`; tabla con headers uppercase; search input con icono Lucide).

Adicionalmente, la lógica de "mapeo sugerido" entre productos AVIS y categorías de la Canasta CAPD está hardcoded en `backend/src/seeds/canasta-mappings.ts` — no es flexible para cambios futuros del archivo guía de auditoría que las enfermeras reciben.

## Goals

1. Establecer un sistema de diseño formal con primitivos React reutilizables en `frontend/src/components/ui/`.
2. Rediseñar las 6 páginas de `/inventory/*` para que se sientan parte de la misma app que `/pacientes`.
3. Migrar las páginas existentes (Pacientes, NewPatient, FichaClinica, etc.) a los nuevos primitivos para terminar la inconsistencia.
4. Reemplazar el mapeo de canasta hardcoded por upload de archivo guía Excel (las enfermeras suben el archivo que reciban; la app reemplaza/mergea categorías y auto-asocia productos).
5. Permitir CRUD total de categorías de canasta a usuarios admin.
6. Dejar herramientas para evitar regresión: Storybook, galería interna, ESLint rule, reglas escritas en `CLAUDE.md`.

## Non-goals

- Cambios al schema de inventory (Products, Lots, Movements, StockCounts) más allá de las dos columnas nuevas en `canasta_categories` y `canasta_products` que se justifican abajo.
- Cambios en lógica clínica (agendas, consultas, fichas).
- Migración de tema oscuro existente (ya funciona).
- Internacionalización (la app es solo es-CL).

## Decisiones tomadas durante brainstorming

| # | Decisión |
|---|----------|
| 1 | Alcance: sistema de diseño completo + barrido + Storybook + ESLint, en un solo spec sin fases. |
| 2 | El mapeo Canasta CAPD es manejado vía upload del archivo guía. No hay endpoint `seed-defaults`, no hay matchers hardcoded. Una sola acción "subir archivo guía" reemplaza/mergea categorías y auto-asocia productos del catálogo AVIS por regex contra las pistas en la columna Observaciones. |
| 3 | CRUD total de categorías de canasta — añadir, eliminar, editar nombre/orden/notes/isOptional. No hay restricción regulatoria; las enfermeras son responsables de mantener fidelidad con el archivo de auditoría. |
| 4 | Tabla del catálogo: `Código` primero (pill azul monospace), `Nombre` con sentence case (display only — BD intacta), `Tipo` y `Empaque` como tags grises. |
| 5 | File upload: drop-zone con drag-and-drop + bloque de resultado integrado (creados/actualizados/sin cambios/errores). Componente único `FileUpload` reutilizable. |
| 6 | Editor de productos asociados: drawer lateral derecho de 480px con header + buscador + contador + lista scrollable + footer fijo con botones Cancelar/Guardar. |

## Arquitectura

```
frontend/
├── src/
│   ├── components/
│   │   ├── ui/                       # Primitivos (NUEVO)
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── SearchInput.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Textarea.tsx
│   │   │   ├── Checkbox.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Drawer.tsx
│   │   │   ├── DataTable.tsx
│   │   │   ├── FileUpload.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   ├── Tag.tsx
│   │   │   ├── CodePill.tsx
│   │   │   ├── PageHeader.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Skeleton.tsx
│   │   │   └── index.ts              # Barrel export
│   │   ├── ConfirmDialog.tsx         # (existente, ya integrado al sistema)
│   │   ├── Toast.tsx                 # (existente)
│   │   ├── Layout.tsx                # (existente, no se toca)
│   │   ├── ProtectedRoute.tsx        # (existente)
│   │   └── ...
│   ├── formatters/                   # NUEVO
│   │   └── text.ts                   # toSentenceCase, formatCode, etc.
│   ├── pages/
│   │   ├── inventory/                # rediseño
│   │   ├── PatientsListPage.tsx      # migrar a primitivos
│   │   └── ...
│   └── ...
├── eslint-rules/                     # NUEVO
│   └── use-primitives.js             # ESLint rule custom
└── .storybook/                       # NUEVO

backend/
├── src/
│   ├── inventory/
│   │   ├── canasta/
│   │   │   ├── canasta-import.service.ts   # NUEVO (parser + merge + matcher)
│   │   │   ├── canasta-categories.controller.ts # NUEVO (CRUD)
│   │   │   └── ...
│   │   └── ...
│   ├── seeds/
│   │   └── canasta-mappings.ts       # ELIMINAR
│   └── migrations/
│       ├── 1714240000000-InventoryFoundation.ts  # (histórica)
│       └── 1714320000000-CanastaResetAndAutomappedFlag.ts  # NUEVO
```

## Sistema de diseño

### Tokens

Extender `frontend/src/index.css` con CSS custom properties. Todos los tokens van bajo el prefijo `--ui-*` para evitar colisiones con tokens internos que Tailwind 4 emite en `@layer theme` (ej: `--radius-md`, `--shadow-md`):

```css
:root {
  /* Spacing scale (alineado con Tailwind) */
  --ui-space-1: 0.25rem;
  --ui-space-2: 0.5rem;
  --ui-space-3: 0.75rem;
  --ui-space-4: 1rem;
  --ui-space-5: 1.25rem;
  --ui-space-6: 1.5rem;
  --ui-space-8: 2rem;

  /* Radii */
  --ui-radius-sm: 0.375rem;
  --ui-radius-md: 0.5rem;
  --ui-radius-lg: 0.75rem;
  --ui-radius-xl: 1rem;

  /* Shadows */
  --ui-shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --ui-shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --ui-shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);

  /* Colors semánticos (referencia a Tailwind palette ya en uso) */
  --ui-color-bg: theme(colors.slate.100);
  --ui-color-surface: theme(colors.white);
  --ui-color-border: theme(colors.slate.200);
  --ui-color-primary: theme(colors.blue.600);
  --ui-color-text: theme(colors.slate.800);
  --ui-color-muted: theme(colors.slate.500);
}

.dark {
  --ui-color-bg: theme(colors.slate.950);
  --ui-color-surface: theme(colors.slate.900);
  --ui-color-border: theme(colors.slate.700);
  --ui-color-text: theme(colors.slate.200);
  --ui-color-muted: theme(colors.slate.400);
}
```

Las clases utility actuales (`.card`, `.btn-primary`, etc.) se mantienen para retrocompatibilidad durante la migración pero los primitivos las usan internamente — al final de la migración solo los primitivos las consumen.

### Primitivos React

Cada primitivo:

- TS estricto, props tipados con `interface`
- `forwardRef` cuando aplica (Input, Button, Drawer trigger)
- Variantes con función helper `cn()` (clsx + tailwind-merge) — añadir dependencias si no están
- Test unitario con React Testing Library
- Story de Storybook con todas las variantes
- Export desde `frontend/src/components/ui/index.ts`

#### Catálogo de primitivos

**`Button`** — variantes: `primary | secondary | danger | success | ghost | link`. Tamaños: `sm | md | lg`. Props: `loading`, `disabled`, `leftIcon`, `rightIcon`, `as` (para usarlo como `<a>` o `<NavLink>`).

**`Input`** — variantes: `default | error`. Props: `label`, `helpText`, `error`, `leftIcon`, `rightIcon`, todos los `InputHTMLAttributes`.

**`SearchInput`** — extiende `Input`. Icono Lucide `Search` izquierdo, botón clear (`X`) cuando hay valor, debounce opcional via prop `debounceMs`. `aria-label` requerido.

**`Select`** — versión estilizada de `<select>` nativo (mantiene accesibilidad), con flecha SVG custom (la regla de `index.css:34-41` lo hace ya, pero se mueve al primitivo). Props: `options: { value: string; label: string }[]`, `placeholder`.

**`Textarea`** — extiende `Input` con `rows`, auto-resize opcional.

**`Checkbox`** — `<input type="checkbox">` estilizado con label. Estados: idle, checked, indeterminate, disabled.

**`Modal`** — overlay centrado con backdrop, focus trap, ESC para cerrar, click fuera para cerrar (configurable). Props: `open`, `onClose`, `title`, `size: 'sm' | 'md' | 'lg' | 'xl'`. Renderiza children como cuerpo y opcionalmente acepta slots `header`, `footer`.

**`Drawer`** — panel lateral. Props: `open`, `onClose`, `side: 'right' | 'left'` (default right), `width: number | string` (default 480), `title`, `subtitle`. Mismo focus trap y ESC-close que `Modal`. Animación slide-in 200ms.

**`DataTable<T>`** — wrapper genérico sobre `<table>`. Props: `columns: { key, label, render?, align?, width? }[]`, `data: T[]`, `loading`, `emptyState`, `onRowClick?`, `keyExtractor: (row) => string | number`. Headers con uppercase tracking-wider (patrón actual de `PatientsListPage`). Hover azul claro. Soporta paginación opcional via prop `pagination`.

**`FileUpload`** — drop-zone. Props: `accept` (mime/extensiones), `maxSize` (bytes), `label`, `helperText`, `onUpload: (file: File) => Promise<void>`, `result?: ImportResult` (opcional, renderiza el bloque de resultado integrado). Estados: `idle | dragging | uploading | success | error`. Drag-over visual. `aria-label`.

**`EmptyState`** — icono + título + descripción + acción opcional. Para tabla vacía, lista vacía, error de fetch.

**`Tag`** — pill pequeño para categorías. Variantes: `gray | blue | green | yellow | red`. Tamaño compacto, uppercase opcional via prop.

**`CodePill`** — variante de `Tag` específica para códigos AVIS. Fuente monospace, fondo azul claro, texto azul oscuro. Acepta children (el código numérico).

**`PageHeader`** — título + subtítulo + acciones (botones a la derecha). Para encabezar páginas. Props: `title`, `subtitle?`, `actions?: ReactNode`.

**`Card`** — wrapper con la clase `.card`. Acepta `padding` configurable.

**`Skeleton`** — shimmer placeholder. Props: `width`, `height`, `circle`. Usado durante loading.

### Util `formatters/text.ts`

```typescript
// Mapping para preservar palabras (siglas, unidades, marcas)
const PRESERVE = new Set([
  'mg', 'ml', 'cm', 'mm', 'g', 'kg', 'l', 'µg', 'mcg', 'iu',  // unidades
  'ud', 'pza', 'kit',                                          // empaques
  'avis', 'rayen', 'phmb', 'dacc', 'agho', 'capd',             // siglas
]);

const ACCENT_RECOVERY = new Map([
  ['acido', 'ácido'],
  ['aposito', 'apósito'],
  ['unguento', 'ungüento'],
  ['oftalmico', 'oftálmico'],
  ['topica', 'tópica'],
  ['solucion', 'solución'],
  ['inyeccion', 'inyección'],
  ['inyectable', 'inyectable'],
  ['acetilsalicilico', 'acetilsalicílico'],
  ['polietilenglicol', 'polietilenglicol'],
  ['polihexanida', 'polihexanida'],
  // ... lista completa derivada del catálogo AVIS productivo
]);

export function toSentenceCase(input: string): string {
  if (!input) return '';
  const lower = input.toLowerCase().trim();
  // 1. Tokenizar respetando números y "10x10"
  // 2. Para cada token: si está en PRESERVE, mantener lower; si está en ACCENT_RECOVERY, reemplazar; si es número, mantener
  // 3. Capitalizar solo la primera letra del primer token
  // 4. Re-ensamblar conservando whitespace original
  // ...
}

export function formatCode(code: string): string {
  // Strip "AVIS_QUILPUE:" prefix etc. — devuelve solo el número
  const colonIdx = code.indexOf(':');
  return colonIdx >= 0 ? code.substring(colonIdx + 1) : code;
}
```

Tests exhaustivos: ~30 casos cubriendo todos los tipos de string del catálogo real.

## Backend

### Eliminaciones

- `backend/src/seeds/canasta-mappings.ts` → borrar.
- `CANASTA_MAPPINGS` export → borrar todas las referencias.
- `seedCanastaDefaults` service method y `POST /api/inventory/canasta/seed-defaults` route → borrar.
- Frontend: `seedCanastaDefaults` en `services/api.ts` → borrar.
- `CanastaAdminPage` botón "Aplicar mapeo sugerido" → borrar.

### Nuevo: import del archivo guía

**Endpoint**: `POST /api/inventory/canasta/import` (admin)

**Request**: multipart/form-data
- `file`: `.xlsx` (≤ 5 MB)
- `sheet` (opcional): nombre de hoja, default `"CURACIONES"`

**Parser** (`backend/src/inventory/canasta/canasta-import.service.ts`):

1. Lee la hoja indicada con `xlsx` (lazy import, mismo patrón que `audit-export.service.ts`).
2. Estructura esperada del archivo guía:
   - Filas de encabezado (saltadas)
   - Filas de categoría: columna A = nombre categoría, columna B/C = SI/NO (ignoradas), columna D = `notes` (pistas con códigos AVIS o palabras clave), columna E/F = stock (ignoradas)
   - Sección INSUMOS y AYUDAS_TECNICAS separadas por una fila título
3. Para cada categoría parseada, extrae candidatos de matching desde `notes`:
   - Códigos AVIS explícitos (regex `/\b\d{2,5}\b/g` filtrado contra códigos válidos en BD)
   - Palabras clave (split por `;`, `,`, `|`, normalizadas a minúsculas)
4. Aplica merge inteligente:
   - **Match por `sourceKey`** primero (campo nuevo en `canasta_categories`, columna `source_key VARCHAR(120) NULL`). Cuando el import inserta o actualiza una categoría a partir del archivo guía, escribe `sourceKey = normalize(nombre_original_en_archivo)` (ej: `"aposito_bacteriostatico"`). Match por `sourceKey` igual al normalizado de la fila actual del archivo.
   - Si no hay match por `sourceKey`, **match por nombre** (case-insensitive, normalizado, sin acentos).
   - Si match → UPDATE `notes`, `displayOrder`, `isOptional`, `section`. **No toca `name`** (la enfermera puede haberlo renombrado a propósito).
   - Si no match → INSERT con `sourceKey` poblado.
   - Categorías existentes con `sourceKey` no nulo que ya no aparecen en el archivo → marcar `archived = true` (columna nueva). Categorías con `sourceKey` nulo (creadas manualmente vía CRUD) nunca se archivan automáticamente.
5. Para cada categoría (creada o actualizada), corre matchers contra el catálogo:
   - Match por código AVIS exacto.
   - Match por nombre del producto contra cada palabra clave (`product.name LIKE %keyword%` case-insensitive).
6. Política de asociación:
   - Si la asociación ya existía con `auto_mapped = false` → se preserva.
   - Si existía con `auto_mapped = true` y ya no matchea → se elimina.
   - Si no existía y matchea → se crea con `auto_mapped = true`.

**Response**:
```typescript
{
  categoriesCreated: number;
  categoriesUpdated: number;
  categoriesArchived: number;
  productsAutoMatched: number;
  productsManualPreserved: number;
  errors: { row: number; reason: string }[];
}
```

### Nuevo: CRUD categorías

**Endpoints** (admin):
- `POST /api/inventory/canasta/categories` — crea categoría manual.
  Body: `{ name, section, displayOrder?, isOptional?, notes? }`.
- `PATCH /api/inventory/canasta/categories/:id` — actualiza campos.
  Body: subset de los anteriores.
- `DELETE /api/inventory/canasta/categories/:id` — borra categoría + asociaciones (cascade).
- `GET /api/inventory/canasta/categories` — lista todas (incluyendo archivadas si query `?includeArchived=true`).

Service y controller con tests unitarios.

### Migration

Archivo: `backend/src/migrations/1714320000000-CanastaResetAndAutomappedFlag.ts`

```typescript
export class CanastaResetAndAutomappedFlag1714320000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add columns
    await queryRunner.query(`ALTER TABLE canasta_products ADD COLUMN auto_mapped BOOLEAN NOT NULL DEFAULT FALSE`);
    await queryRunner.query(`ALTER TABLE canasta_categories ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE`);
    await queryRunner.query(`ALTER TABLE canasta_categories ADD COLUMN source_key VARCHAR(120) NULL`);
    await queryRunner.query(`CREATE INDEX IDX_canasta_categories_source_key ON canasta_categories (source_key)`);

    // 2. Drop UNIQUE on display_order (now editable / can repeat during reorder)
    await queryRunner.query(`ALTER TABLE canasta_categories DROP CONSTRAINT IF EXISTS UQ_canasta_categories_display_order`);

    // 3. Wipe existing seed data — fresh start, app waits for archivo guía upload
    await queryRunner.query(`DELETE FROM canasta_products`);
    await queryRunner.query(`DELETE FROM canasta_categories`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Schema rollback only — no automatic re-seed. Restore data from
    // backup-prd-YYYYMMDD-pre-ui-redesign.sql if needed (see "Plan de migración productivo").
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_canasta_categories_source_key`);
    await queryRunner.query(`ALTER TABLE canasta_categories DROP COLUMN source_key`);
    await queryRunner.query(`ALTER TABLE canasta_categories DROP COLUMN archived`);
    await queryRunner.query(`ALTER TABLE canasta_products DROP COLUMN auto_mapped`);
    await queryRunner.query(`ALTER TABLE canasta_categories ADD CONSTRAINT UQ_canasta_categories_display_order UNIQUE (display_order)`);
  }
}
```

**Nota**: el `down()` re-seedea para no romper rollbacks productivos. Si se ejecuta forward y hay datos manuales, se pierden — esto es intencional (fresh start).

**Plan productivo**: dado que producción ya tiene las 14 categorías seedeadas, después del deploy:
1. La migration corre y borra las categorías → app vacía.
2. Marcelo (yo) sube el `CURACIONES.xlsx` actual via endpoint admin manualmente → categorías + auto-asociaciones reaparecen.
3. Las enfermeras curan manualmente lo que falte.

## Frontend — rediseño páginas inventario

### `CatalogAdminPage.tsx`

```tsx
<PageHeader title="Catálogo de productos" subtitle="660 productos · última actualización 2026-04-27" />

<Card>
  <FileUpload
    accept=".xlsx"
    label="Importar catálogo AVIS"
    helperText='Excel .xlsx, hoja "PRODUCTOS AVIS"'
    onUpload={handleImport}
    result={lastImport}
  />
</Card>

<Card>
  <div className="p-5 pb-3">
    <SearchInput
      value={search}
      onChange={setSearch}
      placeholder="Buscar producto por nombre o código…"
      debounceMs={300}
    />
  </div>
  <DataTable
    columns={[
      { key: 'code', label: 'Código', width: 100, render: (p) => <CodePill>{primaryCode(p)}</CodePill> },
      { key: 'name', label: 'Nombre', render: (p) => toSentenceCase(p.name) },
      { key: 'type', label: 'Tipo', width: 140, render: (p) => <Tag>{toSentenceCase(p.type)}</Tag> },
      { key: 'packaging', label: 'Empaque', width: 120, render: (p) => <Tag>{toSentenceCase(p.packaging)}</Tag> },
    ]}
    data={products}
    loading={loading}
    emptyState={<EmptyState icon={Package} title="Sin productos" description="Sube el catálogo AVIS para empezar" />}
    keyExtractor={(p) => p.id}
  />
</Card>
```

### `CanastaAdminPage.tsx`

```tsx
<PageHeader
  title="Canasta CAPD"
  subtitle={`${categories.length} categorías`}
  actions={<Button onClick={openNewCategory} leftIcon={Plus}>Nueva categoría</Button>}
/>

<Card>
  <FileUpload
    accept=".xlsx"
    label="Importar archivo guía de auditoría"
    helperText="Excel .xlsx con las categorías y observaciones de la auditoría"
    onUpload={handleGuideImport}
    result={lastGuideImport}
  />
</Card>

<DataTable
  columns={[
    { key: 'order', label: '#', width: 40, render: (c) => c.displayOrder },
    { key: 'name', label: 'Categoría', render: (c) => <strong>{c.name}</strong> },
    { key: 'section', label: 'Sección', width: 120, render: (c) => <Tag>{c.section}</Tag> },
    { key: 'products', label: 'Productos', width: 100, render: (c) => `${c.products.length}` },
    { key: 'notes', label: 'Observaciones', render: (c) => <span className="text-slate-500 text-xs">{c.notes}</span> },
    { key: 'actions', label: '', width: 200, render: (c) => (
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={() => openEditor(c)}>Editar productos</Button>
        <Button variant="ghost" size="sm" onClick={() => openCategoryEdit(c)}>Editar categoría</Button>
        <Button variant="ghost" size="sm" onClick={() => deleteCategory(c)}>Eliminar</Button>
      </div>
    )},
  ]}
  data={categories}
  keyExtractor={(c) => c.id}
/>

<Drawer open={editingCategoryId !== null} onClose={closeDrawer} title={editingCategory?.name} subtitle="Editar productos asociados">
  <SearchInput value={drawerSearch} onChange={setDrawerSearch} placeholder="Buscar producto…" />
  <div className="counter">{selectedIds.size} de {filteredProducts.length} seleccionados</div>
  <ul>
    {filteredProducts.map((p) => (
      <li><Checkbox checked={selectedIds.has(p.id)} onChange={...} label={toSentenceCase(p.name)} extra={<CodePill>{primaryCode(p)}</CodePill>} /></li>
    ))}
  </ul>
  <DrawerFooter>
    <Button variant="secondary" onClick={closeDrawer}>Cancelar</Button>
    <Button onClick={save}>Guardar cambios</Button>
  </DrawerFooter>
</Drawer>
```

### Otras páginas inventario

`ReceptionPage`, `StockCountPage`, `InventoryListPage`, `AuditExportPage` — rediseñar con primitivos. Cambios mínimos en lógica, focus en sustitución de inputs/botones/tablas crudos por primitivos.

## Migración de páginas existentes

Páginas a barrer y migrar:

| Página | Cambios |
|--------|--------|
| `PatientsListPage` | Sustituir tabla inline por `DataTable`, search inline por `SearchInput`, botones por `Button`. La presentación visual no cambia (es la referencia) — solo extracción a primitivos. |
| `NewPatientPage` | Inputs/labels por `Input` con `label` prop. Selects por `Select`. |
| `PatientDetailPage` | Cards por `Card`. Botones por `Button`. Tabs/modals por primitivos correspondientes. |
| `AppointmentsPage` | Idem. |
| `FichaClinicaPage` | Idem (revisar formularios extensos). |
| `UsuariosPage` (admin) | Tabla por `DataTable`. |
| `AuditLogPage` (admin) | Idem. |
| `LoginPage` | Form inputs por `Input`. |

**Regla de migración**: cero cambios funcionales. Si se descubre un bug durante la migración, se documenta y se aborda en spec separado. Esto evita scope creep.

## Storybook + galería

### Storybook

- Instalar `@storybook/react-vite ^8` en `frontend/package.json` como devDep.
- Config en `frontend/.storybook/`:
  - `main.ts`: stories en `src/components/ui/**/*.stories.tsx`.
  - `preview.ts`: importa `index.css` para que las stories renderen con tokens.
- Cada primitivo tiene `Component.stories.tsx` con todas las variantes documentadas via Controls.
- Script `npm run storybook` en `frontend/package.json` para arrancar local.
- No build estática a CDN por ahora — solo herramienta dev local.

### Galería interna `/dev/ui`

Ruta solo activa cuando `import.meta.env.DEV === true`. Renderiza una página con cada primitivo + variantes en grid. Para validación visual rápida sin tener Storybook abierto.

```tsx
// frontend/src/pages/dev/UiGalleryPage.tsx
{import.meta.env.DEV && <Route path="/dev/ui" element={<UiGalleryPage />} />}
```

## ESLint rule

`frontend/eslint-rules/use-primitives.js` — regla custom que prohíbe en archivos bajo `src/pages/**`:

- `<button>` directo
- `<input type="text">`, `<input type="search">`, `<input type="email">`, etc.
- `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<td>` directos
- `<select>` directo

Mensaje del lint: "Use primitives from `components/ui/` instead. See `docs/superpowers/specs/2026-04-28-inventory-ui-redesign-design.md`."

Whitelist via comentario `// eslint-disable-next-line ui/use-primitives` para casos legítimos (ej. tabla generada server-side, formulario nativo de auth).

Configuración en `frontend/eslint.config.js`:
```javascript
import usePrimitives from './eslint-rules/use-primitives.js';

export default [
  {
    plugins: { ui: { rules: { 'use-primitives': usePrimitives } } },
    rules: { 'ui/use-primitives': 'error' },
  },
];
```

## Tests

### Unit (Vitest + RTL)

Por primitivo (`Component.test.tsx`):
- Renderiza con props default.
- Cada variante renderiza la clase correcta.
- Eventos (click, change) se propagan.
- `forwardRef` funciona donde aplica.
- Accesibilidad básica: `aria-label`, `role`, `disabled`.

Por util (`text.test.ts`):
- ~30 casos de `toSentenceCase` cubriendo el catálogo AVIS real.
- `formatCode` con varios formatos de prefijo.

### Backend

Por servicio nuevo (`canasta-import.service.spec.ts`):
- Parser correcto de hoja CURACIONES con fixture Excel.
- Merge: categoría existente → update; nueva → create; ausente → archive.
- Auto-mapping: códigos explícitos > keywords; respeta `auto_mapped=false`.
- Manejo de errores: hoja inexistente, archivo corrupto, fila malformada.

CRUD (`canasta-categories.controller.spec.ts`):
- POST con datos válidos; rechaza sin admin.
- PATCH parcial.
- DELETE cascadea a `canasta_products`.

### E2E (Playwright)

Suite `inventory-redesign.spec.ts`:
1. Admin sube catálogo AVIS → tabla muestra productos rediseñados (código pill, sentence case).
2. Admin sube archivo guía CURACIONES → categorías aparecen con auto-asociaciones.
3. Admin abre drawer de "Apósitos bacteriostáticos" → buscador filtra → marca un producto manual → guarda.
4. Admin sube archivo guía nuevamente → asociación manual se preserva.
5. Admin crea categoría manual → renombra → elimina.
6. Admin descarga Excel auditable → el archivo refleja las asociaciones actuales.

## CLAUDE.md updates

Agregar al `CLAUDE.md` raíz una sección:

```markdown
## UI Standards

- All new UI must use primitives from `frontend/src/components/ui/`. Do not reinvent
  Button, Input, SearchInput, Modal, Drawer, DataTable, FileUpload, Tag, CodePill, etc.
- For unsupported variants, extend the primitive in `components/ui/`. Do not write
  inline styles in pages.
- Browse the live gallery at `/dev/ui` (development only) to see all primitives.
- Storybook: `cd frontend && npm run storybook`.
- The ESLint rule `ui/use-primitives` enforces this in `src/pages/**`.
- Reference design spec: `docs/superpowers/specs/2026-04-28-inventory-ui-redesign-design.md`.
```

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Migración masiva de páginas introduce regresiones visuales sutiles | Tests visuales con Playwright de los flujos críticos. Validación manual con el companion antes de mergear. |
| `toSentenceCase` rompe nombres médicos por casos no previstos | Tests exhaustivos derivados del catálogo real (~30 casos). Lista `PRESERVE` y `ACCENT_RECOVERY` editable sin redeploy si surge un caso. |
| Enfermera renombra una categoría y al re-importar guía se duplica | Mitigado vía `sourceKey` (estable en BD aunque cambie `name`). Si el archivo guía mismo cambia el wording de la categoría, el match cae al nombre normalizado sin acentos. Caso residual: renombre en archivo guía + renombre manual en BD para la misma fila. Documentar en CLAUDE.md: "renombrar categorías es seguro, el sistema preserva la fuente; si la auditora también renombra, podría duplicarse — borrar manualmente la duplicada". |
| Migration borra producción por error | `down()` re-seedea las 14 categorías originales. Backup de BD antes del deploy productivo (tipo `backup-prd-YYYYMMDD-pre-canasta-reset.sql`). |
| Tras el deploy, las enfermeras ven la canasta vacía y no entienden | Marcelo (yo) sube el archivo guía vía endpoint admin inmediatamente después del deploy productivo. Notificar al equipo antes. |
| ESLint rule custom bloquea casos legítimos | Whitelist via comentario de disable. Documentar excepciones permitidas en CLAUDE.md. |
| Storybook 8 trae deps pesadas | Solo devDependency. CI no lo instala (script aparte). |

## Criterios de aceptación

- [ ] `frontend/src/components/ui/` contiene los 16 primitivos listados, todos con tests unitarios pasando.
- [ ] `formatters/text.ts` existe con `toSentenceCase` y `formatCode`, tests verdes para los ~30 casos del catálogo real.
- [ ] `canasta-mappings.ts` y todas sus referencias eliminadas. `git grep -i "CANASTA_MAPPINGS\|seedCanastaDefaults"` retorna vacío.
- [ ] Migration `1714320000000-CanastaResetAndAutomappedFlag` corre limpia en local y staging. Tablas `canasta_categories` y `canasta_products` quedan vacías.
- [ ] Endpoint `POST /api/inventory/canasta/import` parsea fixture del CURACIONES.xlsx real, crea categorías + auto-asocia productos, conserva asociaciones manuales en re-upload.
- [ ] Endpoints CRUD `POST/PATCH/DELETE /api/inventory/canasta/categories` funcionan con tests.
- [ ] Las 6 páginas de `/inventory/*` rediseñadas usando exclusivamente primitivos.
- [ ] Las 8+ páginas existentes (Pacientes, NewPatient, etc.) migradas a primitivos sin cambios funcionales.
- [ ] Storybook arranca con `npm run storybook` y muestra todas las stories.
- [ ] Galería `/dev/ui` accesible en dev y muestra todos los primitivos.
- [ ] ESLint rule `ui/use-primitives` activa, falla CI si alguien introduce `<button>` directo en `src/pages/**`.
- [ ] Sección "UI Standards" agregada al `CLAUDE.md` raíz.
- [ ] Tests Playwright e2e del flujo completo (subir catálogo → subir guía → editar drawer → exportar) en verde.
- [ ] Visual sanity check: las páginas rediseñadas se ven coherentes con `PatientsListPage`.

## Plan de migración productivo

Orden de deploy:

1. Merge a `main`, CI verde.
2. Render despliega backend → migration corre → canasta queda vacía.
3. Render despliega frontend.
4. Marcelo sube `CURACIONES.xlsx` a producción via endpoint admin.
5. Marcelo verifica que las categorías y auto-asociaciones aparecen.
6. Notificar al equipo (enfermeras) que pueden curar manualmente.

Backup productivo previo: `pg_dump` antes del paso 1, archivar como `backup-prd-YYYYMMDD-pre-ui-redesign.sql`.

## Out of scope (specs futuros)

- Solicitudes de restock mensuales (módulo nuevo).
- Llenado automático de columnas E/F del Excel auditable.
- Notificaciones in-app de productos por vencer.
- Decremento automático de stock por curación.
- Integración de código RAYEN para otras comunas.
- Dashboard de inventario.
- Mobile-first redesign (la app es responsive básica; rediseño completo mobile pendiente).

## Notas de implementación

- **Mantener fidelidad con BD**: los nombres de productos en BD siguen en MAYÚSCULAS (cómo vienen del Excel AVIS). Solo el display los normaliza. Esto preserva la auditabilidad del catálogo importado.
- **Code system display preference**: por ahora hardcodeado `'AVIS_QUILPUE'` como sistema primario. Cuando llegue una segunda comuna, se hace setting por usuario/cesfam (out of scope acá).
- **Drawer y Modal comparten focus trap**: extraer a hook `useFocusTrap` reutilizable.
- **`DataTable` no implementa virtualización**: con 660 productos como límite máximo realista, scroll nativo es suficiente. Si la lista crece a 5k+, considerar `@tanstack/react-virtual`.
