# Plan A — Design System & UI Primitives

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish `frontend/src/components/ui/` with 16 typed, tested React primitives, design tokens, text formatters, Storybook 8, an in-app gallery at `/dev/ui`, and an advisory ESLint rule, so subsequent plans (B/C/D) can consume and enforce them.

**Architecture:**
- Tokens: CSS custom properties in `frontend/src/index.css` extending the existing utility classes (`.card`, `.btn-*`, `.form-control`).
- Components: function components with TypeScript strict mode; styling via `cn()` helper (clsx + tailwind-merge); ARIA attributes baked in.
- Tests: Vitest + RTL, colocated `Component.test.tsx`. Stories colocated `Component.stories.tsx`.
- Gallery: dev-only route `/dev/ui` rendering all primitives; Storybook for richer docs.
- ESLint: custom rule `ui/use-primitives` set to `warn` in this plan; promoted to `error` in Plan D once migrations land.

**Tech Stack:** React 19, TypeScript 5.9, Tailwind CSS 4, Vite 7, Vitest 4, React Testing Library, Storybook 8 (Vite builder), ESLint 9 (flat config).

**Spec reference:** `docs/superpowers/specs/2026-04-28-inventory-ui-redesign-design.md`

**Branch:** `feat/inventory-ui-redesign` (already checked out, spec already committed at `997fee3`).

---

## File structure produced by this plan

```
frontend/
├── .storybook/
│   ├── main.ts
│   └── preview.ts
├── eslint-rules/
│   └── use-primitives.js
├── eslint.config.js                     (modified)
├── package.json                         (modified)
├── src/
│   ├── App.tsx                          (modified — register /dev/ui route)
│   ├── index.css                        (modified — design tokens)
│   ├── lib/
│   │   └── cn.ts                        (new)
│   ├── formatters/
│   │   ├── text.ts                      (new)
│   │   └── text.test.ts                 (new)
│   ├── hooks/
│   │   └── useFocusTrap.ts              (new)
│   ├── components/
│   │   └── ui/
│   │       ├── Button.tsx + .test.tsx + .stories.tsx
│   │       ├── Input.tsx + .test.tsx + .stories.tsx
│   │       ├── SearchInput.tsx + ...
│   │       ├── Select.tsx + ...
│   │       ├── Textarea.tsx + ...
│   │       ├── Checkbox.tsx + ...
│   │       ├── Modal.tsx + ...
│   │       ├── Drawer.tsx + ...
│   │       ├── DataTable.tsx + ...
│   │       ├── FileUpload.tsx + ...
│   │       ├── EmptyState.tsx + ...
│   │       ├── Tag.tsx + ...
│   │       ├── CodePill.tsx + ...
│   │       ├── PageHeader.tsx + ...
│   │       ├── Card.tsx + ...
│   │       ├── Skeleton.tsx + ...
│   │       └── index.ts                 (barrel)
│   └── pages/
│       └── dev/
│           └── UiGalleryPage.tsx        (new)
└── CLAUDE.md                            (modified — UI Standards section)
```

---

## Conventions used by every primitive task

Every primitive task has the same shape (test → fail → implement → pass → story → commit). Code blocks are full files, never abridged. Tailwind classes use the existing palette in `index.css`. ARIA attributes are mandatory.

**Commit message convention:** `feat(ui): add <Component> primitive` or `chore(ui): <action>`.

---

## Phase 1 — Foundation

### Task 1: Install runtime helper deps (clsx + tailwind-merge)

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install dependencies**

```bash
cd frontend && npm install clsx tailwind-merge
```

Expected: `package.json` shows `clsx` and `tailwind-merge` under `dependencies`. `package-lock.json` updated.

- [ ] **Step 2: Verify install**

```bash
cd frontend && npm ls clsx tailwind-merge
```

Expected: both packages listed at the top level with their versions, no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(ui): add clsx + tailwind-merge for cn() helper"
```

---

### Task 2: Add `cn()` utility

**Files:**
- Create: `frontend/src/lib/cn.ts`
- Create: `frontend/src/lib/cn.test.ts`

- [ ] **Step 1: Write the failing test**

`frontend/src/lib/cn.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('skips falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });

  it('resolves Tailwind conflicts (later wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('handles conditional objects', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/lib/cn.test.ts
```

Expected: FAIL — `Cannot find module './cn'`.

- [ ] **Step 3: Implement `cn`**

`frontend/src/lib/cn.ts`:

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/lib/cn.test.ts
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/cn.ts frontend/src/lib/cn.test.ts
git commit -m "feat(ui): add cn() helper for class merging"
```

---

### Task 3: Add design tokens to `index.css`

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Append tokens block**

Append to the end of `frontend/src/index.css` (preserve existing rules above):

```css
/* Design tokens */
:root {
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;

  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;

  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);

  --z-overlay: 40;
  --z-modal: 50;
  --z-toast: 60;
}
```

- [ ] **Step 2: Verify build still succeeds**

```bash
cd frontend && npm run build
```

Expected: `tsc -b && vite build` exits 0. CSS file in `dist/` contains the new custom properties.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(ui): add design tokens (spacing, radius, shadow, z-index)"
```

---

### Task 4: `formatters/text.ts` with `toSentenceCase` and `formatCode`

**Files:**
- Create: `frontend/src/formatters/text.ts`
- Create: `frontend/src/formatters/text.test.ts`

- [ ] **Step 1: Write failing tests** (covers preservations, accent recovery, code stripping)

`frontend/src/formatters/text.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { formatCode, toSentenceCase } from './text';

describe('toSentenceCase', () => {
  it('lowercases input and capitalizes first letter', () => {
    expect(toSentenceCase('HELLO WORLD')).toBe('Hello world');
  });

  it('preserves units in lowercase (mg, ml, cm, g, kg, l, mm)', () => {
    expect(toSentenceCase('ACETAZOLAMIDA 250 MG COMPRIMIDO')).toBe('Acetazolamida 250 mg comprimido');
    expect(toSentenceCase('ACICLOVIR 200 MG/5 ML JARABE')).toBe('Aciclovir 200 mg/5 ml jarabe');
  });

  it('preserves known acronyms (UD, AVIS, PHMB, DACC, AGHO, CAPD)', () => {
    expect(toSentenceCase('APOSITO RINGER CON PHMB 10X10 CM UD')).toBe('Apósito ringer con PHMB 10×10 cm UD');
    expect(toSentenceCase('LAMINA DACC 7X9 CM')).toBe('Lámina DACC 7×9 cm');
  });

  it('recovers Spanish accents on common medical words', () => {
    expect(toSentenceCase('ACIDO FOLICO 1 MG')).toBe('Ácido fólico 1 mg');
    expect(toSentenceCase('CREMA TOPICA')).toBe('Crema tópica');
    expect(toSentenceCase('SOLUCION INYECTABLE')).toBe('Solución inyectable');
    expect(toSentenceCase('UNGUENTO OFTALMICO')).toBe('Ungüento oftálmico');
    expect(toSentenceCase('ACIDO ACETILSALICILICO')).toBe('Ácido acetilsalicílico');
  });

  it('replaces lowercase x between digits with × (multiplication sign)', () => {
    expect(toSentenceCase('GASA 10X10')).toBe('Gasa 10×10');
    expect(toSentenceCase('GASA 5X5 CM')).toBe('Gasa 5×5 cm');
  });

  it('handles percentages', () => {
    expect(toSentenceCase('ACICLOVIR 5 % CREMA TOPICA')).toBe('Aciclovir 5 % crema tópica');
  });

  it('returns empty string for empty input', () => {
    expect(toSentenceCase('')).toBe('');
    expect(toSentenceCase('   ')).toBe('');
  });

  it('handles already-cased input', () => {
    expect(toSentenceCase('Hello world')).toBe('Hello world');
  });
});

describe('formatCode', () => {
  it('strips system prefix (AVIS_QUILPUE:)', () => {
    expect(formatCode('AVIS_QUILPUE:1408')).toBe('1408');
  });

  it('returns input unchanged when no colon', () => {
    expect(formatCode('1408')).toBe('1408');
  });

  it('handles future RAYEN-style prefixes', () => {
    expect(formatCode('RAYEN_VINA:99')).toBe('99');
  });

  it('returns empty string for empty input', () => {
    expect(formatCode('')).toBe('');
  });
});
```

- [ ] **Step 2: Run tests, verify FAIL**

```bash
cd frontend && npx vitest run src/formatters/text.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `formatters/text.ts`**

`frontend/src/formatters/text.ts`:

```typescript
const PRESERVE_LOWER = new Set([
  'mg', 'ml', 'cm', 'mm', 'g', 'kg', 'l', 'µg', 'mcg', 'iu',
]);

const PRESERVE_UPPER = new Set([
  'UD', 'PZA', 'KIT', 'AVIS', 'RAYEN', 'PHMB', 'DACC', 'AGHO', 'CAPD',
]);

const ACCENT_RECOVERY = new Map<string, string>([
  ['acido', 'ácido'],
  ['acidos', 'ácidos'],
  ['aposito', 'apósito'],
  ['apositos', 'apósitos'],
  ['unguento', 'ungüento'],
  ['oftalmico', 'oftálmico'],
  ['oftalmica', 'oftálmica'],
  ['topica', 'tópica'],
  ['topico', 'tópico'],
  ['solucion', 'solución'],
  ['inyeccion', 'inyección'],
  ['inyectable', 'inyectable'],
  ['acetilsalicilico', 'acetilsalicílico'],
  ['folico', 'fólico'],
  ['folica', 'fólica'],
  ['lamina', 'lámina'],
  ['laminas', 'láminas'],
  ['polietilenglicol', 'polietilenglicol'],
  ['polihexanida', 'polihexanida'],
  ['hidrofila', 'hidrófila'],
  ['hidrogel', 'hidrogel'],
  ['carboximetilcelulosa', 'carboximetilcelulosa'],
  ['proteasa', 'proteasa'],
  ['metaloproteasa', 'metaloproteasa'],
  ['nylon', 'nylon'],
]);

const TOKEN_RE = /([0-9]+(?:[.,][0-9]+)?|[a-záéíóúñü]+|%|\/|×|x(?=\d)|[^\sa-z0-9])/giu;

export function toSentenceCase(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (!trimmed) return '';

  const tokens: string[] = [];
  let firstWordCapitalized = false;

  // Split preserving whitespace as single spaces
  const parts = trimmed.split(/(\s+)/);

  for (const part of parts) {
    if (/^\s+$/.test(part)) {
      tokens.push(' ');
      continue;
    }

    // Replace digits×digits (case insensitive) — handle 10X10, 5x5
    const xReplaced = part.replace(/(\d)[xX](\d)/g, '$1×$2');

    // Sub-token logic for things like "5%" or "10×10"
    const upper = xReplaced.toUpperCase();
    const lower = xReplaced.toLowerCase();

    if (PRESERVE_UPPER.has(upper)) {
      tokens.push(upper);
    } else if (PRESERVE_LOWER.has(lower)) {
      tokens.push(lower);
    } else if (ACCENT_RECOVERY.has(lower)) {
      const recovered = ACCENT_RECOVERY.get(lower)!;
      if (!firstWordCapitalized) {
        tokens.push(recovered.charAt(0).toUpperCase() + recovered.slice(1));
        firstWordCapitalized = true;
      } else {
        tokens.push(recovered);
      }
    } else if (/^[0-9]/.test(xReplaced) || /^[%\/×]/.test(xReplaced)) {
      tokens.push(xReplaced);
    } else {
      const cased = !firstWordCapitalized
        ? lower.charAt(0).toUpperCase() + lower.slice(1)
        : lower;
      if (/[a-záéíóúñü]/.test(cased)) firstWordCapitalized = true;
      tokens.push(cased);
    }
  }

  return tokens.join('').replace(/\s+/g, ' ');
}

export function formatCode(code: string): string {
  if (!code) return '';
  const colonIdx = code.indexOf(':');
  return colonIdx >= 0 ? code.substring(colonIdx + 1) : code;
}
```

- [ ] **Step 4: Run tests, verify PASS**

```bash
cd frontend && npx vitest run src/formatters/text.test.ts
```

Expected: PASS — all describes green. If any individual case fails (e.g., "Acetazolamida 250 mg comprimido" comes out wrong), tweak the implementation; the tests are the source of truth.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/formatters/text.ts frontend/src/formatters/text.test.ts
git commit -m "feat(ui): add toSentenceCase and formatCode formatters"
```

---

## Phase 2 — Storybook setup

### Task 5: Install Storybook 8 + Vite builder

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Run Storybook init**

```bash
cd frontend && npx storybook@^8 init --type react --builder vite --yes
```

Expected: installs `@storybook/react-vite`, `@storybook/addon-essentials` (or v8 equivalents), creates `.storybook/main.ts`, `.storybook/preview.ts`, adds `storybook` and `build-storybook` scripts.

- [ ] **Step 2: Verify scripts exist**

```bash
cd frontend && grep -E '"storybook"|"build-storybook"' package.json
```

Expected: both scripts present.

- [ ] **Step 3: Delete the demo stories Storybook generated**

```bash
rm -rf frontend/src/stories
```

(Storybook init creates demo stories in `src/stories`. We don't want them — we'll write our own colocated to each primitive.)

- [ ] **Step 4: Commit init**

```bash
git add frontend/package.json frontend/package-lock.json frontend/.storybook/ ':!frontend/src/stories/'
git commit -m "chore(ui): install Storybook 8 with Vite builder"
```

---

### Task 6: Configure Storybook to load primitives' stories and import `index.css`

**Files:**
- Modify: `frontend/.storybook/main.ts`
- Modify: `frontend/.storybook/preview.ts`

- [ ] **Step 1: Update `main.ts`**

`frontend/.storybook/main.ts` (replace whatever the init wrote with this):

```typescript
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/components/ui/**/*.stories.@(ts|tsx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-links',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: { autodocs: 'tag' },
  typescript: { reactDocgen: 'react-docgen-typescript' },
};

export default config;
```

- [ ] **Step 2: Update `preview.ts`**

`frontend/.storybook/preview.ts`:

```typescript
import type { Preview } from '@storybook/react';
import '../src/index.css';

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#f1f5f9' },
        { name: 'dark', value: '#020617' },
      ],
    },
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
  },
};

export default preview;
```

- [ ] **Step 3: Commit**

```bash
git add frontend/.storybook/main.ts frontend/.storybook/preview.ts
git commit -m "chore(ui): configure Storybook to load components/ui/**/*.stories"
```

---

## Phase 3 — Primitives

> Each primitive uses the same TDD pattern: write failing test → confirm fail → implement → confirm pass → write story → commit. Each commit message: `feat(ui): add <Component> primitive`.

### Task 7: `Button` primitive

**Files:**
- Create: `frontend/src/components/ui/Button.tsx`
- Create: `frontend/src/components/ui/Button.test.tsx`
- Create: `frontend/src/components/ui/Button.stories.tsx`

- [ ] **Step 1: Write failing test**

`frontend/src/components/ui/Button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('<Button>', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('fires onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('applies variant=primary by default', () => {
    render(<Button>Default</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-blue-600');
  });

  it('applies variant=secondary classes', () => {
    render(<Button variant="secondary">x</Button>);
    expect(screen.getByRole('button')).toHaveClass('border-slate-200');
  });

  it('applies variant=danger', () => {
    render(<Button variant="danger">x</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-rose-600');
  });

  it('disables and prevents click when disabled', async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>x</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows loading state and disables clicks', async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('forwards ref to underlying button', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>x</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('renders as anchor when as="a" with href', () => {
    render(<Button as="a" href="/foo">link</Button>);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/foo');
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
cd frontend && npx vitest run src/components/ui/Button.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `Button.tsx`**

`frontend/src/components/ui/Button.tsx`:

```tsx
import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children?: ReactNode;
}

type ButtonAsButton = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { as?: 'button' };
type ButtonAsAnchor = CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { as: 'a'; href: string };

export type ButtonProps = ButtonAsButton | ButtonAsAnchor;

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
  secondary:
    'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 active:bg-slate-100 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800',
  ghost:
    'text-slate-700 hover:bg-slate-100 active:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800',
  link: 'text-blue-600 hover:text-blue-700 underline underline-offset-2',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-5 py-3 text-base gap-2',
};

const BASE_CLASSES =
  'inline-flex items-center justify-center rounded-lg font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

export const Button = forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  function Button(props, ref) {
    const {
      variant = 'primary',
      size = 'md',
      loading,
      leftIcon,
      rightIcon,
      children,
      className,
      ...rest
    } = props as ButtonProps & { className?: string };

    const classes = cn(
      BASE_CLASSES,
      VARIANT_CLASSES[variant],
      SIZE_CLASSES[size],
      className,
    );

    const inner = (
      <>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : leftIcon}
        {children}
        {!loading && rightIcon}
      </>
    );

    if ((rest as { as?: string }).as === 'a') {
      const { as: _as, ...anchorProps } = rest as AnchorHTMLAttributes<HTMLAnchorElement> & { as: 'a' };
      return (
        <a
          {...anchorProps}
          ref={ref as React.Ref<HTMLAnchorElement>}
          className={classes}
          aria-busy={loading || undefined}
        >
          {inner}
        </a>
      );
    }

    const { as: _as, disabled, ...buttonProps } = rest as ButtonHTMLAttributes<HTMLButtonElement> & { as?: 'button' };
    return (
      <button
        {...buttonProps}
        ref={ref as React.Ref<HTMLButtonElement>}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
      >
        {inner}
      </button>
    );
  },
);
```

- [ ] **Step 4: Run test, verify PASS**

```bash
cd frontend && npx vitest run src/components/ui/Button.test.tsx
```

Expected: PASS — 9 tests green.

- [ ] **Step 5: Write Storybook story**

`frontend/src/components/ui/Button.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Plus, Save } from 'lucide-react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'danger', 'success', 'ghost', 'link'] },
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
  },
};
export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { children: 'Guardar', variant: 'primary' } };
export const Secondary: Story = { args: { children: 'Cancelar', variant: 'secondary' } };
export const Danger: Story = { args: { children: 'Eliminar', variant: 'danger' } };
export const Success: Story = { args: { children: 'Confirmar', variant: 'success' } };
export const Ghost: Story = { args: { children: 'Más opciones', variant: 'ghost' } };
export const Link: Story = { args: { children: 'Ver detalle', variant: 'link' } };

export const WithLeftIcon: Story = { args: { children: 'Nuevo', leftIcon: <Plus className="w-4 h-4" /> } };
export const Loading: Story = { args: { children: 'Guardando…', loading: true, leftIcon: <Save className="w-4 h-4" /> } };
export const Disabled: Story = { args: { children: 'Deshabilitado', disabled: true } };

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/Button.tsx frontend/src/components/ui/Button.test.tsx frontend/src/components/ui/Button.stories.tsx
git commit -m "feat(ui): add Button primitive"
```

---

### Task 8: `Input` primitive

**Files:**
- Create: `frontend/src/components/ui/Input.tsx`
- Create: `frontend/src/components/ui/Input.test.tsx`
- Create: `frontend/src/components/ui/Input.stories.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Input } from './Input';

describe('<Input>', () => {
  it('renders with label', () => {
    render(<Input label="Nombre" />);
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument();
  });

  it('shows help text', () => {
    render(<Input label="Edad" helpText="En años" />);
    expect(screen.getByText('En años')).toBeInTheDocument();
  });

  it('shows error and applies error class', () => {
    render(<Input label="RUT" error="Inválido" />);
    expect(screen.getByText('Inválido')).toBeInTheDocument();
    const input = screen.getByLabelText('RUT');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.className).toMatch(/border-rose/);
  });

  it('forwards onChange events', async () => {
    const onChange = vi.fn();
    render(<Input label="X" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('X'), 'hi');
    expect(onChange).toHaveBeenCalled();
  });

  it('forwards ref', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<Input label="X" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('renders left and right icons', () => {
    render(
      <Input
        label="Buscar"
        leftIcon={<span data-testid="li">L</span>}
        rightIcon={<span data-testid="ri">R</span>}
      />,
    );
    expect(screen.getByTestId('li')).toBeInTheDocument();
    expect(screen.getByTestId('ri')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
cd frontend && npx vitest run src/components/ui/Input.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `Input.tsx`**

```tsx
import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  helpText?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const BASE =
  'w-full rounded-lg border bg-white text-slate-900 placeholder:text-slate-400 ' +
  'px-3.5 py-2.5 text-sm outline-none transition-all ' +
  'focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500';

const NORMAL = 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600';
const INVALID = 'border-rose-400 focus:ring-rose-500/20 focus:border-rose-500';

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, helpText, error, leftIcon, rightIcon, className, id, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;

  const padLeft = leftIcon ? 'pl-9' : '';
  const padRight = rightIcon ? 'pr-9' : '';

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            {leftIcon}
          </span>
        )}
        <input
          {...rest}
          id={inputId}
          ref={ref}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : helpText ? helpId : undefined}
          className={cn(BASE, error ? INVALID : NORMAL, padLeft, padRight, className)}
        />
        {rightIcon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
            {rightIcon}
          </span>
        )}
      </div>
      {error ? (
        <p id={errorId} className="text-xs text-rose-600 mt-1">{error}</p>
      ) : helpText ? (
        <p id={helpId} className="text-xs text-slate-500 mt-1">{helpText}</p>
      ) : null}
    </div>
  );
});
```

- [ ] **Step 4: Run test, verify PASS**

```bash
cd frontend && npx vitest run src/components/ui/Input.test.tsx
```

- [ ] **Step 5: Storybook story**

`frontend/src/components/ui/Input.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Mail, Search } from 'lucide-react';
import { Input } from './Input';

const meta: Meta<typeof Input> = {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = { args: { label: 'Nombre', placeholder: 'Juan Pérez' } };
export const WithHelpText: Story = { args: { label: 'RUT', placeholder: '12.345.678-9', helpText: 'Sin puntos ni guión' } };
export const WithError: Story = { args: { label: 'RUT', error: 'RUT inválido', value: '123' } };
export const WithLeftIcon: Story = { args: { label: 'Email', placeholder: 'tu@email.com', leftIcon: <Mail className="w-4 h-4" /> } };
export const WithRightIcon: Story = { args: { label: 'Buscar', placeholder: '…', rightIcon: <Search className="w-4 h-4" /> } };
export const Disabled: Story = { args: { label: 'Bloqueado', disabled: true, value: 'No editable' } };
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/Input.tsx frontend/src/components/ui/Input.test.tsx frontend/src/components/ui/Input.stories.tsx
git commit -m "feat(ui): add Input primitive"
```

---

### Task 9: `SearchInput` primitive (built on Input)

**Files:**
- Create: `frontend/src/components/ui/SearchInput.tsx`
- Create: `frontend/src/components/ui/SearchInput.test.tsx`
- Create: `frontend/src/components/ui/SearchInput.stories.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SearchInput } from './SearchInput';

describe('<SearchInput>', () => {
  it('renders with placeholder and search icon', () => {
    render(<SearchInput value="" onChange={() => {}} placeholder="Buscar…" />);
    expect(screen.getByPlaceholderText('Buscar…')).toBeInTheDocument();
  });

  it('fires onChange with new value', async () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} placeholder="x" />);
    await userEvent.type(screen.getByPlaceholderText('x'), 'h');
    expect(onChange).toHaveBeenCalledWith('h');
  });

  it('shows clear button when value is non-empty', () => {
    render(<SearchInput value="hello" onChange={() => {}} placeholder="x" />);
    expect(screen.getByRole('button', { name: /limpiar/i })).toBeInTheDocument();
  });

  it('hides clear button when value is empty', () => {
    render(<SearchInput value="" onChange={() => {}} placeholder="x" />);
    expect(screen.queryByRole('button', { name: /limpiar/i })).not.toBeInTheDocument();
  });

  it('clears value when clear button clicked', async () => {
    const onChange = vi.fn();
    render(<SearchInput value="hello" onChange={onChange} placeholder="x" />);
    await userEvent.click(screen.getByRole('button', { name: /limpiar/i }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

```bash
cd frontend && npx vitest run src/components/ui/SearchInput.test.tsx
```

- [ ] **Step 3: Implement**

```tsx
import { Search, X } from 'lucide-react';
import { Input } from './Input';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  'aria-label'?: string;
  className?: string;
  autoFocus?: boolean;
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  'aria-label': ariaLabel,
  className,
  autoFocus,
}: SearchInputProps) {
  return (
    <Input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel ?? placeholder ?? 'Buscar'}
      autoFocus={autoFocus}
      className={className}
      leftIcon={<Search className="w-4 h-4" />}
      rightIcon={
        value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Limpiar búsqueda"
            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 -mr-1 pointer-events-auto cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        ) : undefined
      }
    />
  );
}
```

- [ ] **Step 4: Run test, verify PASS**

```bash
cd frontend && npx vitest run src/components/ui/SearchInput.test.tsx
```

- [ ] **Step 5: Storybook story**

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { SearchInput } from './SearchInput';

const meta: Meta<typeof SearchInput> = { title: 'UI/SearchInput', component: SearchInput, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof SearchInput>;

export const Default: Story = {
  render: () => {
    const [v, setV] = useState('');
    return <div className="w-96"><SearchInput value={v} onChange={setV} placeholder="Buscar pacientes…" /></div>;
  },
};

export const WithValue: Story = {
  render: () => {
    const [v, setV] = useState('Juan Pérez');
    return <div className="w-96"><SearchInput value={v} onChange={setV} placeholder="Buscar…" /></div>;
  },
};
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/SearchInput.tsx frontend/src/components/ui/SearchInput.test.tsx frontend/src/components/ui/SearchInput.stories.tsx
git commit -m "feat(ui): add SearchInput primitive"
```

---

### Task 10: `Select` primitive

**Files:**
- Create: `frontend/src/components/ui/Select.tsx`
- Create: `frontend/src/components/ui/Select.test.tsx`
- Create: `frontend/src/components/ui/Select.stories.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Select } from './Select';

describe('<Select>', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ];

  it('renders label and options', () => {
    render(<Select label="Letra" options={options} value="" onChange={() => {}} />);
    expect(screen.getByLabelText('Letra')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument();
  });

  it('fires onChange with new value', async () => {
    const onChange = vi.fn();
    render(<Select label="Letra" options={options} value="" onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText('Letra'), 'b');
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('shows placeholder option when provided', () => {
    render(<Select label="x" options={options} value="" onChange={() => {}} placeholder="Selecciona" />);
    expect(screen.getByRole('option', { name: 'Selecciona' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

- [ ] **Step 3: Implement**

```tsx
import { useId } from 'react';
import { cn } from '../../lib/cn';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  helpText?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

const BASE =
  'w-full appearance-none rounded-lg border bg-white text-slate-900 ' +
  'px-3.5 py-2.5 pr-10 text-sm outline-none transition-all ' +
  'focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'dark:bg-slate-800 dark:text-slate-200 ' +
  "bg-[url('data:image/svg+xml,%3csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20fill=%22none%22%20viewBox=%220%200%2020%2020%22%3e%3cpath%20stroke=%22%2394a3b8%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22%20stroke-width=%221.5%22%20d=%22M6%208l4%204%204-4%22/%3e%3c/svg%3e')] " +
  'bg-[length:1.5em_1.5em] bg-no-repeat bg-[position:right_0.5rem_center]';

const NORMAL = 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600';
const INVALID = 'border-rose-400 focus:ring-rose-500/20 focus:border-rose-500';

export function Select({
  options,
  value,
  onChange,
  label,
  placeholder,
  helpText,
  error,
  disabled,
  className,
  id,
}: SelectProps) {
  const genId = useId();
  const selectId = id ?? genId;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
          {label}
        </label>
      )}
      <select
        id={selectId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={error ? 'true' : undefined}
        className={cn(BASE, error ? INVALID : NORMAL, className)}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? (
        <p className="text-xs text-rose-600 mt-1">{error}</p>
      ) : helpText ? (
        <p className="text-xs text-slate-500 mt-1">{helpText}</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run test, verify PASS**

- [ ] **Step 5: Story**

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Select } from './Select';

const meta: Meta<typeof Select> = { title: 'UI/Select', component: Select, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof Select>;

const options = [
  { value: 'femenino', label: 'Femenino' },
  { value: 'masculino', label: 'Masculino' },
];

export const Default: Story = {
  render: () => {
    const [v, setV] = useState('');
    return <div className="w-64"><Select label="Género" options={options} value={v} onChange={setV} placeholder="Todos" /></div>;
  },
};
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/Select.tsx frontend/src/components/ui/Select.test.tsx frontend/src/components/ui/Select.stories.tsx
git commit -m "feat(ui): add Select primitive"
```

---

### Task 11: `Textarea` primitive

**Files:**
- Create: `frontend/src/components/ui/Textarea.tsx`
- Create: `frontend/src/components/ui/Textarea.test.tsx`
- Create: `frontend/src/components/ui/Textarea.stories.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Textarea } from './Textarea';

describe('<Textarea>', () => {
  it('renders with label', () => {
    render(<Textarea label="Notas" />);
    expect(screen.getByLabelText('Notas')).toBeInTheDocument();
  });

  it('forwards onChange', async () => {
    const onChange = vi.fn();
    render(<Textarea label="x" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('x'), 'h');
    expect(onChange).toHaveBeenCalled();
  });

  it('shows error', () => {
    render(<Textarea label="x" error="Requerido" />);
    expect(screen.getByText('Requerido')).toBeInTheDocument();
    expect(screen.getByLabelText('x')).toHaveAttribute('aria-invalid', 'true');
  });

  it('respects rows prop', () => {
    render(<Textarea label="x" rows={6} />);
    expect(screen.getByLabelText('x')).toHaveAttribute('rows', '6');
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```tsx
import { forwardRef, useId } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helpText?: string;
  error?: string;
}

const BASE =
  'w-full rounded-lg border bg-white text-slate-900 placeholder:text-slate-400 ' +
  'px-3.5 py-2.5 text-sm outline-none transition-all resize-y min-h-[5rem] ' +
  'focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500';

const NORMAL = 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600';
const INVALID = 'border-rose-400 focus:ring-rose-500/20 focus:border-rose-500';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, helpText, error, className, id, rows = 4, ...rest },
  ref,
) {
  const genId = useId();
  const textareaId = id ?? genId;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={textareaId} className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
          {label}
        </label>
      )}
      <textarea
        {...rest}
        id={textareaId}
        ref={ref}
        rows={rows}
        aria-invalid={error ? 'true' : undefined}
        className={cn(BASE, error ? INVALID : NORMAL, className)}
      />
      {error ? (
        <p className="text-xs text-rose-600 mt-1">{error}</p>
      ) : helpText ? (
        <p className="text-xs text-slate-500 mt-1">{helpText}</p>
      ) : null}
    </div>
  );
});
```

- [ ] **Step 4: Run, verify PASS**

- [ ] **Step 5: Story**

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Textarea } from './Textarea';

const meta: Meta<typeof Textarea> = { title: 'UI/Textarea', component: Textarea, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = { args: { label: 'Observaciones', placeholder: 'Detalles…' } };
export const WithError: Story = { args: { label: 'Observaciones', error: 'Mínimo 10 caracteres' } };
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/Textarea.tsx frontend/src/components/ui/Textarea.test.tsx frontend/src/components/ui/Textarea.stories.tsx
git commit -m "feat(ui): add Textarea primitive"
```

---

### Task 12: `Checkbox` primitive

**Files:**
- Create: `frontend/src/components/ui/Checkbox.tsx`
- Create: `frontend/src/components/ui/Checkbox.test.tsx`
- Create: `frontend/src/components/ui/Checkbox.stories.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './Checkbox';

describe('<Checkbox>', () => {
  it('renders label', () => {
    render(<Checkbox label="Acepto" />);
    expect(screen.getByLabelText('Acepto')).toBeInTheDocument();
  });

  it('toggles on click', async () => {
    const onChange = vi.fn();
    render(<Checkbox label="x" onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('x'));
    expect(onChange).toHaveBeenCalled();
  });

  it('reflects checked state', () => {
    render(<Checkbox label="x" checked readOnly />);
    expect(screen.getByLabelText('x')).toBeChecked();
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```tsx
import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
  extra?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, extra, className, id, ...rest },
  ref,
) {
  const genId = useId();
  const inputId = id ?? genId;
  return (
    <label htmlFor={inputId} className={cn('flex items-center gap-2 cursor-pointer select-none text-sm', className)}>
      <input
        {...rest}
        id={inputId}
        ref={ref}
        type="checkbox"
        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500/30 cursor-pointer"
      />
      {label && <span className="flex-1">{label}</span>}
      {extra}
    </label>
  );
});
```

- [ ] **Step 4: Run, verify PASS**

- [ ] **Step 5: Story**

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Checkbox } from './Checkbox';

const meta: Meta<typeof Checkbox> = { title: 'UI/Checkbox', component: Checkbox, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Default: Story = { args: { label: 'Acepto los términos' } };
export const Checked: Story = { args: { label: 'Activo', checked: true, readOnly: true } };
export const Disabled: Story = { args: { label: 'No editable', disabled: true } };
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/Checkbox.tsx frontend/src/components/ui/Checkbox.test.tsx frontend/src/components/ui/Checkbox.stories.tsx
git commit -m "feat(ui): add Checkbox primitive"
```

---

### Task 13: `useFocusTrap` hook (shared by Modal/Drawer)

**Files:**
- Create: `frontend/src/hooks/useFocusTrap.ts`
- Create: `frontend/src/hooks/useFocusTrap.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { useFocusTrap } from './useFocusTrap';

function Trap({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, active);
  return (
    <div>
      <button>outside</button>
      <div ref={ref}>
        <button>first</button>
        <button>last</button>
      </div>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('cycles focus between first and last when active', async () => {
    const user = userEvent.setup();
    render(<Trap active={true} />);

    const first = screen.getByRole('button', { name: 'first' });
    first.focus();
    expect(first).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'last' })).toHaveFocus();

    await user.tab();
    expect(first).toHaveFocus(); // wraps back
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```typescript
import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active || !ref.current) return;

    const node = ref.current;
    const focusables = (): HTMLElement[] =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null,
      );

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [ref, active]);
}
```

- [ ] **Step 4: Run, verify PASS**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useFocusTrap.ts frontend/src/hooks/useFocusTrap.test.tsx
git commit -m "feat(ui): add useFocusTrap hook"
```

---

### Task 14: `Modal` primitive

**Files:**
- Create: `frontend/src/components/ui/Modal.tsx`
- Create: `frontend/src/components/ui/Modal.test.tsx`
- Create: `frontend/src/components/ui/Modal.stories.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('<Modal>', () => {
  it('renders children when open', () => {
    render(
      <Modal open onClose={() => {}} title="Title">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <Modal open={false} onClose={() => {}} title="X">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.queryByText('X')).not.toBeInTheDocument();
  });

  it('calls onClose when close button clicked', async () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="X"><p>b</p></Modal>);
    await userEvent.click(screen.getByRole('button', { name: /cerrar/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on ESC', async () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="X"><p>b</p></Modal>);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('renders footer slot', () => {
    render(
      <Modal open onClose={() => {}} title="X" footer={<button>Save</button>}>
        body
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```tsx
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: ReactNode;
  children: ReactNode;
  closeOnBackdrop?: boolean;
}

const SIZE: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = 'md',
  footer,
  children,
  closeOnBackdrop = true,
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={() => closeOnBackdrop && onClose()}
        aria-hidden
      />
      <div
        ref={ref}
        className={cn(
          'relative w-full bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]',
          SIZE[size],
        )}
      >
        {(title || subtitle) && (
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
            <div>
              {title && <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>}
              {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-900/50">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: Run, verify PASS**

- [ ] **Step 5: Story**

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

const meta: Meta<typeof Modal> = { title: 'UI/Modal', component: Modal, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof Modal>;

export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Abrir modal</Button>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Confirmar acción"
          subtitle="Esta acción no se puede deshacer"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => setOpen(false)}>Confirmar</Button>
            </>
          }
        >
          <p>¿Estás seguro de continuar?</p>
        </Modal>
      </>
    );
  },
};
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/Modal.tsx frontend/src/components/ui/Modal.test.tsx frontend/src/components/ui/Modal.stories.tsx
git commit -m "feat(ui): add Modal primitive"
```

---

### Task 15: `Drawer` primitive

**Files:**
- Create: `frontend/src/components/ui/Drawer.tsx`
- Create: `frontend/src/components/ui/Drawer.test.tsx`
- Create: `frontend/src/components/ui/Drawer.stories.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Drawer } from './Drawer';

describe('<Drawer>', () => {
  it('renders title, subtitle, body and footer when open', () => {
    render(
      <Drawer open onClose={() => {}} title="Categoría" subtitle="Editar productos" footer={<button>Save</button>}>
        <p>body</p>
      </Drawer>,
    );
    expect(screen.getByText('Categoría')).toBeInTheDocument();
    expect(screen.getByText('Editar productos')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<Drawer open={false} onClose={() => {}} title="x">body</Drawer>);
    expect(screen.queryByText('x')).not.toBeInTheDocument();
  });

  it('calls onClose on ESC', async () => {
    const onClose = vi.fn();
    render(<Drawer open onClose={onClose} title="x">b</Drawer>);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when X button clicked', async () => {
    const onClose = vi.fn();
    render(<Drawer open onClose={onClose} title="x">b</Drawer>);
    await userEvent.click(screen.getByRole('button', { name: /cerrar/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```tsx
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  side?: 'right' | 'left';
  width?: number | string;
  footer?: ReactNode;
  children: ReactNode;
  closeOnBackdrop?: boolean;
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  side = 'right',
  width = 480,
  footer,
  children,
  closeOnBackdrop = true,
}: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const widthCss = typeof width === 'number' ? `${width}px` : width;
  const sideClasses = side === 'right' ? 'right-0' : 'left-0';

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-slate-900/45"
        onClick={() => closeOnBackdrop && onClose()}
        aria-hidden
      />
      <div
        ref={ref}
        style={{ width: widthCss }}
        className={cn(
          'absolute top-0 bottom-0 bg-white dark:bg-slate-900 shadow-xl border-slate-200 dark:border-slate-700 flex flex-col',
          sideClasses,
          side === 'right' ? 'border-l' : 'border-r',
        )}
      >
        {(title || subtitle) && (
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
            <div>
              {title && <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>}
              {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-900/50">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: Run, verify PASS**

- [ ] **Step 5: Story**

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Button } from './Button';
import { Drawer } from './Drawer';

const meta: Meta<typeof Drawer> = { title: 'UI/Drawer', component: Drawer, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof Drawer>;

export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Abrir drawer</Button>
        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          title="Apósitos bacteriostáticos"
          subtitle="Editar productos asociados"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => setOpen(false)}>Guardar</Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">Aquí va el cuerpo del drawer.</p>
        </Drawer>
      </>
    );
  },
};
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/Drawer.tsx frontend/src/components/ui/Drawer.test.tsx frontend/src/components/ui/Drawer.stories.tsx
git commit -m "feat(ui): add Drawer primitive"
```

---

### Task 16: `Tag` primitive

**Files:**
- Create: `frontend/src/components/ui/Tag.tsx`
- Create: `frontend/src/components/ui/Tag.test.tsx`
- Create: `frontend/src/components/ui/Tag.stories.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tag } from './Tag';

describe('<Tag>', () => {
  it('renders children', () => {
    render(<Tag>Activo</Tag>);
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });

  it('applies blue variant', () => {
    render(<Tag variant="blue">x</Tag>);
    expect(screen.getByText('x').className).toMatch(/bg-blue-50/);
  });

  it('applies uppercase styling when uppercase prop true', () => {
    render(<Tag uppercase>x</Tag>);
    expect(screen.getByText('x').className).toMatch(/uppercase/);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```tsx
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type TagVariant = 'gray' | 'blue' | 'green' | 'yellow' | 'red';

export interface TagProps {
  children: ReactNode;
  variant?: TagVariant;
  uppercase?: boolean;
  className?: string;
}

const VARIANTS: Record<TagVariant, string> = {
  gray: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  yellow: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  red: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400',
};

export function Tag({ children, variant = 'gray', uppercase, className }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        VARIANTS[variant],
        uppercase && 'uppercase tracking-wider',
        className,
      )}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Run, verify PASS**

- [ ] **Step 5: Story**

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Tag } from './Tag';

const meta: Meta<typeof Tag> = { title: 'UI/Tag', component: Tag, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof Tag>;

export const Variants: Story = {
  render: () => (
    <div className="flex gap-2 flex-wrap">
      <Tag>Gray</Tag>
      <Tag variant="blue">Blue</Tag>
      <Tag variant="green">Green</Tag>
      <Tag variant="yellow">Yellow</Tag>
      <Tag variant="red">Red</Tag>
    </div>
  ),
};
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/Tag.tsx frontend/src/components/ui/Tag.test.tsx frontend/src/components/ui/Tag.stories.tsx
git commit -m "feat(ui): add Tag primitive"
```

---

### Task 17: `CodePill` primitive

**Files:**
- Create: `frontend/src/components/ui/CodePill.tsx`
- Create: `frontend/src/components/ui/CodePill.test.tsx`
- Create: `frontend/src/components/ui/CodePill.stories.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CodePill } from './CodePill';

describe('<CodePill>', () => {
  it('renders code', () => {
    render(<CodePill>1408</CodePill>);
    expect(screen.getByText('1408')).toBeInTheDocument();
  });

  it('uses monospace and blue background', () => {
    render(<CodePill>1408</CodePill>);
    expect(screen.getByText('1408').className).toMatch(/font-mono/);
    expect(screen.getByText('1408').className).toMatch(/bg-blue/);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```tsx
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface CodePillProps {
  children: ReactNode;
  className?: string;
}

export function CodePill({ children, className }: CodePillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md font-mono text-xs font-semibold',
        'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400',
        className,
      )}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Run, verify PASS**

- [ ] **Step 5: Story**

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { CodePill } from './CodePill';

const meta: Meta<typeof CodePill> = { title: 'UI/CodePill', component: CodePill, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof CodePill>;

export const Default: Story = { args: { children: '1408' } };
export const LongCode: Story = { args: { children: 'AVS-99-X' } };
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/CodePill.tsx frontend/src/components/ui/CodePill.test.tsx frontend/src/components/ui/CodePill.stories.tsx
git commit -m "feat(ui): add CodePill primitive"
```

---

### Task 18: `Skeleton` primitive

**Files:**
- Create: `frontend/src/components/ui/Skeleton.tsx`
- Create: `frontend/src/components/ui/Skeleton.test.tsx`
- Create: `frontend/src/components/ui/Skeleton.stories.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton } from './Skeleton';

describe('<Skeleton>', () => {
  it('renders with skeleton class and inline width/height', () => {
    const { container } = render(<Skeleton width={100} height={20} />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('skeleton');
    expect(el.style.width).toBe('100px');
    expect(el.style.height).toBe('20px');
  });

  it('applies circle shape when circle prop set', () => {
    const { container } = render(<Skeleton width={32} height={32} circle />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/rounded-full/);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement** (uses existing `.skeleton` class in `index.css`)

```tsx
import { cn } from '../../lib/cn';

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  circle?: boolean;
  className?: string;
}

export function Skeleton({ width, height, circle, className }: SkeletonProps) {
  const w = typeof width === 'number' ? `${width}px` : width;
  const h = typeof height === 'number' ? `${height}px` : height;
  return (
    <div
      className={cn('skeleton', circle && 'rounded-full', className)}
      style={{ width: w, height: h }}
      aria-hidden
    />
  );
}
```

- [ ] **Step 4: Run, verify PASS**

- [ ] **Step 5: Story**

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Skeleton } from './Skeleton';

const meta: Meta<typeof Skeleton> = { title: 'UI/Skeleton', component: Skeleton, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Block: Story = { args: { width: 200, height: 16 } };
export const Avatar: Story = { args: { width: 40, height: 40, circle: true } };
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/Skeleton.tsx frontend/src/components/ui/Skeleton.test.tsx frontend/src/components/ui/Skeleton.stories.tsx
git commit -m "feat(ui): add Skeleton primitive"
```

---

### Task 19: `EmptyState` primitive

**Files:**
- Create: `frontend/src/components/ui/EmptyState.tsx`
- Create: `frontend/src/components/ui/EmptyState.test.tsx`
- Create: `frontend/src/components/ui/EmptyState.stories.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';

describe('<EmptyState>', () => {
  it('renders title and description', () => {
    render(<EmptyState title="Sin datos" description="No hay nada aquí" />);
    expect(screen.getByText('Sin datos')).toBeInTheDocument();
    expect(screen.getByText('No hay nada aquí')).toBeInTheDocument();
  });

  it('renders action when provided', () => {
    render(<EmptyState title="x" action={<button>Crear</button>} />);
    expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```tsx
import type { ComponentType, ReactNode } from 'react';

interface IconProps {
  className?: string;
  'aria-hidden'?: boolean;
}

export interface EmptyStateProps {
  icon?: ComponentType<IconProps>;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-16 px-4">
      {Icon && <Icon className="w-10 h-10 text-slate-300 mx-auto mb-3" aria-hidden />}
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</p>
      {description && <p className="text-sm text-slate-400 mt-1">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run, verify PASS**

- [ ] **Step 5: Story**

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Package } from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

const meta: Meta<typeof EmptyState> = { title: 'UI/EmptyState', component: EmptyState, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {
  args: { icon: Package, title: 'Sin productos', description: 'Sube el catálogo AVIS para empezar' },
};
export const WithAction: Story = {
  args: {
    icon: Package,
    title: 'Sin productos',
    description: 'Sube el catálogo AVIS',
    action: <Button>Subir archivo</Button>,
  },
};
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/EmptyState.tsx frontend/src/components/ui/EmptyState.test.tsx frontend/src/components/ui/EmptyState.stories.tsx
git commit -m "feat(ui): add EmptyState primitive"
```

---

### Task 20: `Card` primitive

**Files:**
- Create: `frontend/src/components/ui/Card.tsx`
- Create: `frontend/src/components/ui/Card.test.tsx`
- Create: `frontend/src/components/ui/Card.stories.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './Card';

describe('<Card>', () => {
  it('renders children', () => {
    render(<Card>Hello</Card>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('applies card class', () => {
    const { container } = render(<Card>x</Card>);
    expect((container.firstChild as HTMLElement).className).toContain('card');
  });

  it('applies padding=none', () => {
    const { container } = render(<Card padding="none">x</Card>);
    expect((container.firstChild as HTMLElement).className).not.toMatch(/p-\d/);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```tsx
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface CardProps {
  children: ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
}

const PADS: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-7',
};

export function Card({ children, padding = 'md', className }: CardProps) {
  return <div className={cn('card', PADS[padding], className)}>{children}</div>;
}
```

- [ ] **Step 4: Run, verify PASS**

- [ ] **Step 5: Story**

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Card } from './Card';

const meta: Meta<typeof Card> = { title: 'UI/Card', component: Card, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = { args: { children: <p>Contenido del card</p> } };
export const NoPadding: Story = { args: { padding: 'none', children: <p className="p-2">Sin padding</p> } };
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/Card.tsx frontend/src/components/ui/Card.test.tsx frontend/src/components/ui/Card.stories.tsx
git commit -m "feat(ui): add Card primitive"
```

---

### Task 21: `PageHeader` primitive

**Files:**
- Create: `frontend/src/components/ui/PageHeader.tsx`
- Create: `frontend/src/components/ui/PageHeader.test.tsx`
- Create: `frontend/src/components/ui/PageHeader.stories.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

describe('<PageHeader>', () => {
  it('renders title and subtitle', () => {
    render(<PageHeader title="Catálogo" subtitle="660 productos" />);
    expect(screen.getByRole('heading', { name: 'Catálogo' })).toBeInTheDocument();
    expect(screen.getByText('660 productos')).toBeInTheDocument();
  });

  it('renders actions slot', () => {
    render(<PageHeader title="x" actions={<button>Nuevo</button>} />);
    expect(screen.getByRole('button', { name: 'Nuevo' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```tsx
import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run, verify PASS**

- [ ] **Step 5: Story**

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Plus } from 'lucide-react';
import { Button } from './Button';
import { PageHeader } from './PageHeader';

const meta: Meta<typeof PageHeader> = { title: 'UI/PageHeader', component: PageHeader, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof PageHeader>;

export const Default: Story = { args: { title: 'Pacientes', subtitle: '33 registrados' } };
export const WithActions: Story = {
  args: {
    title: 'Pacientes',
    subtitle: '33 registrados',
    actions: <Button leftIcon={<Plus className="w-4 h-4" />}>Nuevo paciente</Button>,
  },
};
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/PageHeader.tsx frontend/src/components/ui/PageHeader.test.tsx frontend/src/components/ui/PageHeader.stories.tsx
git commit -m "feat(ui): add PageHeader primitive"
```

---

### Task 22: `DataTable` primitive

**Files:**
- Create: `frontend/src/components/ui/DataTable.tsx`
- Create: `frontend/src/components/ui/DataTable.test.tsx`
- Create: `frontend/src/components/ui/DataTable.stories.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable';

interface Row { id: number; name: string; age: number }
const data: Row[] = [
  { id: 1, name: 'Ana', age: 30 },
  { id: 2, name: 'Bea', age: 25 },
];

describe('<DataTable>', () => {
  it('renders columns and rows', () => {
    render(
      <DataTable
        columns={[
          { key: 'name', label: 'Nombre' },
          { key: 'age', label: 'Edad' },
        ]}
        data={data}
        keyExtractor={(r) => r.id}
      />,
    );
    expect(screen.getByText('Nombre')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Bea')).toBeInTheDocument();
  });

  it('uses custom render function for column', () => {
    render(
      <DataTable
        columns={[
          { key: 'name', label: 'N', render: (r) => <strong>{r.name}!</strong> },
        ]}
        data={data}
        keyExtractor={(r) => r.id}
      />,
    );
    expect(screen.getByText('Ana!')).toBeInTheDocument();
  });

  it('shows empty state when no data and not loading', () => {
    render(
      <DataTable
        columns={[{ key: 'name', label: 'N' }]}
        data={[]}
        emptyState={<p>No hay datos</p>}
        keyExtractor={() => ''}
      />,
    );
    expect(screen.getByText('No hay datos')).toBeInTheDocument();
  });

  it('shows skeleton rows when loading', () => {
    const { container } = render(
      <DataTable
        columns={[{ key: 'name', label: 'N' }]}
        data={[]}
        loading
        keyExtractor={() => ''}
      />,
    );
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it('calls onRowClick', async () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        columns={[{ key: 'name', label: 'N' }]}
        data={data}
        onRowClick={onRowClick}
        keyExtractor={(r) => r.id}
      />,
    );
    await userEvent.click(screen.getByText('Ana'));
    expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ana' }));
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```tsx
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Skeleton } from './Skeleton';

export interface ColumnDef<T> {
  key: string;
  label: ReactNode;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  loading?: boolean;
  emptyState?: ReactNode;
  onRowClick?: (row: T) => void;
  keyExtractor: (row: T) => string | number;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  loading,
  emptyState,
  onRowClick,
  keyExtractor,
  className,
}: DataTableProps<T>) {
  if (!loading && data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-800">
            {columns.map((c) => (
              <th
                key={c.key}
                style={c.width ? { width: typeof c.width === 'number' ? `${c.width}px` : c.width } : undefined}
                className={cn(
                  'py-2.5 px-3 font-medium text-slate-400 text-xs uppercase tracking-wider',
                  c.align === 'right' && 'text-right',
                  c.align === 'center' && 'text-center',
                  !c.align && 'text-left',
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-slate-50 dark:border-slate-800">
                  {columns.map((c) => (
                    <td key={c.key} className="py-3 px-3">
                      <Skeleton height={14} width="80%" />
                    </td>
                  ))}
                </tr>
              ))
            : data.map((row) => (
                <tr
                  key={keyExtractor(row)}
                  className={cn(
                    'border-b border-slate-50 dark:border-slate-800',
                    onRowClick && 'hover:bg-blue-50/50 dark:hover:bg-slate-800 cursor-pointer transition-colors',
                  )}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'py-3 px-3 text-slate-700 dark:text-slate-300',
                        c.align === 'right' && 'text-right',
                        c.align === 'center' && 'text-center',
                      )}
                    >
                      {c.render ? c.render(row) : ((row as Record<string, ReactNode>)[c.key] ?? null)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run, verify PASS**

- [ ] **Step 5: Story**

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { CodePill } from './CodePill';
import { DataTable } from './DataTable';
import { Tag } from './Tag';

const meta: Meta = { title: 'UI/DataTable', tags: ['autodocs'] };
export default meta;

interface Product { id: number; code: string; name: string; type: string }
const products: Product[] = [
  { id: 1, code: '19', name: 'Acetazolamida 250 mg comprimido', type: 'Medicamento' },
  { id: 2, code: '1408', name: 'Apósito alginato de calcio 10×10 cm UD', type: 'Insumo' },
];

export const ProductCatalog: StoryObj = {
  render: () => (
    <DataTable<Product>
      columns={[
        { key: 'code', label: 'Código', width: 100, render: (p) => <CodePill>{p.code}</CodePill> },
        { key: 'name', label: 'Nombre' },
        { key: 'type', label: 'Tipo', width: 140, render: (p) => <Tag>{p.type}</Tag> },
      ]}
      data={products}
      keyExtractor={(p) => p.id}
    />
  ),
};

export const Loading: StoryObj = {
  render: () => (
    <DataTable<Product>
      columns={[{ key: 'code', label: 'Código' }, { key: 'name', label: 'Nombre' }]}
      data={[]}
      loading
      keyExtractor={(p) => p.id}
    />
  ),
};
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/DataTable.tsx frontend/src/components/ui/DataTable.test.tsx frontend/src/components/ui/DataTable.stories.tsx
git commit -m "feat(ui): add DataTable primitive"
```

---

### Task 23: `FileUpload` primitive

**Files:**
- Create: `frontend/src/components/ui/FileUpload.tsx`
- Create: `frontend/src/components/ui/FileUpload.test.tsx`
- Create: `frontend/src/components/ui/FileUpload.stories.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FileUpload } from './FileUpload';

describe('<FileUpload>', () => {
  it('renders label and helper text', () => {
    render(<FileUpload label="Importar Excel" helperText=".xlsx, hoja PRODUCTOS AVIS" onUpload={async () => {}} />);
    expect(screen.getByText('Importar Excel')).toBeInTheDocument();
    expect(screen.getByText('.xlsx, hoja PRODUCTOS AVIS')).toBeInTheDocument();
  });

  it('invokes onUpload when file selected', async () => {
    const onUpload = vi.fn(async () => {});
    render(<FileUpload label="X" onUpload={onUpload} />);
    const input = screen.getByLabelText(/seleccionar archivo|x/i, { selector: 'input[type="file"]' });
    const file = new File(['x'], 'x.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    await userEvent.upload(input, file);
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(file));
  });

  it('renders result block when result prop set', () => {
    render(
      <FileUpload
        label="X"
        onUpload={async () => {}}
        result={{ created: 612, updated: 48, unchanged: 0, skipped: 0, errors: [] }}
      />,
    );
    expect(screen.getByText(/612/)).toBeInTheDocument();
    expect(screen.getByText(/48/)).toBeInTheDocument();
  });

  it('shows error count and toggleable details', async () => {
    render(
      <FileUpload
        label="X"
        onUpload={async () => {}}
        result={{ created: 0, updated: 0, unchanged: 0, skipped: 1, errors: [{ row: 12, reason: 'Código vacío' }] }}
      />,
    );
    expect(screen.getByText(/1 errores/)).toBeInTheDocument();
    await userEvent.click(screen.getByText(/1 errores/));
    expect(screen.getByText(/Fila 12/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```tsx
import { useId, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface FileUploadResult {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

export interface FileUploadProps {
  label: string;
  helperText?: string;
  accept?: string;
  maxSize?: number;
  onUpload: (file: File) => Promise<void>;
  result?: FileUploadResult;
  disabled?: boolean;
}

export function FileUpload({
  label,
  helperText,
  accept = '.xlsx',
  maxSize = 5 * 1024 * 1024,
  onUpload,
  result,
  disabled,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setLocalError(null);
    if (maxSize && file.size > maxSize) {
      setLocalError(`Archivo supera el máximo de ${(maxSize / 1024 / 1024).toFixed(0)} MB`);
      return;
    }
    setUploading(true);
    try {
      await onUpload(file);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Error al importar');
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl py-8 px-6 text-center cursor-pointer transition-all',
          dragging
            ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30'
            : 'border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-slate-900',
          (disabled || uploading) && 'opacity-50 cursor-not-allowed',
        )}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.click(); }}
      >
        <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" aria-hidden />
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {uploading ? 'Importando…' : 'Arrastra el archivo aquí, o '}
          {!uploading && (
            <label htmlFor={id} className="text-blue-600 hover:text-blue-700 cursor-pointer underline-offset-2 hover:underline">
              selecciona uno
            </label>
          )}
        </p>
        {label && <p className="text-xs text-slate-500 mt-1">{label}</p>}
        {helperText && <p className="text-xs text-slate-400 mt-1">{helperText}</p>}
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          disabled={disabled || uploading}
          aria-label={label}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = '';
          }}
        />
      </div>

      {localError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {localError}
        </div>
      )}

      {result && (
        <div
          className={cn(
            'rounded-lg border px-4 py-3 text-sm',
            result.errors.length > 0
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800',
          )}
        >
          <div className="font-medium">
            {result.errors.length > 0 ? 'Importación completada con avisos' : 'Importación exitosa'}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="px-2 py-0.5 bg-white rounded text-xs font-medium">✓ {result.created} creados</span>
            <span className="px-2 py-0.5 bg-white rounded text-xs font-medium">↻ {result.updated} actualizados</span>
            <span className="px-2 py-0.5 bg-white rounded text-xs font-medium">= {result.unchanged} sin cambios</span>
            {result.skipped > 0 && (
              <span className="px-2 py-0.5 bg-white rounded text-xs font-medium">⊘ {result.skipped} saltados</span>
            )}
            {result.errors.length > 0 && (
              <span className="px-2 py-0.5 bg-white rounded text-xs font-medium text-rose-700">
                ⚠ {result.errors.length} errores
              </span>
            )}
          </div>
          {result.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium underline">{result.errors.length} errores — ver detalle</summary>
              <ul className="mt-2 text-xs space-y-0.5">
                {result.errors.slice(0, 50).map((err, i) => (
                  <li key={i}>Fila {err.row}: {err.reason}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run, verify PASS**

- [ ] **Step 5: Story**

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { FileUpload } from './FileUpload';

const meta: Meta<typeof FileUpload> = { title: 'UI/FileUpload', component: FileUpload, tags: ['autodocs'] };
export default meta;
type Story = StoryObj<typeof FileUpload>;

export const Idle: Story = {
  args: { label: 'Importar catálogo AVIS', helperText: 'Excel .xlsx, hoja PRODUCTOS AVIS', onUpload: async () => {} },
};

export const WithSuccessResult: Story = {
  args: {
    label: 'Importar catálogo AVIS',
    helperText: '.xlsx',
    onUpload: async () => {},
    result: { created: 612, updated: 48, unchanged: 0, skipped: 0, errors: [] },
  },
};

export const WithErrors: Story = {
  args: {
    label: 'Importar catálogo AVIS',
    helperText: '.xlsx',
    onUpload: async () => {},
    result: {
      created: 600,
      updated: 30,
      unchanged: 0,
      skipped: 3,
      errors: [
        { row: 12, reason: 'Código vacío' },
        { row: 34, reason: 'Nombre duplicado' },
        { row: 89, reason: 'Tipo desconocido' },
      ],
    },
  },
};
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/FileUpload.tsx frontend/src/components/ui/FileUpload.test.tsx frontend/src/components/ui/FileUpload.stories.tsx
git commit -m "feat(ui): add FileUpload primitive"
```

---

## Phase 4 — Discovery & enforcement

### Task 24: Barrel export for `components/ui`

**Files:**
- Create: `frontend/src/components/ui/index.ts`

- [ ] **Step 1: Write barrel**

```typescript
export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { Input } from './Input';
export type { InputProps } from './Input';

export { SearchInput } from './SearchInput';
export type { SearchInputProps } from './SearchInput';

export { Select } from './Select';
export type { SelectProps, SelectOption } from './Select';

export { Textarea } from './Textarea';
export type { TextareaProps } from './Textarea';

export { Checkbox } from './Checkbox';
export type { CheckboxProps } from './Checkbox';

export { Modal } from './Modal';
export type { ModalProps } from './Modal';

export { Drawer } from './Drawer';
export type { DrawerProps } from './Drawer';

export { Tag } from './Tag';
export type { TagProps, TagVariant } from './Tag';

export { CodePill } from './CodePill';
export type { CodePillProps } from './CodePill';

export { Skeleton } from './Skeleton';
export type { SkeletonProps } from './Skeleton';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { Card } from './Card';
export type { CardProps } from './Card';

export { PageHeader } from './PageHeader';
export type { PageHeaderProps } from './PageHeader';

export { DataTable } from './DataTable';
export type { DataTableProps, ColumnDef } from './DataTable';

export { FileUpload } from './FileUpload';
export type { FileUploadProps, FileUploadResult } from './FileUpload';
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npm run build
```

Expected: build succeeds; no missing export errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/index.ts
git commit -m "feat(ui): add barrel export for components/ui"
```

---

### Task 25: Gallery page `/dev/ui`

**Files:**
- Create: `frontend/src/pages/dev/UiGalleryPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Write the gallery page**

`frontend/src/pages/dev/UiGalleryPage.tsx`:

```tsx
import { Mail, Package, Plus, Save } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  CodePill,
  DataTable,
  Drawer,
  EmptyState,
  FileUpload,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Skeleton,
  Tag,
  Textarea,
} from '../../components/ui';
import { toSentenceCase } from '../../formatters/text';

interface ProductRow { id: number; code: string; name: string; type: string }
const SAMPLE_PRODUCTS: ProductRow[] = [
  { id: 1, code: '19', name: 'ACETAZOLAMIDA 250 MG COMPRIMIDO', type: 'MEDICAMENTO' },
  { id: 2, code: '1408', name: 'APOSITO ALGINATO DE CALCIO 10X10 CM UD', type: 'INSUMO' },
  { id: 3, code: '1778', name: 'APOSITO RINGER CON PHMB 10X10 CM UD', type: 'INSUMO' },
];

export default function UiGalleryPage() {
  const [search, setSearch] = useState('');
  const [textarea, setTextarea] = useState('');
  const [select, setSelect] = useState('');
  const [checked, setChecked] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="space-y-8 p-8 max-w-5xl mx-auto">
      <PageHeader
        title="UI Gallery"
        subtitle="Todos los primitivos en un solo lugar (solo dev)"
        actions={<Button leftIcon={<Plus className="w-4 h-4" />}>Acción</Button>}
      />

      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="success">Success</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="flex gap-2">
          <Button size="sm">Small</Button>
          <Button>Medium</Button>
          <Button size="lg">Large</Button>
          <Button loading leftIcon={<Save className="w-4 h-4" />}>Loading</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Inputs">
        <Input label="Nombre" placeholder="Juan Pérez" />
        <Input label="Email" leftIcon={<Mail className="w-4 h-4" />} />
        <Input label="Inválido" error="RUT inválido" value="123" readOnly />
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar producto…" />
        <Select
          label="Género"
          options={[
            { value: 'femenino', label: 'Femenino' },
            { value: 'masculino', label: 'Masculino' },
          ]}
          value={select}
          onChange={setSelect}
          placeholder="Todos"
        />
        <Textarea label="Notas" value={textarea} onChange={(e) => setTextarea(e.target.value)} />
        <Checkbox label="Acepto los términos" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
      </Section>

      <Section title="Tags & Pills">
        <div className="flex gap-2 flex-wrap">
          <Tag>Gray</Tag>
          <Tag variant="blue">Blue</Tag>
          <Tag variant="green">Green</Tag>
          <Tag variant="yellow">Yellow</Tag>
          <Tag variant="red">Red</Tag>
          <Tag uppercase>Uppercase</Tag>
        </div>
        <div className="flex gap-2 flex-wrap">
          <CodePill>19</CodePill>
          <CodePill>1408</CodePill>
          <CodePill>1778</CodePill>
        </div>
      </Section>

      <Section title="Skeleton">
        <div className="space-y-2 max-w-md">
          <Skeleton width="100%" height={16} />
          <Skeleton width="80%" height={14} />
          <Skeleton width={40} height={40} circle />
        </div>
      </Section>

      <Section title="EmptyState">
        <Card>
          <EmptyState
            icon={Package}
            title="Sin productos"
            description="Sube el catálogo AVIS para empezar"
            action={<Button leftIcon={<Plus className="w-4 h-4" />}>Subir archivo</Button>}
          />
        </Card>
      </Section>

      <Section title="DataTable">
        <Card padding="none">
          <DataTable<ProductRow>
            columns={[
              { key: 'code', label: 'Código', width: 100, render: (p) => <CodePill>{p.code}</CodePill> },
              { key: 'name', label: 'Nombre', render: (p) => toSentenceCase(p.name) },
              { key: 'type', label: 'Tipo', width: 140, render: (p) => <Tag>{toSentenceCase(p.type)}</Tag> },
            ]}
            data={SAMPLE_PRODUCTS}
            keyExtractor={(p) => p.id}
          />
        </Card>
      </Section>

      <Section title="FileUpload">
        <FileUpload
          label="Importar catálogo AVIS"
          helperText="Excel .xlsx, hoja PRODUCTOS AVIS"
          onUpload={async () => new Promise((r) => setTimeout(r, 600))}
          result={{ created: 612, updated: 48, unchanged: 0, skipped: 0, errors: [] }}
        />
      </Section>

      <Section title="Modal & Drawer">
        <div className="flex gap-2">
          <Button onClick={() => setModalOpen(true)}>Abrir Modal</Button>
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Abrir Drawer</Button>
        </div>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Confirmar"
          subtitle="Acción no reversible"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button onClick={() => setModalOpen(false)}>Confirmar</Button>
            </>
          }
        >
          <p>Cuerpo del modal.</p>
        </Modal>
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title="Apósitos bacteriostáticos"
          subtitle="Editar productos asociados"
          footer={
            <>
              <Button variant="secondary" onClick={() => setDrawerOpen(false)}>Cancelar</Button>
              <Button onClick={() => setDrawerOpen(false)}>Guardar</Button>
            </>
          }
        >
          <p className="text-sm text-slate-500">Cuerpo del drawer (lista de productos, etc.).</p>
        </Drawer>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
```

- [ ] **Step 2: Register the dev-only route in `App.tsx`**

Open `frontend/src/App.tsx`. Locate the `Routes` block (around line 40-55 based on existing structure). Add this conditional route alongside the others:

```tsx
{import.meta.env.DEV && (
  <Route path="/dev/ui" element={<UiGalleryPage />} />
)}
```

And add the import near the top of `App.tsx`:

```tsx
import UiGalleryPage from './pages/dev/UiGalleryPage';
```

(The import statement may be conditionally tree-shaken in production builds; Vite's import.meta.env.DEV is replaced at build time, so the route condition is removed and the import becomes dead-code-eliminated.)

- [ ] **Step 3: Run dev server and visit /dev/ui**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173/dev/ui` in browser. Expected: gallery renders all primitives. No console errors.

Stop the dev server (Ctrl+C).

- [ ] **Step 4: Build and verify production strips dev route**

```bash
cd frontend && npm run build
grep -r "UiGalleryPage" dist/ || echo "GalleryPage absent from prod build (ok)"
```

Expected: gallery code not present in `dist/` (Vite's `import.meta.env.DEV` substitution eliminates the dead branch).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/dev/UiGalleryPage.tsx frontend/src/App.tsx
git commit -m "feat(ui): add /dev/ui gallery page (dev only)"
```

---

### Task 26: ESLint custom rule `ui/use-primitives` (warn level)

**Files:**
- Create: `frontend/eslint-rules/use-primitives.js`
- Modify: `frontend/eslint.config.js`

- [ ] **Step 1: Implement the rule**

`frontend/eslint-rules/use-primitives.js`:

```javascript
/**
 * @fileoverview Disallows raw HTML controls in src/pages — use primitives from components/ui.
 * @type {import('eslint').Rule.RuleModule}
 */
const FORBIDDEN_TAGS = new Set(['button', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'select', 'textarea']);
const FORBIDDEN_INPUT_TYPES = new Set(['text', 'search', 'email', 'password', 'tel', 'url', 'number']);

const messages = {
  forbiddenTag: "Use the matching primitive from 'components/ui' instead of raw <{{tag}}>.",
  forbiddenInput: "Use <Input> from 'components/ui' instead of <input type=\"{{type}}\">.",
};

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Force usage of design-system primitives in src/pages/**' },
    messages,
    schema: [],
  },
  create(context) {
    const filename = context.filename || context.getFilename();
    if (!filename.includes('/src/pages/')) return {};
    if (filename.includes('/dev/')) return {}; // gallery page is allowed to use anything

    return {
      JSXOpeningElement(node) {
        const name = node.name;
        if (name.type !== 'JSXIdentifier') return;
        const tag = name.name;

        if (tag === 'input') {
          const typeAttr = node.attributes.find(
            (a) => a.type === 'JSXAttribute' && a.name && a.name.name === 'type',
          );
          const type = typeAttr && typeAttr.value && typeAttr.value.type === 'Literal'
            ? typeAttr.value.value
            : 'text';
          if (FORBIDDEN_INPUT_TYPES.has(type)) {
            context.report({ node, messageId: 'forbiddenInput', data: { type } });
          }
          return;
        }

        if (FORBIDDEN_TAGS.has(tag)) {
          context.report({ node, messageId: 'forbiddenTag', data: { tag } });
        }
      },
    };
  },
};
```

- [ ] **Step 2: Wire the rule into `eslint.config.js`**

Open `frontend/eslint.config.js` and add (somewhere after the existing imports/configs):

```javascript
import usePrimitives from './eslint-rules/use-primitives.js';

// ... existing config array, add a new entry:

// In the exported config array, add:
{
  files: ['src/pages/**/*.{ts,tsx}'],
  plugins: {
    ui: { rules: { 'use-primitives': usePrimitives } },
  },
  rules: {
    'ui/use-primitives': 'warn', // Plan A: advisory; Plan D promotes to 'error'
  },
},
```

(Read the file first, locate the export, and append this config as a new array element. Don't replace existing config.)

- [ ] **Step 3: Run lint to verify rule fires**

```bash
cd frontend && npm run lint 2>&1 | head -100
```

Expected: existing `src/pages/inventory/CatalogAdminPage.tsx` triggers warnings on `<input>` and `<table>` tags. `src/pages/PatientsListPage.tsx` triggers on `<table>`. The build does not fail (warnings only).

- [ ] **Step 4: Commit**

```bash
git add frontend/eslint-rules/ frontend/eslint.config.js
git commit -m "feat(ui): add ESLint rule ui/use-primitives at warn level"
```

---

### Task 27: Update `CLAUDE.md` with UI Standards section

**Files:**
- Modify: `CLAUDE.md` (root)

- [ ] **Step 1: Read current `CLAUDE.md`**

```bash
cat /Users/marcelo/dev/claude/curaciones/CLAUDE.md | head -80
```

(If `CLAUDE.md` doesn't exist at the repo root, create it.)

- [ ] **Step 2: Append the UI Standards section**

Append to the end of `CLAUDE.md` (or create with this content if missing):

```markdown
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

Rule `ui/use-primitives` (in `frontend/eslint-rules/use-primitives.js`) flags raw `<button>`, `<input type="text|search|...">`, `<table>`, `<select>`, `<textarea>` in `src/pages/**`. It is `warn` during the migration (Plans A-C) and promoted to `error` once Plan D completes.

### Whitelist

For legitimate exceptions (e.g., a third-party widget that injects raw HTML), use a single-line `// eslint-disable-next-line ui/use-primitives` comment.

### Reference

Design spec: `docs/superpowers/specs/2026-04-28-inventory-ui-redesign-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add UI Standards section to CLAUDE.md"
```

---

### Task 28: Final verification + handoff to Plan B

**Files:** none (verification only)

- [ ] **Step 1: Run full test suite**

```bash
cd frontend && npm run test 2>&1 | tail -30
```

Expected: all tests pass — primitives, formatters, hooks. New test count ≥ 60.

- [ ] **Step 2: Run lint**

```bash
cd frontend && npm run lint 2>&1 | tail -20
```

Expected: zero errors. Warnings from `ui/use-primitives` are expected (existing pages haven't been migrated yet).

- [ ] **Step 3: Run build**

```bash
cd frontend && npm run build
```

Expected: clean build, no TS errors.

- [ ] **Step 4: Smoke-test Storybook**

```bash
cd frontend && npm run storybook -- --no-open --quiet 2>&1 &
sleep 10
curl -s http://localhost:6006 | head -5
```

Expected: HTML response from Storybook. Stop with `kill %1`.

- [ ] **Step 5: Smoke-test gallery in dev**

```bash
cd frontend && npm run dev 2>&1 &
sleep 5
curl -s http://localhost:5173/dev/ui | head -3
```

Expected: HTML response. Stop with `kill %1`.

- [ ] **Step 6: Push branch and open PR**

```bash
git push -u origin feat/inventory-ui-redesign
gh pr create --title "feat(ui): design system + primitives + gallery + ESLint rule (Plan A)" --body "$(cat <<'EOF'
## Summary

Plan A of the inventory UI redesign: establishes `components/ui/` with 16 typed primitives, design tokens, text formatters (`toSentenceCase`, `formatCode`), Storybook 8, an in-app gallery at `/dev/ui`, and an advisory ESLint rule (`ui/use-primitives` at `warn`).

No existing pages have been changed yet — this PR is foundational. Plans B/C/D consume these primitives.

## Spec
- `docs/superpowers/specs/2026-04-28-inventory-ui-redesign-design.md`

## Test plan
- [ ] `npm run test` green
- [ ] `npm run lint` zero errors
- [ ] `npm run build` clean
- [ ] Visit `/dev/ui` in dev — verify all primitives render
- [ ] `npm run storybook` — verify stories load
- [ ] No visual regressions in existing pages
EOF
)"
```

- [ ] **Step 7: After PR merged, write Plan B**

Once Plan A is merged to `main`, invoke the writing-plans skill to create Plan B (Backend canasta refactor) with the following handoff context:

> **Handoff to Plan B**
> - `frontend/src/components/ui/` is published with 16 primitives. Use them when building Plan C frontend.
> - `frontend/src/formatters/text.ts` exposes `toSentenceCase` and `formatCode`.
> - The `ui/use-primitives` ESLint rule is at `warn`. Plan D promotes it to `error`.
> - `CLAUDE.md` has the UI Standards section.
> - **Plan B's scope**: backend changes only — eliminate `canasta-mappings.ts`, eliminate `seedCanastaDefaults`, add `POST /api/inventory/canasta/import` (multipart guide upload), add CRUD endpoints for canasta categories, add migration `1714320000000-CanastaResetAndAutomappedFlag` (adds `auto_mapped`, `archived`, `source_key` columns; wipes existing seed data). All decisions are documented in the spec.

---

## Self-review

**Spec coverage:** ✅
- Tokens — Task 3
- Primitivos (16) — Tasks 7-23
- `toSentenceCase` + `formatCode` — Task 4
- Storybook — Tasks 5-6, plus per-primitive
- Galería `/dev/ui` — Task 25
- ESLint rule — Task 26
- CLAUDE.md update — Task 27
- Verification + handoff — Task 28
- `useFocusTrap` shared hook — Task 13 (covers Modal+Drawer reuse stated in spec)

**Placeholders:** none. Every step has runnable commands and complete code.

**Type consistency:** all components export both `Component` and `ComponentProps`. Barrel re-exports both. `cn()` signature matches usage in every primitive. `FileUploadResult` shape is consistent between primitive, story, and the spec (created/updated/unchanged/skipped/errors).

**Spec gaps fixed:** none required. The `useFocusTrap` hook (added as Task 13) was implied by the spec ("Drawer y Modal comparten focus trap: extraer a hook `useFocusTrap` reutilizable") and is now explicit in the plan.
