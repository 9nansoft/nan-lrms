# UI Foundation — Design Spec (Sub-project 1 of 5)

Date: 2026-10-11 · Status: draft for review · Owner: Chaiyaporn Suratemeekul

## Context

The user asked for the whole app to become "more informative / professional /
modern / user friendly", in Sarabun. The redesign is decomposed into five
sub-projects, each with its own spec → plan → implementation:

1. **Foundation** (this spec): tokens, Thai type scale, shared components, sidebar shell, status strip, migration + lint guard
2. Provincial dashboard `/` (+ kiosk)
3. Hospital maternity-ward page
4. Provincial list pages (hospitals, pregnancies, referrals, outcomes)
5. Admin, profile, login, about

### Decisions already made (brainstorming, 2026-10-11)

| Decision | Choice |
|---|---|
| Primary audience when density and legibility conflict | **Ward nurses** (legibility first) |
| Visual direction | **C · Warm Public Health**: warm paper surface, deep-indigo brand, larger type, risk-tinted rows, solid alert tile |
| App shell | **Left sidebar**, collapsible to an icon rail |
| Implementation approach | **Tokens first, then incremental migration** (not repaint-only, not a new component library) |
| Illustrations | Approved style, generated with the BMS image service; used only on login / empty / stale / error / about |

Mockups: `.superpowers/brainstorm/1437805-1791700719/content/` (`visual-style.html`, `shell-layout.html`, `assets-in-context.html`).

### Problems this foundation fixes (measured 2026-10-11)

| Problem | Evidence |
|---|---|
| Thai text too small | 1,214 arbitrary `text-[Npx]`; 473 at 9–11px |
| No single visual language | teal brand + unused navy "ATC" palette + shadcn neutral greys coexist |
| Risk colours defined in many places | 512 raw `red/green/yellow/amber/emerald-NNN` classes, 339 raw hex, plus hex in `src/config/risk-levels.ts` |
| Few shared primitives | 10 shadcn primitives; KPI tiles, section headers and empty states re-implemented per page |

Sarabun is already loaded in `src/app/layout.tsx` (weights 300–700) and set as `--font-sans`.

## 1. Design tokens

**Single source of truth:** `src/config/design-tokens.ts` (typed constants).
`src/app/globals.css` mirrors them as CSS custom properties and Tailwind
`@theme` colours. A unit test asserts every token in the TS module equals its
CSS variable value. TS is the source because non-CSS consumers exist:
server-rendered vital-sign PNGs, Leaflet map styles and Recharts series.

| Group | Token | Value |
|---|---|---|
| Surface | `surface-page` / `surface-card` / `surface-muted` / `border` | `#FBF8F3` / `#FFFFFF` / `#F3EFE6` / `#E8E1D2` |
| Ink | `ink` / `ink-muted` / `ink-subtle` | `#22223B` / `#5C5C7A` / `#6B6B85` |
| Brand | `brand` / `brand-strong` / `brand-soft` | `#2E3A87` / `#232D6B` / `#E4E6F4` |
| Risk high | `risk-high` / `risk-high-text` / `risk-high-tint` | `#C0392B` / `#A1271B` / `#FDECEA` |
| Risk medium | `risk-medium` / `risk-medium-text` / `risk-medium-tint` | `#D08A00` / `#8A5A00` / `#FFF6E0` |
| Risk low | `risk-low` / `risk-low-text` / `risk-low-tint` | `#3F8F4F` / `#2F6B3A` / `#EEF7EE` |
| Status | `danger` / `warn` / `ok` (+ `-text`, `-tint`) | alias risk high / medium / low |

Rules:
- Every text/background pair used by a component meets WCAG AA (≥4.5:1 for
  body text). The token test checks the declared pairs. Measured 2026-10-11:
  ink-subtle/page 4.87, ink-muted/page 6.07, risk text/tint 5.5–6.5,
  white/risk-high 5.44, white/brand 10.14. `ink-subtle` on `surface-muted` is
  exactly 4.50, so muted surfaces must use `ink-muted` for secondary text.
- shadcn variables (`--primary`, `--background`, `--foreground`, `--card`,
  `--border`, `--ring`, `--muted`, `--destructive`, …) are remapped onto these
  tokens so existing primitives follow automatically.
- `src/config/risk-levels.ts` `color` / `bgColor` read from `design-tokens.ts`;
  no hex literals remain there.
- Legacy `--primary-teal*`, `--accent-navy*`, `--ink-navy*`, `--surface-cool`,
  `--rule-*` become aliases of the new tokens during migration and are deleted
  once the lint allowlist shows zero users.
- The kiosk palette (`--kiosk-*`) stays a separate dark set, retuned so its
  risk hues match the risk tokens.

## 2. Thai type scale

Tailwind utilities defined in `globals.css` (`@theme` font sizes with line-height):

| Utility | Size / line-height / weight | Use |
|---|---|---|
| `text-caption` | 13px / 1.5 / 400 | **Minimum size outside kiosk**: metadata, AN/GA lines |
| `text-label` | 14px / 1.5 / 500 | Column headers, form labels, chips |
| `text-body` | 15px / 1.65 / 400 | Default body (set on `body`) |
| `text-body-lg` | 17px / 1.6 / 500 | Patient names, primary row text |
| `text-title` | 22px / 1.35 / 600 | Section / card titles |
| `text-page` | 26px / 1.3 / 700 | Page heading |
| `text-kpi-sm` / `text-kpi` | 26px / 34px, 1.15, 700 | KPI numbers |

`.num` applies `font-variant-numeric: tabular-nums`. `KpiTile` and `DataTable`
numeric cells use it by default. The kiosk keeps its own larger scale.

## 3. Shared components (`src/components/shared/`)

| Component | Contract |
|---|---|
| `PageHeader` | `title`, `subtitle?`, `actions?`, `freshness?` (renders `FreshnessBadge`) |
| `SectionCard` | `title`, `description?`, `actions?`, `tone?: 'default' \| 'warn' \| 'danger'`, children. Replaces `SectionLabel` usage in `components/dashboard/shared.tsx` |
| `KpiTile` | `label`, `count: number` (**server aggregate only**, per the count-provenance rule), `hint?` (KpiTip), `tone?: 'default' \| 'high' \| 'warn'`, `href?` |
| `RiskChip` | `level: RiskLevel`, `score?`, `label?`; marker + text + Thai label; `aria-label` carries the level so colour is never the only signal. `RiskIndicator`, `CpdBadge`, `AncRiskChip` keep their props and render through it |
| `DataTable` | Presentation wrapper over `ui/table`: sticky header, `rowRisk?(row)` tint, numeric column alignment, built-in `loading` skeleton and `empty` slot. Column definitions stay page-owned |
| `EmptyState` | `illustration: 'ward' \| 'referral' \| 'stale' \| 'generic'`, `title`, `description`, `action?`; falls back to an icon when illustrations are disabled |
| `FreshnessBadge` | `lastSyncAt`; label `ซิงค์ล่าสุด HH:MM · N นาทีที่แล้ว`; tone from `classifySyncHealth` (same 60-min rule as `/api/health`); `role="status"` |
| `StaleBanner`, `ErrorState`, `LoadingState` | Restyled. Messages take the structure **what happened · since when · what to do**, in Thai (constitution V) |

Existing component APIs are preserved; only rendering changes.

## 4. App shell (`src/components/layout/AppShell.tsx`)

It replaces `TopNavBar` / `TopNavBarSlot` in `src/app/(provincial)/layout.tsx`
and `src/app/(hospital)/layout.tsx`.

- **Sidebar** (brand indigo, 232px):
  - Logo, then nav items from `src/config/nav.ts` filtered by the existing `filterNavByRole`, with settings pinned at the bottom.
  - Collapses to a 64px icon rail; the state persists in `localStorage` (wrapped in try/catch, defaulting to expanded).
  - Below 1024px it becomes a slide-over drawer opened from a header button.
  - Hospital-role users get **ห้องคลอด** and **โปรไฟล์** (today they get an empty nav).
- **Header:**
  - Breadcrumb from the existing `BreadcrumbContext` / `useSetBreadcrumbs`.
  - `OnlineUsersBadge`, and the user menu (avatar, role label, profile, logout).
- `DbHealthBanner` stays above content.
- Kiosk mode hides the shell, as today.

### Status strip (`StatusStrip`)

It renders under the header on every page.

| Role | Content |
|---|---|
| Provincial | fresh `X/Y` hospitals · stale (>60 min) `N` (opens list) · last update `HH:MM` · high risk `N` (links to list) |
| Hospital | own hospital `FreshnessBadge` · high risk `N` in own ward |

Data comes from a new **`GET /api/sync/freshness`**:
- **Logic:** lives in `src/services/sync-freshness.ts`, not in the route. Staleness uses `classifySyncHealth`; the high-risk count reuses the existing dashboard high-risk aggregate (never a row length).
- **Scope:** session-scoped. Hospital roles only ever receive their own hospital, and the server enforces this.
- **Caching:** cached via the existing Redis cache layer and invalidated by the existing SSE update events, so there is no new polling loop.
- **Pseudo-hospitals:** `NON_REPORTING_HCODES` in `src/config/hospital-network.ts` (initially `['99999']`) excludes them from freshness counts. `src/services/health.ts` uses the same list, which removes the permanent false `hospital_sync_stale` degradation found in the 2026-10-11 health check.

## 5. Migration

A one-shot codemod (`scripts/codemods/design-tokens.ts`). Its mapping table is unit-tested and its output diff reviewed:

| Input | Output | Count |
|---|---|---|
| `text-[9–13px]` | `text-caption` (9–12px are bumped to 13) | 1,003 |
| `text-[14px]` | `text-label` | 95 |
| `text-[15px]` | `text-body` | 43 |
| `text-[16–17px]` | `text-body-lg` | 7 |
| `text-[18–23px]` | `text-title` | 27 |
| `text-[24–29px]` | `text-page` | 26 |
| `text-[≥30px]` | `text-kpi` | 12 |
| `bg/text/border-{red,rose}-NNN` | `danger` / `danger-text` / `danger-tint` by role and shade | part of 512 |
| `…-{amber,yellow}-NNN` | `warn` / `warn-text` / `warn-tint` | part of 512 |
| `…-{green,emerald}-NNN` | `ok` / `ok-text` / `ok-tint` | part of 512 |
| hex in charts / Leaflet / PNG renderers | imports from `design-tokens.ts` | part of 339 |

- Kiosk components (`KioskHeader` and kiosk-mode branches) are excluded.
- Hex values left after the codemod get a manual pass.
- **Overflow risk** (text bumped to 13px in dense tables and badges): Playwright screenshots of the 8 main routes at 1440 / 1024 / 768px are captured before and after, and overflow is fixed before merge. Page layouts themselves are not redesigned here.

## 6. Lint guard

A local ESLint rule, `no-adhoc-design-values` (in `eslint-rules/`), applies to `src/app/**` and `src/components/**`. It rejects:
- `text-[<n>px|rem]`
- raw Tailwind palette colour classes (`(bg|text|border|ring|fill|stroke)-(red|rose|amber|yellow|green|emerald|teal|…)-\d+`)
- hex colour literals in `className` / `style`

Remaining exceptions live in `eslint-rules/design-allowlist.json`, which may only shrink; a test asserts no new entries without a reason field. The rule has its own tests, covering code it must reject and code it must accept.

## 7. Illustrations

- **Final set:** `ward`, `referral`, `stale`, `generic`, `login-hero`, `about-header`. Generated once with the BMS image service (`POST /v1/generate`, Qwen-Image-2.1, `num_inference_steps: 40`), one shared style prompt, fixed seeds.
- **Storage:** committed as webp (≤900px, ≤150 KB) under `public/illustrations/`. `public/illustrations/README.md` records the prompt, seed, model and date for each, so the set is reproducible.
- **No runtime calls** to the image service.
- **Red cross:** no red-cross emblem (legally protected); use a green cross or no symbol.
- **About map:** `about-header` is decorative only and must not be presented as Khon Kaen geography.
- **License gate:** Qwen-Image-2.1 is under the Qwen Research License. **Production deploy of the illustrations requires a license sign-off.** Until then `EmptyState` uses its icon fallback via the `NEXT_PUBLIC_ILLUSTRATIONS_ENABLED` flag (default `false`). The rest of the foundation is not blocked.

## 8. Testing (TDD, tests first)

- **Unit (Vitest):**
  - Token parity: TS ↔ CSS, plus AA contrast for declared pairs.
  - Codemod mapping table.
  - Lint rule (reject and accept cases).
  - `sync-freshness` service: fresh, stale, never-synced, future-dated, non-reporting excluded, role scoping.
  - `/api/sync/freshness` auth and scoping.
  - `health.ts` excludes `NON_REPORTING_HCODES`.
- **Component (RTL):** every section 3 component for tone mapping, roles/labels, and the loading/empty/error slots. `AppShell` collapse, drawer, and role-filtered nav.
- **E2E (Playwright):**
  - Login, dashboard, ward and one list page at three widths.
  - Detailed debug logs (network, console, screenshots, errors) per the constitution.
- **Gates per commit:** full Vitest suite, `tsc --noEmit` and `npm run lint` green.

## 9. Rollout

- Commit after each step: tokens → type scale → components → shell + status strip → codemod → lint guard → illustrations.
- Deploy pattern: tag a rollback image (`kk-lrms-app:rollback-<date>-pre-ui-foundation`), build with `BUILD_SHA`, health check, then watch sync logs for 3 minutes.
- Before/after screenshots are kept in `docs/ui-foundation-screenshots/` for review.

## Out of scope

Page-specific layouts (sub-projects 2–5), app-wide dark mode, changes to nav
items or routes, and the clinical logic or data shown.
