# UI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every KK-LRMS page one direction-C visual language: tokens, a Thai type scale with a 13px floor, shared components, a sidebar app shell with a live data-freshness status strip, and a lint guard so the app cannot drift back.

**Architecture:**
- **Tokens:** typed constants in `src/config/design-tokens.ts` are the single source of truth. `globals.css` mirrors them, and tests enforce parity.
- **Components:** new shared components in `src/components/shared/`. Existing components keep their props and render through the new ones.
- **Shell:** `AppShell` replaces `TopNavBar` in both route-group layouts. Its status strip reads a new session-scoped `/api/sync/freshness`, with logic in `src/services/sync-freshness.ts`.
- **Migration:** a one-shot codemod converts the 1,003 sub-14px arbitrary sizes and the raw risk/brand colour classes. An ESLint rule blocks reintroduction.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind CSS 4 (`@theme`), shadcn/ui, SWR, lucide-react, Vitest + RTL (jsdom) + PGlite, Playwright, ESLint 9 flat config.

**Spec:** `docs/superpowers/specs/2026-10-11-ui-foundation-design.md` (commit `54ff634`). Executors read both.

## Global Constraints

- Font: Sarabun (already loaded in `src/app/layout.tsx`); do not add fonts.
- Minimum text size outside kiosk: **13px** (`text-caption`).
- Type scale (px / line-height / weight):
  - caption 13/1.5/400
  - label 14/1.5/500
  - body 15/1.65/400
  - body-lg 17/1.6/500
  - title 22/1.35/600
  - page 26/1.3/700
  - kpi-sm 26/1.15/700
  - kpi 34/1.15/700
- Colours (exact hex, from the spec):
  - Surfaces: surface-page `#FBF8F3`, surface-card `#FFFFFF`, surface-muted `#F3EFE6`, border `#E8E1D2`
  - Ink: ink `#22223B`, ink-muted `#5C5C7A`, ink-subtle `#6B6B85`
  - Brand: brand `#2E3A87`, brand-strong `#232D6B`, brand-soft `#E4E6F4`
  - Risk high: `#C0392B` / text `#A1271B` / tint `#FDECEA`
  - Risk medium: `#D08A00` / text `#8A5A00` / tint `#FFF6E0`
  - Risk low: `#3F8F4F` / text `#2F6B3A` / tint `#EEF7EE`
  - Status `ok` / `warn` / `danger` alias risk low / medium / high.
- Every declared text/background pair ≥ 4.5:1. On `surface-muted`, secondary text uses `ink-muted`, never `ink-subtle`.
- `html { font-size: 18px }` stays (rem utilities across the app depend on it). The new type scale is in **px**.
- KPI numbers come from server aggregates, never `rows.length` (count-provenance rule).
- All user-facing messages are in Thai and follow **what happened · since when · what to do**.
- Kiosk mode keeps working: the shell must render the sidebar as `<aside>` and the top bar as `<header className="sticky …">`. The existing `html.kiosk-mode aside` / `header.sticky` rules hide them.
- No runtime calls to the image service; illustrations ship as static webp behind `NEXT_PUBLIC_ILLUSTRATIONS_ENABLED` (default `false`).
- Gates per commit: `npx vitest run <touched tests>`, then `npx tsc --noEmit` and `npm run lint` green. Run the full `npx vitest run --maxWorkers=6` at the end of tasks 3, 8, 13, 14 and 17.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Spec deviations (decided while planning, with reasons)

1. **Pseudo-hospitals:** reuse `EXEMPT_HCODES` (`'00000'`, `'99999'`) from `src/lib/hospital-access-guard.ts` instead of a new `NON_REPORTING_HCODES`. It is the same set; defining it twice would drift.
2. **Tabular figures:** use Tailwind's built-in `tabular-nums` instead of a custom `.num` utility.
3. **Status strip refresh:** SWR polling every 30s against a 15s server-cached endpoint, instead of SSE. `useSSE` opens a new `EventSource` per call, so an SSE strip would double SSE connections per tab, against the 200-concurrent-user target.
4. **Lint guard scope:** the guard bans risk/brand hues (`red rose orange amber yellow green emerald teal`) but not neutral greys (`slate gray zinc …`). Neutrals have no codemod mapping yet; sub-projects 2–5 own them.
5. **`RiskLevelConfig` gains `textColor`.** Marker colours on their own tints fail AA for text, so chips use `*-text` on `*-tint`.
6. **Authenticated E2E** needs a real BMS session (`E2E_BMS_SESSION_ID`), matching `tests/e2e/dashboard.spec.ts`. Without it those specs skip; unauthenticated specs always run.
7. **`SectionLabel` → `SectionCard` page migration** is deferred to sub-projects 2–5. All 21 usages are inside page layouts, which those sub-projects own. The foundation ships `SectionCard`; `SectionLabel` stays legal until each page moves.
8. **Codemod runner** is `.mjs` run with `node --experimental-strip-types` (local Node 22), so `tsc` never sees a `.ts`-extension import.

## Review Focus

1. **Kiosk mode** must still hide the new sidebar, header and status strip. The strip must live inside `header.sticky`. This is pinned in Task 13.
2. **A session whose hcode is exempt or unregistered** (99999 provincial admin, or a hospital not in `hospitals`) must get province numbers and `own: null`, with no crash and no other hospital's details. This is pinned in Task 10.
3. **Sync timestamps that are null, unparseable or in the future** must render Thai text such as "ยังไม่เคยซิงค์" or "เวลาซิงค์ล่วงหน้า…", never `NaN` or a negative age. This is pinned in Task 4.
4. **`localStorage` that throws** (private mode, blocked storage) must leave the sidebar expanded and the page working. This is pinned in Task 12.
5. **A failing `/api/sync/freshness`** (500, offline) must show a quiet Thai notice with retry; the page around it keeps working. This is pinned in Task 11.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/config/design-tokens.ts` | Colour + type tokens, `cssVarName`, `contrastRatio` | 1, 2 |
| `src/app/globals.css` | CSS mirror of tokens, shadcn remap, legacy aliases, type scale, body default | 1, 2 |
| `src/config/risk-levels.ts` | Risk config reads tokens; adds `textColor` | 3 |
| `src/config/anc-risk-display.ts` | Adds `ANC_TO_RISK_LEVEL` | 3 |
| `src/components/shared/RiskChip.tsx` | The one risk visual | 3 |
| `src/components/shared/{RiskIndicator,CpdBadge,AncRiskChip}.tsx` | Render via `RiskChip` (props unchanged) | 3 |
| `src/lib/sync-age.ts` | `describeSyncAge()`: tone, clock, relative Thai age | 4 |
| `src/components/shared/FreshnessBadge.tsx` | Freshness pill | 4 |
| `src/components/shared/{SectionCard,PageHeader,KpiTile}.tsx` | Page building blocks | 5 |
| `src/components/shared/DataTable.tsx` | Table presentation wrapper | 6 |
| `src/config/illustrations.ts`, `src/components/shared/EmptyState.tsx` | Empty/stale states with illustration or icon fallback | 7 |
| `src/components/shared/{ErrorState,LoadingState,StaleBanner}.tsx`, `src/components/layout/DbHealthBanner.tsx` | Restyle to tokens (props unchanged, `ErrorState` gains `remedy`) | 8 |
| `src/services/dashboard.ts` | Extract `countActiveLaborByRisk()` | 9 |
| `src/services/health.ts` | Exclude `EXEMPT_HCODES` | 9 |
| `src/types/sync-freshness.ts` | `FreshnessSummary` type (client-safe) | 10 |
| `src/services/sync-freshness.ts`, `src/app/api/sync/freshness/route.ts` | Freshness logic + route | 10 |
| `src/hooks/useSyncFreshness.ts`, `src/components/layout/StatusStrip.tsx` | Strip data + UI | 11 |
| `src/config/nav.ts`, `src/hooks/useSidebarState.ts`, `src/hooks/usePresenceHeartbeat.ts` | Nav per variant, persisted collapse, heartbeat extracted from TopNavBar | 12 |
| `src/components/layout/{AppShell,Sidebar,AppHeader}.tsx`, both route-group `layout.tsx` | The shell | 13 |
| `scripts/codemods/design-tokens-map.ts`, `scripts/codemods/design-tokens.mjs` | Codemod mapping + runner | 14 |
| `eslint-rules/no-adhoc-design-values.mjs`, `eslint-rules/design-allowlist.json`, `eslint.config.mjs` | Lint guard | 15 |
| `scripts/illustrations/{generate.py,manifest.json}`, `public/illustrations/*` | Reproducible illustration set | 16 |
| `tests/e2e/ui-foundation.spec.ts` | E2E with debug logging + screenshots | 17 |

---

### Task 1: Colour tokens (TS source of truth + CSS mirror)

**Files:**
- Create: `src/config/design-tokens.ts`
- Modify: `src/app/globals.css` (`:root` block lines 8–80, `@theme inline` block lines 82–154)
- Test: `tests/unit/config/design-tokens.test.ts`

**Interfaces:**
- Produces:
  - `COLOR` (readonly record of hex strings) and `type ColorToken = keyof typeof COLOR`
  - `STATUS = { ok: 'riskLow', warn: 'riskMedium', danger: 'riskHigh' }`
  - `cssVarName(token: ColorToken): string`, e.g. `'riskHighText' → '--risk-high-text'`
  - `contrastRatio(fg: string, bg: string): number`
  - `CONTRAST_PAIRS`
- Tailwind classes: `bg-surface-page`, `bg-surface-card`, `bg-surface-muted`, `text-ink`, `text-ink-muted`, `text-ink-subtle`, `bg-brand`, `text-brand`, `bg-brand-soft`, `text-brand-strong`, `bg-danger`, `bg-danger-tint`, `text-danger-text` (and the same for `warn` / `ok`), `shadow-soft`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/config/design-tokens.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  COLOR,
  STATUS,
  CONTRAST_PAIRS,
  cssVarName,
  contrastRatio,
  type ColorToken,
} from '@/config/design-tokens';

const css = readFileSync(path.resolve(__dirname, '../../../src/app/globals.css'), 'utf8');
const rootStart = css.indexOf(':root {');
const rootBlock = css.slice(rootStart, css.indexOf('}', rootStart));

describe('design tokens', () => {
  it('cssVarName converts camelCase to a CSS custom property', () => {
    expect(cssVarName('riskHighText')).toBe('--risk-high-text');
    expect(cssVarName('surfacePage')).toBe('--surface-page');
    expect(cssVarName('border')).toBe('--border');
  });

  it.each(Object.entries(COLOR))('%s is mirrored in :root with the same hex', (token, hex) => {
    const name = cssVarName(token as ColorToken);
    const m = rootBlock.match(new RegExp(`\\s${name}:\\s*(#[0-9A-Fa-f]{6})\\s*;`));
    expect(m?.[1].toUpperCase()).toBe(hex);
  });

  it.each(Object.keys(COLOR))('%s is exposed as a Tailwind colour', (token) => {
    const name = cssVarName(token as ColorToken).slice(2);
    expect(css).toContain(`--color-${name}: var(--${name});`);
  });

  it.each(Object.entries(STATUS))('status %s aliases %s (marker, text, tint)', (status, risk) => {
    const r = cssVarName(risk as ColorToken);
    expect(rootBlock).toContain(`--${status}: var(${r});`);
    expect(rootBlock).toContain(`--${status}-text: var(${r}-text);`);
    expect(rootBlock).toContain(`--${status}-tint: var(${r}-tint);`);
    for (const suffix of ['', '-text', '-tint']) {
      expect(css).toContain(`--color-${status}${suffix}: var(--${status}${suffix});`);
    }
  });

  it.each(CONTRAST_PAIRS)('%s on %s meets WCAG AA (≥4.5:1)', (fg, bg) => {
    expect(contrastRatio(COLOR[fg], COLOR[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it('contrastRatio matches known reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('shadcn primitives follow the tokens', () => {
    expect(rootBlock).toContain('--background: var(--surface-page);');
    expect(rootBlock).toContain('--primary: var(--brand);');
    expect(rootBlock).toContain('--destructive: var(--risk-high);');
  });

  it('legacy palettes are aliases, not separate colours', () => {
    expect(rootBlock).toContain('--primary-teal: var(--brand);');
    expect(rootBlock).toContain('--accent-navy: var(--brand);');
    expect(rootBlock).toContain('--ink-navy: var(--ink);');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/config/design-tokens.test.ts`
Expected: FAIL with `Failed to resolve import "@/config/design-tokens"`.

- [ ] **Step 3: Create the token module**

```ts
// src/config/design-tokens.ts
// Direction C ("Warm Public Health") design tokens — the single source of
// truth. src/app/globals.css mirrors these as CSS custom properties and
// tests/unit/config/design-tokens.test.ts fails if the two drift. TS is the
// source because PNG renderers, Leaflet and Recharts cannot read CSS vars.
export const COLOR = {
  surfacePage: '#FBF8F3',
  surfaceCard: '#FFFFFF',
  surfaceMuted: '#F3EFE6',
  border: '#E8E1D2',
  ink: '#22223B',
  inkMuted: '#5C5C7A',
  inkSubtle: '#6B6B85',
  brand: '#2E3A87',
  brandStrong: '#232D6B',
  brandSoft: '#E4E6F4',
  riskHigh: '#C0392B',
  riskHighText: '#A1271B',
  riskHighTint: '#FDECEA',
  riskMedium: '#D08A00',
  riskMediumText: '#8A5A00',
  riskMediumTint: '#FFF6E0',
  riskLow: '#3F8F4F',
  riskLowText: '#2F6B3A',
  riskLowTint: '#EEF7EE',
} as const;

export type ColorToken = keyof typeof COLOR;

/** Data-freshness / status language reuses the risk language. */
export const STATUS = { ok: 'riskLow', warn: 'riskMedium', danger: 'riskHigh' } as const satisfies Record<
  string,
  ColorToken
>;

/** Text/background pairs components actually use; each must meet AA. */
export const CONTRAST_PAIRS: ReadonlyArray<readonly [ColorToken, ColorToken]> = [
  ['ink', 'surfacePage'],
  ['inkMuted', 'surfacePage'],
  ['inkSubtle', 'surfacePage'],
  ['ink', 'surfaceCard'],
  ['inkMuted', 'surfaceCard'],
  ['inkMuted', 'surfaceMuted'],
  ['riskHighText', 'riskHighTint'],
  ['riskMediumText', 'riskMediumTint'],
  ['riskLowText', 'riskLowTint'],
  ['surfaceCard', 'riskHigh'],
  ['surfaceCard', 'brand'],
  ['brandStrong', 'brandSoft'],
];

export function cssVarName(token: ColorToken): string {
  return `--${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

function channel(hex: string, i: number): number {
  const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
}

/** WCAG 2.x contrast ratio between two #RRGGBB colours. */
export function contrastRatio(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}
```

- [ ] **Step 4: Mirror the tokens in `globals.css` `:root`**

Replace the existing `--primary-teal*`, `--risk-*`, `--status-*` and `--accent-navy*`…`--rule-hair` declarations (lines 10–36) with the block below. Then change the existing shadcn lines inside `:root` as listed after it. Keep the `--kiosk-*` lines unchanged.

```css
  /* ── Direction C tokens — mirror of src/config/design-tokens.ts ──
     (parity-tested in tests/unit/config/design-tokens.test.ts) */
  --surface-page: #FBF8F3;
  --surface-card: #FFFFFF;
  --surface-muted: #F3EFE6;
  --ink: #22223B;
  --ink-muted: #5C5C7A;
  --ink-subtle: #6B6B85;
  --brand: #2E3A87;
  --brand-strong: #232D6B;
  --brand-soft: #E4E6F4;
  --risk-high: #C0392B;
  --risk-high-text: #A1271B;
  --risk-high-tint: #FDECEA;
  --risk-medium: #D08A00;
  --risk-medium-text: #8A5A00;
  --risk-medium-tint: #FFF6E0;
  --risk-low: #3F8F4F;
  --risk-low-text: #2F6B3A;
  --risk-low-tint: #EEF7EE;
  /* Status language = risk language */
  --ok: var(--risk-low);
  --ok-text: var(--risk-low-text);
  --ok-tint: var(--risk-low-tint);
  --warn: var(--risk-medium);
  --warn-text: var(--risk-medium-text);
  --warn-tint: var(--risk-medium-tint);
  --danger: var(--risk-high);
  --danger-text: var(--risk-high-text);
  --danger-tint: var(--risk-high-tint);
  --status-online: var(--ok);
  --status-offline: var(--danger);
  --status-unknown: var(--ink-subtle);
  /* Legacy palettes — aliases only; delete once eslint-rules/design-allowlist.json is empty */
  --primary-teal: var(--brand);
  --primary-teal-dark: var(--brand-strong);
  --primary-teal-light: var(--brand-soft);
  --primary-teal-50: var(--surface-muted);
  --accent-navy: var(--brand);
  --accent-navy-strong: var(--brand-strong);
  --accent-navy-soft: var(--brand-soft);
  --ink-navy: var(--ink);
  --ink-navy-dim: var(--ink-muted);
  --ink-navy-muted: var(--ink-subtle);
  --surface-cool: var(--surface-muted);
  --surface-sunken: var(--surface-muted);
  --rule-strong: var(--border);
  --rule-hair: var(--border);
```

Change these existing `:root` shadcn lines:

```css
  --background: var(--surface-page);
  --foreground: var(--ink);
  --card: var(--surface-card);
  --card-foreground: var(--ink);
  --popover: var(--surface-card);
  --popover-foreground: var(--ink);
  --primary: var(--brand);
  --primary-foreground: #FFFFFF;
  --secondary: var(--brand-soft);
  --secondary-foreground: var(--brand-strong);
  --muted: var(--surface-muted);
  --muted-foreground: var(--ink-muted);
  --accent: var(--brand-soft);
  --accent-foreground: var(--brand-strong);
  --destructive: var(--risk-high);
  --border: #E8E1D2;
  --input: var(--border);
  --ring: var(--brand);
  --radius: 1rem;
```

Retune the kiosk risk hues to the same family:

```css
  --kiosk-high: #E0675C;
  --kiosk-med: #E0A43A;
  --kiosk-low: #5FAE6E;
```

- [ ] **Step 5: Expose the tokens to Tailwind (`@theme inline`)**

Add these lines inside `@theme inline { … }`. Skip any line that already exists, such as `--color-risk-low: var(--risk-low);`.

```css
  --color-surface-page: var(--surface-page);
  --color-surface-card: var(--surface-card);
  --color-surface-muted: var(--surface-muted);
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-ink-subtle: var(--ink-subtle);
  --color-brand: var(--brand);
  --color-brand-strong: var(--brand-strong);
  --color-brand-soft: var(--brand-soft);
  --color-risk-high-text: var(--risk-high-text);
  --color-risk-high-tint: var(--risk-high-tint);
  --color-risk-medium-text: var(--risk-medium-text);
  --color-risk-medium-tint: var(--risk-medium-tint);
  --color-risk-low-text: var(--risk-low-text);
  --color-risk-low-tint: var(--risk-low-tint);
  --color-ok: var(--ok);
  --color-ok-text: var(--ok-text);
  --color-ok-tint: var(--ok-tint);
  --color-warn: var(--warn);
  --color-warn-text: var(--warn-text);
  --color-warn-tint: var(--warn-tint);
  --color-danger: var(--danger);
  --color-danger-text: var(--danger-text);
  --color-danger-tint: var(--danger-tint);
  --shadow-soft: 0 2px 8px rgb(46 58 135 / 0.07);
```

- [ ] **Step 6: Run the token test to verify it passes**

Run: `npx vitest run tests/unit/config/design-tokens.test.ts`
Expected: PASS (every row of each `it.each`).

- [ ] **Step 7: Run the colour-sensitive component tests and update stale expectations**

Run: `npx vitest run tests/unit/components`

The expected failures are tests that assert old palette values, for example `ConnectionStatus.test.tsx` expects `rgb(34, 197, 94)` (`#22c55e`). For each failure, check whether the value now comes from a token. If it does, change the expectation to the token-derived value using the helper below; never to a new literal hex. If a failure is **not** a palette assertion, stop and investigate it as a real regression.

```ts
// tests/helpers/color.ts
export function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
```

Example: `expect(label.style.color).toBe(hexToRgb(COLOR.riskLow));`. Class assertions such as `bg-green-500` stay until Task 14 rewrites the component.

- [ ] **Step 8: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: both exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/config/design-tokens.ts src/app/globals.css tests/unit/config/design-tokens.test.ts tests/helpers/color.ts tests/unit/components
git commit -m "feat(ui): direction-C colour tokens as single source of truth

TS module drives CSS vars (parity + WCAG AA tested); shadcn primitives and
the legacy teal/navy palettes now alias the tokens, so the whole app moves
to one palette without touching components yet.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Thai type scale

**Files:**
- Modify: `src/config/design-tokens.ts` (append), `src/app/globals.css` (`@theme inline`, `@layer base body`)
- Test: `tests/unit/config/type-scale.test.ts`

**Interfaces:**
- Produces:
  - `TYPE_SCALE: Record<TypeToken, { px: number; lineHeight: number; weight: number }>`
  - `type TypeToken = 'caption' | 'label' | 'body' | 'body-lg' | 'title' | 'page' | 'kpi-sm' | 'kpi'`
  - `MIN_TEXT_PX = 13`
- Tailwind classes: `text-caption`, `text-label`, `text-body`, `text-body-lg`, `text-title`, `text-page`, `text-kpi-sm`, `text-kpi`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/config/type-scale.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TYPE_SCALE, MIN_TEXT_PX } from '@/config/design-tokens';

const css = readFileSync(path.resolve(__dirname, '../../../src/app/globals.css'), 'utf8');

describe('Thai type scale', () => {
  it.each(Object.entries(TYPE_SCALE))('%s is declared in @theme with size, line-height, weight', (name, t) => {
    expect(css).toContain(`--text-${name}: ${t.px}px;`);
    expect(css).toContain(`--text-${name}--line-height: ${t.lineHeight};`);
    expect(css).toContain(`--text-${name}--font-weight: ${t.weight};`);
  });

  it('nothing in the scale is below the 13px Thai legibility floor', () => {
    expect(MIN_TEXT_PX).toBe(13);
    for (const t of Object.values(TYPE_SCALE)) expect(t.px).toBeGreaterThanOrEqual(MIN_TEXT_PX);
  });

  it('body defaults to text-body; the 18px rem root is preserved', () => {
    expect(css).toMatch(/body\s*\{\s*@apply bg-background text-foreground text-body;/);
    expect(css).toMatch(/html\s*\{\s*font-size: 18px;/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/config/type-scale.test.ts`
Expected: FAIL with `TYPE_SCALE` undefined (import error).

- [ ] **Step 3: Add the scale to the token module**

```ts
// append to src/config/design-tokens.ts
/** Sarabun type scale in px (the html root is 18px, so rem would mislead).
 *  Thai stacks vowels/tone marks above and below the line — line-heights are
 *  deliberately generous. */
export const TYPE_SCALE = {
  caption: { px: 13, lineHeight: 1.5, weight: 400 },
  label: { px: 14, lineHeight: 1.5, weight: 500 },
  body: { px: 15, lineHeight: 1.65, weight: 400 },
  'body-lg': { px: 17, lineHeight: 1.6, weight: 500 },
  title: { px: 22, lineHeight: 1.35, weight: 600 },
  page: { px: 26, lineHeight: 1.3, weight: 700 },
  'kpi-sm': { px: 26, lineHeight: 1.15, weight: 700 },
  kpi: { px: 34, lineHeight: 1.15, weight: 700 },
} as const;

export type TypeToken = keyof typeof TYPE_SCALE;

/** Smallest text allowed outside kiosk mode. */
export const MIN_TEXT_PX = TYPE_SCALE.caption.px;
```

- [ ] **Step 4: Declare the scale in CSS**

Add inside `@theme inline { … }`:

```css
  --text-caption: 13px;
  --text-caption--line-height: 1.5;
  --text-caption--font-weight: 400;
  --text-label: 14px;
  --text-label--line-height: 1.5;
  --text-label--font-weight: 500;
  --text-body: 15px;
  --text-body--line-height: 1.65;
  --text-body--font-weight: 400;
  --text-body-lg: 17px;
  --text-body-lg--line-height: 1.6;
  --text-body-lg--font-weight: 500;
  --text-title: 22px;
  --text-title--line-height: 1.35;
  --text-title--font-weight: 600;
  --text-page: 26px;
  --text-page--line-height: 1.3;
  --text-page--font-weight: 700;
  --text-kpi-sm: 26px;
  --text-kpi-sm--line-height: 1.15;
  --text-kpi-sm--font-weight: 700;
  --text-kpi: 34px;
  --text-kpi--line-height: 1.15;
  --text-kpi--font-weight: 700;
```

In `@layer base`, change `body { @apply bg-background text-foreground; }` to:

```css
  body {
    @apply bg-background text-foreground text-body;
  }
```

- [ ] **Step 5: Run the test and a production build (CSS errors only surface at build)**

Run: `npx vitest run tests/unit/config/type-scale.test.ts && npm run build`
Expected: test PASS; build completes with no Tailwind/CSS errors.

- [ ] **Step 6: Commit**

```bash
git add src/config/design-tokens.ts src/app/globals.css tests/unit/config/type-scale.test.ts
git commit -m "feat(ui): Sarabun type scale with a 13px Thai legibility floor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: One risk visual — `RiskChip`

**Files:**
- Modify: `src/config/risk-levels.ts` (`RiskLevelConfig` + the three entries), `src/config/anc-risk-display.ts` (append)
- Create: `src/components/shared/RiskChip.tsx`
- Modify: `src/components/shared/RiskIndicator.tsx`, `src/components/shared/CpdBadge.tsx`, `src/components/shared/AncRiskChip.tsx`
- Test: `tests/unit/components/shared/RiskChip.test.tsx`; update `tests/unit/components/{RiskIndicator,CpdBadge}.test.tsx`

**Interfaces:**
- Consumes: `COLOR` (Task 1).
- Produces:
  - `RiskLevelConfig.textColor: string`
  - `ANC_TO_RISK_LEVEL: Record<string, RiskLevel>`
  - `RiskChip(props: RiskChipProps)` with `RiskChipProps = { level: RiskLevel; score?: number; label?: string; size?: 'sm'|'md'|'lg'; variant?: 'chip'|'dot'; pulse?: boolean; className?: string; title?: string; children?: ReactNode } & Omit<HTMLAttributes<HTMLSpanElement>, 'children'|'title'|'className'>`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/components/shared/RiskChip.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RiskChip } from '@/components/shared/RiskChip';
import { RiskLevel } from '@/types/domain';
import { COLOR } from '@/config/design-tokens';
import { RISK_LEVELS } from '@/config/risk-levels';
import { hexToRgb } from '../../../helpers/color';

describe('RiskChip', () => {
  it('chip: tint background + AA text colour from tokens, Thai aria-label with score', () => {
    render(<RiskChip level={RiskLevel.HIGH} score={11.5} />);
    const chip = screen.getByRole('status');
    expect(chip).toHaveAccessibleName('เสี่ยงสูง คะแนน 11.5');
    expect(chip.style.backgroundColor).toBe(hexToRgb(COLOR.riskHighTint));
    expect(chip.style.color).toBe(hexToRgb(COLOR.riskHighText));
    expect(chip).toHaveTextContent('11.5');
  });

  it('chip without score shows the Thai label', () => {
    render(<RiskChip level={RiskLevel.LOW} />);
    expect(screen.getByRole('status')).toHaveTextContent('เสี่ยงต่ำ');
  });

  it('children override the visible text but not the accessible name', () => {
    render(<RiskChip level={RiskLevel.MEDIUM} label="ความเสี่ยงระดับ 2">HR2</RiskChip>);
    const chip = screen.getByRole('status');
    expect(chip).toHaveTextContent('HR2');
    expect(chip).toHaveAccessibleName('ความเสี่ยงระดับ 2');
  });

  it('dot variant renders a marker dot plus label, colour never the only signal', () => {
    const { container } = render(<RiskChip level={RiskLevel.MEDIUM} variant="dot" pulse />);
    const dot = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(dot.style.backgroundColor).toBe(hexToRgb(COLOR.riskMedium));
    expect(dot.className).toContain('animate-pulse');
    expect(screen.getByText('เสี่ยงปานกลาง')).toBeInTheDocument();
  });

  it('passes through data-* attributes', () => {
    render(<RiskChip level={RiskLevel.HIGH} data-risk="HR3" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-risk', 'HR3');
  });

  it('risk-levels config reads every colour from tokens', () => {
    expect(RISK_LEVELS[RiskLevel.HIGH]).toMatchObject({
      color: COLOR.riskHigh,
      bgColor: COLOR.riskHighTint,
      textColor: COLOR.riskHighText,
    });
    expect(RISK_LEVELS[RiskLevel.LOW].textColor).toBe(COLOR.riskLowText);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/components/shared/RiskChip.test.tsx`
Expected: FAIL with `Failed to resolve import "@/components/shared/RiskChip"`.

- [ ] **Step 3: Point risk config at tokens**

In `src/config/risk-levels.ts`:
- Add `import { COLOR } from '@/config/design-tokens';`.
- Add `textColor: string;` to `RiskLevelConfig` after `bgColor`.
- Set the three entries to:
  - `LOW: color: COLOR.riskLow, bgColor: COLOR.riskLowTint, textColor: COLOR.riskLowText`
  - `MEDIUM: color: COLOR.riskMedium, bgColor: COLOR.riskMediumTint, textColor: COLOR.riskMediumText`
  - `HIGH: color: COLOR.riskHigh, bgColor: COLOR.riskHighTint, textColor: COLOR.riskHighText`

Append to `src/config/anc-risk-display.ts`:

```ts
import { RiskLevel } from '@/types/domain';

/** ANC codes → the shared risk language (HR1/HR2 share medium). */
export const ANC_TO_RISK_LEVEL: Record<string, RiskLevel> = {
  LOW: RiskLevel.LOW,
  HR1: RiskLevel.MEDIUM,
  HR2: RiskLevel.MEDIUM,
  HR3: RiskLevel.HIGH,
};
```

(Put the `import` at the top of the file with the other imports. The file currently has none, so it becomes line 6 after the header comment.)

- [ ] **Step 4: Create `RiskChip`**

```tsx
// src/components/shared/RiskChip.tsx
// The one risk visual. Every risk chip/dot in the app renders through this so
// colour, size and accessible naming cannot drift between screens.
import type { HTMLAttributes, ReactNode } from 'react';
import { RISK_LEVELS } from '@/config/risk-levels';
import type { RiskLevel } from '@/types/domain';
import { cn } from '@/lib/utils';

export type RiskChipProps = {
  level: RiskLevel;
  score?: number;
  /** Accessible/visible Thai label override (defaults to the level's labelTh). */
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'chip' | 'dot';
  pulse?: boolean;
  className?: string;
  title?: string;
  /** Visible content override (e.g. "HR3"); accessible name stays Thai. */
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'title' | 'className'>;

const SIZE: Record<NonNullable<RiskChipProps['size']>, string> = {
  sm: 'px-2 py-0.5 text-caption min-w-8',
  md: 'px-3 py-1 text-label min-w-10',
  lg: 'px-4 py-2 text-title min-w-14',
};

export function RiskChip({
  level,
  score,
  label,
  size = 'md',
  variant = 'chip',
  pulse = false,
  className,
  title,
  children,
  ...rest
}: RiskChipProps) {
  const cfg = RISK_LEVELS[level];
  const name = label ?? cfg.labelTh;
  const accessibleName = score === undefined ? name : `${name} คะแนน ${score.toFixed(1)}`;

  if (variant === 'dot') {
    return (
      <span
        {...rest}
        aria-label={accessibleName}
        title={title}
        className={cn('inline-flex items-center gap-1.5 text-label', className)}
      >
        <span
          aria-hidden="true"
          className={cn('h-2.5 w-2.5 rounded-full', pulse && 'animate-pulse')}
          style={{ backgroundColor: cfg.color }}
        />
        <span style={{ color: cfg.textColor }}>{children ?? name}</span>
      </span>
    );
  }

  return (
    <span
      {...rest}
      role="status"
      aria-label={accessibleName}
      title={title}
      className={cn(
        'inline-flex items-center justify-center gap-1 rounded-full font-semibold tabular-nums',
        SIZE[size],
        className,
      )}
      style={{ backgroundColor: cfg.bgColor, color: cfg.textColor }}
    >
      {children ?? (score !== undefined ? score.toFixed(1) : name)}
    </span>
  );
}
```

- [ ] **Step 5: Route the three existing components through `RiskChip` (their props stay identical)**

`src/components/shared/RiskIndicator.tsx`: replace the component body with:

```tsx
export function RiskIndicator({ riskLevel, pulse = false, className }: RiskIndicatorProps) {
  return <RiskChip level={riskLevel} variant="dot" pulse={pulse} className={className} />;
}
```

(Import `RiskChip` from `@/components/shared/RiskChip`; remove now-unused imports.)

`src/components/shared/CpdBadge.tsx`: keep the existing `title` logic (`HIGH_RISK_RECOMMENDATION` when HIGH). Replace the returned `<span …>` with `<RiskChip>`, moving the current span's children **unchanged** inside it:

```tsx
  return (
    <RiskChip level={riskLevel} score={score} size={size} title={title} className={className}>
      {/* ← the existing span's children, unchanged */}
    </RiskChip>
  );
```

(`title` is whatever the current component computes for its `title` attribute; drop the old `SIZE`/style code.)

`src/components/shared/AncRiskChip.tsx`:

```tsx
import { RiskChip } from '@/components/shared/RiskChip';
import { ANC_RISK_LABEL_TH, ANC_TO_RISK_LEVEL } from '@/config/anc-risk-display';

export function AncRiskChip({ level }: { level: string }) {
  const mapped = ANC_TO_RISK_LEVEL[level];
  if (!mapped) {
    // Unknown/legacy code: neutral chip, still labelled.
    return (
      <span
        data-risk={level}
        role="status"
        aria-label={level}
        className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-caption font-semibold text-ink-muted"
      >
        {level}
      </span>
    );
  }
  return (
    <RiskChip level={mapped} size="sm" label={ANC_RISK_LABEL_TH[level] ?? level} data-risk={level}>
      {level}
    </RiskChip>
  );
}
```

- [ ] **Step 6: Run the chip tests and the existing badge tests**

Run: `npx vitest run tests/unit/components/shared/RiskChip.test.tsx tests/unit/components/RiskIndicator.test.tsx tests/unit/components/CpdBadge.test.tsx`
Expected: RiskChip PASS. Old RiskIndicator/CpdBadge tests that assert old hex or old inline colours fail. Update **only** those assertions to the token values via `hexToRgb(COLOR.…)`: `textColor` for chip text, `color` for dots, `bgColor` for chip backgrounds. Re-run until all PASS.

- [ ] **Step 7: Full suite, typecheck, lint**

Run: `npx vitest run --maxWorkers=6 && npx tsc --noEmit && npm run lint`
Expected: all green. If a test outside the badges fails on a risk colour (charts, map, pages), update it the same way. Any other failure is a regression: investigate it, do not edit the assertion.

- [ ] **Step 8: Commit**

```bash
git add src/config/risk-levels.ts src/config/anc-risk-display.ts src/components/shared/RiskChip.tsx src/components/shared/RiskIndicator.tsx src/components/shared/CpdBadge.tsx src/components/shared/AncRiskChip.tsx tests/unit/components
git commit -m "feat(ui): RiskChip — one risk visual for CPD and ANC chips

Risk config reads tokens and gains an AA-safe textColor; RiskIndicator,
CpdBadge and AncRiskChip keep their props but render through RiskChip, so
risk looks identical on every screen and is never colour-only.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `describeSyncAge` + `FreshnessBadge`

**Files:**
- Create: `src/lib/sync-age.ts`, `src/components/shared/FreshnessBadge.tsx`
- Test: `tests/unit/lib/sync-age.test.ts`, `tests/unit/components/shared/FreshnessBadge.test.tsx`

**Interfaces:**
- Consumes: `classifySyncHealth`, `SyncHealthClass` from `@/config/hospital-network`.
- Produces:
  - `type FreshnessTone = 'ok' | 'warn' | 'danger'`
  - `interface SyncAge { health: SyncHealthClass; tone: FreshnessTone; clock: string | null; relative: string }`
  - `describeSyncAge(lastSyncAt: string | null | undefined, syncStatus?: string, now?: Date): SyncAge`
  - `FreshnessBadge({ lastSyncAt, syncStatus?, label?, now?, className? })`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/lib/sync-age.test.ts
import { describe, it, expect } from 'vitest';
import { describeSyncAge } from '@/lib/sync-age';

const NOW = new Date('2026-10-11T05:40:00Z'); // 12:40 Bangkok

describe('describeSyncAge', () => {
  it('fresh sync → ok, Bangkok clock, minutes ago', () => {
    expect(describeSyncAge('2026-10-11T05:38:00Z', 'OK', NOW)).toEqual({
      health: 'ok', tone: 'ok', clock: '12:38', relative: '2 นาทีที่แล้ว',
    });
  });
  it('under a minute → เมื่อสักครู่', () => {
    expect(describeSyncAge('2026-10-11T05:39:30Z', 'OK', NOW).relative).toBe('เมื่อสักครู่');
  });
  it('over 60 minutes → stale/warn in hours', () => {
    const a = describeSyncAge('2026-10-11T03:10:00Z', 'OK', NOW);
    expect(a).toMatchObject({ health: 'stale', tone: 'warn', relative: '2 ชั่วโมงที่แล้ว' });
  });
  it('over 24 hours → critical/danger, clock includes the Thai date', () => {
    const a = describeSyncAge('2026-09-23T03:02:00Z', 'OK', NOW);
    expect(a).toMatchObject({ health: 'critical', tone: 'danger', relative: '18 วันที่แล้ว' });
    expect(a.clock).toBe('23 ก.ย. 10:02');
  });
  it.each([null, undefined, '', 'not-a-date'])('missing/unparseable %p → never, no NaN', (v) => {
    const a = describeSyncAge(v as string | null | undefined, 'OK', NOW);
    expect(a).toEqual({ health: 'never', tone: 'danger', clock: null, relative: 'ยังไม่เคยซิงค์' });
  });
  it('future-dated sync → warn with a clock-skew hint, never a negative age', () => {
    const a = describeSyncAge('2026-10-11T06:40:00Z', 'OK', NOW);
    expect(a.tone).toBe('warn');
    expect(a.relative).toBe('เวลาซิงค์ล่วงหน้า — ตรวจสอบนาฬิกาเครื่อง');
    expect(a.relative).not.toMatch(/-|NaN/);
  });
  it('BLOCKED status → danger regardless of age', () => {
    expect(describeSyncAge('2026-10-11T05:38:00Z', 'BLOCKED', NOW).tone).toBe('danger');
  });
});
```

```tsx
// tests/unit/components/shared/FreshnessBadge.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FreshnessBadge } from '@/components/shared/FreshnessBadge';

const NOW = new Date('2026-10-11T05:40:00Z');

describe('FreshnessBadge', () => {
  it('renders label, clock and age as a status', () => {
    render(<FreshnessBadge lastSyncAt="2026-10-11T05:38:00Z" now={NOW} />);
    const s = screen.getByRole('status');
    expect(s).toHaveTextContent('ซิงค์ล่าสุด 12:38 · 2 นาทีที่แล้ว');
    expect(s).toHaveAttribute('data-tone', 'ok');
  });
  it('never-synced renders only the Thai explanation', () => {
    render(<FreshnessBadge lastSyncAt={null} now={NOW} />);
    expect(screen.getByRole('status')).toHaveTextContent('ยังไม่เคยซิงค์');
    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'danger');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/unit/lib/sync-age.test.ts tests/unit/components/shared/FreshnessBadge.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/sync-age.ts
// Human-readable data freshness. Classification is delegated to
// classifySyncHealth (the same 60-min / 24-h policy /api/health uses), so the
// badge, the status strip and the health endpoint can never disagree.
import { classifySyncHealth, type SyncHealthClass } from '@/config/hospital-network';

export type FreshnessTone = 'ok' | 'warn' | 'danger';

export interface SyncAge {
  health: SyncHealthClass;
  tone: FreshnessTone;
  clock: string | null;
  relative: string;
}

const HEALTH_TONE: Record<SyncHealthClass, FreshnessTone> = {
  ok: 'ok',
  stale: 'warn',
  critical: 'danger',
  never: 'danger',
  blocked: 'danger',
};

const DAY_MIN = 1440;

function bangkokClock(d: Date): string {
  return d.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function bangkokDate(d: Date): string {
  return d.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' });
}

export function describeSyncAge(
  lastSyncAt: string | null | undefined,
  syncStatus = 'OK',
  now: Date = new Date(),
): SyncAge {
  const t = lastSyncAt ? new Date(lastSyncAt).getTime() : NaN;
  if (!Number.isFinite(t)) {
    return { health: 'never', tone: 'danger', clock: null, relative: 'ยังไม่เคยซิงค์' };
  }
  const synced = new Date(t);
  const mins = Math.floor((now.getTime() - t) / 60_000);
  const clock = mins >= DAY_MIN ? `${bangkokDate(synced)} ${bangkokClock(synced)}` : bangkokClock(synced);

  if (mins < 0) {
    return { health: 'stale', tone: 'warn', clock, relative: 'เวลาซิงค์ล่วงหน้า — ตรวจสอบนาฬิกาเครื่อง' };
  }
  const health = classifySyncHealth(syncStatus, lastSyncAt, now);
  let relative: string;
  if (mins < 1) relative = 'เมื่อสักครู่';
  else if (mins < 60) relative = `${mins} นาทีที่แล้ว`;
  else if (mins < DAY_MIN) relative = `${Math.floor(mins / 60)} ชั่วโมงที่แล้ว`;
  else relative = `${Math.floor(mins / DAY_MIN)} วันที่แล้ว`;
  return { health, tone: HEALTH_TONE[health], clock, relative };
}
```

```tsx
// src/components/shared/FreshnessBadge.tsx
'use client';
import { describeSyncAge, type FreshnessTone } from '@/lib/sync-age';
import { cn } from '@/lib/utils';

const TEXT: Record<FreshnessTone, string> = {
  ok: 'text-ok-text',
  warn: 'text-warn-text',
  danger: 'text-danger-text',
};
const DOT: Record<FreshnessTone, string> = { ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger' };

export interface FreshnessBadgeProps {
  lastSyncAt: string | null | undefined;
  syncStatus?: string;
  label?: string;
  now?: Date;
  className?: string;
}

export function FreshnessBadge({
  lastSyncAt,
  syncStatus,
  label = 'ซิงค์ล่าสุด',
  now,
  className,
}: FreshnessBadgeProps) {
  const a = describeSyncAge(lastSyncAt, syncStatus, now);
  return (
    <span
      role="status"
      data-tone={a.tone}
      suppressHydrationWarning
      className={cn('inline-flex items-center gap-2 text-label', TEXT[a.tone], className)}
    >
      <span aria-hidden="true" className={cn('h-2.5 w-2.5 shrink-0 rounded-full', DOT[a.tone])} />
      {a.clock ? (
        <span>
          {label} <b className="tabular-nums">{a.clock}</b> · {a.relative}
        </span>
      ) : (
        <span>{a.relative}</span>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/unit/lib/sync-age.test.ts tests/unit/components/shared/FreshnessBadge.test.tsx`
Expected: PASS. If `th-TH` month formatting differs on this Node/ICU build (e.g. `ก.ย.` vs `ก.ย`), fix the **implementation** to normalise it. Do not loosen the test; the Thai short month with a trailing dot is the product requirement.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add src/lib/sync-age.ts src/components/shared/FreshnessBadge.tsx tests/unit/lib/sync-age.test.ts tests/unit/components/shared/FreshnessBadge.test.tsx
git commit -m "feat(ui): FreshnessBadge — Thai data-freshness with health-endpoint parity

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `SectionCard`, `PageHeader`, `KpiTile`

**Files:**
- Create: `src/components/shared/SectionCard.tsx`, `src/components/shared/PageHeader.tsx`, `src/components/shared/KpiTile.tsx`
- Test: `tests/unit/components/shared/page-blocks.test.tsx`

**Interfaces:**
- Consumes: `FreshnessBadge` (Task 4), `KpiTip` (`@/components/shared/KpiTip`, props `{ title; body; trigger: ReactElement; children; side? }`).
- Produces:
  - `SectionCard({ title, description?, actions?, tone?: 'default'|'warn'|'danger', className?, children })`
  - `PageHeader({ title, subtitle?, actions?, freshness?: { lastSyncAt: string | null; syncStatus?: string } })`
  - `KpiTile({ label, count, unit?, tone?: 'default'|'high'|'warn', href?, hint?: { title: string; body: ReactNode }, className? })`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/components/shared/page-blocks.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionCard } from '@/components/shared/SectionCard';
import { PageHeader } from '@/components/shared/PageHeader';
import { KpiTile } from '@/components/shared/KpiTile';

describe('SectionCard', () => {
  it('is a labelled region with title, description and actions', () => {
    render(
      <SectionCard title="ผู้คลอดเสี่ยงสูง" description="เรียงตามคะแนน" actions={<button>ดูทั้งหมด</button>}>
        <p>เนื้อหา</p>
      </SectionCard>,
    );
    expect(screen.getByRole('region', { name: 'ผู้คลอดเสี่ยงสูง' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'ผู้คลอดเสี่ยงสูง' })).toBeInTheDocument();
    expect(screen.getByText('เรียงตามคะแนน')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ดูทั้งหมด' })).toBeInTheDocument();
  });
  it('danger tone uses the danger tint', () => {
    render(<SectionCard title="t" tone="danger">x</SectionCard>);
    expect(screen.getByRole('region').className).toContain('bg-danger-tint');
  });
});

describe('PageHeader', () => {
  it('renders an h1, subtitle and freshness badge', () => {
    render(
      <PageHeader
        title="ภาพรวมจังหวัดขอนแก่น"
        subtitle="ผู้คลอดทุกโรงพยาบาลในจังหวัด"
        freshness={{ lastSyncAt: null }}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'ภาพรวมจังหวัดขอนแก่น' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('ยังไม่เคยซิงค์');
  });
});

describe('KpiTile', () => {
  it('shows a formatted server count with tabular figures', () => {
    render(<KpiTile label="รอคลอด" count={1234} />);
    const value = screen.getByText('1,234');
    expect(value.className).toContain('tabular-nums');
    expect(value.className).toContain('text-kpi');
  });
  it('high tone is the solid danger tile with white text', () => {
    const { container } = render(<KpiTile label="เสี่ยงสูง" count={2} tone="high" />);
    expect((container.firstChild as HTMLElement).className).toContain('bg-danger');
    expect((container.firstChild as HTMLElement).className).toContain('text-white');
  });
  it('href makes the whole tile a link named by label and count', () => {
    render(<KpiTile label="เสี่ยงสูง" count={2} href="/?risk=high" />);
    expect(screen.getByRole('link', { name: 'เสี่ยงสูง 2' })).toHaveAttribute('href', '/?risk=high');
  });
  it.each([NaN, Infinity])('non-finite count %p renders an em dash, not NaN', (n) => {
    render(<KpiTile label="รอคลอด" count={n} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/components/shared/page-blocks.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

```tsx
// src/components/shared/SectionCard.tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type SectionTone = 'default' | 'warn' | 'danger';

const TONE: Record<SectionTone, string> = {
  default: 'bg-surface-card',
  warn: 'bg-warn-tint border border-warn/40',
  danger: 'bg-danger-tint border border-danger/40',
};

export interface SectionCardProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  tone?: SectionTone;
  className?: string;
  children: ReactNode;
}

export function SectionCard({ title, description, actions, tone = 'default', className, children }: SectionCardProps) {
  return (
    <section aria-label={title} className={cn('rounded-2xl p-5 shadow-soft', TONE[tone], className)}>
      <header className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-title text-brand">{title}</h2>
          {description && <p className="text-caption text-ink-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}
```

```tsx
// src/components/shared/PageHeader.tsx
import type { ReactNode } from 'react';
import { FreshnessBadge } from '@/components/shared/FreshnessBadge';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  freshness?: { lastSyncAt: string | null; syncStatus?: string };
}

export function PageHeader({ title, subtitle, actions, freshness }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-4">
      <div>
        <h1 className="text-page text-brand">{title}</h1>
        {subtitle && <p className="text-body text-ink-muted">{subtitle}</p>}
        {freshness && (
          <FreshnessBadge className="mt-1" lastSyncAt={freshness.lastSyncAt} syncStatus={freshness.syncStatus} />
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
```

```tsx
// src/components/shared/KpiTile.tsx
// `count` must be a server aggregate (pagination.total / counts / summary),
// never rows.length of a row-limited fetch — the count-provenance rule.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { KpiTip } from '@/components/shared/KpiTip';
import { cn } from '@/lib/utils';

export type KpiTone = 'default' | 'high' | 'warn';

const TONE: Record<KpiTone, { box: string; label: string; value: string }> = {
  default: { box: 'bg-surface-card shadow-soft', label: 'text-ink-muted', value: 'text-brand' },
  high: { box: 'bg-danger text-white', label: 'text-white', value: 'text-white' },
  warn: { box: 'bg-warn-tint border border-warn/40', label: 'text-warn-text', value: 'text-warn-text' },
};

export interface KpiTileProps {
  label: string;
  count: number;
  unit?: string;
  tone?: KpiTone;
  href?: string;
  hint?: { title: string; body: ReactNode };
  className?: string;
}

export function KpiTile({ label, count, unit, tone = 'default', href, hint, className }: KpiTileProps) {
  const t = TONE[tone];
  const shown = Number.isFinite(count) ? count.toLocaleString('en-US') : '—';
  const labelNode = hint ? (
    <KpiTip title={hint.title} body={hint.body} trigger={<span className="cursor-help underline decoration-dotted" />}>
      {label}
    </KpiTip>
  ) : (
    label
  );
  const body = (
    <>
      <div className={cn('text-label', t.label)}>{labelNode}</div>
      <div className={cn('text-kpi tabular-nums', t.value)}>
        {shown}
        {unit && <span className="ml-1 text-body">{unit}</span>}
      </div>
    </>
  );
  const box = cn('block rounded-2xl px-5 py-4', t.box, className);
  return href ? (
    <Link href={href} aria-label={`${label} ${shown}`} className={cn(box, 'transition-transform hover:-translate-y-0.5')}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/components/shared/page-blocks.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add src/components/shared/SectionCard.tsx src/components/shared/PageHeader.tsx src/components/shared/KpiTile.tsx tests/unit/components/shared/page-blocks.test.tsx
git commit -m "feat(ui): SectionCard, PageHeader and KpiTile building blocks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `DataTable`

**Files:**
- Create: `src/components/shared/DataTable.tsx`
- Test: `tests/unit/components/shared/DataTable.test.tsx`

**Interfaces:**
- Consumes: `Table, TableHeader, TableBody, TableHead, TableRow, TableCell, TableCaption` from `@/components/ui/table`; `RiskLevel` from `@/types/domain`.
- Produces:
  - `DataTableColumn<T> = { key: string; header: ReactNode; cell: (row: T) => ReactNode; numeric?: boolean; className?: string }`
  - `DataTable<T>({ columns, rows, rowKey, rowRisk?, loading?, empty?, caption?, onRowClick? })`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/components/shared/DataTable.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { RiskLevel } from '@/types/domain';

type Row = { an: string; name: string; score: number; risk: RiskLevel };
const rows: Row[] = [
  { an: 'AN1', name: 'นาง ส.', score: 11.5, risk: RiskLevel.HIGH },
  { an: 'AN2', name: 'นาง ก.', score: 2.5, risk: RiskLevel.LOW },
];
const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'ผู้คลอด', cell: (r) => r.name },
  { key: 'score', header: 'คะแนน', cell: (r) => r.score.toFixed(1), numeric: true },
];

describe('DataTable', () => {
  it('renders headers and rows, numeric cells right-aligned with tabular figures', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.an} caption="ผู้คลอด" />);
    expect(screen.getByRole('table', { name: 'ผู้คลอด' })).toBeInTheDocument();
    const cell = screen.getByText('11.5').closest('td')!;
    expect(cell.className).toContain('text-right');
    expect(cell.className).toContain('tabular-nums');
  });
  it('tints rows by risk', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.an} rowRisk={(r) => r.risk} />);
    expect(screen.getByText('นาง ส.').closest('tr')!.className).toContain('bg-danger-tint');
    expect(screen.getByText('นาง ก.').closest('tr')!.className).toContain('bg-ok-tint');
  });
  it('loading shows a busy skeleton, not the empty message', () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.an} loading />);
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('ไม่มีข้อมูล')).not.toBeInTheDocument();
  });
  it('empty rows render the empty slot across all columns', () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.an} empty={<span>ยังไม่มีผู้คลอด</span>} />);
    const cell = screen.getByText('ยังไม่มีผู้คลอด').closest('td')!;
    expect(cell).toHaveAttribute('colspan', '2');
  });
  it('clickable rows respond to click and Enter', async () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.an} onRowClick={onRowClick} />);
    const tr = screen.getByText('นาง ก.').closest('tr')!;
    await userEvent.click(tr);
    tr.focus();
    await userEvent.keyboard('{Enter}');
    expect(onRowClick).toHaveBeenCalledTimes(2);
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
    expect(within(tr).getByText('2.5')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/components/shared/DataTable.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
// src/components/shared/DataTable.tsx
'use client';
import type { ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RiskLevel } from '@/types/domain';
import { cn } from '@/lib/utils';

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  numeric?: boolean;
  className?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowRisk?: (row: T) => RiskLevel | null | undefined;
  loading?: boolean;
  empty?: ReactNode;
  caption?: string;
  onRowClick?: (row: T) => void;
}

const RISK_ROW: Record<RiskLevel, string> = {
  [RiskLevel.LOW]: 'bg-ok-tint',
  [RiskLevel.MEDIUM]: 'bg-warn-tint',
  [RiskLevel.HIGH]: 'bg-danger-tint',
};

const SKELETON_ROWS = 3;

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowRisk,
  loading = false,
  empty,
  caption,
  onRowClick,
}: DataTableProps<T>) {
  return (
    <Table aria-busy={loading ? 'true' : undefined} aria-label={caption}>
      {caption && <TableCaption className="sr-only">{caption}</TableCaption>}
      <TableHeader className="sticky top-0 z-10 bg-surface-muted">
        <TableRow>
          {columns.map((c) => (
            <TableHead key={c.key} className={cn('text-label text-ink-muted', c.numeric && 'text-right')}>
              {c.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading &&
          Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <TableRow key={`sk-${i}`} className="animate-pulse">
              {columns.map((c) => (
                <TableCell key={c.key}>
                  <div className="h-4 rounded bg-surface-muted" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        {!loading && rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={columns.length} className="py-8 text-center text-body text-ink-muted">
              {empty ?? 'ไม่มีข้อมูล'}
            </TableCell>
          </TableRow>
        )}
        {!loading &&
          rows.map((row) => {
            const risk = rowRisk?.(row);
            return (
              <TableRow
                key={rowKey(row)}
                className={cn(risk && RISK_ROW[risk], onRowClick && 'cursor-pointer hover:brightness-[0.98]')}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === 'Enter') onRowClick(row);
                      }
                    : undefined
                }
              >
                {columns.map((c) => (
                  <TableCell
                    key={c.key}
                    className={cn('text-body', c.numeric && 'text-right tabular-nums', c.className)}
                  >
                    {c.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
      </TableBody>
    </Table>
  );
}
```

Do not change `ui/table`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/components/shared/DataTable.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add src/components/shared/DataTable.tsx tests/unit/components/shared/DataTable.test.tsx
git commit -m "feat(ui): DataTable presentation wrapper (risk tints, skeleton, empty slot)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `EmptyState` with illustration or icon fallback

**Files:**
- Create: `src/config/illustrations.ts`, `src/components/shared/EmptyState.tsx`
- Test: `tests/unit/components/shared/EmptyState.test.tsx`

**Interfaces:**
- Produces:
  - `type IllustrationName = 'ward' | 'referral' | 'stale' | 'generic'`
  - `ILLUSTRATION_SRC: Record<IllustrationName, string>`
  - `illustrationsEnabled(): boolean`
  - `EmptyState({ illustration?, title, description?, action?, tone?: 'default'|'warn', className? })`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/components/shared/EmptyState.test.tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '@/components/shared/EmptyState';

afterEach(() => vi.unstubAllEnvs());

describe('EmptyState', () => {
  it('flag off (default): icon fallback, no image request', () => {
    vi.stubEnv('NEXT_PUBLIC_ILLUSTRATIONS_ENABLED', '');
    const { container } = render(<EmptyState illustration="ward" title="ยังไม่มีผู้คลอดในห้องคลอดขณะนี้" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'ยังไม่มีผู้คลอดในห้องคลอดขณะนี้' })).toBeInTheDocument();
  });
  it('flag on: decorative illustration from /illustrations', () => {
    vi.stubEnv('NEXT_PUBLIC_ILLUSTRATIONS_ENABLED', 'true');
    const { container } = render(<EmptyState illustration="stale" title="ข้อมูลไม่อัปเดต" />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toContain('state-stale.webp');
    expect(img).toHaveAttribute('alt', '');
  });
  it('warn tone + description + action render', () => {
    render(
      <EmptyState
        illustration="stale"
        tone="warn"
        title="ข้อมูลโรงพยาบาลบ้านไผ่ไม่อัปเดตมา 18 วัน"
        description="วิธีแก้: เปิด KK-LRMS บนเครื่องห้องคลอดที่ล็อกอิน HOSxP ไว้"
        action={<a href="/about#sync">ดูวิธีตั้งค่าการซิงค์</a>}
      />,
    );
    expect(screen.getByRole('status').className).toContain('bg-warn-tint');
    expect(screen.getByText(/วิธีแก้/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ดูวิธีตั้งค่าการซิงค์' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/components/shared/EmptyState.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/config/illustrations.ts
// Static, pre-generated illustrations (scripts/illustrations/manifest.json).
// Gated: Qwen-Image-2.1 output may ship only after the license sign-off —
// until then NEXT_PUBLIC_ILLUSTRATIONS_ENABLED stays unset and EmptyState
// falls back to icons.
export type IllustrationName = 'ward' | 'referral' | 'stale' | 'generic';

export const ILLUSTRATION_SRC: Record<IllustrationName, string> = {
  ward: '/illustrations/empty-ward.webp',
  referral: '/illustrations/empty-referral.webp',
  stale: '/illustrations/state-stale.webp',
  generic: '/illustrations/generic.webp',
};

export function illustrationsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ILLUSTRATIONS_ENABLED === 'true';
}
```

```tsx
// src/components/shared/EmptyState.tsx
import Image from 'next/image';
import type { ReactNode } from 'react';
import { Ambulance, BedDouble, CloudOff, Inbox, type LucideIcon } from 'lucide-react';
import { ILLUSTRATION_SRC, illustrationsEnabled, type IllustrationName } from '@/config/illustrations';
import { cn } from '@/lib/utils';

const ICON: Record<IllustrationName, LucideIcon> = {
  ward: BedDouble,
  referral: Ambulance,
  stale: CloudOff,
  generic: Inbox,
};

export interface EmptyStateProps {
  illustration?: IllustrationName;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: 'default' | 'warn';
  className?: string;
}

export function EmptyState({
  illustration = 'generic',
  title,
  description,
  action,
  tone = 'default',
  className,
}: EmptyStateProps) {
  const Icon = ICON[illustration];
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center gap-2 rounded-2xl px-6 py-8 text-center',
        tone === 'warn' ? 'border border-warn/40 bg-warn-tint' : 'bg-surface-card shadow-soft',
        className,
      )}
    >
      {illustrationsEnabled() ? (
        <Image src={ILLUSTRATION_SRC[illustration]} alt="" width={260} height={195} className="h-auto w-[min(260px,62%)]" />
      ) : (
        <Icon aria-hidden="true" className={cn('h-12 w-12', tone === 'warn' ? 'text-warn-text' : 'text-brand')} />
      )}
      <h3 className={cn('text-title', tone === 'warn' ? 'text-warn-text' : 'text-brand')}>{title}</h3>
      {description && <div className="max-w-prose text-body text-ink-muted">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/components/shared/EmptyState.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add src/config/illustrations.ts src/components/shared/EmptyState.tsx tests/unit/components/shared/EmptyState.test.tsx
git commit -m "feat(ui): EmptyState with flag-gated illustrations and icon fallback

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Restyle the state components to tokens

**Files:**
- Modify: `src/components/shared/ErrorState.tsx`, `src/components/shared/LoadingState.tsx`, `src/components/shared/StaleBanner.tsx`, `src/components/layout/DbHealthBanner.tsx`
- Test: `tests/unit/components/shared/state-restyle.test.tsx`; update `tests/unit/components/{ErrorState,LoadingState,StaleBanner}.test.tsx` where they assert old classes

**Interfaces:**
- Produces: `ErrorState` gains `remedy?: string`, rendered as `วิธีแก้: {remedy}`. All other props are unchanged.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/components/shared/state-restyle.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorState } from '@/components/shared/ErrorState';
import { StaleBanner } from '@/components/shared/StaleBanner';
import { LoadingState } from '@/components/shared/LoadingState';

describe('state components use tokens and actionable Thai copy', () => {
  it('ErrorState banner shows what / since / what-to-do', () => {
    render(
      <ErrorState
        variant="banner"
        message="โหลดข้อมูลแดชบอร์ดไม่สำเร็จ"
        lastUpdatedAt="2026-10-11T05:38:00Z"
        remedy="ตรวจสอบอินเทอร์เน็ต แล้วกดลองใหม่"
        onRetry={() => {}}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('โหลดข้อมูลแดชบอร์ดไม่สำเร็จ');
    expect(alert).toHaveTextContent('วิธีแก้: ตรวจสอบอินเทอร์เน็ต แล้วกดลองใหม่');
    expect(alert.className).toContain('bg-warn-tint');
    expect(alert.className).not.toMatch(/text-\[\d+px\]/);
  });
  it('ErrorState page variant uses the danger text token', () => {
    render(<ErrorState message="ผิดพลาด" />);
    expect(screen.getByText('ผิดพลาด').className).toContain('text-danger-text');
  });
  it('StaleBanner partial outage is a warn strip that names hospitals and the fix', () => {
    render(<StaleBanner allOffline={false} offlineHospitals={['บ้านไผ่']} />);
    const el = screen.getByRole('alert');
    expect(el.className).toContain('bg-warn-tint');
    expect(el).toHaveTextContent('บ้านไผ่');
    expect(el).toHaveTextContent('วิธีแก้');
  });
  it('StaleBanner full outage is a danger strip', () => {
    render(<StaleBanner allOffline offlineHospitals={[]} />);
    expect(screen.getByRole('alert').className).toContain('bg-danger');
  });
  it('LoadingState uses body text', () => {
    render(<LoadingState />);
    expect(screen.getByText('กำลังโหลดข้อมูล...').className).toContain('text-body');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/components/shared/state-restyle.test.tsx`
Expected: FAIL on `remedy`, `bg-warn-tint`, `text-danger-text` and `role="alert"` on StaleBanner.

- [ ] **Step 3: Implement (class/copy changes only, same structure)**

**`ErrorState.tsx`:**
- Add `remedy?: string;` to `ErrorStateProps` and destructure it.
- Banner variant:
  - The root keeps `role="alert"`. Its className becomes `'flex flex-wrap items-center gap-3 border-b border-warn/40 bg-warn-tint px-5 py-2 text-caption text-ink'`. Remove the inline `color-mix` background style and every `var(--ink-navy*)` / `var(--accent-navy-soft)` / `var(--rule-strong)` reference, replacing them with `text-ink`, `text-ink-muted`, `hover:bg-brand-soft`, `border-border`.
  - After the message, add `{remedy && <span className="text-ink-muted">วิธีแก้: {remedy}</span>}`.
- Page variant:
  - The message element's className becomes `'text-body text-danger-text'` (replacing the `var(--risk-high)` style), and the icon gets `className="h-8 w-8 text-danger"`.
  - Add the same `remedy` line under the message, with `text-body text-ink-muted`.

**`StaleBanner.tsx`:**
- The wrapper gets `role="alert"` and keeps its `fixed top-0 …` positioning. Replace `bg-red-600 … text-white` with `bg-danger text-white`, and `bg-yellow-500 …` with `border-b border-warn bg-warn-tint text-warn-text`. Keep the existing text.
- Append `<span className="ml-2">วิธีแก้: เปิด KK-LRMS บนเครื่องห้องคลอดที่ล็อกอิน HOSxP ไว้ ระบบจะซิงค์ให้อัตโนมัติ</span>` to both variants.

**`LoadingState.tsx`:** the message element gets `text-body text-muted-foreground`. The spinner and skeleton are unchanged (they already use shadcn tokens, which Task 1 remapped).

**`DbHealthBanner.tsx`:** replace the gradient/hex inline styles with the className `border-b border-danger bg-danger-tint px-4 py-2 text-caption text-danger-text` and remove `font-mono text-[12px]`. Keep the existing message and retry button, and append ` วิธีแก้: กด "ลองอีกครั้ง" หากยังไม่หายให้แจ้งผู้ดูแลระบบ` to the message if it has no remedy clause.

- [ ] **Step 4: Run the new and existing state tests**

Run: `npx vitest run tests/unit/components/shared/state-restyle.test.tsx tests/unit/components/ErrorState.test.tsx tests/unit/components/LoadingState.test.tsx tests/unit/components/StaleBanner.test.tsx`
Expected: the new test PASSES. Old tests asserting `bg-red-600` / `bg-yellow-500` / `color-mix` fail: update those to the token classes above. Behaviour assertions (retry callback, null render when healthy) must pass **unchanged**.

- [ ] **Step 5: Full suite, typecheck, lint, commit**

```bash
npx vitest run --maxWorkers=6 && npx tsc --noEmit && npm run lint
git add src/components/shared/ErrorState.tsx src/components/shared/LoadingState.tsx src/components/shared/StaleBanner.tsx src/components/layout/DbHealthBanner.tsx tests/unit/components
git commit -m "feat(ui): state components on tokens with what/since/what-to-do copy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Shared active-labour risk counts + health excludes pseudo-hospitals

**Files:**
- Modify: `src/services/dashboard.ts` (the inline `counts` query in `getProvinceDashboard`, lines ~99–108)
- Modify: `src/services/health.ts` (hospital query + loop)
- Test: `tests/unit/services/active-labor-risk.test.ts`, `tests/unit/services/health-exempt.test.ts`

**Interfaces:**
- Produces:
  - `interface ActiveLaborRiskRow { hospital_id: string; hcode: string; risk_level: string | null; count: number }`
  - `countActiveLaborByRisk(db: DatabaseAdapter, opts?: { hcode?: string }): Promise<ActiveLaborRiskRow[]>`, where `count` is always a number.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/services/active-labor-risk.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { PgliteAdapter } from '@/db/pglite-adapter';
import { countActiveLaborByRisk } from '@/services/dashboard';

async function seedHospital(db: PgliteAdapter, id: string, hcode: string) {
  await db.query(
    `INSERT INTO hospitals (id, hcode, name, level, is_active, connection_status, created_at, updated_at)
     VALUES (?, ?, ?, 'A_S', true, 'ONLINE', NOW(), NOW())`,
    [id, hcode, `รพ.${hcode}`],
  );
}
async function seedPatient(db: PgliteAdapter, id: string, hospitalId: string, status: string, risk: string | null) {
  await db.query(
    `INSERT INTO cached_patients (id, hospital_id, hn, an, name, labor_status, admit_date, synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'enc', ?, NOW(), NOW(), NOW(), NOW())`,
    [id, hospitalId, `HN-${id}`, `AN-${id}`, status],
  );
  if (risk) {
    await db.query(
      `INSERT INTO cpd_scores (id, patient_id, score, risk_level, recommendation, calculated_at, created_at)
       VALUES (?, ?, 11, ?, '-', NOW(), NOW())`,
      [`cs-${id}`, id, risk],
    );
  }
}

describe('countActiveLaborByRisk', () => {
  let db: PgliteAdapter;
  beforeEach(async () => {
    db = await createTestDb();
    await seedHospital(db, 'h1', '11000');
    await seedHospital(db, 'h2', '11002');
    await seedPatient(db, 'p1', 'h1', 'ACTIVE', 'HIGH');
    await seedPatient(db, 'p2', 'h1', 'ACTIVE', 'HIGH');
    await seedPatient(db, 'p3', 'h1', 'DELIVERED', 'HIGH'); // not active → excluded
    await seedPatient(db, 'p4', 'h2', 'ACTIVE', 'LOW');
  });

  it('counts ACTIVE labour by latest risk per hospital, as numbers', async () => {
    const rows = await countActiveLaborByRisk(db);
    const high = rows.find((r) => r.hcode === '11000' && r.risk_level === 'HIGH');
    expect(high?.count).toBe(2);
    expect(typeof high?.count).toBe('number');
    expect(rows.find((r) => r.hcode === '11002' && r.risk_level === 'LOW')?.count).toBe(1);
  });

  it('filters to one hospital by hcode', async () => {
    const rows = await countActiveLaborByRisk(db, { hcode: '11002' });
    expect(new Set(rows.map((r) => r.hcode))).toEqual(new Set(['11002']));
  });
});
```

If an insert fails on a NOT NULL column, copy the full column list for that table from `tests/unit/api/dashboard.test.ts` (the `INSERT INTO cached_patients` at line ~31 and the `INSERT INTO cpd_scores` at line ~112) into the helper. Keep the values above.

```ts
// tests/unit/services/health-exempt.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { PgliteAdapter } from '@/db/pglite-adapter';
import { getHealthStatus } from '@/services/health';

describe('health excludes pseudo-hospitals (EXEMPT_HCODES)', () => {
  let db: PgliteAdapter;
  beforeEach(async () => {
    db = await createTestDb();
    const fresh = new Date(Date.now() - 5 * 60_000).toISOString();
    const old = new Date(Date.now() - 10 * 86_400_000).toISOString();
    for (const [id, hcode, last] of [
      ['h1', '11000', fresh],
      ['h99', '99999', old], // Provincial Admin — never a real feed
      ['h0', '00000', null],
    ] as const) {
      await db.query(
        `INSERT INTO hospitals (id, hcode, name, level, is_active, connection_status, last_sync_at, created_at, updated_at)
         VALUES (?, ?, ?, 'A_S', true, 'ONLINE', ?, NOW(), NOW())`,
        [id, hcode, `รพ.${hcode}`, last],
      );
    }
  });

  it('counts only reporting hospitals and is not degraded by 99999/00000', async () => {
    const h = await getHealthStatus(db);
    expect(h.hospitalConnections.total).toBe(1);
    expect(h.hospitalConnections.stale).toBe(0);
    expect(h.degradedReasons).not.toContain('hospital_sync_stale');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/unit/services/active-labor-risk.test.ts tests/unit/services/health-exempt.test.ts`
Expected: the first fails with `countActiveLaborByRisk is not a function`; the second fails with `expected 3 to be 1`.

- [ ] **Step 3: Extract the shared query in `src/services/dashboard.ts`**

Add above `getProvinceDashboard`:

```ts
export interface ActiveLaborRiskRow {
  hospital_id: string;
  hcode: string;
  risk_level: string | null;
  count: number;
}

/** ACTIVE labour per hospital by latest CPD risk — the one aggregate behind
 *  every "high risk N" number (dashboard, status strip). */
export async function countActiveLaborByRisk(
  db: DatabaseAdapter,
  opts: { hcode?: string } = {},
): Promise<ActiveLaborRiskRow[]> {
  const params: string[] = [];
  let hcodeFilter = '';
  if (opts.hcode) {
    params.push(opts.hcode);
    hcodeFilter = 'AND h.hcode = ?';
  }
  // SQLite-compatible: no LATERAL join, use subquery
  const rows = await db.query<ActiveLaborRiskRow>(
    `SELECT h.id as hospital_id, h.hcode,
       (SELECT cs.risk_level FROM cpd_scores cs
        WHERE cs.patient_id = cp.id
        ORDER BY cs.calculated_at DESC LIMIT 1) as risk_level,
       COUNT(cp.id) as count
     FROM hospitals h
     LEFT JOIN cached_patients cp ON cp.hospital_id = h.id AND cp.labor_status = 'ACTIVE'
     WHERE h.is_active = true ${hcodeFilter}
     GROUP BY h.id, h.hcode, risk_level`,
    params,
  );
  return rows.map((r) => ({ ...r, count: Number(r.count) || 0 }));
}
```

In `getProvinceDashboard`, replace the inline `const counts = await db.query<PatientCountRow>(…)` with `const counts = await countActiveLaborByRisk(db);`. If `PatientCountRow` has no other users, delete it (`grep -n PatientCountRow src/services/dashboard.ts`).

- [ ] **Step 4: Exclude `EXEMPT_HCODES` in `src/services/health.ts`**

Add `import { EXEMPT_HCODES } from '@/lib/hospital-access-guard';`, then change the query and add a filter:

```ts
    const hospitals = (
      await db.query<{
        hcode: string;
        connection_status: string;
        last_sync_at: string | Date | null;
      }>('SELECT hcode, connection_status, last_sync_at FROM hospitals WHERE is_active = true')
    ).filter((h) => !EXEMPT_HCODES.has(h.hcode)); // pseudo-hospitals never sync
```

The rest of the loop is unchanged.

- [ ] **Step 5: Run the new tests plus the existing dashboard and health suites**

Run: `npx vitest run tests/unit/services/active-labor-risk.test.ts tests/unit/services/health-exempt.test.ts tests/unit/api/dashboard.test.ts tests/unit/api/health.test.ts tests/unit/api/health-route.test.ts`
Expected: all PASS. If an existing health test seeded `99999` and expected it counted, that test encoded the bug; update its expectation and note it in the commit message.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add src/services/dashboard.ts src/services/health.ts tests/unit/services/active-labor-risk.test.ts tests/unit/services/health-exempt.test.ts tests/unit/api
git commit -m "fix(health): stop pseudo-hospitals 99999/00000 degrading /api/health; share risk counts

The 2026-10-11 health check showed /api/health permanently 'degraded'
partly because Provincial Admin (99999) never syncs. EXEMPT_HCODES already
defines these accounts; health now excludes them. The ACTIVE-labour risk
aggregate is extracted so the status strip reuses the dashboard's numbers.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Freshness service + `GET /api/sync/freshness`

**Files:**
- Create: `src/types/sync-freshness.ts`, `src/services/sync-freshness.ts`, `src/app/api/sync/freshness/route.ts`
- Test: `tests/unit/services/sync-freshness.test.ts`, `tests/unit/api/sync-freshness-route.test.ts`

**Interfaces:**
- Consumes: `countActiveLaborByRisk` (Task 9), `classifySyncHealth`, `EXEMPT_HCODES`, `auth`, `getDatabase`, `ensureInit`, `cacheGetJson`, `cacheSetJson`.
- Produces:

```ts
// src/types/sync-freshness.ts
import type { SyncHealthClass } from '@/config/hospital-network';
export interface FreshnessSummary {
  generatedAt: string;
  province: {
    reporting: number;
    fresh: number;
    stale: number; // stale + critical + future-dated
    never: number;
    highRisk: number;
    lastSyncAt: string | null;
  };
  own: { hcode: string; name: string; lastSyncAt: string | null; health: SyncHealthClass; highRisk: number } | null;
}
```

- `getSyncFreshness(db: DatabaseAdapter, opts: { hcode: string | null | undefined; now?: Date }): Promise<FreshnessSummary>`
- `GET /api/sync/freshness` → `200 FreshnessSummary` | `401 { error: 'Unauthorized' }` | `500 { error, message }`

- [ ] **Step 1: Write the failing service test**

```ts
// tests/unit/services/sync-freshness.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { PgliteAdapter } from '@/db/pglite-adapter';
import { getSyncFreshness } from '@/services/sync-freshness';

const NOW = new Date('2026-10-11T05:40:00Z');
const mins = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

describe('getSyncFreshness', () => {
  let db: PgliteAdapter;
  beforeEach(async () => {
    db = await createTestDb();
    const rows: Array<[string, string, string | null]> = [
      ['h1', '11000', mins(5)], // fresh
      ['h2', '11002', mins(60 * 24 * 18)], // 18 days stale (บ้านไผ่)
      ['h3', '10998', mins(90)], // stale
      ['h4', '77652', null], // never
      ['h5', '11004', new Date(NOW.getTime() + 3_600_000).toISOString()], // future-dated
      ['h99', '99999', mins(60 * 24 * 10)], // exempt pseudo-hospital
    ];
    for (const [id, hcode, last] of rows) {
      await db.query(
        `INSERT INTO hospitals (id, hcode, name, level, is_active, connection_status, last_sync_at, created_at, updated_at)
         VALUES (?, ?, ?, 'A_S', true, 'ONLINE', ?, NOW(), NOW())`,
        [id, hcode, `รพ.${hcode}`, last],
      );
    }
    await db.query(
      `INSERT INTO cached_patients (id, hospital_id, hn, an, name, labor_status, admit_date, synced_at, created_at, updated_at)
       VALUES ('p1','h1','HN1','AN1','enc','ACTIVE',NOW(),NOW(),NOW(),NOW())`,
    );
    await db.query(
      `INSERT INTO cpd_scores (id, patient_id, score, risk_level, recommendation, calculated_at, created_at)
       VALUES ('c1','p1',11,'HIGH','-',NOW(),NOW())`,
    );
  });

  it('province summary excludes exempt hcodes and classifies every feed', async () => {
    const s = await getSyncFreshness(db, { hcode: null, now: NOW });
    expect(s.province).toEqual({
      reporting: 5,
      fresh: 1,
      stale: 3, // 18-day, 90-min, future-dated
      never: 1,
      highRisk: 1,
      lastSyncAt: mins(5),
    });
    expect(s.own).toBeNull();
    expect(s.generatedAt).toBe(NOW.toISOString());
  });

  it('hospital session gets its own block', async () => {
    const s = await getSyncFreshness(db, { hcode: '11000', now: NOW });
    expect(s.own).toEqual({ hcode: '11000', name: 'รพ.11000', lastSyncAt: mins(5), health: 'ok', highRisk: 1 });
  });

  it.each(['99999', '00000', '55555', undefined])('exempt/unregistered/missing hcode %p → own null, no throw', async (hcode) => {
    const s = await getSyncFreshness(db, { hcode, now: NOW });
    expect(s.own).toBeNull();
    expect(s.province.reporting).toBe(5);
  });

  it('own block never leaks another hospital', async () => {
    const s = await getSyncFreshness(db, { hcode: '11002', now: NOW });
    expect(s.own?.hcode).toBe('11002');
    expect(JSON.stringify(s)).not.toContain('11000');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/services/sync-freshness.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the type and service**

Create `src/types/sync-freshness.ts` with the interface in **Interfaces** above, then:

```ts
// src/services/sync-freshness.ts
// Province + own-hospital data freshness for the app-wide status strip.
// Staleness uses classifySyncHealth (same policy as /api/health and
// FreshnessBadge); the high-risk number reuses countActiveLaborByRisk (same
// aggregate as the dashboard). Pseudo-hospitals (EXEMPT_HCODES) never sync
// and are excluded. Returns counts only — no per-hospital list — so a
// hospital session learns nothing it can't already see on the dashboard.
import type { DatabaseAdapter } from '@/db/adapter';
import { classifySyncHealth } from '@/config/hospital-network';
import { EXEMPT_HCODES } from '@/lib/hospital-access-guard';
import { countActiveLaborByRisk } from '@/services/dashboard';
import type { FreshnessSummary } from '@/types/sync-freshness';

interface HospitalSyncRow {
  hcode: string;
  name: string;
  last_sync_at: string | Date | null;
}

function toIso(v: string | Date | null): string | null {
  if (v === null) return null;
  return v instanceof Date ? v.toISOString() : v;
}

export async function getSyncFreshness(
  db: DatabaseAdapter,
  opts: { hcode: string | null | undefined; now?: Date },
): Promise<FreshnessSummary> {
  const now = opts.now ?? new Date();
  const hospitals = await db.query<HospitalSyncRow>(
    'SELECT hcode, name, last_sync_at FROM hospitals WHERE is_active = true',
  );
  const reporting = hospitals.filter((h) => !EXEMPT_HCODES.has(h.hcode));

  const highByHcode = new Map<string, number>();
  for (const r of await countActiveLaborByRisk(db)) {
    if (r.risk_level === 'HIGH') highByHcode.set(r.hcode, (highByHcode.get(r.hcode) ?? 0) + r.count);
  }

  let fresh = 0;
  let stale = 0;
  let never = 0;
  let latest: number | null = null;
  for (const h of reporting) {
    const iso = toIso(h.last_sync_at);
    const t = iso ? new Date(iso).getTime() : NaN;
    if (!Number.isFinite(t)) {
      never += 1;
      continue;
    }
    if (t > now.getTime()) {
      stale += 1; // future-dated: same treatment as /api/health
      continue;
    }
    if (classifySyncHealth('OK', iso, now) === 'ok') fresh += 1;
    else stale += 1;
    if (latest === null || t > latest) latest = t;
  }

  let own: FreshnessSummary['own'] = null;
  if (opts.hcode && !EXEMPT_HCODES.has(opts.hcode)) {
    const h = reporting.find((x) => x.hcode === opts.hcode);
    if (h) {
      const iso = toIso(h.last_sync_at);
      own = {
        hcode: h.hcode,
        name: h.name,
        lastSyncAt: iso,
        health: classifySyncHealth('OK', iso, now),
        highRisk: highByHcode.get(h.hcode) ?? 0,
      };
    }
  }

  return {
    generatedAt: now.toISOString(),
    province: {
      reporting: reporting.length,
      fresh,
      stale,
      never,
      highRisk: reporting.reduce((sum, h) => sum + (highByHcode.get(h.hcode) ?? 0), 0),
      lastSyncAt: latest === null ? null : new Date(latest).toISOString(),
    },
    own,
  };
}
```

- [ ] **Step 4: Run the service test**

Run: `npx vitest run tests/unit/services/sync-freshness.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing route test**

```ts
// tests/unit/api/sync-freshness-route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
const freshnessMock = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: vi.fn() }));
vi.mock('@/db/connection', () => ({ getDatabase: vi.fn(async () => ({})) }));
vi.mock('@/services/sync-freshness', () => ({
  getSyncFreshness: (...a: unknown[]) => freshnessMock(...a),
}));

import { GET } from '@/app/api/sync/freshness/route';

describe('GET /api/sync/freshness', () => {
  beforeEach(() => {
    authMock.mockReset();
    freshnessMock.mockReset();
  });

  it('401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(freshnessMock).not.toHaveBeenCalled();
  });

  it('scopes by the session hcode — never a client-supplied one', async () => {
    authMock.mockResolvedValue({ user: { hospitalCode: '11002', role: 'NURSE' } });
    freshnessMock.mockResolvedValue({ generatedAt: 'x', province: {}, own: null });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(freshnessMock).toHaveBeenCalledWith(expect.anything(), { hcode: '11002' });
  });

  it('500 with an actionable Thai message when the service throws', async () => {
    authMock.mockResolvedValue({ user: { hospitalCode: '11002', role: 'NURSE' } });
    freshnessMock.mockRejectedValue(new Error('db down'));
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toMatch(/ลองใหม่/);
  });
});
```

- [ ] **Step 6: Implement the route**

```ts
// src/app/api/sync/freshness/route.ts
// GET /api/sync/freshness — app-wide status strip data, scoped by the session.
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ensureInit } from '@/lib/ensure-init';
import { getDatabase } from '@/db/connection';
import { cacheGetJson, cacheSetJson } from '@/lib/cache';
import { logger } from '@/lib/logger';
import { getSyncFreshness } from '@/services/sync-freshness';
import type { FreshnessSummary } from '@/types/sync-freshness';

const CACHE_TTL_SECONDS = 15;
const CACHE_ENABLED = process.env.NODE_ENV !== 'test';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const hcode = session.user.hospitalCode ?? null;
  const key = `cache:sync-freshness:${hcode ?? 'none'}`;
  try {
    await ensureInit();
    if (CACHE_ENABLED) {
      const cached = await cacheGetJson<FreshnessSummary>(key);
      if (cached) return NextResponse.json(cached);
    }
    const db = await getDatabase();
    const summary = await getSyncFreshness(db, { hcode });
    if (CACHE_ENABLED) await cacheSetJson(key, summary, CACHE_TTL_SECONDS);
    return NextResponse.json(summary);
  } catch (error) {
    logger.error('sync_freshness_failed', { hcode, error: String(error) });
    return NextResponse.json(
      {
        error: 'sync_freshness_failed',
        message: 'ตรวจสอบสถานะข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง หากยังไม่หายให้แจ้งผู้ดูแลระบบ',
      },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 7: Run both tests, typecheck, lint, commit**

```bash
npx vitest run tests/unit/services/sync-freshness.test.ts tests/unit/api/sync-freshness-route.test.ts
npx tsc --noEmit && npm run lint
git add src/types/sync-freshness.ts src/services/sync-freshness.ts src/app/api/sync/freshness/route.ts tests/unit/services/sync-freshness.test.ts tests/unit/api/sync-freshness-route.test.ts
git commit -m "feat(sync): session-scoped /api/sync/freshness for the status strip

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: both tests PASS; tsc/lint exit 0.

---

### Task 11: `useSyncFreshness` + `StatusStrip`

**Files:**
- Create: `src/hooks/useSyncFreshness.ts`, `src/components/layout/StatusStrip.tsx`
- Test: `tests/unit/components/layout/StatusStrip.test.tsx`

**Interfaces:**
- Consumes: `FreshnessSummary` (Task 10), `describeSyncAge` / `FreshnessBadge` (Task 4).
- Produces:
  - `useSyncFreshness(): SWRResponse<FreshnessSummary, Error>` (refreshInterval 30s)
  - `StatusStrip({ variant: 'provincial' | 'hospital' })`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/components/layout/StatusStrip.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FreshnessSummary } from '@/types/sync-freshness';

const swrState: { data?: FreshnessSummary; error?: Error; isLoading: boolean; mutate: () => void } = {
  isLoading: false,
  mutate: vi.fn(),
};
vi.mock('@/hooks/useSyncFreshness', () => ({ useSyncFreshness: () => swrState }));

import { StatusStrip } from '@/components/layout/StatusStrip';

const summary: FreshnessSummary = {
  generatedAt: '2026-10-11T05:40:00Z',
  province: { reporting: 27, fresh: 16, stale: 10, never: 1, highRisk: 2, lastSyncAt: '2026-10-11T05:38:00Z' },
  own: { hcode: '11000', name: 'รพ.น้ำพอง', lastSyncAt: '2026-10-11T05:38:00Z', health: 'ok', highRisk: 1 },
};

describe('StatusStrip', () => {
  beforeEach(() => {
    swrState.data = undefined;
    swrState.error = undefined;
    swrState.isLoading = false;
  });

  it('provincial: fresh x/y, stale count linking to hospitals, high-risk link', () => {
    swrState.data = summary;
    render(<StatusStrip variant="provincial" />);
    expect(screen.getByText(/ข้อมูลสด/)).toHaveTextContent('ข้อมูลสด 16/27 รพ.');
    expect(screen.getByRole('link', { name: /ไม่ซิงค์เกิน 1 ชม\. 10 รพ\./ })).toHaveAttribute('href', '/hospitals');
    expect(screen.getByRole('link', { name: 'เสี่ยงสูง 2 ราย' })).toHaveAttribute('href', '/');
    expect(screen.getByText(/ยังไม่เคยซิงค์/)).toHaveTextContent('ยังไม่เคยซิงค์ 1 รพ.');
  });

  it('hospital: own freshness badge + ward high-risk link', () => {
    swrState.data = summary;
    render(<StatusStrip variant="hospital" />);
    expect(screen.getByRole('status')).toHaveTextContent('ข้อมูลจาก HOSxP ล่าสุด');
    expect(screen.getByRole('link', { name: 'เสี่ยงสูง 1 ราย' })).toHaveAttribute('href', '/hospital-maternity-ward');
  });

  it('hospital session without an own block explains why', () => {
    swrState.data = { ...summary, own: null };
    render(<StatusStrip variant="hospital" />);
    expect(screen.getByText('บัญชีนี้ไม่ได้ผูกกับโรงพยาบาลที่ส่งข้อมูล')).toBeInTheDocument();
  });

  it('zero high risk is calm, not a red pill', () => {
    swrState.data = { ...summary, province: { ...summary.province, highRisk: 0 } };
    render(<StatusStrip variant="provincial" />);
    expect(screen.getByText('ไม่มีผู้คลอดเสี่ยงสูง')).toBeInTheDocument();
  });

  it('API failure: quiet Thai notice with retry, page keeps working', async () => {
    swrState.error = new Error('HTTP 500');
    render(<StatusStrip variant="provincial" />);
    expect(screen.getByText('ไม่สามารถตรวจสอบสถานะข้อมูลได้')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'ลองใหม่' }));
    expect(swrState.mutate).toHaveBeenCalled();
  });

  it('loading renders a fixed-height placeholder (no layout jump)', () => {
    swrState.isLoading = true;
    const { container } = render(<StatusStrip variant="provincial" />);
    expect(container.firstChild).toHaveAttribute('aria-busy', 'true');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/components/layout/StatusStrip.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the hook and strip**

```ts
// src/hooks/useSyncFreshness.ts
'use client';
// Polls a 15s server-cached endpoint every 30s. Deliberately no SSE here:
// useSSE opens one EventSource per call, and the strip is on every page.
import useSWR from 'swr';
import type { FreshnessSummary } from '@/types/sync-freshness';

const REFRESH_MS = 30_000;

async function fetchFreshness(url: string): Promise<FreshnessSummary> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as FreshnessSummary;
}

export function useSyncFreshness() {
  return useSWR<FreshnessSummary, Error>('/api/sync/freshness', fetchFreshness, {
    refreshInterval: REFRESH_MS,
    revalidateOnFocus: true,
  });
}
```

```tsx
// src/components/layout/StatusStrip.tsx
'use client';
import Link from 'next/link';
import { useSyncFreshness } from '@/hooks/useSyncFreshness';
import { FreshnessBadge } from '@/components/shared/FreshnessBadge';
import { describeSyncAge } from '@/lib/sync-age';
import { cn } from '@/lib/utils';

const BAR =
  'flex min-h-9 flex-wrap items-center gap-x-5 gap-y-1 border-b border-border bg-surface-muted px-5 py-1.5 text-label text-ink-muted';

function Dot({ tone }: { tone: 'ok' | 'warn' | 'danger' }) {
  const cls = { ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger' }[tone];
  return <span aria-hidden="true" className={cn('inline-block h-2.5 w-2.5 rounded-full', cls)} />;
}

function HighRisk({ count, href }: { count: number; href: string }) {
  if (count <= 0) return <span className="ml-auto text-ok-text">ไม่มีผู้คลอดเสี่ยงสูง</span>;
  return (
    <Link href={href} className="ml-auto rounded-full bg-danger px-3 py-0.5 font-semibold text-white">
      เสี่ยงสูง {count} ราย
    </Link>
  );
}

export function StatusStrip({ variant }: { variant: 'provincial' | 'hospital' }) {
  const { data, error, isLoading, mutate } = useSyncFreshness();

  if (isLoading && !data) return <div aria-busy="true" className={BAR} />;
  if (error && !data) {
    return (
      <div className={BAR}>
        <span>ไม่สามารถตรวจสอบสถานะข้อมูลได้</span>
        <button type="button" onClick={() => void mutate()} className="underline">
          ลองใหม่
        </button>
      </div>
    );
  }
  if (!data) return null;

  if (variant === 'hospital') {
    return (
      <div className={BAR}>
        {data.own ? (
          <>
            <FreshnessBadge lastSyncAt={data.own.lastSyncAt} label="ข้อมูลจาก HOSxP ล่าสุด" />
            <HighRisk count={data.own.highRisk} href="/hospital-maternity-ward" />
          </>
        ) : (
          <span>บัญชีนี้ไม่ได้ผูกกับโรงพยาบาลที่ส่งข้อมูล</span>
        )}
      </div>
    );
  }

  const p = data.province;
  const clock = describeSyncAge(p.lastSyncAt).clock;
  return (
    <div className={BAR}>
      <span className="inline-flex items-center gap-2">
        <Dot tone="ok" />
        ข้อมูลสด{' '}
        <b className="tabular-nums text-ink">
          {p.fresh}/{p.reporting}
        </b>{' '}
        รพ.
      </span>
      {p.stale > 0 && (
        <Link href="/hospitals" className="inline-flex items-center gap-2 hover:underline">
          <Dot tone="warn" />
          ไม่ซิงค์เกิน 1 ชม. <b className="tabular-nums text-ink">{p.stale}</b> รพ.
        </Link>
      )}
      {p.never > 0 && (
        <span className="inline-flex items-center gap-2">
          <Dot tone="danger" />
          ยังไม่เคยซิงค์ <b className="tabular-nums text-ink">{p.never}</b> รพ.
        </span>
      )}
      {clock && (
        <span>
          อัปเดตล่าสุด <b className="tabular-nums text-ink">{clock}</b>
        </span>
      )}
      <HighRisk count={p.highRisk} href="/" />
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/components/layout/StatusStrip.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add src/hooks/useSyncFreshness.ts src/components/layout/StatusStrip.tsx tests/unit/components/layout/StatusStrip.test.tsx
git commit -m "feat(ui): StatusStrip — province/own data freshness and high-risk count

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Nav per variant, persisted sidebar state, presence heartbeat hook

**Files:**
- Modify: `src/config/nav.ts`, `src/components/layout/TopNavBar.tsx` (heartbeat moves out)
- Create: `src/hooks/useSidebarState.ts`, `src/hooks/usePresenceHeartbeat.ts`
- Test: `tests/unit/config/nav.test.ts`, `tests/unit/hooks/useSidebarState.test.ts`

**Interfaces:**
- Produces:
  - `type ShellVariant = 'provincial' | 'hospital'`
  - `HOSPITAL_NAV_ITEMS: NavItem[]`
  - `navItemsFor(variant: ShellVariant, role: string | null | undefined): NavItem[]`
  - `useSidebarState(): { collapsed: boolean; toggle: () => void }`, with storage key `kk-lrms:sidebar-collapsed`
  - `usePresenceHeartbeat(pathname: string, userId: string | undefined): void`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/config/nav.test.ts
import { describe, it, expect } from 'vitest';
import { navItemsFor, NAV_ITEMS, HOSPITAL_NAV_ITEMS } from '@/config/nav';

describe('navItemsFor', () => {
  it('hospital variant: ward + profile only (previously an empty nav)', () => {
    expect(navItemsFor('hospital', 'NURSE').map((i) => i.href)).toEqual(['/hospital-maternity-ward', '/profile']);
    expect(HOSPITAL_NAV_ITEMS.map((i) => i.label)).toEqual(['ห้องคลอด', 'โปรไฟล์']);
  });
  it('provincial non-admin hides admin-only items', () => {
    expect(navItemsFor('provincial', 'NURSE').some((i) => i.adminOnly)).toBe(false);
  });
  it('provincial admin sees everything', () => {
    expect(navItemsFor('provincial', 'ADMIN')).toHaveLength(NAV_ITEMS.length);
  });
});
```

```ts
// tests/unit/hooks/useSidebarState.test.ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSidebarState } from '@/hooks/useSidebarState';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('useSidebarState', () => {
  it('defaults to expanded and persists a toggle', () => {
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.collapsed).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
    expect(window.localStorage.getItem('kk-lrms:sidebar-collapsed')).toBe('1');
  });
  it('restores a saved collapsed state', () => {
    window.localStorage.setItem('kk-lrms:sidebar-collapsed', '1');
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.collapsed).toBe(true);
  });
  it('storage that throws (private mode) → expanded, toggle still works', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.collapsed).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/unit/config/nav.test.ts tests/unit/hooks/useSidebarState.test.ts`
Expected: FAIL (`navItemsFor` and the hook are not defined).

- [ ] **Step 3: Implement**

Append to `src/config/nav.ts`. Add `UserRound` to the existing `lucide-react` import and update the header comment's "TopNavBar (legacy chrome)" to "AppShell sidebar".

```ts
export type ShellVariant = 'provincial' | 'hospital';

/** Hospital-role sessions: their ward and their profile (notification prefs). */
export const HOSPITAL_NAV_ITEMS: NavItem[] = [
  { href: '/hospital-maternity-ward', label: 'ห้องคลอด', icon: Stethoscope },
  { href: '/profile', label: 'โปรไฟล์', icon: UserRound },
];

export function navItemsFor(variant: ShellVariant, role: string | null | undefined): NavItem[] {
  return variant === 'hospital' ? HOSPITAL_NAV_ITEMS : filterNavByRole(NAV_ITEMS, role);
}
```

```ts
// src/hooks/useSidebarState.ts
'use client';
import { useCallback, useEffect, useState } from 'react';

const KEY = 'kk-lrms:sidebar-collapsed';

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false; // blocked storage: default expanded
  }
}

function write(collapsed: boolean): void {
  try {
    window.localStorage.setItem(KEY, collapsed ? '1' : '0');
  } catch {
    // Per-browser convenience only — never block the UI on storage.
  }
}

export function useSidebarState(): { collapsed: boolean; toggle: () => void } {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(read());
  }, []);
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      write(!c);
      return !c;
    });
  }, []);
  return { collapsed, toggle };
}
```

Create `src/hooks/usePresenceHeartbeat.ts` by **moving** the heartbeat `useEffect` out of `src/components/layout/TopNavBar.tsx` (its `sendHeartbeat` POST to `/api/presence/heartbeat` every 30s, plus the focus and visibilitychange listeners), unchanged:

```ts
// src/hooks/usePresenceHeartbeat.ts
'use client';
import { useEffect } from 'react';

const HEARTBEAT_MS = 30_000;

export function usePresenceHeartbeat(pathname: string, userId: string | undefined): void {
  useEffect(() => {
    if (!userId) return;
    const sendHeartbeat = () => {
      if (document.visibilityState === 'hidden') return;
      fetch('/api/presence/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathname || '/' }),
        keepalive: true,
      }).catch(() => {
        // Presence is best-effort and should not interrupt clinical workflows.
      });
    };
    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, HEARTBEAT_MS);
    window.addEventListener('focus', sendHeartbeat);
    document.addEventListener('visibilitychange', sendHeartbeat);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', sendHeartbeat);
      document.removeEventListener('visibilitychange', sendHeartbeat);
    };
  }, [pathname, userId]);
}
```

In `TopNavBar.tsx`, replace the moved effect with `usePresenceHeartbeat(pathname, userId);`. It is deleted in Task 13, but keep it working until then.

- [ ] **Step 4: Run tests, typecheck, lint, commit**

```bash
npx vitest run tests/unit/config/nav.test.ts tests/unit/hooks/useSidebarState.test.ts tests/unit/components/TopNavBar.test.tsx
npx tsc --noEmit && npm run lint
git add src/config/nav.ts src/hooks/useSidebarState.ts src/hooks/usePresenceHeartbeat.ts src/components/layout/TopNavBar.tsx tests/unit/config/nav.test.ts tests/unit/hooks/useSidebarState.test.ts
git commit -m "feat(ui): per-variant nav, persisted sidebar state, extracted presence heartbeat

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all PASS (TopNavBar behaviour unchanged).

---

### Task 13: `AppShell` (sidebar + header + strip) replaces `TopNavBar`

**Files:**
- Create: `src/components/layout/Sidebar.tsx`, `src/components/layout/AppHeader.tsx`, `src/components/layout/AppShell.tsx`
- Modify: `src/app/(provincial)/layout.tsx`, `src/app/(hospital)/layout.tsx`
- Delete (after the grep check in Step 6): `src/components/layout/TopNavBar.tsx`, `src/components/layout/TopNavBarSlot.tsx`, `tests/unit/components/TopNavBar.test.tsx`
- Test: `tests/unit/components/layout/AppShell.test.tsx`

**Interfaces:**
- Consumes:
  - `navItemsFor`, `ROLE_LABELS`, `ShellVariant` (Task 12)
  - `useSidebarState`, `usePresenceHeartbeat` (Task 12)
  - `StatusStrip` (Task 11)
  - `useBreadcrumbs()` from `@/components/layout/BreadcrumbContext`
  - `OnlineUsersBadge` from `@/components/dashboard/OnlineUsersBadge`
  - `CallDirectoryButton` from `@/components/calls/CallDirectoryButton`
  - `useSession`, `signOut` from `next-auth/react`; `usePathname` from `next/navigation`
- Produces: `AppShell({ variant: ShellVariant; children: ReactNode })`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/components/layout/AppShell.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'u1', name: 'ชัยพร ส.', role: 'NURSE', hospitalName: 'รพ.น้ำพอง', hospitalCode: '11000' } },
  }),
  signOut: vi.fn(),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/hospital-maternity-ward' }));
vi.mock('@/hooks/usePresenceHeartbeat', () => ({ usePresenceHeartbeat: vi.fn() }));
vi.mock('@/components/layout/StatusStrip', () => ({ StatusStrip: () => <div data-testid="strip" /> }));
vi.mock('@/components/dashboard/OnlineUsersBadge', () => ({ OnlineUsersBadge: () => null }));
vi.mock('@/components/calls/CallDirectoryButton', () => ({ CallDirectoryButton: () => null }));
vi.mock('@/components/layout/BreadcrumbContext', () => ({
  useBreadcrumbs: () => [{ label: 'ห้องคลอด' }],
}));

import { AppShell } from '@/components/layout/AppShell';

describe('AppShell', () => {
  it('kiosk contract: sidebar is <aside>, top bar is header.sticky, strip lives inside the header', () => {
    const { container } = render(<AppShell variant="hospital">page</AppShell>);
    expect(container.querySelector('aside')).not.toBeNull();
    const header = container.querySelector('header.sticky') as HTMLElement;
    expect(header).not.toBeNull();
    expect(within(header).getByTestId('strip')).toBeInTheDocument();
  });

  it('hospital variant nav: ward (current page) + profile', () => {
    render(<AppShell variant="hospital">page</AppShell>);
    const nav = screen.getByRole('navigation', { name: 'เมนูหลัก' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/hospital-maternity-ward', '/profile']);
    expect(within(nav).getByRole('link', { name: /ห้องคลอด/ })).toHaveAttribute('aria-current', 'page');
  });

  it('collapse button toggles the rail and keeps accessible names', async () => {
    render(<AppShell variant="hospital">page</AppShell>);
    await userEvent.click(screen.getByRole('button', { name: 'ย่อเมนู' }));
    expect(screen.getByRole('button', { name: 'ขยายเมนู' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /โปรไฟล์/ })).toBeInTheDocument();
  });

  it('header shows breadcrumb, user identity and a logout button', () => {
    render(<AppShell variant="hospital">page</AppShell>);
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent('ห้องคลอด');
    expect(screen.getByText('ชัยพร ส.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ออกจากระบบ' })).toBeInTheDocument();
  });

  it('mobile drawer button exists with the kiosk-hidden label', () => {
    render(<AppShell variant="hospital">page</AppShell>);
    expect(screen.getByRole('button', { name: 'เปิดเมนู' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/components/layout/AppShell.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `Sidebar`**

```tsx
// src/components/layout/Sidebar.tsx
'use client';
import Link from 'next/link';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { NavItem } from '@/config/nav';
import { cn } from '@/lib/utils';

export interface SidebarProps {
  items: NavItem[];
  isActive: (href: string) => boolean;
  collapsed: boolean;
  onToggle: () => void;
  homeHref: string;
  /** Drawer mode (<1024px): closes on navigation. */
  onNavigate?: () => void;
  className?: string;
}

export function Sidebar({ items, isActive, collapsed, onToggle, homeHref, onNavigate, className }: SidebarProps) {
  const main = items.filter((i) => !i.adminOnly);
  const pinned = items.filter((i) => i.adminOnly);
  const renderItem = ({ href, label, icon: Icon }: NavItem) => {
    const active = isActive(href);
    return (
      <Link
        key={href}
        href={href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        title={collapsed ? label : undefined}
        className={cn(
          'flex items-center gap-3 rounded-xl px-3 py-2 text-body font-medium transition-colors',
          active ? 'bg-surface-page text-brand' : 'text-brand-soft hover:bg-white/10 hover:text-white',
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className={cn(collapsed && 'sr-only')}>{label}</span>
      </Link>
    );
  };
  return (
    <aside
      className={cn(
        'flex h-full flex-col gap-1 bg-brand px-2.5 py-4 text-white transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-58',
        className,
      )}
    >
      <Link href={homeHref} className="mb-4 flex items-center gap-2.5 px-2" aria-label="KK-LRMS หน้าแรก">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white font-bold text-brand">K</span>
        <span className={cn('text-body-lg font-bold', collapsed && 'sr-only')}>KK-LRMS</span>
      </Link>
      <nav aria-label="เมนูหลัก" className="flex flex-1 flex-col gap-1">
        {main.map(renderItem)}
        <div className="flex-1" />
        {pinned.map(renderItem)}
      </nav>
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
        className="mt-2 hidden items-center justify-center rounded-xl py-2 text-brand-soft hover:bg-white/10 lg:flex"
      >
        {collapsed ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
      </button>
    </aside>
  );
}
```

(`w-58` = 232px with Tailwind 4's default 4px spacing step.)

- [ ] **Step 4: Implement `AppHeader` and `AppShell`**

Check `export interface Breadcrumb` in `src/components/layout/BreadcrumbContext.tsx` (line 12) before writing the header. If its text field is not `label`, use that field name here and in the test mock. If it has `href`, render those crumbs as `<Link>`.

```tsx
// src/components/layout/AppHeader.tsx
'use client';
import Link from 'next/link';
import { LogOut, Menu } from 'lucide-react';
import { signOut } from 'next-auth/react';
import type { ReactNode } from 'react';
import { useBreadcrumbs } from '@/components/layout/BreadcrumbContext';
import { OnlineUsersBadge } from '@/components/dashboard/OnlineUsersBadge';
import { CallDirectoryButton } from '@/components/calls/CallDirectoryButton';

export interface AppHeaderProps {
  userName: string;
  roleLabel: string;
  hospitalName: string;
  onOpenDrawer: () => void;
  /** Rendered inside the sticky header so kiosk mode hides it too. */
  strip: ReactNode;
}

export function AppHeader({ userName, roleLabel, hospitalName, onOpenDrawer, strip }: AppHeaderProps) {
  const crumbs = useBreadcrumbs();
  const initials = userName.trim().slice(0, 2);
  return (
    <header className="sticky top-0 z-30 bg-surface-page">
      <div className="flex items-center gap-3 border-b border-border px-5 py-2.5">
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="เปิดเมนู"
          className="rounded-lg p-1.5 text-brand hover:bg-brand-soft lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <nav aria-label="breadcrumb" className="min-w-0 truncate text-body text-ink-muted">
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`}>
              {i > 0 && <span className="mx-1.5">›</span>}
              {i === crumbs.length - 1 ? <b className="text-ink">{c.label}</b> : c.label}
            </span>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <OnlineUsersBadge />
          {hospitalName && (
            <span className="hidden rounded-full bg-brand-soft px-3 py-0.5 text-label text-brand-strong md:inline">
              {hospitalName}
            </span>
          )}
          <Link href="/profile" className="hidden text-label text-brand hover:underline md:inline">
            การตั้งค่าการแจ้งเตือน
          </Link>
          <CallDirectoryButton />
          <span className="hidden flex-col items-end leading-tight md:flex">
            <span className="text-label text-ink">{userName}</span>
            {roleLabel && <span className="text-caption text-ink-muted">{roleLabel}</span>}
          </span>
          <span
            aria-hidden="true"
            className="grid h-8 w-8 place-items-center rounded-full bg-brand-soft text-caption font-bold text-brand"
          >
            {initials}
          </span>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            aria-label="ออกจากระบบ"
            title="ออกจากระบบ"
            className="rounded-lg p-1.5 text-ink-muted hover:bg-brand-soft hover:text-brand"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
      {strip}
    </header>
  );
}
```

```tsx
// src/components/layout/AppShell.tsx
'use client';
import { useCallback, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { navItemsFor, ROLE_LABELS, type ShellVariant } from '@/config/nav';
import { useSidebarState } from '@/hooks/useSidebarState';
import { usePresenceHeartbeat } from '@/hooks/usePresenceHeartbeat';
import { Sidebar } from '@/components/layout/Sidebar';
import { AppHeader } from '@/components/layout/AppHeader';
import { StatusStrip } from '@/components/layout/StatusStrip';

export function AppShell({ variant, children }: { variant: ShellVariant; children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const { data: session } = useSession();
  const { collapsed, toggle } = useSidebarState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const role = session?.user?.role;
  const items = navItemsFor(variant, role);
  const homeHref = variant === 'hospital' ? '/hospital-maternity-ward' : '/';
  usePresenceHeartbeat(pathname, session?.user?.id);

  const isActive = useCallback(
    (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href)),
    [pathname],
  );

  return (
    <div className="flex min-h-screen bg-surface-page">
      <Sidebar
        items={items}
        isActive={isActive}
        collapsed={collapsed}
        onToggle={toggle}
        homeHref={homeHref}
        className="sticky top-0 hidden h-screen lg:flex"
      />
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="เมนู">
          <button
            type="button"
            aria-label="ปิดเมนู"
            className="absolute inset-0 bg-ink/40"
            onClick={() => setDrawerOpen(false)}
          />
          <Sidebar
            items={items}
            isActive={isActive}
            collapsed={false}
            onToggle={() => setDrawerOpen(false)}
            homeHref={homeHref}
            onNavigate={() => setDrawerOpen(false)}
            className="relative h-full"
          />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          userName={session?.user?.name ?? ''}
          roleLabel={role ? (ROLE_LABELS[role] ?? role) : ''}
          hospitalName={session?.user?.hospitalName ?? ''}
          onOpenDrawer={() => setDrawerOpen(true)}
          strip={<StatusStrip variant={variant} />}
        />
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Swap both layouts**

`src/app/(provincial)/layout.tsx`: replace the inner `<div className="flex min-h-screen flex-col bg-slate-50/50"> … </div>` (DbHealthBanner, TopNavBarSlot, main, ClinicalChatPanel) with:

```tsx
            <DbHealthBanner />
            <AppShell variant="provincial">
              <main className="flex-1">
                <ContentFrameSlot>{children}</ContentFrameSlot>
              </main>
            </AppShell>
            {/* Clinical chatbot — statistics mode (provincial dashboard
                aggregates). Clinical drilldown pages can override per-page. */}
            <ClinicalChatPanel mode="statistics" />
```

Import `AppShell` from `@/components/layout/AppShell` and remove the `TopNavBarSlot` import.

`src/app/(hospital)/layout.tsx`: replace the inner `<div className="flex min-h-screen flex-col bg-slate-50/50"> … </div>` with the block below (the header reads breadcrumbs, so it needs the provider):

```tsx
          <BreadcrumbProvider>
            <AppShell variant="hospital">
              <main className="flex-1">{children}</main>
            </AppShell>
            {/* Clinical chatbot — maternity-ward mode (per-patient clinical RAG). */}
            <ClinicalChatPanel mode="clinical" />
          </BreadcrumbProvider>
```

Import `BreadcrumbProvider` from `@/components/layout/BreadcrumbContext` and `AppShell`, and remove the `TopNavBar` import. Update the header comment to "the shared AppShell".

- [ ] **Step 6: Remove the old chrome only if nothing else uses it**

Run: `grep -rn "TopNavBar" src tests --include=*.ts --include=*.tsx | grep -v "src/components/layout/TopNavBar"`
- **No output:** delete `src/components/layout/TopNavBar.tsx`, `src/components/layout/TopNavBarSlot.tsx` and `tests/unit/components/TopNavBar.test.tsx`.
- **Any remaining users:** migrate each to `AppShell` first, then delete.

- [ ] **Step 7: Run shell tests, full suite, typecheck, lint, build**

```bash
npx vitest run tests/unit/components/layout/AppShell.test.tsx
npx vitest run --maxWorkers=6
npx tsc --noEmit && npm run lint && npm run build
```

Expected: all green. If page tests rendered the old `TopNavBar` and now fail on missing chrome text, check whether they assert page content or chrome. Update chrome assertions to `AppShell` equivalents; never delete page-content assertions.

- [ ] **Step 8: Commit**

```bash
git add -A src/components/layout "src/app/(provincial)/layout.tsx" "src/app/(hospital)/layout.tsx" tests/unit/components
git commit -m "feat(ui): sidebar AppShell with status strip replaces TopNavBar

Hospital-role users now get a real nav (ward + profile) instead of an empty
bar; kiosk contract preserved (aside + header.sticky); presence heartbeat,
call directory and notification-settings link carried over.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Codemod — sizes and risk/brand colours onto tokens

**Files:**
- Create: `scripts/codemods/design-tokens-map.ts`, `scripts/codemods/design-tokens.mjs`
- Test: `tests/unit/scripts/design-tokens-map.test.ts`
- Modify (by running the codemod): `src/**/*.tsx`, `src/**/*.ts` (excluding kiosk files and `src/components/ui/`)

**Interfaces:**
- Produces:
  - `mapFontSizePx(px: number): string`
  - `mapColorClass(prop: string, hue: string, shade: number): string | null`
  - `rewriteSource(src: string): { output: string; sizeCount: number; colorCount: number; manual: string[] }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/scripts/design-tokens-map.test.ts
import { describe, it, expect } from 'vitest';
import { mapFontSizePx, mapColorClass, rewriteSource } from '../../../scripts/codemods/design-tokens-map';

describe('mapFontSizePx', () => {
  it.each([
    [9, 'text-caption'], [10, 'text-caption'], [11, 'text-caption'], [12, 'text-caption'], [13, 'text-caption'],
    [14, 'text-label'], [15, 'text-body'], [16, 'text-body-lg'], [17, 'text-body-lg'],
    [18, 'text-title'], [22, 'text-title'], [24, 'text-page'], [28, 'text-page'], [30, 'text-kpi'], [48, 'text-kpi'],
  ])('%ipx → %s', (px, token) => expect(mapFontSizePx(px)).toBe(token));
});

describe('mapColorClass', () => {
  it.each([
    ['bg', 'red', 50, 'bg-danger-tint'], ['bg', 'red', 600, 'bg-danger'],
    ['text', 'red', 500, 'text-danger'], ['text', 'red', 700, 'text-danger-text'],
    ['border', 'amber', 200, 'border-warn/40'], ['border', 'amber', 500, 'border-warn'],
    ['bg', 'emerald', 100, 'bg-ok-tint'], ['text', 'green', 800, 'text-ok-text'],
    ['bg', 'teal', 50, 'bg-brand-soft'], ['bg', 'teal', 600, 'bg-brand'], ['text', 'teal', 700, 'text-brand'],
    ['fill', 'rose', 500, 'fill-danger'],
  ])('%s-%s-%i → %s', (prop, hue, shade, out) => expect(mapColorClass(prop, hue, shade)).toBe(out));
  it('gradients and unknown hues are left for manual review', () => {
    expect(mapColorClass('from', 'red', 500)).toBeNull();
    expect(mapColorClass('bg', 'slate', 100)).toBeNull();
  });
});

describe('rewriteSource', () => {
  it('rewrites sizes and colours, keeping variants and opacity modifiers', () => {
    const src = `<div className="text-[11px] md:text-[14px] hover:bg-red-50 bg-amber-500/20 text-slate-500">`;
    const r = rewriteSource(src);
    expect(r.output).toBe(`<div className="text-caption md:text-label hover:bg-danger-tint bg-warn/20 text-slate-500">`);
    expect(r.sizeCount).toBe(2);
    expect(r.colorCount).toBe(2);
  });
  it('does not touch look-alikes', () => {
    const src = `const a = "context-[11px]"; const b = "bg-red-500x";`;
    expect(rewriteSource(src).output).toBe(src);
  });
  it('reports gradients, rem sizes and arbitrary hex as manual', () => {
    const r = rewriteSource(`"from-red-500 text-[0.75rem] bg-[#ff0000]"`);
    expect(r.output).toBe(`"from-red-500 text-[0.75rem] bg-[#ff0000]"`);
    expect(r.manual).toEqual(['from-red-500', 'text-[0.75rem]', 'bg-[#ff0000]']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/scripts/design-tokens-map.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the mapping**

```ts
// scripts/codemods/design-tokens-map.ts
// Pure mapping for the one-shot design-token codemod (spec §5). Imported by
// the runner (design-tokens.mjs) and by tests; no I/O here.
const SIZE_BUCKETS: ReadonlyArray<{ max: number; token: string }> = [
  { max: 13.99, token: 'text-caption' }, // 9–12px are bumped to the 13px floor
  { max: 14.99, token: 'text-label' },
  { max: 15.99, token: 'text-body' },
  { max: 17.99, token: 'text-body-lg' },
  { max: 23.99, token: 'text-title' },
  { max: 29.99, token: 'text-page' },
  { max: Number.POSITIVE_INFINITY, token: 'text-kpi' },
];

export function mapFontSizePx(px: number): string {
  return (SIZE_BUCKETS.find((b) => px <= b.max) ?? SIZE_BUCKETS[SIZE_BUCKETS.length - 1]).token;
}

const HUE: Record<string, 'danger' | 'warn' | 'ok' | 'brand'> = {
  red: 'danger',
  rose: 'danger',
  orange: 'warn',
  amber: 'warn',
  yellow: 'warn',
  green: 'ok',
  emerald: 'ok',
  teal: 'brand',
};

const SIMPLE_PROPS = new Set(['ring', 'fill', 'stroke', 'outline', 'decoration', 'divide', 'accent', 'caret']);

export function mapColorClass(prop: string, hue: string, shade: number): string | null {
  const s = HUE[hue];
  if (!s) return null;
  if (s === 'brand') {
    if (prop === 'bg') return shade <= 100 ? 'bg-brand-soft' : 'bg-brand';
    if (prop === 'text') return 'text-brand';
    if (prop === 'border') return shade <= 200 ? 'border-brand-soft' : 'border-brand';
    return SIMPLE_PROPS.has(prop) ? `${prop}-brand` : null;
  }
  if (prop === 'bg') return shade <= 300 ? `bg-${s}-tint` : `bg-${s}`;
  if (prop === 'text') return shade <= 500 ? `text-${s}` : `text-${s}-text`;
  if (prop === 'border') return shade <= 300 ? `border-${s}/40` : `border-${s}`;
  return SIMPLE_PROPS.has(prop) ? `${prop}-${s}` : null;
}

const PREFIX = '((?:[a-z0-9-]+:)*)';
const SIZE_RE = new RegExp(`(?<![\\w-])${PREFIX}text-\\[(\\d+(?:\\.\\d+)?)px\\](?![\\w-])`, 'g');
const COLOR_RE = new RegExp(
  `(?<![\\w-])${PREFIX}(bg|text|border|ring|fill|stroke|outline|decoration|divide|accent|caret|from|via|to)-` +
    `(red|rose|orange|amber|yellow|green|emerald|teal)-(\\d{2,3})(\\/\\d{1,3})?(?![\\w-])`,
  'g',
);
const MANUAL_RE = /(?<![\w-])(?:[a-z0-9-]+:)*(?:text-\[\d+(?:\.\d+)?rem\]|[a-z]+-\[#[0-9a-fA-F]{3,8}\])/g;

export interface RewriteResult {
  output: string;
  sizeCount: number;
  colorCount: number;
  manual: string[];
}

export function rewriteSource(src: string): RewriteResult {
  let sizeCount = 0;
  let colorCount = 0;
  const manual: string[] = [];
  let out = src.replace(SIZE_RE, (_m, variants: string, px: string) => {
    sizeCount += 1;
    return `${variants}${mapFontSizePx(Number(px))}`;
  });
  out = out.replace(COLOR_RE, (m, variants: string, prop: string, hue: string, shade: string, op?: string) => {
    const mapped = mapColorClass(prop, hue, Number(shade));
    if (!mapped) {
      manual.push(m);
      return m;
    }
    colorCount += 1;
    const base = op ? mapped.split('/')[0] + op : mapped;
    return `${variants}${base}`;
  });
  for (const m of out.match(MANUAL_RE) ?? []) manual.push(m);
  return { output: out, sizeCount, colorCount, manual };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/scripts/design-tokens-map.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the runner**

```js
// scripts/codemods/design-tokens.mjs
// One-shot codemod: node --experimental-strip-types scripts/codemods/design-tokens.mjs [--write]
// Dry-run by default; prints totals and every manual-review site.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { rewriteSource } from './design-tokens-map.ts';

const write = process.argv.includes('--write');
const EXCLUDE = [/Kiosk/i, /^src\/components\/ui\//];
const files = execSync("git ls-files 'src/*.ts' 'src/*.tsx' 'src/**/*.ts' 'src/**/*.tsx'", { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => !EXCLUDE.some((r) => r.test(f)));

let changed = 0;
let sizes = 0;
let colors = 0;
const manual = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const r = rewriteSource(src);
  sizes += r.sizeCount;
  colors += r.colorCount;
  for (const m of r.manual) manual.push(`${f}: ${m}`);
  if (r.output !== src) {
    changed += 1;
    if (write) writeFileSync(f, r.output);
  }
}
console.log(`[design-tokens] ${write ? 'WROTE' : 'DRY RUN'} files=${changed} sizes=${sizes} colors=${colors} manual=${manual.length}`);
for (const m of manual) console.log(`  manual: ${m}`);
```

- [ ] **Step 6: Capture BEFORE screenshots (needed for the overflow review)**

Do Task 17 Steps 1–2 first (the E2E spec and debug helper) if they are not there yet. Then:

```bash
npm run dev &   # wait for "Ready"
UI_SNAPSHOT_TAG=before npx playwright test tests/e2e/ui-foundation.spec.ts --grep @snapshot
```

- [ ] **Step 7: Dry run, then write**

```bash
node --experimental-strip-types scripts/codemods/design-tokens.mjs > /tmp/codemod-dry.txt; head -1 /tmp/codemod-dry.txt
node --experimental-strip-types scripts/codemods/design-tokens.mjs --write | head -1
git diff --stat | tail -1
```

Expected: the dry run reports roughly `sizes≈1168` (1003 + 95 + 43 + 7 + 27 + 26 + 12, minus kiosk files) and a non-zero `colors`. The write run reports the same numbers.

- [ ] **Step 8: Manual pass on the reported sites**

For each `manual:` line in `/tmp/codemod-dry.txt`:
- **Chart, Leaflet or PNG hex** (e.g. `ProvinceMapLeaflet.tsx`, `RiskDistributionChart.tsx`, the vital-sign PNG renderer): replace the literal with `COLOR.<token>` imported from `@/config/design-tokens`.
- **Gradient (`from-/via-/to-`):** replace with the nearest token pair, e.g. `from-danger-tint to-surface-card`, or remove it if decorative.
- **rem sizes:** map by computed px (rem × 18) with `mapFontSizePx`.

Anything that genuinely must stay goes in the Task 15 allowlist with a reason.

- [ ] **Step 9: Verify — full suite, typecheck, lint, build**

```bash
npx vitest run --maxWorkers=6 && npx tsc --noEmit && npm run lint && npm run build
```

Expected: green. Component tests that asserted raw classes (e.g. `bg-green-500` in `ConnectionStatus.test.tsx`) now fail. Update them to the token class the codemod produced (`bg-ok`), and only those assertions.

- [ ] **Step 10: AFTER screenshots + overflow review**

```bash
UI_SNAPSHOT_TAG=after npx playwright test tests/e2e/ui-foundation.spec.ts --grep @snapshot
```

Compare `docs/ui-foundation-screenshots/before-*` vs `after-*` for every route and width. Fix any clipped or overflowing text (typically dense tables and badges that grew from 10–11px to 13px) with layout changes only: wrapping, `min-w-0`, `truncate` with `title`, or column width. Never go back below 13px. Re-run the AFTER capture until the review is clean.

- [ ] **Step 11: Commit (mechanical first, then manual)**

```bash
git add -A src scripts/codemods tests/unit/scripts tests/unit/components
git commit -m "refactor(ui): codemod arbitrary sizes and risk/brand colours onto tokens

Mechanical rewrite (scripts/codemods/design-tokens.mjs, mapping unit-tested):
9–12px Thai text raised to the 13px floor, raw red/amber/green/teal classes
mapped to danger/warn/ok/brand tokens. Kiosk files excluded.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add -A src docs/ui-foundation-screenshots
git commit -m "fix(ui): manual token pass + overflow fixes after the 13px floor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(If the manual pass produced no changes, skip the second commit.)

---

### Task 15: Lint guard `no-adhoc-design-values`

**Files:**
- Create: `eslint-rules/no-adhoc-design-values.mjs`, `eslint-rules/design-allowlist.json`
- Modify: `eslint.config.mjs`
- Test: `tests/unit/eslint/no-adhoc-design-values.test.ts`

**Interfaces:**
- Produces: the ESLint plugin `kk-design` with rule `kk-design/no-adhoc-design-values`, and an allowlist JSON shaped `{ "maxEntries": number, "files": { "<path>": "<reason>" } }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/eslint/no-adhoc-design-values.test.ts
import { describe, it, expect } from 'vitest';
import { RuleTester } from 'eslint';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import rule from '../../../eslint-rules/no-adhoc-design-values.mjs';

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
});

describe('no-adhoc-design-values', () => {
  // RuleTester registers its own describe/it blocks, so it must run at
  // describe level — calling it inside it() fails under Vitest.
  tester.run('no-adhoc-design-values', rule, {
      valid: [
        { code: '<div className="text-caption bg-danger-tint text-slate-500" />' },
        { code: 'cn("text-label", ok && "bg-ok")' },
        { code: '<div style={{ color: COLOR.riskHigh }} />' },
        { code: 'const id = "#section";' }, // not in className/style
      ],
      invalid: [
        { code: '<div className="text-[11px]" />', errors: [{ messageId: 'size' }] },
        { code: '<div className="hover:bg-red-50" />', errors: [{ messageId: 'palette' }] },
        { code: 'cn("p-2", "text-emerald-700")', errors: [{ messageId: 'palette' }] },
        { code: '<div className={`x ${a} bg-[#ff0000]`} />', errors: [{ messageId: 'hex' }] },
        { code: '<div style={{ color: "#22c55e" }} />', errors: [{ messageId: 'hex' }] },
      ],
  });

  it('allowlist entries all carry a reason and never exceed maxEntries', () => {
    const list = JSON.parse(
      readFileSync(path.resolve(__dirname, '../../../eslint-rules/design-allowlist.json'), 'utf8'),
    ) as { maxEntries: number; files: Record<string, string> };
    const entries = Object.entries(list.files);
    expect(entries.length).toBeLessThanOrEqual(list.maxEntries);
    for (const [file, reason] of entries) {
      expect(reason.trim().length, `reason for ${file}`).toBeGreaterThan(10);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/eslint/no-adhoc-design-values.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the rule**

```js
// eslint-rules/no-adhoc-design-values.mjs
// Blocks ad-hoc design values in className/cn()/style so the app can't drift
// off the design tokens (spec §6). Neutral greys are intentionally allowed
// until sub-projects 2–5 give them tokens.
const SIZE = /(?<![\w-])(?:[a-z0-9-]+:)*text-\[\d+(?:\.\d+)?(?:px|rem)\]/;
const PALETTE =
  /(?<![\w-])(?:[a-z0-9-]+:)*(?:bg|text|border|ring|fill|stroke|outline|decoration|divide|accent|caret|from|via|to)-(?:red|rose|orange|amber|yellow|green|emerald|teal)-\d{2,3}(?![\w-])/;
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const CLASS_CALLEES = new Set(['cn', 'clsx', 'cva', 'twMerge']);

function inClassContext(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === 'JSXAttribute') return p.name?.name === 'className' || p.name?.name === 'class';
    if (p.type === 'CallExpression' && p.callee?.type === 'Identifier') return CLASS_CALLEES.has(p.callee.name);
  }
  return false;
}

function inStyleContext(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === 'JSXAttribute') return p.name?.name === 'style';
  }
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Use design tokens instead of ad-hoc sizes, palette colours or hex' },
    messages: {
      size: 'Use a type-scale token (text-caption/label/body/…) instead of "{{v}}".',
      palette: 'Use a semantic colour token (danger/warn/ok/brand) instead of "{{v}}".',
      hex: 'Use COLOR from @/config/design-tokens or a token class instead of "{{v}}".',
    },
    schema: [],
  },
  create(context) {
    function check(node, text) {
      const cls = inClassContext(node);
      const sty = !cls && inStyleContext(node);
      if (!cls && !sty) return;
      if (cls) {
        const s = text.match(SIZE);
        if (s) context.report({ node, messageId: 'size', data: { v: s[0] } });
        const p = text.match(PALETTE);
        if (p) context.report({ node, messageId: 'palette', data: { v: p[0] } });
      }
      const h = text.match(HEX);
      if (h) context.report({ node, messageId: 'hex', data: { v: h[0] } });
    }
    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
};

export default rule;
```

- [ ] **Step 4: Wire it into `eslint.config.mjs` with the allowlist**

```js
import nextConfig from 'eslint-config-next';
import { readFileSync } from 'node:fs';
import noAdhocDesignValues from './eslint-rules/no-adhoc-design-values.mjs';

const designAllowlist = JSON.parse(
  readFileSync(new URL('./eslint-rules/design-allowlist.json', import.meta.url), 'utf8'),
);

const eslintConfig = [
  ...nextConfig,
  {
    ignores: ['node_modules/', '.next/', 'dist/', 'build/', 'coverage/', '*.min.js'],
  },
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    ignores: Object.keys(designAllowlist.files),
    plugins: { 'kk-design': { rules: { 'no-adhoc-design-values': noAdhocDesignValues } } },
    rules: { 'kk-design/no-adhoc-design-values': 'error' },
  },
];

export default eslintConfig;
```

Start the allowlist empty:

```json
{ "maxEntries": 0, "files": {} }
```

- [ ] **Step 5: Run the rule test, then lint the repo and build the allowlist from what remains**

```bash
npx vitest run tests/unit/eslint/no-adhoc-design-values.test.ts
npm run lint 2>&1 | grep -E "^/.*\.(tsx?|mjs)$" | sed "s#^$PWD/##" | sort -u
```

For every file still reported:
- Fix it if the fix is mechanical.
- Otherwise add it to `design-allowlist.json` with a reason naming the sub-project that will migrate it, e.g. `"src/components/dashboard/KioskHeader.tsx": "kiosk keeps its own dark palette and larger scale (spec §1); migrate with sub-project 2"`.

Set `maxEntries` to the final count, then re-run `npm run lint`.
Expected: lint exits 0. The test passes, with `entries ≤ maxEntries` and every reason longer than 10 chars.

- [ ] **Step 6: Commit**

```bash
git add eslint-rules eslint.config.mjs tests/unit/eslint
git commit -m "chore(lint): no-adhoc-design-values guard with shrink-only allowlist

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Final illustration set (reproducible, no red-cross emblem)

**Files:**
- Create: `scripts/illustrations/generate.py`, `scripts/illustrations/manifest.json`, `public/illustrations/README.md`, `public/illustrations/{empty-ward,empty-referral,state-stale,generic,login-hero,about-header}.webp`
- Test: `tests/unit/config/illustrations.test.ts`

**Interfaces:**
- Consumes: `ILLUSTRATION_SRC` (Task 7).
- Produces: static assets at the paths in `ILLUSTRATION_SRC`, plus `login-hero.webp` and `about-header.webp` for sub-project 5.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/config/illustrations.test.ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { ILLUSTRATION_SRC } from '@/config/illustrations';

const root = path.resolve(__dirname, '../../..');
const manifest = JSON.parse(readFileSync(path.join(root, 'scripts/illustrations/manifest.json'), 'utf8')) as {
  model: string;
  style: string;
  items: Array<{ file: string; prompt: string; seed: number; aspect: string; transparent: boolean }>;
};

describe('illustration set', () => {
  it.each(Object.values(ILLUSTRATION_SRC))('%s exists, ≤150 KB, and is in the manifest', (src) => {
    const file = path.join(root, 'public', src);
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeLessThanOrEqual(150 * 1024);
    expect(manifest.items.some((i) => `/illustrations/${i.file}` === src)).toBe(true);
  });
  it('every manifest item records a fixed seed and forbids the red-cross emblem', () => {
    for (const i of manifest.items) {
      expect(Number.isInteger(i.seed) && i.seed > 0).toBe(true);
      expect(`${manifest.style} ${i.prompt}`).toMatch(/no red cross/i);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/config/illustrations.test.ts`
Expected: FAIL (manifest missing).

- [ ] **Step 3: Write the manifest and generator**

`scripts/illustrations/manifest.json`. `seed: 0` means "pick one and record it"; the generator writes the seed it used back.

```json
{
  "model": "Qwen-Image-2.1 via https://text2image-flux2.bmscloud.in.th/v1/generate (num_inference_steps 40)",
  "license": "Qwen Research License — production use requires sign-off (see spec §7)",
  "style": "Flat vector editorial illustration, soft rounded shapes, limited palette of deep indigo #2e3a87, warm terracotta #c0392b accents, sage green #3f8f4f, soft sky blue and cream, subtle paper grain, generous negative space, friendly and professional Thai public-health style, no text, no letters, no logos, no red cross symbol, use a small green cross if a medical symbol is needed",
  "items": [
    { "file": "empty-ward.webp", "aspect": "4:3", "transparent": true, "seed": 62304410640514919,
      "prompt": "A calm Thai nurse standing BESIDE (not behind) an empty, neatly made hospital delivery bed, full body visible, bed in front-left and nurse to the right with clear space between them." },
    { "file": "empty-referral.webp", "aspect": "4:3", "transparent": true, "seed": 0,
      "prompt": "A small white ambulance with a green cross driving along a gentle curved road between two simple friendly hospital buildings marked with small green crosses, a dotted route line, quiet and calm." },
    { "file": "state-stale.webp", "aspect": "4:3", "transparent": true, "seed": 3482118292227061430,
      "prompt": "A small simple hospital building with a large wall clock beside it and a gently disconnected cable plug, conveying data waiting to sync, calm not alarming." },
    { "file": "generic.webp", "aspect": "4:3", "transparent": true, "seed": 0,
      "prompt": "A tidy empty clipboard and a folded blanket on a soft rounded table, calm, nothing to do yet." },
    { "file": "login-hero.webp", "aspect": "3:2", "transparent": false, "seed": 6991217676267424919,
      "prompt": "A Thai mother in a hospital gown cradling her newborn, a smiling Thai midwife nurse beside her checking a tablet, soft morning light through a window, cream background." },
    { "file": "about-header.webp", "aspect": "16:9", "transparent": false, "seed": 0,
      "prompt": "Abstract decorative pattern of soft rounded shapes connected by thin indigo lines and small hospital icons with green crosses, clearly not a real map, cream background." }
  ]
}
```

Note: the three non-zero seeds come from the 2026-10-11 brainstorming renders. Re-rendering with the new style string (which adds "no red cross") gives different pixels, so treat them as starting points and re-record.

`scripts/illustrations/generate.py`:

```python
"""Regenerate the KK-LRMS illustration set from manifest.json.

Usage: python3 scripts/illustrations/generate.py [--only file.webp]
Writes public/illustrations/<file> (webp, max 900px, quality stepped down to
fit <=150 KB) and records the seed actually used back into the manifest so
reruns are reproducible.
"""
import base64, io, json, pathlib, sys, urllib.request
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "scripts/illustrations/manifest.json"
OUT = ROOT / "public/illustrations"
API = "https://text2image-flux2.bmscloud.in.th/v1/generate"
MAX_BYTES = 150 * 1024


def generate(style: str, item: dict) -> tuple[bytes, int]:
    body = {"prompt": f"{item['prompt']} {style}", "aspect": item["aspect"],
            "num_inference_steps": 40, "transparent": item["transparent"]}
    if item.get("seed"):
        body["seed"] = item["seed"]
    req = urllib.request.Request(API, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=900) as r:
        res = json.load(r)
    first = res["images"][0]
    b64 = first if isinstance(first, str) else (first.get("b64_json") or first.get("image") or first.get("data"))
    seed = res.get("seed") or (first.get("seed") if isinstance(first, dict) else None)
    return base64.b64decode(b64.split(",")[-1]), int(seed)


def to_webp(png: bytes) -> bytes:
    im = Image.open(io.BytesIO(png))
    im.thumbnail((900, 900))
    for q in (82, 74, 66, 58, 50):
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=q)
        if buf.tell() <= MAX_BYTES:
            return buf.getvalue()
    raise SystemExit("cannot fit under 150 KB — simplify the prompt")


def main() -> None:
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    manifest = json.loads(MANIFEST.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    for item in manifest["items"]:
        if only and item["file"] != only:
            continue
        print(f"[illustrations] generating {item['file']} (seed {item.get('seed') or 'new'}) ...", flush=True)
        png, seed = generate(manifest["style"], item)
        data = to_webp(png)
        (OUT / item["file"]).write_bytes(data)
        item["seed"] = seed
        print(f"[illustrations] {item['file']}: {len(data)//1024} KB, seed {seed}", flush=True)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Generate and review each image**

Run: `python3 scripts/illustrations/generate.py`
Expected: six `[illustrations] <file>: N KB, seed S` lines. The service runs about 4s to 2min per image depending on its queue; check `curl -s https://text2image-flux2.bmscloud.in.th/v1/queue` if it seems stuck.

Open each webp and reject any image with:
- a red cross
- text or letters
- anatomical errors (limbs through furniture)
- a map that could be read as real geography

Regenerate a rejected image with `--only <file>` after setting its `seed` back to `0`.

- [ ] **Step 5: Write `public/illustrations/README.md`**

```markdown
# Illustrations

Generated with Qwen-Image-2.1 (BMS image service) from
`scripts/illustrations/manifest.json` — prompts, style string and seeds are
recorded there; `python3 scripts/illustrations/generate.py` reproduces them.

- Decorative only: always rendered with `alt=""`.
- **License:** Qwen Research License. Production use requires sign-off;
  until then `NEXT_PUBLIC_ILLUSTRATIONS_ENABLED` stays unset and
  `EmptyState` shows icons.
- No red-cross emblem (legally protected) — green cross or none.
- `about-header.webp` is abstract; never present it as Khon Kaen geography.
```

- [ ] **Step 6: Run the test and commit**

```bash
npx vitest run tests/unit/config/illustrations.test.ts
git add scripts/illustrations public/illustrations tests/unit/config/illustrations.test.ts
git commit -m "feat(ui): reproducible illustration set (flag-gated pending license sign-off)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: PASS.

---

### Task 17: E2E with debug logging, screenshots, final verification

**Files:**
- Create: `tests/e2e/ui-foundation.spec.ts`, `tests/e2e/helpers/debug-log.ts`
- Create (output): `docs/ui-foundation-screenshots/` (PNG, committed)

**Interfaces:**
- Consumes: the running app (`PLAYWRIGHT_BASE_URL`, default `http://127.0.0.1:3000`); optional `E2E_BMS_SESSION_ID` for authenticated pages; `UI_SNAPSHOT_TAG` (`before` | `after`, default `after`).

- [ ] **Step 1: Write the debug-log helper**

```ts
// tests/e2e/helpers/debug-log.ts
// Constitution: E2E must log network, console, UI state and errors per step.
import type { Page, TestInfo } from '@playwright/test';

export function attachDebugLogging(page: Page): string[] {
  const log: string[] = [];
  const stamp = () => new Date().toISOString();
  page.on('console', (m) => log.push(`${stamp()} console.${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => log.push(`${stamp()} PAGEERROR: ${e.message}`));
  page.on('requestfailed', (r) => log.push(`${stamp()} REQFAILED ${r.method()} ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.url().includes('/api/')) log.push(`${stamp()} ${r.status()} ${r.request().method()} ${r.url()}`);
  });
  return log;
}

export async function flushDebugLog(log: string[], testInfo: TestInfo): Promise<void> {
  await testInfo.attach('debug-log', { body: log.join('\n'), contentType: 'text/plain' });
  console.log(`[e2e:${testInfo.title}]\n${log.join('\n')}`);
}
```

- [ ] **Step 2: Write the spec**

```ts
// tests/e2e/ui-foundation.spec.ts
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { attachDebugLogging, flushDebugLog } from './helpers/debug-log';

const TAG = process.env.UI_SNAPSHOT_TAG ?? 'after';
const OUT = 'docs/ui-foundation-screenshots';
const WIDTHS = [1440, 1024, 768] as const;
const AUTH_ROUTES = ['/', '/pregnancies', '/hospitals', '/referrals', '/outcomes', '/hospital-maternity-ward', '/profile'];
const SESSION = process.env.E2E_BMS_SESSION_ID;

mkdirSync(OUT, { recursive: true });

async function login(page: Page, log: string[]) {
  await page.goto('/login');
  await page.fill('input#sessionId', SESSION!);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
  log.push(`logged in → ${page.url()}`);
}

test.describe('UI foundation', () => {
  test('login page renders in Sarabun with no page errors @snapshot', async ({ page }, testInfo) => {
    const log = attachDebugLogging(page);
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('/login');
      await expect(page.locator('input#sessionId')).toBeVisible();
      const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
      log.push(`body font-family @${w}: ${font}`);
      expect(font.toLowerCase()).toContain('sarabun');
      await page.screenshot({ path: `${OUT}/${TAG}-login-${w}.png`, fullPage: true });
    }
    await flushDebugLog(log, testInfo);
    expect(log.filter((l) => l.includes('PAGEERROR'))).toEqual([]);
  });

  test('authenticated shell, strip and routes @snapshot', async ({ page }, testInfo) => {
    test.skip(!SESSION, 'set E2E_BMS_SESSION_ID to run authenticated E2E (see tests/e2e/dashboard.spec.ts)');
    const log = attachDebugLogging(page);
    await login(page, log);
    for (const route of AUTH_ROUTES) {
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 900 });
        const freshness = page
          .waitForResponse((r) => r.url().includes('/api/sync/freshness'), { timeout: 20_000 })
          .catch(() => null);
        await page.goto(route);
        const res = await freshness;
        log.push(`${route} @${w}: freshness ${res ? res.status() : 'no request'}`);
        await expect(page.locator('header.sticky')).toBeVisible();
        if (w >= 1024) await expect(page.locator('aside').first()).toBeVisible();
        else await expect(page.getByRole('button', { name: 'เปิดเมนู' })).toBeVisible();
        const tiny = await page.evaluate(
          () =>
            [...document.querySelectorAll('body *')]
              .filter((el) => (el as HTMLElement).innerText?.trim() && el.children.length === 0)
              // third-party map attribution (Leaflet) is not ours to restyle
              .filter((el) => !el.closest('.leaflet-container'))
              .map((el) => parseFloat(getComputedStyle(el).fontSize))
              .filter((px) => px < 13).length,
        );
        log.push(`${route} @${w}: leaf text elements under 13px = ${tiny}`);
        expect(tiny, `${route} @${w} has text under the 13px floor`).toBe(0);
        await page.screenshot({ path: `${OUT}/${TAG}-${route.replaceAll('/', '_') || 'root'}-${w}.png`, fullPage: true });
      }
    }
    await flushDebugLog(log, testInfo);
    expect(log.filter((l) => l.includes('PAGEERROR'))).toEqual([]);
  });

  test('kiosk mode hides the shell', async ({ page }, testInfo) => {
    test.skip(!SESSION, 'requires E2E_BMS_SESSION_ID');
    const log = attachDebugLogging(page);
    await login(page, log);
    await page.goto('/');
    await page.evaluate(() => document.documentElement.classList.add('kiosk-mode'));
    await expect(page.locator('aside').first()).toBeHidden();
    await expect(page.locator('header.sticky')).toBeHidden();
    log.push('kiosk-mode: aside + header.sticky hidden');
    await flushDebugLog(log, testInfo);
  });
});
```

- [ ] **Step 3: Run E2E against a local dev server**

```bash
npm run dev &   # wait for "Ready"
npx playwright test tests/e2e/ui-foundation.spec.ts
```

Expected: the login test PASSES and the authenticated tests SKIP (no session). If you have a valid BMS session ID, run `E2E_BMS_SESSION_ID=<id> npx playwright test tests/e2e/ui-foundation.spec.ts`; all PASS, debug logs print per route, and screenshots land in `docs/ui-foundation-screenshots/`.

If any assertion fails, read the attached debug log first (network status of `/api/sync/freshness`, console errors, the under-13px count) to find the root cause before changing anything.

- [ ] **Step 4: Final verification**

```bash
npx vitest run --maxWorkers=6
npx tsc --noEmit
npm run lint
npm run build
grep -rlE "text-\[[0-9.]+px\]" src --include=*.tsx   # expect only files listed in eslint-rules/design-allowlist.json
```

Expected: everything green; every file the grep prints appears in the allowlist.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/ui-foundation.spec.ts tests/e2e/helpers/debug-log.ts docs/ui-foundation-screenshots
git commit -m "test(e2e): UI foundation E2E with debug logs, 13px floor check, screenshots

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Deploy is not part of this plan.** It needs explicit user approval. Use the standard pattern: rollback tag `kk-lrms-app:rollback-<date>-pre-ui-foundation`, `BUILD_SHA` build, health check, 3-minute sync-log watch. `NEXT_PUBLIC_ILLUSTRATIONS_ENABLED` stays unset until the Qwen license sign-off.
