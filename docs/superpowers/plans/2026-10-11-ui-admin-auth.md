# Admin, Profile, Login, About Redesign Implementation Plan (Sub-project 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `/login`, `/about`, `/profile` and `/admin` onto the direction-C foundation.
- `/login` gets the approved hero.
- `/about` gets a decorative header and section cards.
- `/profile` becomes legible for ward nurses.
- `/admin` gets `PageHeader`, tabs, `SectionCard` / `DataTable` / `EmptyState` and actionable Thai errors.

Auth and admin security behaviour stays byte-for-byte identical.

**Architecture:**
- **Shared primitives first** (Task 1): `SectionCard id`, the `DataTable` nested-click guard, `InlineNotice`, `BrandMark`, `actionFailure`, hero illustration paths, and a migration guard test.
- **Then one surface per task:** login (2), about (3), profile (4), admin shell + registry tabs (5), admin operations tabs (6), `HospitalEditDialog` + simulation (7). The synthetic visual run is last (8).
- **Characterization before restyle:** every task that touches auth or admin pins the security-relevant behaviour (requests, gates, masking) in a test before it changes any JSX.
- **Logic stays in place.** Only JSX, class names and copy change, plus the documented bugs B1–B5. Three small pure modules are pulled out where they are shared or need testing: `provider-login`, `sync-run-status`, `presence` config.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS 4 (`@theme`, container queries), shadcn/ui + Base UI (Tabs, Dialog), SWR, lucide-react, `next/image`, Vitest + RTL (jsdom), Playwright, ESLint 9 flat config.

**Spec:** `docs/superpowers/specs/2026-10-11-ui-admin-auth-design.md` (committed together with this plan). Foundation: `docs/superpowers/specs/2026-10-11-ui-foundation-design.md` and `docs/superpowers/plans/2026-10-11-ui-foundation.md`. Dashboard: `docs/superpowers/specs/2026-10-11-ui-dashboard-design.md`. Executors read the admin-auth spec first.

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
- Every declared text/background pair ≥ 4.5:1. On `surface-muted`, secondary text uses `ink-muted`, never `ink-subtle`. **Text is never coloured with the base risk hue** (`ok`/`warn`/`danger`, `--risk-*`); use the `-text` variant (B3).
- `html { font-size: 18px }` stays. **Compute widths with an 18px rem:** `px-4` = 18px, `h-11` = 49.5px, `max-w-md` = 504px, and Tailwind `md:` is 864px.
- KPI numbers come from server aggregates or complete unpaginated admin lists (spec D9), never from a row-limited fetch.
- All user-facing messages are Thai and follow **what happened · since when · what to do**.
- Kiosk mode is untouched by this sub-project. The shell must keep rendering the sidebar as `<aside>` and the top bar as `<header className="sticky …">`.
- Gates per commit: `npx vitest run <touched tests>`, then `npx tsc --noEmit` and `npm run lint` green. Run the full `npx vitest run --maxWorkers=6` at the end of tasks 4, 7 and 8.
- Commit messages end with `Co-Authored-By: <implementer's harness attribution>`.

**Sub-project 5 constraints:**
- **Security behaviour identical.** Do not edit:
  - any `fetch(…)` URL, method, header or body;
  - any `signIn` call;
  - `setSessionCookie` / `setMarketplaceToken` / `localStorage` writes;
  - `confirm()` text;
  - any typed-confirmation comparison (`confirmInput.trim() === hospital.hcode`, `revokeInput !== revokeTarget.keyPrefix`);
  - any `maskName` / `maskCid` / local `maskCid` call.

  `src/middleware.ts`, `src/lib/admin-access.ts`, `src/lib/request-origin.ts` and every `src/app/api/**` file are **out of bounds**. Task 7 Step 7 checks this with a diff grep.
- **No behaviour or data changes** beyond B1–B5 and the copy fixes in spec D2/D3.
- **Thai-first labels.** Keep the standard terms HOSxP, BMS, CPD, ANC, CID, API Key, Webhook, Tunnel URL, hcode and LINE. Keep raw status codes (`ONLINE`, `CONNECTED`, `ERROR`) and server error strings verbatim (spec D6).
- **No ad-hoc design values in new code:** no raw palette classes, no `slate-*`, no hex in `className` / `style`, no legacy alias variables (`--ink-navy*`, `--rule-*`, `--accent-navy*`, `--surface-cool`, `--primary-teal*`), no `uppercase` eyebrows, no `zoom`. `tests/unit/ui/admin-auth-migration.test.ts` (Task 1) enforces this for every migrated file.
- **The allowlist only shrinks.** Task 3 removes `src/app/about/page.tsx`. Task 5 removes `src/components/admin/HospitalsTab.tsx`. Task 7 removes `src/components/admin/HospitalEditDialog.tsx` and `src/components/dashboard/SimulationControl.tsx`. Each removal decrements `maxEntries` by the same count **from its current value**, because sub-projects 3–4 shrink the file in parallel.
- **PDPA.** Authenticated screenshots go only to the gitignored `e2e-private/`. Only PHI-free `/login` and `/about` screenshots may be committed.
- **Git.** Work on `main` locally (or the assigned worktree) and never push.

### Spec deviations (decided while planning, with reasons)

The design-level deviations D1–D13 are in the spec. These are the plan-level ones:

1. **Characterization tests open each admin task**, not all in one task up front. Each task stays independently testable, and each characterization test is written against the code that task is about to change.
2. **`BrandMark` is extracted** (Task 1). The round "K" mark appears in `Sidebar`, `/login` and `/about`, and the DRY rule says three uses must already be shared. The Sidebar keeps its exact classes.
3. **`providerLoginStartUrl()` is added** next to the moved `mapProviderError`. jsdom cannot observe a `window.location.href` assignment, so the ProviderID redirect target is pinned as a pure function. The page calls it with the same string as before.
4. **A migration guard test** (`tests/unit/ui/admin-auth-migration.test.ts`) complements the lint rule. The lint rule allows neutral greys and does not know legacy alias variables or comma `grid-cols-[…]` (B1). The guard lists each migrated file, so each task goes red, then green.
5. **The visual run (Task 8) happens in the main checkout after merge.** Turbopack breaks on `node_modules` symlinks inside a worktree.

## Review Focus

1. **Security unchanged.** Task 7 Step 7's `git diff` grep finds no changed `fetch(` / `method:` / `confirm(` / `signIn(` / `maskCid` / `keyPrefix` / `confirmHcode` lines. The characterization tests (Tasks 2, 5, 6, 7) are added before restyle and never edited afterwards.
2. **B1 fixed.** `HospitalsTab` is a real table (`DataTable`), and the guard test bans comma `grid-cols-[a,b]` in migrated files.
3. **Copy accuracy (owner check).** The corrected PDPA bullets on `/about` (Task 3 Step 3), and the login lead sentence and read-only note (Task 2).
4. **Decorative art stays decorative.** Both hero images use `alt=""` inside `aria-hidden`, and nothing captions `about-header` as a map (Task 3 test).
5. **Allowlist and contrast.** Four entries removed, with `maxEntries` decremented by four, and no base-hue text in admin.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/components/shared/{SectionCard,DataTable}.tsx` | `id` passthrough; nested-interactive click guard | 1 |
| `src/components/shared/{InlineNotice,BrandMark}.tsx`, `src/components/layout/Sidebar.tsx` | Success notice; shared "K" mark | 1 |
| `src/lib/action-failure.ts` | Actionable Thai failure message + remedy | 1 |
| `src/config/illustrations.ts`, `tests/unit/config/illustrations.test.ts` | `HERO_ILLUSTRATION_SRC` | 1 |
| `tests/unit/ui/admin-auth-migration.test.ts` | Migration guard (grows per task) | 1 |
| `src/lib/provider-login.ts` | `mapProviderError` (moved), `providerLoginStartUrl` | 2 |
| `src/components/auth/{LoginHero,AccessDeniedNotice,HosxpVersionDialog}.tsx`, `src/app/(auth)/login/page.tsx` | Direction-C login | 2 |
| `src/components/about/{AboutHeader,about-blocks,WebhookApiSection}.tsx`, `src/app/about/page.tsx` | About page | 3 |
| `src/app/(hospital)/profile/page.tsx`, `src/components/profile/NotificationPreferenceCard.tsx` | Profile | 4 |
| `tests/helpers/admin-fixtures.tsx` | SWR/fetch harness for admin tests | 5 |
| `src/config/status-tone.ts`, `src/components/admin/admin-ui.tsx` | `StatusTone`; `StatusPill`, `Field`, `TONE_CLASSES`, `SELECT_CLASS` | 5 |
| `src/app/(provincial)/admin/page.tsx`, `src/components/admin/{HospitalsTab,ActiveProvinceTab,BulkAddHospitalsDialog,AdminMapPane}.tsx` | Admin shell + registry tabs | 5 |
| `src/config/{sync-run-status,presence}.ts`, `src/lib/presence.ts` | Shared sync vocabulary; client-safe presence constants | 6 |
| `src/components/admin/{SyncOverviewTab,OnlineUsersTab,WebhookKeysTab,MophAlertsTab,BmsConfigTab}.tsx` | Operations tabs | 6 |
| `src/components/admin/{HospitalEditDialog,SimulationTab}.tsx`, `src/components/dashboard/SimulationControl.tsx` | Token + Thai pass | 7 |
| `eslint-rules/design-allowlist.json` | −4 entries | 3, 5, 7 |
| `tests/e2e/helpers/session-login.ts`, `tests/e2e/ui-admin-auth.spec.ts`, `tests/e2e/ui-foundation.spec.ts` | E2E + synthetic visual run | 8 |

### Class mapping used in Tasks 3–7

Apply this table whenever a step says "apply the class mapping". **Codes** (hcode, CID, key prefix, URLs, JSON) keep `font-mono`; labels never do.

| Old | New |
|---|---|
| `text-[var(--ink-navy)]`, `style={{ color: 'var(--ink-navy)' }}`, `text-slate-800/700/900` | `text-ink` |
| `text-[var(--ink-navy-dim)]`, `text-[var(--ink-navy-muted)]`, `text-slate-600/500/400/300` | `text-ink-muted` |
| `text-[var(--accent-navy)]`, `color: 'var(--accent-navy)'` | `text-brand` |
| `bg-[var(--accent-navy-soft)]`, `hover:bg-[var(--accent-navy-soft)]`, `background: 'var(--accent-navy-soft)'` | `bg-brand-soft` / `hover:bg-brand-soft` |
| `background: 'var(--accent-navy)'` (buttons) | `bg-brand hover:bg-brand-strong text-white` |
| `bg-[var(--surface-cool)]`, `background: 'var(--surface-cool)'`, `bg-slate-50` | `bg-surface-muted` |
| `bg-white` (panels) | `bg-surface-card` |
| `borderColor: 'var(--rule-strong)'` / `'var(--rule-hair)'` / `var(--rule)` / `var(--rule-subtle)`, `border-slate-*` | `border-border` (class; drop the style key) |
| Square bordered panel `border bg-white p-4` + `style={{ borderColor }}` | `SectionCard` (or `rounded-2xl bg-surface-card p-5 shadow-soft`) |
| `font-mono text-caption uppercase tracking-[…]` eyebrow / column header | `text-label text-ink-muted` (Thai text, no mono, no uppercase) |
| `font-mono text-page … tabular-nums` big number | `KpiTile` inside `KpiGrid` |
| Text in `var(--risk-low)` / `COLOR.riskLow` | `text-ok-text` |
| Text in `var(--risk-medium)` / `COLOR.riskMedium` | `text-warn-text` |
| Text in `var(--risk-high)` / `COLOR.riskHigh` / `COLOR.riskHighText` | `text-danger-text` |
| Border/background in `COLOR.risk*Tint` / `var(--risk-*)` | `bg-*-tint` + `border-*/40` (`ok`/`warn`/`danger`) |
| `'color-mix(in srgb, var(--risk-medium) 8%, white)'` | `bg-warn-tint` |
| `text-sm` prose / `text-xs` meta | `text-body` / `text-caption` |
| `text-lg font-semibold` h3 / `text-2xl`–`text-4xl` | `text-body-lg` / `text-title`–`text-page` |
| Native `<select … style={{ borderColor }}>` | `className={SELECT_CLASS}` (`admin-ui.tsx`) |

---

### Task 1: Shared groundwork

**Files:**
- Modify: `src/components/shared/SectionCard.tsx`, `src/components/shared/DataTable.tsx`, `src/config/illustrations.ts`, `src/components/layout/Sidebar.tsx`, `tests/unit/config/illustrations.test.ts`
- Create: `src/components/shared/InlineNotice.tsx`, `src/components/shared/BrandMark.tsx`, `src/lib/action-failure.ts`, `tests/unit/ui/admin-auth-migration.test.ts`
- Test: `tests/unit/components/shared/admin-auth-blocks.test.tsx`, `tests/unit/lib/action-failure.test.ts`

**Interfaces:**
- Consumes: `cn` (`@/lib/utils`), `RiskLevel`, the existing `DataTable` / `SectionCard` contracts.
- Produces:
  - `SectionCardProps.id?: string`
  - `DataTable` row click ignores clicks that start inside a nested interactive element
  - `InlineNotice({ tone: 'ok' | 'info', children, className? })` (`role="status"`)
  - `BrandMark({ tone?: 'onLight' | 'onBrand', size?: 'sm' | 'md', className? })`
  - `actionFailure(action: string, detail?: string | null, remedy?: string): ActionFailure`, `DEFAULT_ACTION_REMEDY`
  - `HERO_ILLUSTRATION_SRC: { loginHero: string; aboutHeader: string }`
  - `MIGRATED: string[]` in the guard test

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/unit/components/shared/admin-auth-blocks.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SectionCard } from '@/components/shared/SectionCard';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { InlineNotice } from '@/components/shared/InlineNotice';
import { BrandMark } from '@/components/shared/BrandMark';

describe('SectionCard id', () => {
  it('puts the id on the section so in-page anchors resolve', () => {
    render(<SectionCard id="cpd" title="ระบบประเมินความเสี่ยง CPD">x</SectionCard>);
    expect(screen.getByRole('region', { name: 'ระบบประเมินความเสี่ยง CPD' })).toHaveAttribute('id', 'cpd');
  });
  it('renders no id when none is given', () => {
    render(<SectionCard title="t">x</SectionCard>);
    expect(screen.getByRole('region', { name: 't' })).not.toHaveAttribute('id');
  });
});

describe('DataTable — nested controls own their clicks', () => {
  type Row = { id: string; name: string };
  const rows: Row[] = [{ id: 'a', name: 'รพ.ขอนแก่น' }];
  it('a click on a nested button does not also activate the row', async () => {
    const onRowClick = vi.fn();
    const onEdit = vi.fn();
    const columns: DataTableColumn<Row>[] = [
      { key: 'name', header: 'ชื่อ', cell: (r) => r.name },
      { key: 'act', header: 'จัดการ', cell: () => <button type="button" onClick={onEdit}>แก้ไข</button> },
    ];
    render(
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={onRowClick} rowLabel={(r) => `เปิด ${r.name}`} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'แก้ไข' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText('รพ.ขอนแก่น'));
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });
});

describe('InlineNotice', () => {
  it('announces politely in the ok tone', () => {
    render(<InlineNotice tone="ok">บันทึกสำเร็จ</InlineNotice>);
    const n = screen.getByRole('status');
    expect(n).toHaveTextContent('บันทึกสำเร็จ');
    expect(n.className).toContain('bg-ok-tint');
    expect(n.className).toContain('text-ok-text');
  });
});

describe('BrandMark', () => {
  it('is decorative and brand-filled on light surfaces by default', () => {
    const { container } = render(<BrandMark />);
    const mark = container.firstElementChild!;
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark).toHaveTextContent('K');
    expect(mark.className).toContain('bg-brand');
  });
  it('inverts on the brand sidebar', () => {
    const { container } = render(<BrandMark tone="onBrand" size="sm" />);
    expect(container.firstElementChild!.className).toContain('bg-white');
    expect(container.firstElementChild!.className).toContain('h-8');
  });
});
```

```ts
// tests/unit/lib/action-failure.test.ts
import { describe, it, expect } from 'vitest';
import { actionFailure, DEFAULT_ACTION_REMEDY } from '@/lib/action-failure';

describe('actionFailure', () => {
  it('names the action, keeps the server detail and says what to do', () => {
    expect(actionFailure('ลบ รพ.ขอนแก่น (10670)', 'hospital has data')).toEqual({
      message: 'ลบ รพ.ขอนแก่น (10670) ไม่สำเร็จ: hospital has data',
      remedy: DEFAULT_ACTION_REMEDY,
    });
  });
  it('joins a bare Thai verb without a space and omits an empty detail', () => {
    expect(actionFailure('บันทึก', '').message).toBe('บันทึกไม่สำเร็จ');
    expect(actionFailure('บันทึก', null).message).toBe('บันทึกไม่สำเร็จ');
  });
  it('accepts a specific remedy', () => {
    expect(actionFailure('บันทึก', null, 'กดเลือกอีกครั้ง').remedy).toBe('กดเลือกอีกครั้ง');
  });
  it('the default remedy is Thai and actionable', () => {
    expect(DEFAULT_ACTION_REMEDY).toBe(
      'ตรวจสอบการเชื่อมต่อเครือข่าย แล้วลองอีกครั้ง หากยังไม่สำเร็จ แจ้งผู้ดูแลระบบพร้อมข้อความนี้',
    );
  });
});
```

```ts
// tests/unit/ui/admin-auth-migration.test.ts
// Sub-project 5 guard: files migrated to the direction-C tokens must not drift
// back to the retired navy/ATC vocabulary. The lint rule allows neutral greys
// and does not know the legacy alias variables or Tailwind 4's comma trap, so
// this test checks them. Each task appends its files BEFORE migrating them
// (red), then migrates them (green). Never remove a file from this list.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

export const MIGRATED: string[] = [];

type Rule = [name: string, offends: (line: string) => boolean];
const RULES: Rule[] = [
  ['legacy alias variable', (l) => /var\(--(?:ink-navy|rule\b|rule-|accent-navy|surface-cool|primary-teal)/.test(l)],
  ['legacy alias class', (l) => /\b(?:text|bg|border|ring)-(?:ink-navy|accent-navy|surface-cool|rule-strong|rule-hair|primary-teal)/.test(l)],
  ['hex colour', (l) => /#[0-9a-fA-F]{3,8}\b/.test(l)],
  ['css zoom', (l) => /\bzoom:\s*[\d.]/.test(l)],
  ['uppercase eyebrow', (l) => /\buppercase\b/.test(l)],
  ['slate palette', (l) => /\b(?:bg|text|border|from|via|to|ring|divide)-slate-\d/.test(l)],
  // Tailwind 4 keeps commas literally: grid-cols-[90px,1fr] → invalid CSS (B1).
  ['comma grid template', (l) =>
    [...l.matchAll(/grid-cols-\[([^\]]*)\]/g)].some((m) => m[1].replace(/\([^)]*\)/g, '').includes(','))],
];

describe('admin-auth migration guard', () => {
  it('the guard rules catch what they claim to', () => {
    const offends = (s: string) => RULES.filter(([, f]) => f(s)).map(([n]) => n);
    expect(offends("className=\"grid-cols-[90px,1fr]\"")).toEqual(['comma grid template']);
    expect(offends("className=\"grid-cols-[minmax(0,1fr)_420px]\"")).toEqual([]);
    expect(offends("style={{ color: 'var(--ink-navy)' }}")).toEqual(['legacy alias variable']);
    expect(offends('href="#features"')).toEqual([]);
  });
  it.each(MIGRATED.length ? MIGRATED : ['(none yet)'])('%s uses only direction-C vocabulary', (file) => {
    if (file === '(none yet)') return;
    const lines = readFileSync(file, 'utf8').split('\n');
    const hits: string[] = [];
    lines.forEach((line, i) => {
      for (const [name, offends] of RULES) if (offends(line)) hits.push(`${i + 1} ${name}: ${line.trim()}`);
    });
    expect(hits).toEqual([]);
  });
});
```

In `tests/unit/config/illustrations.test.ts`:
1. Change the import to `import { HERO_ILLUSTRATION_SRC, ILLUSTRATION_SRC } from '@/config/illustrations';`.
2. Change `it.each(Object.values(ILLUSTRATION_SRC))(` to `it.each([...Object.values(ILLUSTRATION_SRC), ...Object.values(HERO_ILLUSTRATION_SRC)])(`.

- [ ] **Step 2: Run them to confirm they fail**

```bash
npx vitest run tests/unit/components/shared/admin-auth-blocks.test.tsx tests/unit/lib/action-failure.test.ts tests/unit/ui/admin-auth-migration.test.ts tests/unit/config/illustrations.test.ts
```

Expected: FAIL. `InlineNotice`, `BrandMark`, `action-failure` and `HERO_ILLUSTRATION_SRC` cannot be resolved; the SectionCard `id` and nested-click tests fail. The guard file passes (empty list, rule self-test).

- [ ] **Step 3: Implement**

`src/components/shared/SectionCard.tsx`:
1. Add `id?: string;` to `SectionCardProps`.
2. Destructure `id`.
3. Change the opening tag to `<section id={id} aria-label={title} className={cn('rounded-2xl p-5 shadow-soft', id && 'scroll-mt-6', TONE[tone], className)}>`.

`src/components/shared/DataTable.tsx`:
1. Change the import to `import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';`.
2. Below `activateOnKeys`, add:

```ts
// A click that starts on a nested control (edit/delete button, link, input)
// belongs to that control. Without this guard the row's onRowClick fired too,
// so "แก้ไข" inside a clickable row also navigated the row.
const NESTED_INTERACTIVE = 'a,button,input,select,textarea,label,summary,[role="button"],[role="link"],[role="checkbox"]';

function activateOnClick<T>(row: T, onRowClick: (row: T) => void) {
  return (e: MouseEvent<HTMLTableRowElement>) => {
    const hit = (e.target as Element).closest(NESTED_INTERACTIVE);
    if (hit && hit !== e.currentTarget && e.currentTarget.contains(hit)) return;
    onRowClick(row);
  };
}
```

3. Replace `onClick={clickable ? () => onRowClick(row) : undefined}` with `onClick={clickable ? activateOnClick(row, onRowClick) : undefined}`.

If a sibling sub-project already landed an equivalent guard (`grep -n "closest(" src/components/shared/DataTable.tsx`), keep theirs and keep this task's test.

```tsx
// src/components/shared/InlineNotice.tsx
// Success / info line for in-place admin and profile actions. Failures use
// ErrorState variant="banner" (role="alert", "วิธีแก้: …"), never this.
import type { ReactNode } from 'react';
import { CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const TONE = {
  ok: { box: 'border-ok/40 bg-ok-tint text-ok-text', Icon: CheckCircle2 },
  info: { box: 'border-brand/30 bg-brand-soft text-brand', Icon: Info },
} as const;

export function InlineNotice({
  tone = 'ok',
  children,
  className,
}: {
  tone?: keyof typeof TONE;
  children: ReactNode;
  className?: string;
}) {
  const { box, Icon } = TONE[tone];
  return (
    <p role="status" className={cn('flex items-start gap-2 rounded-xl border px-3 py-2 text-body', box, className)}>
      <Icon aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
```

```tsx
// src/components/shared/BrandMark.tsx
// The round "K" mark: sidebar, login and about all draw it. Decorative — the
// surrounding link or heading carries the accessible name.
import { cn } from '@/lib/utils';

const TONE = { onLight: 'bg-brand text-white', onBrand: 'bg-white text-brand' } as const;
const SIZE = { sm: 'h-8 w-8', md: 'h-10 w-10 text-body-lg' } as const;

export function BrandMark({
  tone = 'onLight',
  size = 'md',
  className,
}: {
  tone?: keyof typeof TONE;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={cn('grid shrink-0 place-items-center rounded-full font-bold', SIZE[size], TONE[tone], className)}>
      K
    </span>
  );
}
```

`src/components/layout/Sidebar.tsx`:
1. Replace `<span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white font-bold text-brand">K</span>` with `<BrandMark tone="onBrand" size="sm" />`.
2. Add `import { BrandMark } from '@/components/shared/BrandMark';`.

The rendered classes are identical; `aria-hidden` is new, and the link keeps `aria-label="KK-LRMS หน้าแรก"`.

```ts
// src/lib/action-failure.ts
// One wording for "an action failed" across admin and profile (constitution V:
// what happened + what to do). Rendered through ErrorState variant="banner",
// which prefixes the remedy with "วิธีแก้:".
export const DEFAULT_ACTION_REMEDY =
  'ตรวจสอบการเชื่อมต่อเครือข่าย แล้วลองอีกครั้ง หากยังไม่สำเร็จ แจ้งผู้ดูแลระบบพร้อมข้อความนี้';

export interface ActionFailure {
  message: string;
  remedy: string;
}

/** `action` reads as the Thai phrase before "ไม่สำเร็จ": a bare verb ("บันทึก")
 *  joins directly; a phrase with an object ("ลบ รพ.ขอนแก่น") gets a space. */
export function actionFailure(action: string, detail?: string | null, remedy = DEFAULT_ACTION_REMEDY): ActionFailure {
  const head = action.trim();
  const message = `${head}${/\s/.test(head) ? ' ' : ''}ไม่สำเร็จ${detail ? `: ${detail}` : ''}`;
  return { message, remedy };
}
```

In `src/config/illustrations.ts`, append:

```ts
/** Full-bleed decorative art (login hero, about header) — same kill switch,
 *  always rendered with alt="" inside an aria-hidden wrapper. about-header is
 *  abstract and must never be presented as Khon Kaen geography. */
export const HERO_ILLUSTRATION_SRC = {
  loginHero: '/illustrations/login-hero.webp',
  aboutHeader: '/illustrations/about-header.webp',
} as const;
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npx vitest run tests/unit/components/shared tests/unit/lib/action-failure.test.ts tests/unit/ui/admin-auth-migration.test.ts tests/unit/config/illustrations.test.ts tests/unit/components/layout
npx tsc --noEmit && npm run lint
```

Expected: PASS (the existing `DataTable.test.tsx` and layout tests stay green); tsc and lint are clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/{SectionCard,DataTable,InlineNotice,BrandMark}.tsx src/components/layout/Sidebar.tsx src/lib/action-failure.ts src/config/illustrations.ts tests/unit/components/shared/admin-auth-blocks.test.tsx tests/unit/lib/action-failure.test.ts tests/unit/ui/admin-auth-migration.test.ts tests/unit/config/illustrations.test.ts
git commit -m "feat(ui): shared groundwork for admin/auth pages

SectionCard takes an id for in-page anchors; DataTable rows no longer fire
onRowClick for clicks on nested controls; InlineNotice, BrandMark and
actionFailure give admin and profile one success style, one brand mark and
one actionable Thai failure wording; hero illustration paths join the
illustration config; a migration guard pins the direction-C vocabulary.

Co-Authored-By: <implementer's harness attribution>"
```

---

### Task 2: Login — direction-C hero (characterization first)

**Files:**
- Create: `src/lib/provider-login.ts`, `src/components/auth/LoginHero.tsx`, `src/components/auth/AccessDeniedNotice.tsx`, `src/components/auth/HosxpVersionDialog.tsx`
- Modify: `src/app/(auth)/login/page.tsx`, `tests/unit/ui/admin-auth-migration.test.ts`
- Test: `tests/unit/pages/login.test.tsx` (rewritten), `tests/unit/lib/provider-login.test.ts`

**Interfaces:**
- Consumes:
  - `signIn` (`next-auth/react`), `useRouter` / `useSearchParams`
  - `setSessionCookie` / `setMarketplaceToken` (`@/utils/bms-session-storage`)
  - `MIN_BMS_API_VERSION`
  - `BrandMark`, `HERO_ILLUSTRATION_SRC`, `illustrationsEnabled`
- Produces:
  - `mapProviderError(code)`, `PROVIDER_ERROR_FALLBACK`, `providerLoginStartUrl(callbackUrl)`
  - `LoginHero()`
  - `AccessDeniedNotice({ info })` with `AccessDeniedInfo`
  - `HosxpVersionDialog({ rejection, onClose })` with `VersionRejection`

- [ ] **Step 1: Write the characterization tests and confirm they pass on today's page**

Replace `tests/unit/pages/login.test.tsx` with:

```tsx
// Login — characterization (pins the auth flow before the redesign) + layout.
// The first describe must pass on the pre-redesign page and is never edited
// afterwards; the second describes the approved direction-C layout.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn() }));
const auth = vi.hoisted(() => ({ signIn: vi.fn() }));
const storage = vi.hoisted(() => ({ setSessionCookie: vi.fn(), setMarketplaceToken: vi.fn() }));

vi.mock('next-auth/react', () => ({ signIn: auth.signIn }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => nav.params,
  useParams: () => ({}),
}));
vi.mock('@/utils/bms-session-storage', () => storage);

import LoginPage from '@/app/(auth)/login/page';

function stubPreflight(body: Record<string, unknown> | null) {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => body }) as unknown as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function submitSession(container: HTMLElement, id: string) {
  await userEvent.type(screen.getByLabelText('BMS Session ID'), id);
  await userEvent.click(container.querySelector('button[type="submit"]')!);
}

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.push.mockReset();
  auth.signIn.mockReset();
  storage.setSessionCookie.mockReset();
  storage.setMarketplaceToken.mockReset();
  window.localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('Login — auth flow characterization (must not change)', () => {
  it('auto-logs in from ?bms-session-id: preflight → signIn → cookie → callbackUrl', async () => {
    nav.params = new URLSearchParams('bms-session-id=abc-123&callbackUrl=/hospital-maternity-ward&marketplace_token=mt');
    const fetchMock = stubPreflight({ ok: true });
    auth.signIn.mockResolvedValue({ error: undefined });
    render(<LoginPage />);
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/hospital-maternity-ward'));
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/hospital-preflight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'abc-123' }),
    });
    expect(auth.signIn).toHaveBeenCalledWith('credentials', { sessionId: 'abc-123', redirect: false });
    expect(storage.setSessionCookie).toHaveBeenCalledWith('abc-123');
    expect(storage.setMarketplaceToken).toHaveBeenCalledWith('mt');
    expect(window.localStorage.getItem('kk-lrms:auth-provider')).toBe('bms');
  });

  it('an empty submit asks for the session id and calls nothing', async () => {
    const fetchMock = stubPreflight({ ok: true });
    const { container } = render(<LoginPage />);
    await userEvent.click(container.querySelector('button[type="submit"]')!);
    expect(await screen.findByText('กรุณากรอก BMS Session ID')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('not_registered names the hospital and who to contact; signIn is never called', async () => {
    stubPreflight({ ok: false, reason: 'not_registered', hospitalCode: '99001', hospitalName: 'รพ.ทดลอง' });
    const { container } = render(<LoginPage />);
    await submitSession(container, 'sess-1');
    expect(await screen.findByText('ไม่ได้รับสิทธิ์ใช้งานระบบ')).toBeInTheDocument();
    expect(screen.getByText('รพ.ทดลอง')).toBeInTheDocument();
    expect(screen.getByText('99001')).toBeInTheDocument();
    expect(screen.getByText(/ติดต่อผู้ดูแลระบบ \(สสจ\.ขอนแก่น\)/)).toBeInTheDocument();
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('deactivated says the hospital was switched off', async () => {
    stubPreflight({ ok: false, reason: 'deactivated', hospitalCode: '10670', hospitalName: 'รพ.ขอนแก่น' });
    const { container } = render(<LoginPage />);
    await submitSession(container, 'sess-2');
    expect(await screen.findByText('โรงพยาบาลถูกปิดการใช้งาน')).toBeInTheDocument();
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('hosxp_too_old opens the update dialog with both versions and blocks sign-in', async () => {
    stubPreflight({
      ok: false, reason: 'hosxp_too_old', hospitalCode: '10670', hospitalName: 'รพ.ขอนแก่น',
      currentVersion: '1.2.3', minVersion: '2.0.0',
    });
    const { container } = render(<LoginPage />);
    await submitSession(container, 'sess-3');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('ต้องอัปเดต HOSxP ก่อนใช้งาน')).toBeInTheDocument();
    expect(within(dialog).getByText('1.2.3')).toBeInTheDocument();
    expect(within(dialog).getAllByText('2.0.0').length).toBeGreaterThanOrEqual(1);
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('a malformed preflight reply is a Thai retry message', async () => {
    stubPreflight(null);
    const { container } = render(<LoginPage />);
    await submitSession(container, 'sess-4');
    expect(await screen.findByText('ไม่สามารถตรวจสอบ session ได้ — กรุณาลองใหม่')).toBeInTheDocument();
  });

  it('an unknown providerError is never the headline; the raw code is detail only', () => {
    nav.params = new URLSearchParams('providerError=<script>evil</script>');
    render(<LoginPage />);
    expect(screen.getByText('เข้าสู่ระบบด้วย ProviderID ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')).toBeInTheDocument();
    expect(screen.getByText('<script>evil</script>')).toBeInTheDocument();
  });

  it('a known providerError maps to friendly Thai', () => {
    nav.params = new URLSearchParams('providerError=access_denied');
    render(<LoginPage />);
    expect(screen.getByText('ท่านไม่ได้อนุญาตให้ระบบเข้าถึงข้อมูล ProviderID กรุณาลองใหม่แล้วกด "อนุญาต"')).toBeInTheDocument();
  });
});
```

```bash
npx vitest run tests/unit/pages/login.test.tsx
```

Expected: **8 PASS on today's page.** If one fails, the test is wrong about today's behaviour; fix the test, never the page. Commit this checkpoint with `git commit -m "test(login): characterize the auth flow before the redesign …"` and the trailer.

- [ ] **Step 2: Write the failing unit and layout tests**

```ts
// tests/unit/lib/provider-login.test.ts
import { describe, it, expect } from 'vitest';
import { mapProviderError, PROVIDER_ERROR_FALLBACK, providerLoginStartUrl } from '@/lib/provider-login';

describe('provider-login', () => {
  it('maps known codes to Thai with no detail', () => {
    expect(mapProviderError('missing_provider_token')).toEqual({
      message: 'ไม่พบข้อมูลการเข้าสู่ระบบ ProviderID กรุณาเริ่มเข้าสู่ระบบใหม่อีกครั้ง',
    });
  });
  it('never echoes IdP text as the message', () => {
    expect(mapProviderError('<b>x</b>')).toEqual({ message: PROVIDER_ERROR_FALLBACK, detail: '<b>x</b>' });
  });
  it('builds the OAuth start URL exactly as the page always did', () => {
    expect(providerLoginStartUrl('/pregnancies?x=1')).toBe('/api/auth/provider/start?callbackUrl=%2Fpregnancies%3Fx%3D1');
  });
});
```

Append to `tests/unit/pages/login.test.tsx`:

```tsx
describe('Login — direction-C layout', () => {
  it('has one h1 naming the system', () => {
    render(<LoginPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ระบบติดตามการคลอดจังหวัดขอนแก่น');
  });
  it('offers BMS (HOSxP) as primary and ProviderID as the read-only alternative', () => {
    const { container } = render(<LoginPage />);
    expect(container.querySelector('button[type="submit"]')).toHaveTextContent('เข้าสู่ระบบด้วย BMS (HOSxP)');
    expect(screen.getByRole('button', { name: 'เข้าสู่ระบบด้วย ProviderID' })).toBeInTheDocument();
    expect(screen.getByText('สิทธิ์อ่านอย่างเดียว — ดูข้อมูลได้ แก้ไขไม่ได้')).toBeInTheDocument();
  });
  it('keeps the session field E2E and HOSxP rely on, with Thai help', () => {
    render(<LoginPage />);
    const input = screen.getByLabelText('BMS Session ID');
    expect(input).toHaveAttribute('id', 'sessionId');
    expect(input).toHaveAccessibleDescription('เปิด KK-LRMS จากเมนูใน HOSxP ระบบจะกรอกให้อัตโนมัติ');
  });
  it('states the PDPA protection and links to /about', () => {
    render(<LoginPage />);
    expect(screen.getByText('ข้อมูลผู้ป่วยได้รับการเข้ารหัสตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'เกี่ยวกับระบบ KK-LRMS' })).toHaveAttribute('href', '/about');
  });
  it('the hero illustration is decorative', () => {
    const { container } = render(<LoginPage />);
    const img = container.querySelector('img[src*="login-hero"]');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('alt', '');
    expect(img!.closest('[aria-hidden="true"]')).not.toBeNull();
  });
  it('shows that HOSxP auto-login is in progress', async () => {
    nav.params = new URLSearchParams('bms-session-id=abc');
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<LoginPage />);
    expect(await screen.findByRole('status')).toHaveTextContent('กำลังเข้าสู่ระบบจาก HOSxP…');
  });
  it('uses no dark slate palette', () => {
    const { container } = render(<LoginPage />);
    expect(container.innerHTML).not.toMatch(/slate-\d/);
  });
});
```

Then add `'src/app/(auth)/login/page.tsx'`, `'src/components/auth/LoginHero.tsx'`, `'src/components/auth/AccessDeniedNotice.tsx'` and `'src/components/auth/HosxpVersionDialog.tsx'` to `MIGRATED` in `tests/unit/ui/admin-auth-migration.test.ts`.

```bash
npx vitest run tests/unit/pages/login.test.tsx tests/unit/lib/provider-login.test.ts tests/unit/ui/admin-auth-migration.test.ts
```

Expected:
- The characterization block still PASSES.
- The layout block FAILS: two `h1`s, no BMS label, no hero.
- `provider-login` cannot be resolved.
- The guard fails, because the files are missing or carry `slate-*` and `uppercase`.

- [ ] **Step 3: Implement**

```ts
// src/lib/provider-login.ts
// ProviderID login helpers (moved verbatim from the login page). The
// `providerError` query param carries text from the ProviderID OAuth
// callback/pending flow (src/app/api/auth/provider/callback/route.ts,
// provider/complete/page.tsx). Some of it is IdP-controlled, so it must never
// be rendered verbatim as the headline: known codes map to friendly Thai,
// unknown ones fall back to a safe headline with the raw code only as detail.
const PROVIDER_ERROR_MESSAGES: Record<string, string> = {
  missing_provider_token: 'ไม่พบข้อมูลการเข้าสู่ระบบ ProviderID กรุณาเริ่มเข้าสู่ระบบใหม่อีกครั้ง',
  'ProviderID login state is invalid or expired':
    'เซสชันการเข้าสู่ระบบ ProviderID หมดอายุหรือไม่ถูกต้อง กรุณาลองเข้าสู่ระบบใหม่อีกครั้ง',
  'ProviderID login failed': 'เข้าสู่ระบบด้วย ProviderID ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
  access_denied: 'ท่านไม่ได้อนุญาตให้ระบบเข้าถึงข้อมูล ProviderID กรุณาลองใหม่แล้วกด "อนุญาต"',
};

export const PROVIDER_ERROR_FALLBACK = 'เข้าสู่ระบบด้วย ProviderID ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';

export function mapProviderError(code: string): { message: string; detail?: string } {
  const known = PROVIDER_ERROR_MESSAGES[code];
  if (known) return { message: known };
  return { message: PROVIDER_ERROR_FALLBACK, detail: code };
}

/** The ProviderID OAuth entry point (read-only sessions). */
export function providerLoginStartUrl(callbackUrl: string): string {
  return `/api/auth/provider/start?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}
```

```tsx
// src/components/auth/LoginHero.tsx
// Decorative right-hand panel of the approved direction-C login. Hidden below
// md (864px) so the form leads on tablets/phones.
import Image from 'next/image';
import { HeartPulse } from 'lucide-react';
import { HERO_ILLUSTRATION_SRC, illustrationsEnabled } from '@/config/illustrations';

export function LoginHero() {
  return (
    <div aria-hidden="true" className="relative hidden min-h-screen bg-surface-muted md:block">
      {illustrationsEnabled() ? (
        <Image
          src={HERO_ILLUSTRATION_SRC.loginHero}
          alt=""
          fill
          priority
          sizes="(min-width: 864px) 55vw, 1px"
          className="object-cover"
        />
      ) : (
        <div className="grid h-full place-items-center bg-brand-soft">
          <HeartPulse className="h-24 w-24 text-brand" />
        </div>
      )}
    </div>
  );
}
```

```tsx
// src/components/auth/AccessDeniedNotice.tsx
// Preflight said the hospital is not registered / deactivated. Copy unchanged
// from the pre-redesign login; only the styling moved onto the tokens.
import { ShieldAlert } from 'lucide-react';

export interface AccessDeniedInfo {
  reason: 'not_registered' | 'deactivated';
  hospitalCode: string;
  hospitalName: string;
  message: string;
}

export function AccessDeniedNotice({ info }: { info: AccessDeniedInfo }) {
  const deactivated = info.reason === 'deactivated';
  return (
    <div role="alert" className="rounded-xl border border-danger/40 bg-danger-tint p-4 text-danger-text">
      <div className="flex items-start gap-2">
        <ShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="text-body font-semibold">{deactivated ? 'โรงพยาบาลถูกปิดการใช้งาน' : 'ไม่ได้รับสิทธิ์ใช้งานระบบ'}</p>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 text-label">
        <dt>โรงพยาบาล:</dt>
        <dd className="font-semibold">{info.hospitalName || '—'}</dd>
        <dt>รหัสโรงพยาบาล:</dt>
        <dd className="font-mono font-semibold">{info.hospitalCode || '—'}</dd>
      </dl>
      <p className="mt-2 border-t border-danger/40 pt-2 text-label">
        {deactivated
          ? 'โรงพยาบาลของท่านถูกปิดการใช้งานในระบบ KK-LRMS หากท่านคิดว่าเป็นความผิดพลาด กรุณาติดต่อผู้ดูแลระบบ (สสจ.ขอนแก่น) เพื่อขอเปิดใช้งานอีกครั้ง'
          : 'โรงพยาบาลของท่านยังไม่ได้รับการลงทะเบียนในระบบ KK-LRMS หากท่านคิดว่าเป็นความผิดพลาด หรือต้องการเข้าร่วมเครือข่าย กรุณาติดต่อผู้ดูแลระบบ (สสจ.ขอนแก่น) เพื่อขอลงทะเบียนโรงพยาบาลของท่านในระบบ'}
      </p>
    </div>
  );
}
```

`src/components/auth/HosxpVersionDialog.tsx`: move the `<Dialog …>…</Dialog>` block of today's page (lines 419–507) into:

```tsx
export interface VersionRejection { hospitalCode: string; hospitalName: string; currentVersion: string | null; minVersion: string; message: string }
export function HosxpVersionDialog({ rejection, onClose }: { rejection: VersionRejection | null; onClose: () => void }) {
  return (
    <Dialog open={rejection !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      {/* … moved JSX … */}
    </Dialog>
  );
}
```

In the moved JSX, rename `versionRejection` to `rejection` and every `setVersionRejection(null)` to `onClose()`. Keep all copy verbatim, and restyle on tokens:
- Header band `bg-gradient-to-br from-danger-tint to-warn-tint` becomes `bg-danger-tint`.
- `text-slate-400` / `text-slate-500` become `text-ink-muted`; `text-slate-800` becomes `text-ink`.
- `border-slate-200 bg-slate-50` becomes `border-border bg-surface-muted`.
- `uppercase tracking-wider` labels become `text-label` (no uppercase).
- `text-xs` becomes `text-label`.
- `text-danger` (text) becomes `text-danger-text`.
- `bg-danger-tint/60` / `bg-ok-tint/60` become `bg-danger-tint` / `bg-ok-tint`.
- The "รับทราบ" button `bg-slate-900 hover:bg-slate-800` becomes `bg-brand hover:bg-brand-strong`.

`src/app/(auth)/login/page.tsx`: replace the file with the following. **`doLogin` and `handleSubmit` are copied verbatim from today's lines 85–190**; only the error rendering and layout change.

```tsx
// Login — direction-C hero (sub-project 5; approved mockup
// .superpowers/brainstorm/1437805-1791700719/content/assets-in-context.html).
// The auth flow — preflight → signIn → session cookie → callbackUrl — is
// unchanged and pinned by tests/unit/pages/login.test.tsx.
'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/shared/BrandMark';
import { LoginHero } from '@/components/auth/LoginHero';
import { AccessDeniedNotice, type AccessDeniedInfo } from '@/components/auth/AccessDeniedNotice';
import { HosxpVersionDialog, type VersionRejection } from '@/components/auth/HosxpVersionDialog';
import { MIN_BMS_API_VERSION } from '@/lib/bms-version';
import { mapProviderError, providerLoginStartUrl } from '@/lib/provider-login';
import { setSessionCookie, setMarketplaceToken } from '@/utils/bms-session-storage';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sessionId, setSessionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState<AccessDeniedInfo | null>(null);
  const [versionRejection, setVersionRejection] = useState<VersionRejection | null>(null);
  const [loading, setLoading] = useState(false);
  const autoLoginAttempted = useRef(false);

  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const bmsSessionId = searchParams.get('bms-session-id');
  const providerError = searchParams.get('providerError');
  const mappedProviderError = providerError ? mapProviderError(providerError) : null;
  const marketplaceToken =
    searchParams.get('marketplace_token') ?? searchParams.get('marketplace-token');

  // … the auto-login useEffect, doLogin() and handleSubmit — VERBATIM from today's page …

  const handleProviderLogin = () => {
    window.location.href = providerLoginStartUrl(callbackUrl);
  };

  const autoLoggingIn = Boolean(bmsSessionId) && loading;

  return (
    <div className="grid min-h-screen bg-surface-page md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col justify-center px-6 py-10 md:px-10">
        <div className="mx-auto w-full max-w-md space-y-6">
          <header className="space-y-3">
            <div className="flex items-center gap-2.5">
              <BrandMark />
              <span className="text-body-lg font-bold text-brand">KK-LRMS</span>
            </div>
            <h1 className="text-page text-brand">
              ระบบติดตามการคลอด
              <br />
              จังหวัดขอนแก่น
            </h1>
            <p className="text-body text-ink-muted">
              เห็นผู้คลอดทุกโรงพยาบาลในจังหวัดแบบเรียลไทม์ ประเมินความเสี่ยง CPD และประสานส่งต่อได้ทันที
            </p>
          </header>

          {autoLoggingIn && (
            <p role="status" className="flex items-center gap-2 rounded-xl bg-brand-soft px-4 py-3 text-body text-brand">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              กำลังเข้าสู่ระบบจาก HOSxP…
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="sessionId" className="text-label text-ink">
                BMS Session ID
              </label>
              <Input
                id="sessionId"
                type="text"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="กรอก Session ID จาก BMS"
                disabled={loading}
                autoFocus
                aria-describedby="sessionId-help"
                className="h-12 rounded-xl border-border bg-surface-card font-mono focus-visible:border-brand focus-visible:ring-brand"
              />
              <p id="sessionId-help" className="text-caption text-ink-muted">
                เปิด KK-LRMS จากเมนูใน HOSxP ระบบจะกรอกให้อัตโนมัติ
              </p>
            </div>

            {accessDenied && <AccessDeniedNotice info={accessDenied} />}

            {!accessDenied && (error || mappedProviderError) && (
              <div role="alert" className="rounded-xl border border-danger/40 bg-danger-tint p-3 text-body text-danger-text">
                {error ? (
                  error
                ) : mappedProviderError ? (
                  <>
                    <div>{mappedProviderError.message}</div>
                    {mappedProviderError.detail && (
                      <div className="mt-1 break-words text-caption">{mappedProviderError.detail}</div>
                    )}
                  </>
                ) : null}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-brand text-body font-semibold text-white hover:bg-brand-strong"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  กำลังตรวจสอบ…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                  เข้าสู่ระบบด้วย BMS (HOSxP)
                </span>
              )}
            </Button>
          </form>

          <div aria-hidden="true" className="flex items-center gap-3 text-caption text-ink-muted">
            <span className="h-px flex-1 bg-border" />
            หรือ
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-1.5">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={handleProviderLogin}
              className="h-12 w-full rounded-xl border-brand/30 bg-surface-card text-body font-semibold text-brand hover:bg-brand-soft"
            >
              เข้าสู่ระบบด้วย ProviderID
            </Button>
            <p className="text-center text-caption text-ink-muted">สิทธิ์อ่านอย่างเดียว — ดูข้อมูลได้ แก้ไขไม่ได้</p>
          </div>

          <p className="flex items-start gap-2 text-caption text-ink-muted">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            ข้อมูลผู้ป่วยได้รับการเข้ารหัสตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA)
          </p>
          <p className="text-caption text-ink-muted">
            <Link href="/about" className="font-medium text-brand underline-offset-4 hover:underline">
              เกี่ยวกับระบบ KK-LRMS
            </Link>{' '}
            · สำนักงานสาธารณสุขจังหวัดขอนแก่น
          </p>
        </div>
      </div>

      <LoginHero />
      <HosxpVersionDialog rejection={versionRejection} onClose={() => setVersionRejection(null)} />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
```

The verbatim `doLogin` still references `MIN_BMS_API_VERSION`, `setVersionRejection`, `setAccessDenied`, `setSessionCookie`, `setMarketplaceToken` and `router.push(callbackUrl)`, so all of those imports stay.

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npx vitest run tests/unit/pages/login.test.tsx tests/unit/lib/provider-login.test.ts tests/unit/ui/admin-auth-migration.test.ts tests/unit/config/min-font-size.test.ts
npx tsc --noEmit && npm run lint
```

Expected: everything PASSES, and the characterization block is unchanged since Step 1.

- [ ] **Step 5: Commit**

```bash
git add src/lib/provider-login.ts src/components/auth "src/app/(auth)/login/page.tsx" tests/unit/pages/login.test.tsx tests/unit/lib/provider-login.test.ts tests/unit/ui/admin-auth-migration.test.ts
git commit -m "feat(login): approved direction-C hero with BMS and ProviderID sign-in

Two columns on the warm surface: brand, Thai title and lead, the session
field with HOSxP help, 'เข้าสู่ระบบด้วย BMS (HOSxP)' then ProviderID with a
read-only note, and the PDPA line; the decorative hero on the right. The
preflight/signIn/cookie flow and ProviderID error mapping are unchanged and
pinned by characterization tests.

Co-Authored-By: <implementer's harness attribution>"
```

---

### Task 3: About — decorative header, section cards, table of contents

**Files:**
- Create: `src/components/about/AboutHeader.tsx`, `src/components/about/about-blocks.tsx`, `src/components/about/WebhookApiSection.tsx`
- Modify: `src/app/about/page.tsx`, `eslint-rules/design-allowlist.json`, `tests/unit/ui/admin-auth-migration.test.ts`
- Test: `tests/unit/pages/about.test.tsx`

**Interfaces:**
- Consumes: `SectionCard` (with `id`), `DataTable`, `RiskChip`, `BrandMark`, `RISK_LEVELS`, `CPD_FACTOR_WEIGHTS`, `KK_HOSPITALS`, `HERO_ILLUSTRATION_SRC`, `illustrationsEnabled`.
- Produces:
  - `AboutHeader()` (`data-testid="about-header"`)
  - `FactTile`, `StepItem`, `FeatureCard`, `HospitalLevelRow`, `RiskLevelCard`, `CodeBlock`, `EndpointBadge`
  - `WebhookApiContent()` (the webhook docs body)

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/pages/about.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import AboutPage from '@/app/about/page';
import { KK_HOSPITALS } from '@/config/hospitals';
import { CPD_FACTOR_WEIGHTS, RISK_LEVELS } from '@/config/risk-levels';
import { RiskLevel } from '@/types/domain';

describe('About page', () => {
  it('has one h1; the header art is decorative', () => {
    const { container } = render(<AboutPage />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const art = container.querySelector('img[src*="about-header"]');
    expect(art).not.toBeNull();
    expect(art).toHaveAttribute('alt', '');
    expect(art!.closest('[aria-hidden="true"]')).not.toBeNull();
  });
  it('never presents the header art as a map or geography', () => {
    render(<AboutPage />);
    expect(screen.getByTestId('about-header').textContent).not.toMatch(/แผนที่|ภูมิศาสตร์|map/i);
  });
  it('the table of contents links to every section card', () => {
    render(<AboutPage />);
    const links = within(screen.getByRole('navigation', { name: 'สารบัญ' })).getAllByRole('link');
    expect(links).toHaveLength(9);
    for (const a of links) {
      const id = a.getAttribute('href')!.replace('#', '');
      expect(document.getElementById(id)?.tagName).toBe('SECTION');
    }
  });
  it('facts come from config, not literals', () => {
    render(<AboutPage />);
    expect(screen.getByTestId('fact-hospitals')).toHaveTextContent(String(KK_HOSPITALS.length));
    expect(screen.getByTestId('fact-cpd-factors')).toHaveTextContent(String(Object.keys(CPD_FACTOR_WEIGHTS).length));
  });
  it('risk levels render labels and ranges from RISK_LEVELS', () => {
    render(<AboutPage />);
    for (const level of [RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH]) {
      expect(screen.getAllByText(RISK_LEVELS[level].labelTh).length).toBeGreaterThanOrEqual(1);
    }
    expect(screen.getByText(`${RISK_LEVELS[RiskLevel.HIGH].minScore} ขึ้นไป`)).toBeInTheDocument();
  });
  it('static tables use the shared DataTable', () => {
    render(<AboutPage />);
    expect(screen.getByRole('table', { name: 'ปัจจัยเสี่ยง CPD' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'กลุ่มผู้ใช้งาน' })).toBeInTheDocument();
  });
  it('the PDPA copy matches what the app does (masked names, ProviderID read-only)', () => {
    render(<AboutPage />);
    expect(screen.queryByText(/ไม่แสดงชื่อ-สกุล/)).toBeNull();
    expect(screen.getByText(/แสดงชื่อแบบย่อ/)).toBeInTheDocument();
    expect(screen.getAllByText(/ProviderID \(สิทธิ์อ่านอย่างเดียว\)/).length).toBeGreaterThanOrEqual(1);
  });
  it('uses no categorical or slate palette', () => {
    const { container } = render(<AboutPage />);
    expect(container.innerHTML).not.toMatch(/\b(?:bg|text|border)-(?:amber|rose|blue|slate)-\d/);
  });
});
```

Add `'src/app/about/page.tsx'`, `'src/components/about/AboutHeader.tsx'`, `'src/components/about/about-blocks.tsx'` and `'src/components/about/WebhookApiSection.tsx'` to `MIGRATED`.

```bash
npx vitest run tests/unit/pages/about.test.tsx tests/unit/ui/admin-auth-migration.test.ts
```

Expected: FAIL. There is no `about-header`, no TOC, no `fact-*` ids, no table names; the old PDPA text is present; the palette is categorical.

- [ ] **Step 2: Implement the header and blocks**

```tsx
// src/components/about/AboutHeader.tsx
// about-header.webp is abstract decoration (rounded shapes + green crosses).
// It must never be captioned or described as Khon Kaen geography — see
// public/illustrations/README.md. Text sits beside it, never on it.
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BrandMark } from '@/components/shared/BrandMark';
import { HERO_ILLUSTRATION_SRC, illustrationsEnabled } from '@/config/illustrations';
import { cn } from '@/lib/utils';

export function AboutHeader() {
  const art = illustrationsEnabled();
  return (
    <header data-testid="about-header" className="border-b border-border bg-surface-page md:grid md:grid-cols-2">
      {art && (
        <div aria-hidden="true" className="relative h-36 md:h-auto md:min-h-80">
          <Image
            src={HERO_ILLUSTRATION_SRC.aboutHeader}
            alt=""
            fill
            priority
            sizes="(min-width: 864px) 50vw, 100vw"
            className="object-cover object-left"
          />
        </div>
      )}
      <div className={cn('px-6 py-10 md:px-10 md:py-14', !art && 'mx-auto max-w-5xl md:col-span-2')}>
        <Link href="/login" className="mb-6 inline-flex items-center gap-1.5 text-label text-brand hover:text-brand-strong">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          กลับหน้าเข้าสู่ระบบ
        </Link>
        <div className="mb-4 flex items-center gap-2.5">
          <BrandMark />
          <div>
            <p className="text-body-lg font-bold text-brand">KK-LRMS</p>
            <p className="text-caption text-ink-muted">Khon Kaen Labor Room Monitoring System</p>
          </div>
        </div>
        <h1 className="text-page text-brand">ระบบติดตามการคลอดแบบรวมศูนย์ จังหวัดขอนแก่น</h1>
        <p className="mt-3 max-w-2xl text-body text-ink-muted">
          ระบบ Real-time สำหรับสูติแพทย์และพยาบาลห้องคลอด ใช้ติดตามและประเมินความเสี่ยง
          ผู้คลอดในโรงพยาบาลชุมชนทั่วจังหวัดขอนแก่น จากศูนย์กลางที่ รพ.ขอนแก่น
        </p>
      </div>
    </header>
  );
}
```

```tsx
// src/components/about/about-blocks.tsx
// Presentation blocks of the public /about page (moved out of page.tsx and
// put on the direction-C tokens). Static documentation facts — never KPIs.
import type { ReactNode } from 'react';
import { FileJson } from 'lucide-react';
import { RiskChip } from '@/components/shared/RiskChip';
import { RiskLevel } from '@/types/domain';
import { cn } from '@/lib/utils';

export function FactTile({ value, label, testId }: { value: string; label: string; testId?: string }) {
  return (
    <div data-testid={testId} className="rounded-xl bg-brand-soft p-4 text-center">
      <div className="text-kpi-sm tabular-nums text-brand">{value}</div>
      <div className="mt-1 text-label text-brand">{label}</div>
    </div>
  );
}

export function StepItem({ step, title, description }: { step: number; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand font-bold text-white">{step}</div>
      <div>
        <h3 className="text-body-lg text-ink">{title}</h3>
        <p className="mt-1 text-body text-ink-muted">{description}</p>
      </div>
    </div>
  );
}

export function FeatureCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-2xl bg-surface-card p-6 shadow-soft">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand">{icon}</div>
      <h3 className="mb-2 text-body-lg text-ink">{title}</h3>
      <p className="text-body text-ink-muted">{description}</p>
    </div>
  );
}

export function HospitalLevelRow({ level, name, description }: { level: string; name: string; description: string }) {
  return (
    <div className="flex items-start gap-4 border-b border-border py-3 last:border-0">
      <span className="shrink-0 rounded-lg bg-brand-soft px-3 py-1 font-mono text-label font-bold text-brand">{level}</span>
      <div>
        <span className="text-body font-semibold text-ink">{name}</span>
        <p className="mt-0.5 text-label text-ink-muted">{description}</p>
      </div>
    </div>
  );
}

const RISK_CARD: Record<RiskLevel, string> = {
  [RiskLevel.LOW]: 'border-ok/40 bg-ok-tint',
  [RiskLevel.MEDIUM]: 'border-warn/40 bg-warn-tint',
  [RiskLevel.HIGH]: 'border-danger/40 bg-danger-tint',
};

export function RiskLevelCard({ level, score, action }: { level: RiskLevel; score: string; action: string }) {
  return (
    <div className={cn('rounded-xl border p-4', RISK_CARD[level])}>
      <RiskChip level={level} />
      <p className="mt-2 text-body text-ink">
        คะแนน CPD: <span className="font-semibold tabular-nums">{score}</span>
      </p>
      <p className="text-label text-ink-muted">{action}</p>
    </div>
  );
}

export function CodeBlock({ title, children }: { title?: string; children: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {title && (
        <div className="flex items-center gap-2 bg-brand-strong px-4 py-2 font-mono text-caption text-brand-soft">
          <FileJson aria-hidden="true" className="h-4 w-4" />
          {title}
        </div>
      )}
      <pre className="overflow-x-auto bg-ink p-4 font-mono text-label leading-relaxed text-surface-page">
        <code>{children}</code>
      </pre>
    </div>
  );
}

const METHOD: Record<string, string> = {
  POST: 'border-ok/40 bg-ok-tint text-ok-text',
  GET: 'border-brand/30 bg-brand-soft text-brand',
  DELETE: 'border-danger/40 bg-danger-tint text-danger-text',
};

export function EndpointBadge({ method, path }: { method: string; path: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 font-mono text-label">
      <span className={cn('rounded border px-2 py-0.5 text-caption font-bold', METHOD[method])}>{method}</span>
      <span className="text-ink">{path}</span>
    </div>
  );
}
```

- [ ] **Step 3: Restructure the page**

`src/components/about/WebhookApiSection.tsx`:
1. Export `function WebhookApiContent()` that returns `<div className="space-y-8">…</div>`.
2. Its body is the JSX **between** today's `<div className="rounded-2xl bg-white p-8 shadow-sm space-y-8">` (line 535) and its matching closing `</div>` (line 985), moved verbatim.
3. Import `CodeBlock` and `EndpointBadge` from `./about-blocks`, plus the lucide icons the block uses (`Activity`, `CheckCircle2`, `Globe`, `Key`, `Send`, `XCircle`, …; let `tsc` list them).
4. Apply the class mapping. In addition, the incremental-mode box `border-blue-200 bg-blue-50` / `text-blue-800` / `text-blue-700` becomes `border-brand/30 bg-brand-soft` / `text-brand` / `text-brand`.
5. The prose stays verbatim.

`src/app/about/page.tsx`:
1. Delete the local `SectionTitle`, `FeatureCard`, `HospitalLevelRow`, `RiskLevelCard`, `StepItem`, `CodeBlock` and `EndpointBadge`. Import the blocks, `AboutHeader`, `WebhookApiContent`, `SectionCard`, `DataTable`, `KK_HOSPITALS` and `CPD_FACTOR_WEIGHTS`. Keep `ABOUT_RISK_LEVELS`, `RISK_LEVEL_ACTION_PROSE` and `formatRiskScoreRange`.
2. Add the section list (single source for the TOC and the card titles):

```tsx
const SECTIONS = [
  { id: 'overview', title: 'ภาพรวมระบบ' },
  { id: 'objectives', title: 'วัตถุประสงค์' },
  { id: 'features', title: 'ฟีเจอร์หลักของระบบ' },
  { id: 'cpd', title: 'ระบบประเมินความเสี่ยง CPD' },
  { id: 'network', title: 'โครงสร้างเครือข่ายโรงพยาบาล' },
  { id: 'workflow', title: 'ขั้นตอนการทำงานของระบบ' },
  { id: 'webhook', title: 'Webhook & API สำหรับโรงพยาบาลภายนอก' },
  { id: 'users', title: 'กลุ่มผู้ใช้งาน' },
  { id: 'security', title: 'ความปลอดภัยและความเป็นส่วนตัว' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];
const title = (id: SectionId) => SECTIONS.find((s) => s.id === id)!.title;
```

3. Page shell:

```tsx
<div className="min-h-screen bg-surface-page">
  <AboutHeader />
  <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
    <nav aria-label="สารบัญ" className="flex flex-wrap gap-2">
      {SECTIONS.map((s) => (
        <a key={s.id} href={`#${s.id}`} className="rounded-full border border-border bg-surface-card px-3 py-1.5 text-label text-brand hover:bg-brand-soft">
          {s.title}
        </a>
      ))}
    </nav>
    {/* nine SectionCards */}
    {/* footer */}
  </main>
</div>
```

4. Each old `<section><SectionTitle>…</SectionTitle><div className="rounded-2xl bg-white p-8 shadow-sm …">BODY</div></section>` becomes `<SectionCard id="…" title={title('…')}>BODY</SectionCard>`. Move each BODY verbatim, then apply the class mapping. Exceptions:
   - **overview:** replace the four stat tiles with:

     ```tsx
     <div className="grid grid-cols-2 gap-4 pt-4 md:grid-cols-4">
       <FactTile testId="fact-hospitals" value={String(KK_HOSPITALS.length)} label="โรงพยาบาลในเครือข่าย" />
       <FactTile testId="fact-refresh" value="30" label="วินาที อัปเดตข้อมูล" />
       <FactTile testId="fact-cpd-factors" value={String(Object.keys(CPD_FACTOR_WEIGHTS).length)} label="ปัจจัยเสี่ยง CPD" />
       <FactTile testId="fact-always-on" value="24/7" label="ติดตามตลอดเวลา" />
     </div>
     ```

   - **cpd:** the factor `<table>` becomes `DataTable` with `caption="ปัจจัยเสี่ยง CPD"`, `rowKey={(r) => r.factor}` and columns `ปัจจัย` / `เกณฑ์ที่เพิ่มความเสี่ยง` / `คะแนนสูงสุด` (numeric). The rows go in a local `CPD_FACTOR_ROWS` const with today's eight rows verbatim. The risk cards map `ABOUT_RISK_LEVELS` to `<RiskLevelCard key={level} level={level} score={formatRiskScoreRange(RISK_LEVELS[level])} action={RISK_LEVEL_ACTION_PROSE[level]} />`. The heading "ระดับความเสี่ยง" becomes `h3.text-body-lg.text-ink`.
   - **workflow:** each `ChevronRight` divider becomes `text-ink-muted`.
   - **webhook:** `<SectionCard id="webhook" title={title('webhook')}><WebhookApiContent /></SectionCard>`.
   - **users:** the `<table>` becomes `DataTable` with `caption="กลุ่มผู้ใช้งาน"`, columns `บทบาท` / `ตำแหน่ง` / `การใช้งานหลัก`, and today's four rows verbatim in `USER_GROUP_ROWS`.
   - **security:** the bullets stay, with two corrected (spec D3). Replace the **ระบบยืนยันตัวตน** text with `ผู้ใช้ต้องเข้าสู่ระบบด้วย BMS Session ID จาก HOSxP หรือ ProviderID (สิทธิ์อ่านอย่างเดียว) ไม่สามารถเข้าถึงข้อมูลได้โดยไม่ผ่านการยืนยันตัวตน`. Replace the **ไม่แสดงชื่อผู้คลอด** item with `<strong>แสดงชื่อแบบย่อ</strong> — หน้าจอแสดงชื่อผู้คลอดพร้อมอักษรแรกของนามสกุล (เช่น สมหญิง ข.) และเลขบัตรประชาชนแบบปิดบัง (เช่น 3XXXXXXXX2121) เพื่อความเป็นส่วนตัว`.
   - **Footer:** classes per the mapping (`border-border`, `text-ink-muted`, `font-semibold text-ink`); copy verbatim.
5. Remove the `"src/app/about/page.tsx"` entry from `eslint-rules/design-allowlist.json` and decrement `maxEntries` by 1.

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npx vitest run tests/unit/pages/about.test.tsx tests/unit/ui/admin-auth-migration.test.ts tests/unit/eslint tests/unit/config/min-font-size.test.ts
npx tsc --noEmit && npm run lint
```

Expected: PASS; lint shows 0 problems with the about entry gone.

- [ ] **Step 5: Commit**

```bash
git add src/components/about src/app/about/page.tsx eslint-rules/design-allowlist.json tests/unit/pages/about.test.tsx tests/unit/ui/admin-auth-migration.test.ts
git commit -m "feat(about): decorative header, section cards and a table of contents

The abstract about-header art sits beside the title (alt=\"\", aria-hidden,
never called a map); nine SectionCards with anchors; static tables on
DataTable; risk cards from RISK_LEVELS; hospital and CPD-factor counts from
config; one neutral fact-tile tone (allowlist entry removed). PDPA copy now
matches the app: masked names/CIDs and ProviderID read-only login.

Co-Authored-By: <implementer's harness attribution>"
```

---

### Task 4: Profile and notification preferences, legible for nurses

**Files:**
- Modify: `src/app/(hospital)/profile/page.tsx`, `src/components/profile/NotificationPreferenceCard.tsx`, `tests/unit/ui/admin-auth-migration.test.ts`
- Test: `tests/unit/components/NotificationPreferenceCard.test.tsx` (append), `tests/integration/profile-page.test.tsx` (append)

**Interfaces:**
- Consumes: `PageHeader`, `SectionCard`, `EmptyState`, `ErrorState`, `LoadingState`, `Button`, `maskName`, `maskCid`, `KK_HOSPITALS`.
- Produces: unchanged component APIs (`ProfilePage`, `NotificationPreferenceCard`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/components/NotificationPreferenceCard.test.tsx` (it reuses that file's `GET_BODY`):

```tsx
describe('NotificationPreferenceCard — nurse legibility (sub-project 5)', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());
  const okGet = () =>
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => GET_BODY }) as Response));

  it('is a titled section card', async () => {
    okGet();
    render(<NotificationPreferenceCard />);
    expect(await screen.findByRole('region', { name: 'การแจ้งเตือนทาง LINE (MOPH Prompt)' })).toBeInTheDocument();
  });
  it('groups events under a legend per tier', async () => {
    okGet();
    render(<NotificationPreferenceCard />);
    expect(await screen.findByRole('group', { name: 'แจ้งทันที' })).toBeInTheDocument();
  });
  it('checkboxes are 20px tap targets in the brand accent', async () => {
    okGet();
    render(<NotificationPreferenceCard />);
    const box = await screen.findByRole('checkbox', { name: /ANC HR3/ });
    expect(box.className).toMatch(/\bh-5\b/);
    expect(box.className).toMatch(/\bw-5\b/);
    expect(box.className).toContain('accent-brand');
  });
  it('a save failure says what happened and what to do', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init?: RequestInit) =>
        !init || init.method === undefined
          ? ({ ok: true, status: 200, json: async () => GET_BODY } as Response)
          : ({ ok: false, status: 500, json: async () => ({}) } as Response),
      ),
    );
    const user = userEvent.setup();
    render(<NotificationPreferenceCard />);
    await user.click(await screen.findByRole('checkbox', { name: /ฉุกเฉินในห้องคลอด/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('บันทึกไม่สำเร็จ — การตั้งค่ากลับเป็นค่าเดิมแล้ว');
    expect(alert).toHaveTextContent('วิธีแก้: ตรวจสอบการเชื่อมต่อ แล้วเลือกอีกครั้ง');
  });
  it('a load failure offers ลองใหม่, which reloads', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
      .mockResolvedValue({ ok: true, status: 200, json: async () => GET_BODY });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<NotificationPreferenceCard />);
    await user.click(await screen.findByRole('button', { name: /ลองใหม่/ }));
    expect(await screen.findByRole('checkbox', { name: /ANC HR3/ })).toBeInTheDocument();
  });
});
```

Append to `tests/integration/profile-page.test.tsx`:

```tsx
describe('profile page layout (sub-project 5)', () => {
  it('uses the shared page header; identity is masked inside a section card; no nested main', async () => {
    const { container } = render(await ProfilePage());
    expect(screen.getByRole('heading', { level: 1, name: 'โปรไฟล์และการแจ้งเตือน' })).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'ข้อมูลผู้ใช้' });
    expect(within(card).getByText('นาย ชัยพร ส.')).toBeInTheDocument();
    expect(within(card).getByText(/3X{8}2121/)).toBeInTheDocument();
    expect(within(card).queryByText('3320500282121')).toBeNull();
    expect(container.querySelector('main')).toBeNull();
  });
});
```

Add `within` to that file's `@testing-library/react` import.

Add `'src/app/(hospital)/profile/page.tsx'` and `'src/components/profile/NotificationPreferenceCard.tsx'` to `MIGRATED`.

```bash
npx vitest run tests/unit/components/NotificationPreferenceCard.test.tsx tests/integration/profile-page.test.tsx tests/unit/ui/admin-auth-migration.test.ts
```

Expected: the new cases FAIL (no region, legend, accent, remedy or retry; nested `main`; `slate-*`). The existing cases PASS.

- [ ] **Step 2: Implement**

`src/app/(hospital)/profile/page.tsx`:

```tsx
import { auth } from '@/lib/auth';
import { maskName, maskCid } from '@/lib/pii-mask';
import { PageHeader } from '@/components/shared/PageHeader';
import { SectionCard } from '@/components/shared/SectionCard';
import { NotificationPreferenceCard } from '@/components/profile/NotificationPreferenceCard';

export async function ProfilePage() {
  const session = await auth();
  const user = session?.user;
  const displayName = maskName(user?.name);
  const displayCid = maskCid(user?.userCid);
  return (
    // AppShell already renders <main>; this page is a plain container.
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-5 md:px-6">
      <PageHeader title="โปรไฟล์และการแจ้งเตือน" subtitle="ข้อมูลผู้ใช้จากการเข้าสู่ระบบ และการตั้งค่าการแจ้งเตือนทาง LINE" />
      <SectionCard title="ข้อมูลผู้ใช้" description="แสดงแบบปิดบังบางส่วนตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
          <dt className="text-ink-muted">โรงพยาบาล</dt>
          <dd className="text-ink">{user?.hospitalName || '—'}</dd>
          <dt className="text-ink-muted">ชื่อ</dt>
          <dd className="text-body-lg text-ink">{displayName || '—'}</dd>
          <dt className="text-ink-muted">เลขบัตรประชาชน</dt>
          <dd className="font-mono text-ink">{displayCid || '—'}</dd>
        </dl>
      </SectionCard>
      <NotificationPreferenceCard />
    </div>
  );
}

export default ProfilePage;
```

`src/components/profile/NotificationPreferenceCard.tsx` keeps every function **verbatim**: `load`, `save`, `removeHospital`, `effectiveEvents`, `toggleEvent`, `followHospital`. Make these edits:

1. **Error state type and messages:**
   - Change `const [error, setError] = useState('');` to `const [error, setError] = useState<{ message: string; remedy: string; retry?: boolean } | null>(null);`.
   - Every `setError('')` becomes `setError(null)`.
   - The three failure calls become:
     - `setError({ message: 'โหลดการตั้งค่าไม่สำเร็จ', remedy: 'ตรวจสอบการเชื่อมต่อเครือข่าย แล้วกด ลองใหม่', retry: true })`
     - `setError({ message: 'บันทึกไม่สำเร็จ — การตั้งค่ากลับเป็นค่าเดิมแล้ว', remedy: 'ตรวจสอบการเชื่อมต่อ แล้วเลือกอีกครั้ง' })`
     - `setError({ message: 'ลบไม่สำเร็จ — ยังติดตามโรงพยาบาลนี้อยู่', remedy: 'ตรวจสอบการเชื่อมต่อ แล้วกด เลิกติดตาม อีกครั้ง' })`
   - In `load`, add `setError(null);` right after `setLoading(true);`, so a retry clears the banner.
2. `TIER_LABEL.urgent`: `'ทันที'` becomes `'แจ้งทันที'`.
3. Replace the returned JSX with:

```tsx
  return (
    <SectionCard title="การแจ้งเตือนทาง LINE (MOPH Prompt)" description="เลือกเหตุการณ์ที่ต้องการรับ และโรงพยาบาลที่ต้องการติดตาม">
      <div className="space-y-4">
        {loading && <LoadingState message="กำลังโหลดการตั้งค่า…" className="py-4" />}
        {busy && (
          <p role="status" className="flex items-center gap-2 text-label text-ink-muted">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> กำลังบันทึก…
          </p>
        )}
        {error && (
          <ErrorState
            variant="banner"
            className="rounded-xl border"
            message={error.message}
            remedy={error.remedy}
            onRetry={error.retry ? () => void load() : undefined}
          />
        )}

        {/* Suppressed while an error is showing: "you follow nothing" is a claim
            about saved state we cannot make when the load failed. */}
        {!loading && !error && preferences.length === 0 && (
          <EmptyState
            illustration="generic"
            title="ยังไม่ได้ติดตามโรงพยาบาลใด"
            description="เพิ่มโรงพยาบาลก่อน จึงจะได้รับแจ้งเตือนทาง LINE"
            className="shadow-none"
          />
        )}

        {preferences.map((row) => {
          const isOwn = row.hospitalCode === ownHospitalCode;
          const hasDigest = events.some((e) => e.tier === 'digest' && row.events.includes(e.key));
          return (
            <div key={row.hospitalCode} className="rounded-xl border border-border bg-surface-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-body-lg text-ink">{hospitalLabel(row.hospitalCode)}</p>
                  {/* Read from the row, not re-derived here: the server decides
                      how much detail a hospital's alerts may carry, and this
                      line is the user's only view of that decision. */}
                  <p
                    className={cn(
                      'inline-flex rounded-full px-2.5 py-0.5 text-caption font-semibold',
                      row.detailLevel === 'full' ? 'bg-ok-tint text-ok-text' : 'bg-surface-muted text-ink-muted',
                    )}
                  >
                    {row.detailLevel === 'full' ? 'โรงพยาบาลของคุณ — แจ้งเตือนระดับผู้ป่วยได้' : 'รับเฉพาะยอดรวม ไม่ระบุตัวผู้ป่วย'}
                  </p>
                </div>
                {!isOwn && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void removeHospital(row.hospitalCode)}
                    disabled={busy}
                    aria-label={`เลิกติดตาม ${row.hospitalCode}`}
                    className="h-9 border-border text-label text-ink-muted hover:text-danger-text"
                  >
                    เลิกติดตาม
                  </Button>
                )}
              </div>

              {tiers.map((tier) => {
                const tierEvents = events.filter((e) => e.tier === tier);
                if (tierEvents.length === 0) return null;
                return (
                  <fieldset key={tier} className="mt-3">
                    <legend className="mb-1 text-label text-ink-muted">{TIER_LABEL[tier]}</legend>
                    {tierEvents.map((e) => (
                      <label key={e.key} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-surface-muted">
                        <input
                          type="checkbox"
                          aria-label={e.labelTh}
                          checked={effectiveEvents(row).includes(e.key)}
                          disabled={busy}
                          onChange={() => toggleEvent(row, e.key)}
                          className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
                        />
                        <span className="text-body text-ink">
                          {e.labelTh}
                          <span className="block text-label text-ink-muted">{e.descriptionTh}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                );
              })}

              {hasDigest && (
                <label className="mt-3 flex flex-wrap items-center gap-3 text-body text-ink">
                  เวลาส่งสรุปรายวัน
                  <select
                    value={row.digestHour}
                    aria-label="เวลาส่งสรุปรายวัน"
                    disabled={busy}
                    onChange={(ev) => void save({ ...row, digestHour: Number(ev.target.value) })}
                    className="h-11 rounded-lg border border-border bg-surface-card px-3 text-body"
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>{String(h).padStart(2, '0')}:00 น.</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          );
        })}

        {/* Without this a new user, who has no rows at all, would have to know
            their own 5-digit hospital code to receive anything. */}
        {!loading && ownHospitalCode !== '' && !ownIsFollowed && (
          <Button onClick={() => followHospital(ownHospitalCode)} disabled={busy} className="h-11 bg-brand text-body text-white hover:bg-brand-strong">
            เพิ่มโรงพยาบาลของคุณ ({hospitalLabel(ownHospitalCode)})
          </Button>
        )}

        {/* A picker rather than free text — it cannot produce an invalid code.
            Hospitals that are not yours are stored as 'aggregate'. */}
        <div className="space-y-1.5">
          <label htmlFor="watch-hospital" className="text-label text-ink">
            ติดตามโรงพยาบาลอื่น (จะได้รับเฉพาะยอดรวม ไม่ระบุตัวผู้ป่วย)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              id="watch-hospital"
              value={addCode}
              onChange={(e) => setAddCode(e.target.value)}
              aria-label="เพิ่มโรงพยาบาลที่ต้องการติดตาม"
              className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface-card px-3 text-body"
            >
              <option value="">เลือกโรงพยาบาล…</option>
              {KK_HOSPITALS.filter((h) => !preferences.some((r) => r.hospitalCode === h.hcode)).map((h) => (
                <option key={h.hcode} value={h.hcode}>{h.name} ({h.hcode})</option>
              ))}
            </select>
            <Button
              disabled={!addCode || busy}
              onClick={() => {
                const code = addCode;
                setAddCode('');
                followHospital(code);
              }}
              className="h-11 bg-brand px-5 text-body text-white hover:bg-brand-strong"
            >
              เพิ่ม
            </Button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
```

4. New imports: `Loader2` (lucide-react), `Button`, `SectionCard`, `EmptyState`, `ErrorState`, `LoadingState`, `cn`.

- [ ] **Step 3: Run the tests to confirm they pass**

```bash
npx vitest run tests/unit/components/NotificationPreferenceCard.test.tsx tests/integration/profile-page.test.tsx tests/unit/ui/admin-auth-migration.test.ts tests/unit/api/profile-notification-preference.test.ts
npx tsc --noEmit && npm run lint
npx vitest run --maxWorkers=6
```

Expected: every old and new case PASSES (the old regexes `บันทึกไม่สำเร็จ`, `ลบไม่สำเร็จ`, `โหลดการตั้งค่าไม่สำเร็จ`, `กำลังโหลด` and `ยังไม่ได้ติดตามโรงพยาบาลใด` still match), and the full suite is green.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(hospital)/profile/page.tsx" src/components/profile/NotificationPreferenceCard.tsx tests/unit/components/NotificationPreferenceCard.test.tsx tests/integration/profile-page.test.tsx tests/unit/ui/admin-auth-migration.test.ts
git commit -m "feat(profile): legible notification preferences for ward nurses

PageHeader + a masked identity card; LINE preferences in a SectionCard with
a legend per tier, 20px brand checkboxes on 44px rows, h-11 pickers, and
failures that say what happened and what to do (with ลองใหม่ on load). The
optimistic save/revert and the server-derived detail level are unchanged.

Co-Authored-By: <implementer's harness attribution>"
```

---

### Task 5: Admin shell and registry tabs (characterization first)

**Files:**
- Create: `tests/helpers/admin-fixtures.tsx`, `src/config/status-tone.ts`, `src/components/admin/admin-ui.tsx`
- Modify: `src/app/(provincial)/admin/page.tsx`, `src/components/admin/{HospitalsTab,ActiveProvinceTab,BulkAddHospitalsDialog,AdminMapPane}.tsx`, `eslint-rules/design-allowlist.json`, `tests/unit/ui/admin-auth-migration.test.ts`
- Test: `tests/unit/components/admin/admin-page.test.tsx`, `tests/unit/components/admin/hospitals-tab.test.tsx`, `tests/unit/components/admin/admin-ui.test.tsx`

**Interfaces:**
- Consumes: `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` (`@/components/ui/tabs`), `PageHeader`, `SectionCard`, `DataTable`, `EmptyState`, `ErrorState`, `InlineNotice`, `actionFailure`, `useSetBreadcrumbs`.
- Produces:
  - `type StatusTone = 'ok' | 'warn' | 'danger' | 'brand' | 'neutral'`
  - `TONE_CLASSES: Record<StatusTone, { chip; text; dot }>`
  - `StatusPill({ tone, icon?, title?, children, className? })`
  - `Field({ label, htmlFor?, hint?, children })`
  - `SELECT_CLASS`
  - Test helpers: `adminHospital(o?)`, `renderWithSwr(ui, map)`, `stubMutations(fn)`

- [ ] **Step 1: Characterization harness and tests (green on today's code)**

```tsx
// tests/helpers/admin-fixtures.tsx
// Admin component harness: SWR answers from a fixture map (unmocked keys stay
// pending forever, so a test never crashes on data it did not ask for), and
// global fetch records every mutation for request-shape assertions.
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { AdminHospital } from '@/components/admin/HospitalEditDialog';

export function adminHospital(o: Partial<AdminHospital> = {}): AdminHospital {
  return {
    hcode: '10670', name: 'รพ.ขอนแก่น', level: 'A_S', serviceType: null, provinceCode: '40',
    districtCode: '4001', lat: null, lon: null, isActive: true, connectionStatus: 'CONNECTED',
    lastSyncAt: null, bmsConfig: null, ...o,
  };
}

export function renderWithSwr(ui: ReactElement, map: Record<string, unknown>) {
  const fetcher = vi.fn(async (key: string) => {
    if (!(key in map)) return new Promise(() => {});
    const v = map[key];
    if (v instanceof Error) throw v;
    return v;
  });
  const utils = render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>,
  );
  return { fetcher, ...utils };
}

type MutationReply = { ok: boolean; status?: number; body?: unknown };
export function stubMutations(reply: (url: string, init?: RequestInit) => MutationReply = () => ({ ok: true, body: {} })) {
  const spy = vi.fn(async (url: string, init?: RequestInit) => {
    const r = reply(url, init);
    return { ok: r.ok, status: r.status ?? (r.ok ? 200 : 500), json: async () => r.body ?? {} } as Response;
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}
```

```tsx
// tests/unit/components/admin/hospitals-tab.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HospitalsTab } from '@/components/admin/HospitalsTab';
import { adminHospital, renderWithSwr, stubMutations } from '../../../helpers/admin-fixtures';

const failing = adminHospital({
  hcode: '10671', name: 'รพ.ชุมแพ',
  bmsConfig: { tunnelUrl: 'https://t', hasSession: false, sessionExpiresAt: null, databaseType: null,
    authenticity: { status: 'cid_unstable', checkedAt: null, reason: null } },
});
const BASE = {
  '/api/admin/hospitals': { hospitals: [adminHospital(), failing] },
  '/api/admin/config': { config: { active_province_code: '40' } },
  '/api/admin/provinces': { provinces: [{ code: '40', name: 'ขอนแก่น' }] },
  '/api/admin/hospitals/data-counts': { counts: { '10670': { totalRows: 1234, perTable: { cached_patients: 1234 } } } },
  '/api/admin/moph-hospitals?province=40': {
    hospitals: [{ hcode: '10999', name: 'รพ.ใหม่', hospitalTypeId: 7, bedCount: 30, provinceCode: '40', districtCode: '4002' }],
  },
};
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('HospitalsTab — characterization (must not change)', () => {
  it('adds a hospital from the MOPH registry with a JSON POST', async () => {
    const fetchSpy = stubMutations();
    renderWithSwr(<HospitalsTab />, BASE);
    await userEvent.click(await screen.findByRole('button', { name: /เพิ่มโรงพยาบาล/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getAllByRole('combobox')[0], '10999');
    await userEvent.click(within(dialog).getByRole('button', { name: /^เพิ่ม$/ }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/admin/hospitals');
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(JSON.parse(String(init!.body))).toMatchObject({ hcode: '10999', name: 'รพ.ใหม่', provinceCode: '40', districtCode: '4002', isActive: true });
  });
  it('deletes only after confirm(), with DELETE to the hospital URL', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const fetchSpy = stubMutations();
    renderWithSwr(<HospitalsTab />, BASE);
    const del = (await screen.findAllByRole('button', { name: /^ลบ/ }))[0];
    await userEvent.click(del);
    expect(fetchSpy).not.toHaveBeenCalled();
    await userEvent.click(del);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/admin/hospitals/10670', { method: 'DELETE' }));
    expect(confirmSpy).toHaveBeenNthCalledWith(1, 'ลบ รพ.ขอนแก่น (10670)?\nข้อมูลการตั้งค่า BMS จะถูกลบไปด้วย');
  });
  it('clear-purge needs confirm() and POSTs to clear-purge', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchSpy = stubMutations();
    renderWithSwr(<HospitalsTab />, BASE);
    await userEvent.click(await screen.findByRole('button', { name: /เปิดใช้งาน.*อีกครั้ง/ }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/admin/hospitals/10671/clear-purge', { method: 'POST' }));
  });
});
```

```tsx
// tests/unit/components/admin/admin-page.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/components/layout/BreadcrumbContext', () => ({ useSetBreadcrumbs: vi.fn() }));
vi.mock('@/components/admin/AdminMapPane', () => ({
  AdminMapPane: ({ onSelectHospital }: { onSelectHospital?: (h: string) => void }) => (
    <button type="button" onClick={() => onSelectHospital?.('10670')}>pin-10670</button>
  ),
}));
vi.mock('@/components/admin/HospitalsTab', () => ({
  HospitalsTab: ({ autoEditHcode }: { autoEditHcode?: string | null }) => (
    <div data-testid="hospitals-tab" data-auto-edit={autoEditHcode ?? ''} />
  ),
}));
vi.mock('@/components/admin/ActiveProvinceTab', () => ({ ActiveProvinceTab: () => <div data-testid="province-tab" /> }));
vi.mock('@/components/admin/BmsConfigTab', () => ({ BmsConfigTab: () => <div data-testid="bms-tab" /> }));
vi.mock('@/components/admin/WebhookKeysTab', () => ({ WebhookKeysTab: () => <div data-testid="keys-tab" /> }));
vi.mock('@/components/admin/SyncOverviewTab', () => ({ SyncOverviewTab: () => <div data-testid="sync-tab" /> }));
vi.mock('@/components/admin/OnlineUsersTab', () => ({ OnlineUsersTab: () => <div data-testid="users-tab" /> }));
vi.mock('@/components/admin/SimulationTab', () => ({ SimulationTab: () => <div data-testid="sim-tab" /> }));
vi.mock('@/components/admin/MophAlertsTab', () => ({ MophAlertsTab: () => <div data-testid="moph-tab" /> }));

import AdminPage from '@/app/(provincial)/admin/page';

describe('AdminPage — characterization (must not change)', () => {
  it('opens on จังหวัดหลัก; a map pin jumps to the hospitals tab with auto-edit', async () => {
    render(<AdminPage />);
    expect(screen.getByTestId('province-tab')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'pin-10670' }));
    expect(await screen.findByTestId('hospitals-tab')).toHaveAttribute('data-auto-edit', '10670');
  });
});
```

```bash
npx vitest run tests/unit/components/admin
```

Expected: **4 PASS on today's code.** Commit the checkpoint: `git add tests/helpers/admin-fixtures.tsx tests/unit/components/admin && git commit -m "test(admin): characterize registry tabs and the map→edit bridge …"` with the trailer.

- [ ] **Step 2: Write the failing layout tests**

Append to `admin-page.test.tsx`:

```tsx
describe('AdminPage — direction-C layout', () => {
  const TAB_LABELS = ['จังหวัดหลัก', 'โรงพยาบาล', 'การเชื่อมต่อ BMS', 'คีย์ Webhook', 'สถานะการซิงค์', 'ผู้ใช้ออนไลน์', 'จำลองข้อมูล', 'แจ้งเตือน MOPH (LINE)'];
  it('is a titled page with a Thai tablist', () => {
    render(<AdminPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'ตั้งค่าระบบ' })).toBeInTheDocument();
    const list = screen.getByRole('tablist', { name: 'หมวดการตั้งค่า' });
    expect(within(list).getAllByRole('tab').map((t) => t.textContent?.trim())).toEqual(TAB_LABELS);
  });
  it('selecting a tab shows only its panel', async () => {
    render(<AdminPage />);
    await userEvent.click(screen.getByRole('tab', { name: 'สถานะการซิงค์' }));
    expect(screen.getByTestId('sync-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('province-tab')).toBeNull();
  });
  it('labels the map region and drops zoom / fixed-width columns', () => {
    const { container } = render(<AdminPage />);
    expect(screen.getByRole('region', { name: 'แผนที่โรงพยาบาล' })).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/zoom|minmax\(520px/);
  });
});
```

Append to `hospitals-tab.test.tsx`:

```tsx
describe('HospitalsTab — direction-C', () => {
  it('is a real table with Thai headers (B1)', async () => {
    renderWithSwr(<HospitalsTab />, BASE);
    const table = await screen.findByRole('table', { name: 'โรงพยาบาลในระบบ' });
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent?.trim());
    expect(headers).toEqual(['โรงพยาบาล', 'ประเภทบริการ', 'จังหวัด', 'สถานะ', 'ข้อมูลในระบบ', 'จัดการ']);
  });
  it('the card says how many hospitals and how many are active', async () => {
    renderWithSwr(<HospitalsTab />, { ...BASE, '/api/admin/hospitals': { hospitals: [adminHospital(), adminHospital({ hcode: '10672', name: 'รพ.พล', isActive: false })] } });
    expect(await screen.findByText('2 แห่ง · ใช้งาน 1 · ปิดใช้งาน 1')).toBeInTheDocument();
  });
  it('a failed delete is reported in the page with a remedy, not with alert() (B5)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    stubMutations(() => ({ ok: false, status: 409, body: { error: 'hospital has data' } }));
    renderWithSwr(<HospitalsTab />, BASE);
    await userEvent.click((await screen.findAllByRole('button', { name: /^ลบ/ }))[0]);
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('ลบ รพ.ขอนแก่น (10670) ไม่สำเร็จ: hospital has data');
    expect(banner).toHaveTextContent('วิธีแก้:');
    expect(alertSpy).not.toHaveBeenCalled();
  });
  it('a load failure is actionable and retryable', async () => {
    renderWithSwr(<HospitalsTab />, { ...BASE, '/api/admin/hospitals': new Error('column x does not exist') });
    expect(await screen.findByText('โหลดรายการโรงพยาบาลไม่สำเร็จ')).toBeInTheDocument();
    expect(screen.getByText('column x does not exist')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ลองใหม่/ })).toBeInTheDocument();
  });
});
```

```tsx
// tests/unit/components/admin/admin-ui.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Field, StatusPill, TONE_CLASSES } from '@/components/admin/admin-ui';

describe('admin-ui', () => {
  it('StatusPill text always uses the AA -text shade', () => {
    for (const tone of ['ok', 'warn', 'danger'] as const) {
      render(<StatusPill tone={tone}>{tone}</StatusPill>);
      expect(screen.getByText(tone).className).toContain(`text-${tone}-text`);
    }
    expect(TONE_CLASSES.neutral.chip).toContain('text-ink-muted');
  });
  it('Field associates its label with the control', () => {
    render(<Field label="ระดับโรงพยาบาล" htmlFor="lvl"><select id="lvl" /></Field>);
    expect(screen.getByLabelText('ระดับโรงพยาบาล').tagName).toBe('SELECT');
  });
});
```

Add the five files of this task to `MIGRATED`: `src/app/(provincial)/admin/page.tsx`, `src/components/admin/HospitalsTab.tsx`, `src/components/admin/ActiveProvinceTab.tsx`, `src/components/admin/BulkAddHospitalsDialog.tsx`, `src/components/admin/AdminMapPane.tsx`. Also add `src/components/admin/admin-ui.tsx`.

```bash
npx vitest run tests/unit/components/admin tests/unit/ui/admin-auth-migration.test.ts
```

Expected: the characterization block PASSES; the layout tests and the guard FAIL.

- [ ] **Step 3: Implement the shared admin vocabulary**

```ts
// src/config/status-tone.ts
/** Semantic tone for status chips/dots (maps onto the direction-C tokens). */
export type StatusTone = 'ok' | 'warn' | 'danger' | 'brand' | 'neutral';
```

```tsx
// src/components/admin/admin-ui.tsx
// The admin vocabulary in one place: status chips, labelled fields and native
// selects on the direction-C tokens. Text never uses the base risk hue (B3).
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { StatusTone } from '@/config/status-tone';
import { cn } from '@/lib/utils';

export const TONE_CLASSES: Record<StatusTone, { chip: string; text: string; dot: string }> = {
  ok: { chip: 'border-ok/40 bg-ok-tint text-ok-text', text: 'text-ok-text', dot: 'bg-ok' },
  warn: { chip: 'border-warn/40 bg-warn-tint text-warn-text', text: 'text-warn-text', dot: 'bg-warn' },
  danger: { chip: 'border-danger/40 bg-danger-tint text-danger-text', text: 'text-danger-text', dot: 'bg-danger' },
  brand: { chip: 'border-brand/30 bg-brand-soft text-brand', text: 'text-brand', dot: 'bg-brand' },
  neutral: { chip: 'border-border bg-surface-muted text-ink-muted', text: 'text-ink-muted', dot: 'bg-ink-subtle' },
};

export function StatusPill({
  tone, icon: Icon, title, children, className,
}: { tone: StatusTone; icon?: LucideIcon; title?: string; children: ReactNode; className?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-caption font-semibold', TONE_CLASSES[tone].chip, className)}>
      {Icon && <Icon aria-hidden="true" className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-label text-ink">{label}</label>
      {children}
      {hint && <p className="text-caption text-ink-muted">{hint}</p>}
    </div>
  );
}

export const SELECT_CLASS =
  'h-11 w-full rounded-lg border border-border bg-surface-card px-3 text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';
```

- [ ] **Step 4: Implement the admin page**

Replace `src/app/(provincial)/admin/page.tsx` with:

```tsx
// Admin — system configuration on the direction-C shell (sub-project 5).
// Authorization is NOT here: middleware.ts + isAdminAuthorized gate /admin and
// every /api/admin route. Two columns (panel + map) only when the content box
// itself is ≥ 1160px — the sidebar takes 232px (dashboard D6). zoom: 1.15 is
// gone (it overflowed at 1024px and skewed Leaflet hit-testing).
'use client';

import { useState } from 'react';
import { Activity, Bell, Building2, Database, FlaskConical, Globe, KeyRound, UsersRound, type LucideIcon } from 'lucide-react';
import { useSetBreadcrumbs } from '@/components/layout/BreadcrumbContext';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ActiveProvinceTab } from '@/components/admin/ActiveProvinceTab';
import { HospitalsTab } from '@/components/admin/HospitalsTab';
import { BmsConfigTab } from '@/components/admin/BmsConfigTab';
import { WebhookKeysTab } from '@/components/admin/WebhookKeysTab';
import { SyncOverviewTab } from '@/components/admin/SyncOverviewTab';
import { OnlineUsersTab } from '@/components/admin/OnlineUsersTab';
import { SimulationTab } from '@/components/admin/SimulationTab';
import { MophAlertsTab } from '@/components/admin/MophAlertsTab';
import { AdminMapPane } from '@/components/admin/AdminMapPane';

type TabKey = 'province' | 'hospitals' | 'bms-config' | 'webhook-keys' | 'sync-overview' | 'online-users' | 'simulation' | 'moph-alerts';

const TABS: ReadonlyArray<{ key: TabKey; label: string; icon: LucideIcon }> = [
  { key: 'province', label: 'จังหวัดหลัก', icon: Globe },
  { key: 'hospitals', label: 'โรงพยาบาล', icon: Building2 },
  { key: 'bms-config', label: 'การเชื่อมต่อ BMS', icon: Database },
  { key: 'webhook-keys', label: 'คีย์ Webhook', icon: KeyRound },
  { key: 'sync-overview', label: 'สถานะการซิงค์', icon: Activity },
  { key: 'online-users', label: 'ผู้ใช้ออนไลน์', icon: UsersRound },
  { key: 'simulation', label: 'จำลองข้อมูล', icon: FlaskConical },
  { key: 'moph-alerts', label: 'แจ้งเตือน MOPH (LINE)', icon: Bell },
];

export default function AdminPage() {
  useSetBreadcrumbs([{ label: 'แดชบอร์ด', href: '/' }, { label: 'ตั้งค่า' }]);
  const [activeTab, setActiveTab] = useState<TabKey>('province');
  // Map pin click → HospitalsTab opens the edit dialog for that hcode.
  const [autoEditHcode, setAutoEditHcode] = useState<string | null>(null);
  const handleSelectHospitalFromMap = (hcode: string) => {
    setActiveTab('hospitals');
    setAutoEditHcode(hcode);
  };

  return (
    <div className="@container min-h-full bg-surface-page">
      <div className="flex flex-col gap-5 px-4 py-5 md:px-6">
        <PageHeader
          title="ตั้งค่าระบบ"
          subtitle="จังหวัดหลัก ทะเบียนโรงพยาบาล การเชื่อมต่อ HOSxP คีย์ Webhook และการแจ้งเตือน — สำหรับผู้ดูแลระบบ สสจ."
        />
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="gap-5">
          <TabsList
            variant="line"
            aria-label="หมวดการตั้งค่า"
            className="w-full max-w-full flex-wrap justify-start gap-1 border-b border-border pb-1 group-data-horizontal/tabs:h-auto"
          >
            {TABS.map(({ key, label, icon: Icon }) => (
              <TabsTrigger key={key} value={key} className="h-10 flex-none px-3 text-label data-active:text-brand">
                <Icon aria-hidden="true" className="h-4 w-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="grid grid-cols-1 items-start gap-5 @min-[1160px]:grid-cols-[minmax(0,1fr)_420px]">
            <div className="min-w-0">
              <TabsContent value="province"><ActiveProvinceTab /></TabsContent>
              <TabsContent value="hospitals">
                <HospitalsTab autoEditHcode={autoEditHcode} onAutoEditConsumed={() => setAutoEditHcode(null)} />
              </TabsContent>
              <TabsContent value="bms-config"><BmsConfigTab /></TabsContent>
              <TabsContent value="webhook-keys"><WebhookKeysTab /></TabsContent>
              <TabsContent value="sync-overview"><SyncOverviewTab /></TabsContent>
              <TabsContent value="online-users"><OnlineUsersTab /></TabsContent>
              <TabsContent value="simulation"><SimulationTab /></TabsContent>
              <TabsContent value="moph-alerts"><MophAlertsTab /></TabsContent>
            </div>
            <section
              aria-label="แผนที่โรงพยาบาล"
              className="min-w-0 @min-[1160px]:sticky @min-[1160px]:top-[calc(var(--app-header-h,0px)+16px)]"
            >
              <AdminMapPane onSelectHospital={handleSelectHospitalFromMap} />
            </section>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement the registry tabs**

**`HospitalsTab.tsx`.** Keep the SWR hooks, `useMemo`s, the auto-edit `useEffect`, and `openAdd` / `handleAdd` / `handleDelete` / `handleClearPurge` verbatim, except for these edits:

1. Add `const [actionError, setActionError] = useState<ActionFailure | null>(null);`.
2. In `handleDelete` and `handleClearPurge`, add `setActionError(null);` right after `setBusy(true);`.
3. Replace the two `alert((e as Error).message);` calls:
   - delete: `setActionError(actionFailure(\`ลบ ${h.name} (${h.hcode})\`, (e as Error).message));`
   - clear-purge: `setActionError(actionFailure(\`เปิดใช้งานการซิงค์ของ ${h.name} (${h.hcode})\`, (e as Error).message));`
4. Replace the `if (error) { return (<div className="border-2 …">…</div>); }` block with:

```tsx
  if (error) {
    // Surface the real failure (e.g. "column X does not exist" after a schema
    // mismatch) so "no hospitals yet" and "server failed" never look alike.
    return (
      <ErrorState
        message="โหลดรายการโรงพยาบาลไม่สำเร็จ"
        detail={(error as Error).message}
        remedy="รีสตาร์ทเซิร์ฟเวอร์เพื่อให้ schema-sync เพิ่มคอลัมน์ที่ขาด แล้วกด ลองใหม่ หากยังไม่ได้ แจ้งผู้ดูแลระบบพร้อมข้อความด้านบน"
        onRetry={() => void mutate()}
      />
    );
  }
```

5. Replace the returned JSX from `<div className="space-y-4">` down to the end of the add `<Dialog>` with:

```tsx
  const inactive = hospitals.filter((h) => !h.isActive).length;
  const columns: DataTableColumn<AdminHospital>[] = [
    {
      key: 'name',
      header: 'โรงพยาบาล',
      cell: (h) => {
        const failed = isHospitalAuthenticityFailure(h);
        return (
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body font-medium text-ink">{h.name}</span>
              {failed && (
                <StatusPill tone="danger" icon={AlertTriangle} title={describeAuthenticityFailure(h)}>ข้อมูลไม่ผ่านตรวจสอบ</StatusPill>
              )}
            </div>
            <div className="font-mono text-caption text-ink-muted">{h.hcode} · {h.level}</div>
            {failed && (
              <button
                type="button"
                onClick={() => handleClearPurge(h)}
                disabled={busy}
                title="ล้างสถานะระงับการซิงค์ฝั่งเซิร์ฟเวอร์ — การซิงค์จริงจะเริ่มอีกครั้งเมื่อผู้ใช้จากโรงพยาบาลนี้เปิด KK-LRMS จาก HOSxP"
                className="inline-flex min-h-9 items-center rounded-lg border border-ok/40 bg-ok-tint px-2.5 text-caption font-semibold text-ok-text hover:brightness-95 disabled:opacity-50"
              >
                เปิดใช้งานการซิงค์อีกครั้ง
              </button>
            )}
          </div>
        );
      },
    },
    { key: 'service', header: 'ประเภทบริการ', cell: (h) => <span className="text-label text-ink-muted">{SERVICE_TYPE_LABEL[h.serviceType ?? ''] ?? '—'}</span> },
    {
      key: 'province',
      header: 'จังหวัด',
      cell: (h) => (
        <span className="text-label text-ink-muted">
          {h.provinceCode ? `${provinceByCode.get(h.provinceCode) ?? '-'} · ${h.provinceCode}` : '—'}
        </span>
      ),
    },
    {
      key: 'active',
      header: 'สถานะ',
      cell: (h) => (
        <StatusPill tone={h.isActive ? 'ok' : 'neutral'} title={h.isActive ? undefined : 'โรงพยาบาลถูกปิดการใช้งาน — กด "แก้ไข" เพื่อเปิดใช้งานอีกครั้งหรือลบข้อมูล'}>
          {h.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
        </StatusPill>
      ),
    },
    {
      key: 'data',
      header: 'ข้อมูลในระบบ',
      numeric: true,
      cell: (h) => {
        if (dataCountsData === undefined) return <span className="text-caption text-ink-muted">…</span>;
        const total = dataCountsData.counts?.[h.hcode]?.totalRows;
        const perTable = dataCountsData.counts?.[h.hcode]?.perTable;
        const tooltip = perTable
          ? Object.entries(perTable).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v.toLocaleString('th-TH')}`).join('\n') || 'ไม่มีข้อมูล'
          : 'ไม่มีข้อมูล';
        return (
          <button
            type="button"
            onClick={() => setEditHospital(h)}
            title={`คลิกเพื่อจัดการข้อมูล\n${tooltip}`}
            disabled={busy}
            className={cn(
              'inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-2 tabular-nums hover:bg-brand-soft',
              total && total > 0 ? 'bg-surface-muted text-brand' : 'text-ink-muted',
            )}
          >
            <Database aria-hidden="true" className="h-3.5 w-3.5" />
            {(total ?? 0).toLocaleString('th-TH')}
          </button>
        );
      },
    },
    {
      key: 'actions',
      header: 'จัดการ',
      cell: (h) => (
        <div className="flex justify-end gap-1">
          <Button variant="outline" size="sm" onClick={() => setEditHospital(h)} disabled={busy} aria-label={`แก้ไข ${h.name}`} className="h-9 gap-1 text-label">
            <Pencil aria-hidden="true" className="h-3.5 w-3.5" /> แก้ไข
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleDelete(h)} disabled={busy} aria-label={`ลบ ${h.name} (${h.hcode})`} className="h-9 gap-1 text-label text-danger-text hover:bg-danger-tint">
            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" /> ลบ
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {actionError && (
        <ErrorState variant="banner" className="rounded-xl border" message={actionError.message} remedy={actionError.remedy} />
      )}
      <SectionCard
        title="โรงพยาบาลในระบบ"
        description={`${hospitals.length} แห่ง · ใช้งาน ${hospitals.length - inactive} · ปิดใช้งาน ${inactive}`}
        actions={
          <Button onClick={openAdd} className="h-10 gap-1.5 bg-brand text-white hover:bg-brand-strong">
            <Plus aria-hidden="true" className="h-4 w-4" /> เพิ่มโรงพยาบาล
          </Button>
        }
      >
        <DataTable
          caption="โรงพยาบาลในระบบ"
          columns={columns}
          rows={hospitals}
          rowKey={(h) => h.hcode}
          empty={<EmptyState illustration="generic" title="ยังไม่มีโรงพยาบาลในระบบ" description='กด "เพิ่มโรงพยาบาล" เพื่อเลือกจากทะเบียน MOPH' className="shadow-none" />}
        />
      </SectionCard>

      <Dialog open={addOpen} onOpenChange={(o) => !o && setAddOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-title text-brand">เพิ่มโรงพยาบาลจากทะเบียน MOPH</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-body text-ink-muted">
              ค้นหาในจังหวัดปัจจุบัน ({provinceByCode.get(activeProvince) ?? activeProvince}) — มี {availableMoph.length} รายการที่ยังไม่ถูกเพิ่ม
            </p>
            <Field label="โรงพยาบาล" htmlFor="add-hcode">
              <select
                id="add-hcode"
                value={pickedHcode}
                onChange={(e) => {
                  setPickedHcode(e.target.value);
                  const moph = availableMoph.find((m) => m.hcode === e.target.value);
                  if (moph) setPickedLevel(guessHospitalLevel(moph.hospitalTypeId));
                }}
                className={SELECT_CLASS}
              >
                <option value="">— เลือกโรงพยาบาล —</option>
                {availableMoph.map((m) => (
                  <option key={m.hcode} value={m.hcode}>{m.hcode} · {m.name} {m.bedCount ? `(${m.bedCount} เตียง)` : ''}</option>
                ))}
              </select>
            </Field>
            <Field label="ระดับโรงพยาบาล" htmlFor="add-level">
              <select id="add-level" value={pickedLevel} onChange={(e) => setPickedLevel(e.target.value)} className={SELECT_CLASS}>
                {LEVEL_OPTIONS.map((l) => (<option key={l} value={l}>{l}</option>))}
              </select>
            </Field>
            {addMessage ? <p role="alert" className="text-body text-danger-text">{addMessage}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={busy}>ยกเลิก</Button>
            <Button onClick={handleAdd} disabled={busy || !pickedHcode} className="gap-1.5 bg-brand text-white hover:bg-brand-strong">
              <Plus aria-hidden="true" className="h-4 w-4" />
              เพิ่ม
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

The `HospitalEditDialog` block that follows is kept verbatim.

6. Imports:
   - Drop `COLOR` and `Building2`.
   - Add `cn`, `SectionCard`, `DataTable` + `type DataTableColumn`, `EmptyState`, `ErrorState`, `actionFailure` + `type ActionFailure`, and `Field`, `SELECT_CLASS`, `StatusPill` from `./admin-ui`.

`<Plus/> เพิ่ม` keeps the accessible name "เพิ่ม", because the svg is `aria-hidden`.

**`ActiveProvinceTab.tsx`.** Keep all hooks and handlers. Replace the return body:
1. Delete the `ACTIVE PROVINCE · {provinces.length} choices` eyebrow.
2. The first bordered panel becomes `<SectionCard title="จังหวัดหลักของระบบ" description="เลือกจังหวัดที่ระบบจะโฟกัส — กระทบแดชบอร์ด แผนที่ และการซิงค์ หลังจากบันทึก โรงพยาบาลในจังหวัดอื่นจะไม่แสดงจนกว่าจะเพิ่มเข้าระบบ">`. Inside it:
   - `<div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">` (B1);
   - the select with `className={SELECT_CLASS}` and no `style`;
   - the Save `Button` unchanged;
   - the current-province pill as `<StatusPill tone="brand" icon={CheckCircle2}>กำลังใช้งาน: {currentProvince.name} · {currentProvince.code}</StatusPill>`;
   - `saveMessage` in `<InlineNotice tone="info">`.
3. The second panel becomes `<SectionCard title="เพิ่มหลายโรงพยาบาลพร้อมกัน" description={\`เลือกโรงพยาบาลในจังหวัด${currentProvince.name}จากทะเบียน MOPH แล้วเพิ่มเข้าระบบในครั้งเดียว — ระบบจะตั้งค่าระดับและประเภทบริการเริ่มต้นให้อัตโนมัติ\`}>` wrapping the unchanged button.
4. Drop the `Globe` and `ListPlus` header icons from the panel bodies (`ListPlus` stays on the button).

**`BulkAddHospitalsDialog.tsx`.** Apply the class mapping. Also:
- `BULK ADD · จังหวัด {provinceCode}` becomes `เพิ่มหลายโรงพยาบาล · จังหวัด {provinceCode}`.
- The column headers `HCODE` / `NAME` / `LEVEL` / `BEDS` become `รหัส` / `ชื่อโรงพยาบาล` / `ระดับ` / `เตียง`.
- `ระบบจะเลือก LEVEL จาก…` becomes `ระบบจะเลือกระดับจาก…`.
- Under the `เพิ่มไม่สำเร็จ {errors.length} รายการ` line, add `<p className="text-label">วิธีแก้: รายการที่สำเร็จถูกเพิ่มแล้ว — ตรวจรายการที่ไม่สำเร็จด้านล่าง แล้วกด เพิ่ม อีกครั้งเฉพาะที่เหลือ</p>`.

The `fetch` loop and `onAdded` are unchanged.

**`AdminMapPane.tsx`.** Apply the class mapping. Also:
- `GIS PREVIEW · {activeName} ({activeCode})` becomes `แผนที่โรงพยาบาล · {activeName} ({activeCode})` (`text-label text-ink-muted`).
- `{pinnedCount}/{totalActive} pinned` becomes `ปักหมุดแล้ว {pinnedCount}/{totalActive} แห่ง`.
- The frame becomes `relative w-full overflow-hidden rounded-2xl border border-border bg-surface-card`, keeping `style={{ height: 560 }}` only.
- The footnote `แผนที่ใช้ active province จากการตั้งค่า · …` becomes `แผนที่ใช้จังหวัดหลักจากการตั้งค่า · โรงพยาบาลที่ไม่มีพิกัดจะใช้ centroid ของอำเภอเป็นจุดแสดง` (`text-caption text-ink-muted`, no mono).

**Allowlist.** Remove `"src/components/admin/HospitalsTab.tsx"` from `eslint-rules/design-allowlist.json` and decrement `maxEntries` by 1.

- [ ] **Step 6: Run the tests to confirm they pass**

```bash
npx vitest run tests/unit/components/admin tests/unit/ui/admin-auth-migration.test.ts tests/unit/eslint
npx tsc --noEmit && npm run lint
```

Expected: everything PASSES, and the characterization block is unchanged since Step 1.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(provincial)/admin/page.tsx" src/components/admin/{admin-ui,HospitalsTab,ActiveProvinceTab,BulkAddHospitalsDialog,AdminMapPane}.tsx src/config/status-tone.ts eslint-rules/design-allowlist.json tests/unit/components/admin tests/unit/ui/admin-auth-migration.test.ts
git commit -m "feat(admin): Thai tabbed shell and registry tabs on the tokens

PageHeader + a Base UI tablist; panel and map side by side only when the
content box is >= 1160px, with zoom 1.15 removed (it overflowed at 1024px).
HospitalsTab is a real DataTable — the comma grid-cols template compiled to
invalid CSS and stacked every cell (B1); delete/clear-purge failures show an
actionable banner instead of alert(). Requests and confirm() text unchanged.

Co-Authored-By: <implementer's harness attribution>"
```

---

### Task 6: Admin operations tabs — sync, online users, keys, MOPH alerts, BMS

**Files:**
- Create: `src/config/sync-run-status.ts`, `src/config/presence.ts`
- Modify: `src/lib/presence.ts`, `src/components/admin/{SyncOverviewTab,OnlineUsersTab,WebhookKeysTab,MophAlertsTab,BmsConfigTab}.tsx`, `tests/unit/ui/admin-auth-migration.test.ts`
- Test: `tests/unit/config/sync-run-status.test.ts`, `tests/unit/config/presence.test.ts`, `tests/unit/components/admin/ops-tabs.test.tsx`

**Interfaces:**
- Consumes: `StatusPill`, `TONE_CLASSES`, `Field`, `SELECT_CLASS` (Task 5), `KpiTile`, `KpiGrid`, `DataTable`, `formatRelativeTime` (`@/lib/utils`).
- Produces:
  - `SYNC_OUTCOME_META: Record<'running' | 'success' | 'partial' | 'failed' | 'never', { labelTh: string; tone: StatusTone }>`
  - `SYNC_TRIGGER_TH`, `syncTriggerLabel(t)`
  - `SYNC_STEP_TONE: Record<'running' | 'success' | 'warning' | 'error' | 'info', StatusTone>`
  - `formatSyncDuration(ms)`, `SYNC_OVERVIEW_POLL_MS`
  - `PRESENCE_TTL_SECONDS`, `ONLINE_USERS_POLL_MS`

- [ ] **Step 1: Characterization tests (green on today's code)**

```tsx
// tests/unit/components/admin/ops-tabs.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WebhookKeysTab } from '@/components/admin/WebhookKeysTab';
import { MophAlertsTab } from '@/components/admin/MophAlertsTab';
import { SyncOverviewTab } from '@/components/admin/SyncOverviewTab';
import { OnlineUsersTab } from '@/components/admin/OnlineUsersTab';
import { renderWithSwr, stubMutations } from '../../../helpers/admin-fixtures';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const KEY = {
  id: 'k1', hospitalId: 'h1', hcode: '10670', hospitalName: 'รพ.ขอนแก่น', keyPrefix: 'kklrms_ab12',
  label: 'Production', isActive: true, lastUsedAt: null, createdAt: '2026-10-01T03:00:00Z', revokedAt: null,
};
const KEYS = {
  '/api/admin/webhooks': { keys: [KEY] },
  '/api/admin/hospitals': { hospitals: [{ hcode: '10670', name: 'รพ.ขอนแก่น' }] },
};

describe('WebhookKeysTab — characterization (must not change)', () => {
  it('creates a key with a JSON POST and reveals it once', async () => {
    const fetchSpy = stubMutations(() => ({
      ok: true,
      body: { id: 'k2', apiKey: 'kklrms_SECRET', keyPrefix: 'kklrms_cd34', hospitalName: 'รพ.ขอนแก่น', hcode: '10670', label: 'ทดสอบ' },
    }));
    renderWithSwr(<WebhookKeysTab />, KEYS);
    await userEvent.selectOptions(await screen.findByLabelText(/โรงพยาบาล/), '10670');
    await userEvent.type(screen.getByPlaceholderText(/Production webhook/), 'ทดสอบ');
    await userEvent.click(screen.getByRole('button', { name: /สร้าง/ }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hcode: '10670', label: 'ทดสอบ' }),
      }),
    );
    expect(await screen.findByText('kklrms_SECRET')).toBeInTheDocument();
    await userEvent.click(screen.getByTitle('ปิด'));
    expect(screen.queryByText('kklrms_SECRET')).toBeNull();
  });
  it('revoke stays disabled until the key prefix is typed, then DELETEs', async () => {
    const fetchSpy = stubMutations();
    renderWithSwr(<WebhookKeysTab />, KEYS);
    await userEvent.click(await screen.findByRole('button', { name: /^ยกเลิก/ }));
    const dialog = await screen.findByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: /ยืนยันยกเลิก/ });
    expect(confirmBtn).toBeDisabled();
    await userEvent.type(within(dialog).getByPlaceholderText('kklrms_ab12'), 'kklrms_ab12');
    expect(confirmBtn).toBeEnabled();
    await userEvent.click(confirmBtn);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/admin/webhooks/k1', { method: 'DELETE' }));
  });
});

const MOPH = {
  '/api/admin/config': { config: { active_province_code: '40' } },
  '/api/admin/provinces/40/center-monitors': {
    monitors: [{ id: 'm1', province: '40', cid: '1234567890123', name: 'สมศรี', position: 'พยาบาล', isActive: true, createdAt: '', updatedAt: '' }],
  },
  '/api/admin/moph-alerts?limit=1': { eventQueue: { awaitingRecipients: 0, expired: 0 } },
};

describe('MophAlertsTab — characterization (must not change)', () => {
  it('lists recipients with the CID masked, never in full', async () => {
    renderWithSwr(<MophAlertsTab />, MOPH);
    expect(await screen.findByText('********0123')).toBeInTheDocument();
    expect(screen.queryByText('1234567890123')).toBeNull();
  });
  it('validates the 13-digit CID before any request, then POSTs JSON', async () => {
    const fetchSpy = stubMutations();
    renderWithSwr(<MophAlertsTab />, MOPH);
    await userEvent.type(await screen.findByPlaceholderText('เลขบัตรประชาชน 13 หลัก'), '123');
    await userEvent.type(screen.getByPlaceholderText('ชื่อผู้รับการแจ้งเตือน'), 'สมชาย');
    await userEvent.click(screen.getByRole('button', { name: /เพิ่มผู้รับเตือน/ }));
    expect(await screen.findByText(/CID ต้องเป็นตัวเลข 13 หลัก/)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    await userEvent.type(screen.getByPlaceholderText('เลขบัตรประชาชน 13 หลัก'), '4567890123');
    await userEvent.click(screen.getByRole('button', { name: /เพิ่มผู้รับเตือน/ }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/provinces/40/center-monitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid: '1234567890123', name: 'สมชาย', position: null, isActive: true }),
      }),
    );
  });
});

const SYNC = {
  '/api/admin/sync-overview': {
    total: 1,
    updatedAt: '2026-10-11T03:00:00Z',
    hospitals: [{
      hcode: '10670', name: 'รพ.ขอนแก่น', level: 'A_S', isActive: true, connectionStatus: 'CONNECTED', lastSyncAt: null,
      authenticity: { status: null, reason: null, checkedAt: null, isFailure: false }, dataPurgedAt: null, hasBmsConfig: true,
      latestRun: {
        runId: 'r1', hospitalId: 'h1', hcode: '10670', trigger: 'scheduled', startedAt: '2026-10-11T02:59:00Z',
        finishedAt: '2026-10-11T02:59:02Z', durationMs: 2100, outcome: 'failed', finalMessage: null,
        errorMessage: 'tunnel timeout', steps: [],
      },
    }],
  },
};

describe('SyncOverviewTab — characterization (must not change)', () => {
  it('a hospital row opens the edit dialog on its sync log', async () => {
    const { fetcher } = renderWithSwr(<SyncOverviewTab />, SYNC);
    await userEvent.click(await screen.findByText('tunnel timeout'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith('/api/admin/hospitals/10670/sync-progress?limit=20'));
  });
});

describe('OnlineUsersTab — characterization (must not change)', () => {
  it('the headline count is the server total', async () => {
    renderWithSwr(<OnlineUsersTab />, {
      '/api/admin/online-users': { users: [], total: 7, cache: { backend: 'redis', available: true }, updatedAt: '2026-10-11T03:00:00Z' },
    });
    expect(await screen.findByText('7')).toBeInTheDocument();
  });
});
```

```bash
npx vitest run tests/unit/components/admin/ops-tabs.test.tsx
```

Expected: **7 PASS on today's code.**

If a label selector does not match today's DOM (for example the WebhookKeys `<label htmlFor="hcode">` text), read the file and adjust **only the selector**, never the assertion on the request. Commit the checkpoint with the trailer.

- [ ] **Step 2: Write the failing tests**

```ts
// tests/unit/config/sync-run-status.test.ts
import { describe, it, expect } from 'vitest';
import { SYNC_OUTCOME_META, SYNC_STEP_TONE, formatSyncDuration, syncTriggerLabel, SYNC_OVERVIEW_POLL_MS } from '@/config/sync-run-status';

describe('sync-run-status', () => {
  it('every outcome has a Thai label and a tone', () => {
    expect(SYNC_OUTCOME_META).toEqual({
      success: { labelTh: 'สำเร็จ', tone: 'ok' },
      partial: { labelTh: 'สำเร็จบางส่วน', tone: 'warn' },
      failed: { labelTh: 'ล้มเหลว', tone: 'danger' },
      running: { labelTh: 'กำลังซิงค์', tone: 'brand' },
      never: { labelTh: 'ยังไม่เคยซิงค์', tone: 'neutral' },
    });
  });
  it('step tones follow the same scale', () => {
    expect(SYNC_STEP_TONE).toEqual({ success: 'ok', warning: 'warn', error: 'danger', info: 'neutral', running: 'brand' });
  });
  it('triggers read in Thai; unknown codes pass through', () => {
    expect(syncTriggerLabel('scheduled')).toBe('ตามรอบ');
    expect(syncTriggerLabel('immediate')).toBe('สั่งทันที');
    expect(syncTriggerLabel('onboarding')).toBe('เริ่มใช้งาน');
    expect(syncTriggerLabel('manual-x')).toBe('manual-x');
    expect(syncTriggerLabel(null)).toBe('—');
  });
  it('durations', () => {
    expect(formatSyncDuration(null)).toBe('—');
    expect(formatSyncDuration(850)).toBe('850 มิลลิวินาที');
    expect(formatSyncDuration(2100)).toBe('2.1 วินาที');
  });
  it('the overview refresh interval is the value the copy quotes', () => {
    expect(SYNC_OVERVIEW_POLL_MS).toBe(15_000);
  });
});
```

```ts
// tests/unit/config/presence.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ONLINE_USERS_POLL_MS, PRESENCE_TTL_SECONDS } from '@/config/presence';

describe('presence config', () => {
  it('values match what the server enforces and the tab quotes', () => {
    expect(PRESENCE_TTL_SECONDS).toBe(120);
    expect(ONLINE_USERS_POLL_MS).toBe(10_000);
  });
  it('src/lib/presence.ts imports the TTL instead of redeclaring it', () => {
    const src = readFileSync('src/lib/presence.ts', 'utf8');
    expect(src).not.toMatch(/const PRESENCE_TTL_SECONDS\s*=/);
    expect(src).toMatch(/from '@\/config\/presence'/);
  });
});
```

Append to `ops-tabs.test.tsx`:

```tsx
describe('operations tabs — direction-C', () => {
  it('SyncOverviewTab: Thai filter chips, a named clickable table, Thai outcome and trigger', async () => {
    renderWithSwr(<SyncOverviewTab />, SYNC);
    const table = await screen.findByRole('table', { name: 'สถานะการซิงค์รายโรงพยาบาล' });
    expect(within(table).getByRole('row', { name: 'เปิดบันทึกการซิงค์ของ รพ.ขอนแก่น' })).toBeInTheDocument();
    expect(within(table).getByText('ล้มเหลว')).toBeInTheDocument();
    expect(within(table).getByText('ตามรอบ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /มีปัญหา 1/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('รีเฟรชอัตโนมัติทุก 15 วินาที')).toBeInTheDocument();
  });
  it('SyncOverviewTab: a load failure is actionable and retryable', async () => {
    renderWithSwr(<SyncOverviewTab />, { '/api/admin/sync-overview': new Error('redis down') });
    expect(await screen.findByRole('alert')).toHaveTextContent('โหลดสถานะการซิงค์ไม่สำเร็จ');
    expect(screen.getByRole('button', { name: /ลองใหม่/ })).toBeInTheDocument();
  });
  it('OnlineUsersTab: KPI tile with the server total and an empty state', async () => {
    renderWithSwr(<OnlineUsersTab />, {
      '/api/admin/online-users': { users: [], total: 0, cache: { backend: 'redis', available: true }, updatedAt: '2026-10-11T03:00:00Z' },
    });
    expect(await screen.findByText('ผู้ใช้ออนไลน์ตอนนี้')).toBeInTheDocument();
    expect(screen.getByText('ยังไม่มีผู้ใช้เปิดหน้าเว็บอยู่')).toBeInTheDocument();
    expect(screen.getByText(/หายจากรายการเมื่อไม่มีสัญญาณ 120 วินาที/)).toBeInTheDocument();
  });
  it('WebhookKeysTab: KPI tiles and a Thai table', async () => {
    renderWithSwr(<WebhookKeysTab />, KEYS);
    expect(await screen.findByText('คีย์ทั้งหมด')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'API Key ทั้งหมด' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent?.trim())).toEqual([
      'โรงพยาบาล', 'ชื่อคีย์', 'รหัสขึ้นต้น', 'สร้างเมื่อ', 'ใช้ล่าสุด', 'สถานะ', 'จัดการ',
    ]);
  });
  it('MophAlertsTab: recipients in a named table', async () => {
    renderWithSwr(<MophAlertsTab />, MOPH);
    expect(await screen.findByRole('table', { name: 'ผู้รับการแจ้งเตือน' })).toBeInTheDocument();
  });
});
```

Add the five tab files to `MIGRATED`.

```bash
npx vitest run tests/unit/config/sync-run-status.test.ts tests/unit/config/presence.test.ts tests/unit/components/admin/ops-tabs.test.tsx tests/unit/ui/admin-auth-migration.test.ts
```

Expected: the new tests and the guard FAIL; the characterization block PASSES.

- [ ] **Step 3: Implement the config modules**

```ts
// src/config/sync-run-status.ts
// One vocabulary for HOSxP sync runs: the admin Sync Overview table and the
// hospital dialog's Sync Log both read it (they used to define the same
// badge palette twice, with raw blue/slate hex for running/never).
import type { StatusTone } from '@/config/status-tone';

export type SyncRunOutcome = 'running' | 'success' | 'partial' | 'failed';
export type SyncOverviewOutcome = SyncRunOutcome | 'never';
export type SyncStepStatus = 'running' | 'success' | 'warning' | 'error' | 'info';
export type SyncTrigger = 'scheduled' | 'immediate' | 'onboarding';

export const SYNC_OUTCOME_META: Record<SyncOverviewOutcome, { labelTh: string; tone: StatusTone }> = {
  success: { labelTh: 'สำเร็จ', tone: 'ok' },
  partial: { labelTh: 'สำเร็จบางส่วน', tone: 'warn' },
  failed: { labelTh: 'ล้มเหลว', tone: 'danger' },
  running: { labelTh: 'กำลังซิงค์', tone: 'brand' },
  never: { labelTh: 'ยังไม่เคยซิงค์', tone: 'neutral' },
};

export const SYNC_STEP_TONE: Record<SyncStepStatus, StatusTone> = {
  success: 'ok', warning: 'warn', error: 'danger', info: 'neutral', running: 'brand',
};

export const SYNC_TRIGGER_TH: Record<SyncTrigger, string> = {
  scheduled: 'ตามรอบ', immediate: 'สั่งทันที', onboarding: 'เริ่มใช้งาน',
};

export function syncTriggerLabel(trigger: string | null | undefined): string {
  if (!trigger) return '—';
  return trigger in SYNC_TRIGGER_TH ? SYNC_TRIGGER_TH[trigger as SyncTrigger] : trigger;
}

export function formatSyncDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} มิลลิวินาที`;
  return `${(ms / 1000).toFixed(1)} วินาที`;
}

/** /api/admin/sync-overview refresh — quoted in the tab's copy. */
export const SYNC_OVERVIEW_POLL_MS = 15_000;
```

```ts
// src/config/presence.ts
// Client-safe presence constants (no server imports): src/lib/presence.ts
// enforces the TTL, the admin online-users tab quotes it.
export const PRESENCE_TTL_SECONDS = 120;
export const ONLINE_USERS_POLL_MS = 10_000;
```

In `src/lib/presence.ts`, replace `const PRESENCE_TTL_SECONDS = 120;` with `import { PRESENCE_TTL_SECONDS } from '@/config/presence';` and place it with the imports.

- [ ] **Step 4: Implement the tabs**

**`SyncOverviewTab.tsx`.**
1. Delete `outcomeStyle`, `formatRelative` and `formatDuration`. Import `SYNC_OUTCOME_META`, `syncTriggerLabel`, `formatSyncDuration`, `SYNC_OVERVIEW_POLL_MS` and `type SyncOverviewOutcome`, plus `formatRelativeTime` from `@/lib/utils`.
2. The SWR option becomes `{ refreshInterval: SYNC_OVERVIEW_POLL_MS }`.
3. Keep `effectiveOutcome`, `entryToHospital`, `counts`, `visible` and the dialog block verbatim. `effectiveOutcome` returns `SyncOverviewOutcome`.
4. Replace the JSX between `<section className="space-y-4">` and the `HospitalEditDialog` with:

```tsx
      <SectionCard
        title="สถานะการซิงค์รายโรงพยาบาล"
        description={`ผลการซิงค์รอบล่าสุดของทุกโรงพยาบาล · กดแถวเพื่อเปิดบันทึกการซิงค์`}
        actions={
          <>
            <span className="text-caption text-ink-muted">รีเฟรชอัตโนมัติทุก {SYNC_OVERVIEW_POLL_MS / 1000} วินาที</span>
            <Button variant="outline" size="sm" onClick={() => mutate()} className="h-9 gap-1 text-label text-brand">
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> รีเฟรช
            </Button>
          </>
        }
      >
        <div role="group" aria-label="กรองตามผลการซิงค์" className="mb-3 flex flex-wrap gap-2">
          {([
            { k: 'all' as const, label: 'ทั้งหมด', n: counts.all },
            { k: 'failing' as const, label: 'มีปัญหา', n: counts.failing },
            { k: 'never' as const, label: 'ยังไม่ซิงค์', n: counts.never },
            { k: 'ok' as const, label: 'ปกติ', n: counts.ok },
          ]).map((f) => (
            <button
              key={f.k}
              type="button"
              aria-pressed={filter === f.k}
              onClick={() => setFilter(f.k)}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-label',
                filter === f.k ? 'border-brand bg-brand-soft font-semibold text-brand' : 'border-border bg-surface-card text-ink-muted hover:bg-surface-muted',
              )}
            >
              {f.label} <span className="tabular-nums">{f.n}</span>
            </button>
          ))}
        </div>
        {error && (
          <ErrorState
            variant="banner"
            className="mb-3 rounded-xl border"
            message="โหลดสถานะการซิงค์ไม่สำเร็จ"
            remedy="ระบบจะลองใหม่อัตโนมัติ หรือกด ลองใหม่ หากยังไม่ได้ ตรวจสอบ Redis ของเซิร์ฟเวอร์"
            onRetry={() => void mutate()}
          />
        )}
        <DataTable
          caption="สถานะการซิงค์รายโรงพยาบาล"
          loading={isLoading && !data}
          rows={visible}
          rowKey={(h) => h.hcode}
          onRowClick={(h) => setOpenHcode(h.hcode)}
          rowLabel={(h) => `เปิดบันทึกการซิงค์ของ ${h.name}`}
          empty={<EmptyState illustration="generic" title="ไม่มีโรงพยาบาลในตัวกรองนี้" description="เลือกตัวกรองอื่น หรือกด ทั้งหมด" className="shadow-none" />}
          columns={[
            { key: 'outcome', header: 'ผล', cell: (h) => { const m = SYNC_OUTCOME_META[effectiveOutcome(h)]; return <StatusPill tone={m.tone}>{m.labelTh}</StatusPill>; } },
            {
              key: 'hospital',
              header: 'โรงพยาบาล',
              cell: (h) => (
                <div>
                  <div className="text-body font-medium text-ink">{h.name}</div>
                  <div className="font-mono text-caption text-ink-muted">{h.hcode} · {h.level}</div>
                </div>
              ),
            },
            { key: 'trigger', header: 'เริ่มโดย', cell: (h) => <span className="text-label text-ink-muted">{syncTriggerLabel(h.latestRun?.trigger)}</span> },
            {
              key: 'started',
              header: 'เริ่มเมื่อ',
              cell: (h) => (
                <span className="text-label text-ink-muted" title={h.latestRun?.startedAt ? new Date(h.latestRun.startedAt).toLocaleString('th-TH') : ''}>
                  {formatRelativeTime(h.latestRun?.startedAt ?? null)}
                </span>
              ),
            },
            { key: 'duration', header: 'ใช้เวลา', numeric: true, cell: (h) => formatSyncDuration(h.latestRun?.durationMs ?? null) },
            {
              key: 'summary',
              header: 'สรุป · ข้อผิดพลาด',
              cell: (h) => {
                const run = h.latestRun;
                const outcome = effectiveOutcome(h);
                const text = h.authenticity.isFailure
                  ? `${h.authenticity.status}${h.authenticity.reason ? ` — ${h.authenticity.reason}` : ''}`
                  : run?.errorMessage ?? run?.finalMessage ?? (run?.steps[run.steps.length - 1]?.message ?? '—');
                return (
                  <span
                    title={text}
                    className={cn('line-clamp-2 text-label', outcome === 'failed' ? 'text-danger-text' : outcome === 'partial' ? 'text-warn-text' : 'text-ink-muted')}
                  >
                    {outcome === 'failed' && <AlertTriangle aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" />}
                    {text}
                  </span>
                );
              },
            },
          ]}
        />
      </SectionCard>
```

5. Imports: remove `COLOR`. Add `Button`, `cn`, `SectionCard`, `DataTable`, `EmptyState`, `ErrorState`, `StatusPill`.

The characterization test still clicks the "tunnel timeout" text, which is inside a cell with no nested control, so the row opens.

**`OnlineUsersTab.tsx`.**
1. Delete `ageLabel` and the `Metric` component. Import `ONLINE_USERS_POLL_MS` and `PRESENCE_TTL_SECONDS` from `@/config/presence`, and `formatRelativeTime`. The SWR option becomes `{ refreshInterval: ONLINE_USERS_POLL_MS }`.
2. Return:
   - a `SectionCard title="ผู้ใช้ออนไลน์"` with `description={\`ที่เก็บสถานะ: ${redisBackend === 'redis' ? 'Redis (ใช้ร่วมทุกเครื่อง)' : 'หน่วยความจำของเครื่องนี้ (dev)'} · หายจากรายการเมื่อไม่มีสัญญาณ ${PRESENCE_TTL_SECONDS} วินาที · รีเฟรชทุก ${ONLINE_USERS_POLL_MS / 1000} วินาที${data?.updatedAt ? \` · อัปเดต ${formatTime(data.updatedAt)}\` : ''}\`}`;
   - `<KpiGrid className="mb-4"><KpiTile label="ผู้ใช้ออนไลน์ตอนนี้" count={data?.total ?? 0} testId="online-users-total" /></KpiGrid>`;
   - on error, `<ErrorState variant="banner" className="rounded-xl border" message="โหลดรายชื่อผู้ใช้งานออนไลน์ไม่สำเร็จ" remedy="ระบบจะลองใหม่ทุก 10 วินาที หากยังไม่ได้ ตรวจสอบ Redis ของเซิร์ฟเวอร์" />`;
   - then `DataTable` (`caption="ผู้ใช้ที่เปิดหน้าเว็บอยู่"`, `loading={isLoading}`, `rowKey={(u) => u.userId}`) with columns:
     - ผู้ใช้: name `text-body text-ink` + `role · authProvider · accessMode` in `font-mono text-caption text-ink-muted`
     - โรงพยาบาล: name + hcode mono
     - หน้า: path mono `text-caption`
     - เห็นล่าสุด: `formatTime(lastSeenAt)` + `formatRelativeTime(lastSeenAt)`
     - อุปกรณ์: `browserLabel` + IP mono
   - `empty={<EmptyState illustration="generic" title="ยังไม่มีผู้ใช้เปิดหน้าเว็บอยู่" description="รายชื่อจะปรากฏเมื่อมีผู้ใช้เปิด KK-LRMS และส่งสัญญาณ" className="shadow-none" />}`.

**`WebhookKeysTab.tsx`.** Keep the state, `handleCreate`, `handleCopy`, `handleRevoke` and `closeRevokeModal` verbatim. Apply the class mapping, then:
1. Replace the `kpis` array and the KPI strip with:

```tsx
<KpiGrid>
  <KpiTile label="คีย์ทั้งหมด" count={keys.length} />
  <KpiTile label="ใช้งานได้" count={activeCount} tone="ok" />
  <KpiTile label="ยกเลิกแล้ว" count={keys.length - activeCount} />
</KpiGrid>
```

2. The create `<form>` becomes the body of `<SectionCard title="สร้าง API Key ใหม่" description="เลือกโรงพยาบาลและตั้งชื่อคีย์ — คีย์เต็มจะแสดงเพียงครั้งเดียวหลังสร้าง">`. The `<form onSubmit={handleCreate}>` element and its controls stay:
   - the `select#hcode` with `className={SELECT_CLASS}`;
   - `Input#label`;
   - the submit button uses `bg-brand hover:bg-brand-strong text-white` and drops `style`.

   Its labels: `โรงพยาบาล` / `ชื่อคีย์`. `createError` becomes `<ErrorState variant="banner" className="mt-3 rounded-xl border" message={createError} remedy={DEFAULT_ACTION_REMEDY} />`.
3. The `justCreated` panel becomes `rounded-2xl border border-warn/40 bg-warn-tint p-4`:
   - heading `บันทึก API Key นี้ไว้ทันที — ระบบจะไม่แสดงให้เห็นอีก` in `text-body font-semibold text-warn-text`;
   - the key box `rounded-lg border border-border bg-surface-card`;
   - the "ปิด" button keeps `title="ปิด"` and gains `aria-label="ปิด"`.
4. The keys table becomes `DataTable` with `caption="API Key ทั้งหมด"` and columns:
   - โรงพยาบาล: name + hcode mono
   - ชื่อคีย์
   - รหัสขึ้นต้น: `<code>` mono chip `rounded border border-border bg-surface-muted px-1.5`
   - สร้างเมื่อ: `formatDateTime`
   - ใช้ล่าสุด: `formatDateTime`, or `ยังไม่เคยใช้`
   - สถานะ: `<StatusPill tone={k.isActive ? 'ok' : 'neutral'}>{k.isActive ? 'ใช้งาน' : 'ยกเลิกแล้ว'}</StatusPill>`
   - จัดการ: the existing revoke button for active keys, as `Button variant="outline" size="sm"` with text `ยกเลิก` and `aria-label={\`ยกเลิกคีย์ ${k.keyPrefix}\`}`, `text-danger-text`; `—` for revoked keys
5. The empty state is `<EmptyState illustration="generic" title="ยังไม่มี API Key" description="สร้างคีย์แรกด้านบน แล้วส่งให้ทีม IT ของโรงพยาบาล" className="shadow-none" />`.
6. The revoke dialog content stays (copy and gate verbatim). Apply the class mapping; `revokeError` becomes an `ErrorState` banner.

**`MophAlertsTab.tsx`.** Keep `maskCid`, the state and the handlers verbatim. Apply the class mapping (fixes B4), then:
1. The header block (`Bell` + `h2` + counts + `p`) becomes `<SectionCard title="ผู้รับการแจ้งเตือน MOPH Prompt (ศูนย์กลางจังหวัด)" description={\`จังหวัด ${provinceCode} · ใช้งาน ${activeCount} · ปิด ${monitors.length - activeCount} — ผู้รับเหล่านี้จะได้รับแจ้งเตือน LINE เมื่อมีกรณีเสี่ยงสูง/ฉุกเฉินจากโรงพยาบาลใดๆ ในจังหวัด\`}>` wrapping:
   - the queue notice: `rounded-xl border px-3 py-2 text-label`, `border-warn/40 bg-warn-tint text-warn-text` when `awaitingRecipients > 0`, else `border-border text-ink-muted`; text verbatim;
   - `message`: tone `ok` renders `<InlineNotice tone="ok">`; tone `error` renders `<ErrorState variant="banner" className="rounded-xl border" message={message.text} remedy="ตรวจข้อมูลในฟอร์มแล้วกดบันทึกอีกครั้ง หากยังไม่ได้ แจ้งผู้ดูแลระบบพร้อมข้อความนี้" />`;
   - the add/edit form as a nested `rounded-xl border border-border p-4` block titled `text-label text-ink` (`แก้ไขผู้รับเตือน` / `เพิ่มผู้รับเตือนใหม่`). Field labels are `text-label text-ink`, and the grid is `grid-cols-1 sm:grid-cols-2`.
2. The list becomes `DataTable` with `caption="ผู้รับการแจ้งเตือน"` and columns:
   - ชื่อ
   - CID: `<code className="font-mono">{maskCid(m.cid)}</code>`
   - ตำแหน่ง
   - สถานะ: `StatusPill` ok/neutral, `ใช้งาน` / `ปิดใช้งาน`
   - จัดการ: the existing two buttons; the edit button text stays `แก้ไข`; the delete button gains `aria-label={\`ลบผู้รับเตือน ${m.name}\`}`
3. The empty state is `EmptyState` `ยังไม่มีผู้รับเตือน` / `เพิ่มผู้รับเตือนด้วยฟอร์มด้านบน`.
4. `ErrorState` messages for config/list load get a `remedy`: `ตรวจสอบการเชื่อมต่อ แล้วเปิดแท็บนี้อีกครั้ง`.

**`BmsConfigTab.tsx`.** Apply the class mapping (fixes B3), then:
1. `TUNNEL_STATUS_META` becomes `{ label, tone: StatusTone, Icon }`:
   - ONLINE: `'BMS tunnel ออนไลน์'`, `'ok'`
   - CONFIGURED: `'บันทึก URL แล้ว · ยังไม่ยืนยัน'`, `'warn'`
   - EXPIRED: `'session หมดอายุ'`, `'danger'`
   - NOT_CONFIGURED: `'ยังไม่ตั้งค่า Tunnel URL'`, `'neutral'`

   Render it as `<StatusPill tone={meta.tone} icon={meta.Icon}>{meta.label}</StatusPill>`.
2. `formatLastSync` returns `ซิงค์ล่าสุด —` or `ซิงค์ล่าสุด {date}`.
3. The KPI strip becomes:

```tsx
<KpiGrid>
  <KpiTile label="โรงพยาบาลทั้งหมด" count={hospitals.length} />
  <KpiTile label="มี BMS session" count={connectedCount} tone="ok" />
  <KpiTile label="มี Tunnel URL" count={configuredCount} />
</KpiGrid>
```

4. The tiles grid becomes `grid grid-cols-1 gap-3 @min-[640px]:grid-cols-2`. Each tile is `rounded-xl border border-border bg-surface-card p-4`, and the edit icon button gains `aria-label={\`แก้ไข BMS ของ ${h.name}\`}`.
5. In the dialog, `saveMessage` renders `InlineNotice tone="ok"` when it includes `'สำเร็จ'`, otherwise an `ErrorState` banner with remedy `ตรวจสอบ Tunnel URL แล้วกด บันทึก อีกครั้ง`. This is the same `includes('สำเร็จ')` rule as today.

Requests are unchanged.

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
npx vitest run tests/unit/config tests/unit/components/admin tests/unit/ui/admin-auth-migration.test.ts tests/unit/lib
npx tsc --noEmit && npm run lint
```

Expected: everything PASSES, and the characterization block is unchanged since Step 1.

- [ ] **Step 6: Commit**

```bash
git add src/config/{sync-run-status,presence}.ts src/lib/presence.ts src/components/admin/{SyncOverviewTab,OnlineUsersTab,WebhookKeysTab,MophAlertsTab,BmsConfigTab}.tsx tests/unit/config/{sync-run-status,presence}.test.ts tests/unit/components/admin/ops-tabs.test.tsx tests/unit/ui/admin-auth-migration.test.ts
git commit -m "feat(admin): operations tabs on DataTable with Thai sync vocabulary

Sync overview, online users, webhook keys, MOPH recipients and BMS tunnels
become SectionCards with KpiTiles and DataTables. One sync-run vocabulary
(sync-run-status.ts) replaces two copies of the badge palette; the presence
TTL is quoted from config; status text uses AA -text shades (B3); undefined
--rule/--rule-subtle borders are gone (B4). Requests, typed revoke gate,
one-time key reveal and CID masking are unchanged.

Co-Authored-By: <implementer's harness attribution>"
```

---

### Task 7: `HospitalEditDialog` and the simulation tab — token and Thai pass

**Files:**
- Modify: `src/components/admin/HospitalEditDialog.tsx`, `src/components/admin/SimulationTab.tsx`, `src/components/dashboard/SimulationControl.tsx`, `eslint-rules/design-allowlist.json`, `tests/unit/ui/admin-auth-migration.test.ts`
- Test: `tests/unit/components/admin/hospital-edit-dialog.test.tsx`

**Interfaces:**
- Consumes: `StatusPill`, `Field`, `TONE_CLASSES`, `SELECT_CLASS`, `SYNC_OUTCOME_META`, `SYNC_STEP_TONE`, `formatRelativeTime`, `InlineNotice`, `ErrorState`.
- Produces: unchanged exports (`HospitalEditDialog`, `AdminHospital`, `isHospitalAuthenticityFailure`, `describeAuthenticityFailure`, `SimulationTab`, `SimulationControl`).

- [ ] **Step 1: Characterization tests (green on today's code)**

```tsx
// tests/unit/components/admin/hospital-edit-dialog.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HospitalEditDialog } from '@/components/admin/HospitalEditDialog';
import { adminHospital, renderWithSwr, stubMutations } from '../../../helpers/admin-fixtures';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const MAP = {
  '/api/admin/hospitals/10670/consult-doctors': { doctors: [] },
  '/api/admin/webhooks': { keys: [] },
  '/api/admin/provinces': { provinces: [{ code: '40', name: 'ขอนแก่น' }] },
  '/api/admin/hospitals/10670/data': { counts: {}, totalRows: 42 },
};
const open = (initialSection?: 'sync-log') =>
  renderWithSwr(<HospitalEditDialog hospital={adminHospital()} onClose={() => {}} onSaved={() => {}} initialSection={initialSection} />, MAP);

describe('HospitalEditDialog — characterization (must not change)', () => {
  it('General save PUTs JSON to the hospital URL', async () => {
    const fetchSpy = stubMutations();
    open();
    await userEvent.click(await screen.findByRole('button', { name: /^บันทึก$/ }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/admin/hospitals/10670');
    expect(init).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'application/json' } });
    expect(JSON.parse(String(init!.body))).toMatchObject({ name: 'รพ.ขอนแก่น', isActive: true });
  });
  it('purge stays disabled until the hcode is typed exactly, then DELETEs with confirmHcode', async () => {
    const fetchSpy = stubMutations(() => ({ ok: true, body: { ok: true, counts: {} } }));
    open();
    await userEvent.click(await screen.findByRole('button', { name: /Danger Zone|ลบข้อมูล/ }));
    const purge = await screen.findByRole('button', { name: /ลบข้อมูลของโรงพยาบาลนี้/ });
    expect(purge).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('10670'), '1067');
    expect(purge).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('10670'), '0');
    expect(purge).toBeEnabled();
    await userEvent.click(purge);
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/hospitals/10670/data', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmHcode: '10670' }),
      }),
    );
  });
  it('opening on sync-log fetches the run trail', async () => {
    const { fetcher } = open('sync-log');
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith('/api/admin/hospitals/10670/sync-progress?limit=20'));
  });
});
```

```bash
npx vitest run tests/unit/components/admin/hospital-edit-dialog.test.tsx
```

Expected: **3 PASS on today's code.** Adjust selectors only if needed, never the request assertions. Commit the checkpoint with the trailer.

- [ ] **Step 2: Write the failing tests**

Append:

```tsx
describe('HospitalEditDialog — Thai labels on the tokens', () => {
  it('section tabs and header facts are Thai', async () => {
    open();
    for (const label of ['ข้อมูลทั่วไป', 'แพทย์ที่ปรึกษา', 'การเชื่อมต่อ BMS', 'บันทึกการซิงค์', 'คีย์ Webhook', 'ลบข้อมูล']) {
      expect(await screen.findByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(screen.getByText('ข้อมูลการทำงานของโรงพยาบาล')).toBeInTheDocument();
    expect(screen.getByText('ใช้งาน')).toBeInTheDocument();
    expect(screen.queryByText(/Hospital Operations Profile|Danger Zone|LAST SYNC/)).toBeNull();
  });
});
```

Add `src/components/admin/HospitalEditDialog.tsx`, `src/components/admin/SimulationTab.tsx` and `src/components/dashboard/SimulationControl.tsx` to `MIGRATED`.

Expected: the new test and the guard FAIL.

- [ ] **Step 3: `HospitalEditDialog.tsx` — shared helpers in, local copies out**

1. Delete the local `Field`, `StatusPill`, `toneColor`, `outcomeTone`, `stepTone` and `formatRelative`. Import `Field`, `StatusPill`, `TONE_CLASSES` and `SELECT_CLASS` from `./admin-ui`; `SYNC_OUTCOME_META` and `SYNC_STEP_TONE` from `@/config/sync-run-status`; `formatRelativeTime` from `@/lib/utils`; `InlineNotice`; `ErrorState`.
2. `type Tone` becomes `StatusTone`. In `connectionTone`, `'low'` becomes `'ok'`, `'high'` becomes `'danger'` and `'muted'` becomes `'neutral'`. Every `tone="navy"` becomes `tone="brand"`, `"low"` becomes `"ok"`, `"medium"` becomes `"warn"`, `"high"` becomes `"danger"`, and `"muted"` becomes `"neutral"`.
3. Old `StatusPill` call sites pass `Icon={X} label={…}`; rewrite them as `<StatusPill tone={…} icon={X}>{…}</StatusPill>`. `ProfileMetric`, `HeaderFact`, `SectionIntro` and `StatBox` stay local, restyled with the class mapping; their `tone` props use `TONE_CLASSES[tone].text`.
4. Every `outcomeTone(run.outcome)` badge becomes `<StatusPill tone={SYNC_OUTCOME_META[run.outcome].tone}>{SYNC_OUTCOME_META[run.outcome].labelTh}</StatusPill>`. Every `stepTone(step.status)` dot becomes `<span className={cn('h-2 w-2 rounded-full', TONE_CLASSES[SYNC_STEP_TONE[step.status]].dot)} />`, with step text in `TONE_CLASSES[…].text` for warning/error and `text-ink` otherwise. `formatRelative(x)` becomes `formatRelativeTime(x)`.
5. `message` / `saveMessage` / `error` / `result` boxes:
   - Success strings (`'บันทึกสำเร็จ'`, `บันทึกสำเร็จ — …`, purge `result.ok`) render `<InlineNotice tone="ok">`.
   - Failures render `<ErrorState variant="banner" className="rounded-xl border" message={…} remedy={DEFAULT_ACTION_REMEDY} />`.
   - The branching conditions are unchanged (`message === 'บันทึกสำเร็จ'`, etc.).
6. The Danger Zone wrapper keeps the typed-hcode `Input` and button. Its panel becomes `rounded-2xl border border-danger/40 bg-danger-tint p-4`, and the ready line reads `✓ พร้อมยืนยันการลบ` / `พิมพ์รหัสโรงพยาบาลให้ตรงเพื่อเปิดปุ่ม`.

- [ ] **Step 4: `HospitalEditDialog.tsx` — labels and classes**

1. Apply the spec's `HospitalEditDialog` label table exactly:
   - The `tabs` array `label` / `detail` strings, the header pills and facts, the `Field` labels, `PURGE_TABLE_LABELS`, the key-status words and `REFRESH`.
   - `bmsStatus` strings: `'Session active'` → `'มี BMS session'`, `'URL saved'` → `'บันทึก URL แล้ว'`, `'Not configured'` → `'ยังไม่ตั้งค่า'`.
   - `SectionIntro eyebrow`: `"Destructive operations"` → `"การลบข้อมูล"`; title `"Danger Zone — ลบข้อมูลของโรงพยาบาลนี้"` → `"ลบข้อมูลของโรงพยาบาลนี้"`.
   - `meta={\`Status: ${…}\`}` → `meta={\`สถานะ: ${isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}\`}`.
   - Each `PURGE_TABLE_LABELS` entry renders `label` plus `<span className="ml-1 font-mono text-caption text-ink-muted">{key}</span>`.
2. Apply the class mapping to every remaining line. Specifics:
   - The dialog header `style={{ borderColor: 'var(--rule-strong)' }}` becomes `border-border`.
   - The section-tab buttons drop their `style` and use `cn('relative -mb-px inline-flex min-w-[160px] items-center gap-2 border-b-2 px-3 py-2.5 text-left', active ? 'border-brand font-semibold text-brand' : 'border-transparent text-ink-muted hover:text-brand')`. Their inner spans are `text-label` and `text-caption text-ink-muted`, with no mono. Add `aria-pressed={active}`.
   - The content area `style={{ background: 'var(--surface-cool)' }}` becomes `bg-surface-muted`. Its text uses `text-ink-muted` or darker, never `ink-subtle`.
   - Line 2027 `borderColor: '#fecaca'` and its `COLOR.riskHighTint` background become `border-danger/40 bg-danger-tint text-danger-text` classes. Remove the `COLOR` import if it is now unused.
   - Native selects use `SELECT_CLASS`.
3. Check what is left:

   ```bash
   grep -nE "uppercase|var\(--(ink-navy|rule|accent-navy|surface-cool)|#[0-9a-fA-F]{3,8}\b|COLOR\.risk[A-Za-z]*\b" src/components/admin/HospitalEditDialog.tsx
   ```

   Expected: nothing. A `COLOR` use may stay only where a value feeds a non-CSS consumer; there is none in this file.

- [ ] **Step 5: Simulation tab and control**

**`SimulationTab.tsx`:**
- Drop the `DEV SIMULATION` eyebrow.
- The bordered panel becomes `<SectionCard title="จำลองข้อมูลผู้ป่วย (Dev Simulation)" description="สร้างเหตุการณ์สังเคราะห์ (การรับผู้ป่วย · ANC · referral · partograph) ลงใน local DB ด้วย Gemma-4 เพื่อใช้ทดสอบทุก surface ของแดชบอร์ด — ทุก event type · preset scenario ครบทุกโหมด · และเลือกโรงพยาบาลเองได้">`.
- The warning box becomes `rounded-xl border border-warn/40 bg-warn-tint px-3 py-2 text-label text-warn-text` with an `AlertTriangle` (`text-warn-text`) and the copy verbatim. Then `<SimulationControl />`.
- Remove `COLOR`.

**`SimulationControl.tsx`** (copy stays English, spec D7):
- Apply the class mapping and remove every `uppercase`.
- `style={{ background: '#fffdfa' }}` becomes `className` `bg-surface-page`.
- The header `style={{ borderColor: 'var(--rule-strong)', background: COLOR.riskMedium }}` becomes `border-warn/40 bg-warn-tint`, and its `text-white` / `text-white/85` text becomes `text-warn-text` (B3: white on #D08A00 was ~2.9:1).
- The running chip `bg-white … text-warn-text` stays.

**Allowlist:** remove the `src/components/admin/HospitalEditDialog.tsx` and `src/components/dashboard/SimulationControl.tsx` entries and decrement `maxEntries` by 2.

- [ ] **Step 6: Run the tests to confirm they pass**

```bash
npx vitest run tests/unit/components/admin tests/unit/ui/admin-auth-migration.test.ts tests/unit/eslint tests/unit/config/min-font-size.test.ts
npx tsc --noEmit && npm run lint
npx vitest run --maxWorkers=6
```

Expected: everything PASSES, and the characterization block is unchanged since Step 1.

- [ ] **Step 7: Security diff check (Review Focus 1)**

```bash
BASE=$(git log --format=%H --grep='test(login): characterize' -n1)~1
git diff "$BASE" -- src/components/admin src/components/dashboard/SimulationControl.tsx "src/app/(auth)" "src/app/(provincial)/admin" src/components/profile \
  | grep -E '^[-+][^-+].*(fetch\(|method:|confirm\(|signIn\(|setSessionCookie|setMarketplaceToken|maskCid|maskName|keyPrefix|confirmHcode|Content-Type)' \
  | grep -vE '^\+.*(import|from )'
git diff --stat "$BASE" -- src/middleware.ts src/lib/admin-access.ts src/lib/request-origin.ts src/app/api
```

Expected:
- **First command:** only line *moves* show up (the login's `fetch('/api/auth/hospital-preflight'` and `signIn(` lines appear as identical `-`/`+` pairs, as does the move to `provider-login.ts`). Each `-` line has an identical `+` partner. Investigate any line without a partner before committing.
- **Second command:** no output.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/{HospitalEditDialog,SimulationTab}.tsx src/components/dashboard/SimulationControl.tsx eslint-rules/design-allowlist.json tests/unit/components/admin/hospital-edit-dialog.test.tsx tests/unit/ui/admin-auth-migration.test.ts
git commit -m "feat(admin): hospital dialog and simulation tab on tokens, Thai labels

HospitalEditDialog reads the shared admin vocabulary (StatusPill, Field,
sync-run-status) instead of its own palette and English eyebrows; the
simulation dialog header meets contrast (B3). Two allowlist entries go.
Requests, the typed purge gate and initial-section behaviour are unchanged.

Co-Authored-By: <implementer's harness attribution>"
```

---

### Task 8: E2E layout checks and the synthetic visual run

**Files:**
- Create: `tests/e2e/helpers/session-login.ts`, `tests/e2e/ui-admin-auth.spec.ts`
- Modify: `tests/e2e/ui-foundation.spec.ts` (use the shared login helper)
- Output (gitignored): `e2e-private/ui-admin-auth/*.png`. Committed (PHI-free): `docs/ui-foundation-screenshots/after-{login,about}-{1440,1024,768}.png`

**Interfaces:**
- Consumes: the running app (`PLAYWRIGHT_BASE_URL`) with `E2E_BMS_SESSION_ID`; `attachDebugLogging` / `flushDebugLog`.
- Produces: `loginWithSession(page, session, log)`.

- [ ] **Step 1: Shared login helper**

```ts
// tests/e2e/helpers/session-login.ts
import type { Page } from '@playwright/test';

/** BMS session login through the real form (input#sessionId + submit). */
export async function loginWithSession(page: Page, session: string, log: string[]): Promise<void> {
  await page.goto('/login');
  await page.fill('input#sessionId', session);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
  log.push(`logged in → ${new URL(page.url()).pathname}`);
}
```

In `tests/e2e/ui-foundation.spec.ts`:
1. Delete the local `async function login(page: Page, log: string[]) { … }`.
2. Add `import { loginWithSession } from './helpers/session-login';`.
3. Replace each `await login(page, log);` with `await loginWithSession(page, SESSION!, log);`.
4. Drop `type Page` from the import if it is now unused.

- [ ] **Step 2: The spec**

```ts
// tests/e2e/ui-admin-auth.spec.ts
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { attachDebugLogging, flushDebugLog } from './helpers/debug-log';
import { loginWithSession } from './helpers/session-login';

const TAG = process.env.UI_SNAPSHOT_TAG ?? 'after';
const PUBLIC_OUT = 'docs/ui-foundation-screenshots'; // PHI-free public pages only
const PRIVATE_OUT = 'e2e-private/ui-admin-auth'; // gitignored — admin/profile can show names
const WIDTHS = [1440, 1024, 768] as const;
const SESSION = process.env.E2E_BMS_SESSION_ID;
const ADMIN_TABS = ['จังหวัดหลัก', 'โรงพยาบาล', 'การเชื่อมต่อ BMS', 'คีย์ Webhook', 'สถานะการซิงค์', 'ผู้ใช้ออนไลน์', 'จำลองข้อมูล', 'แจ้งเตือน MOPH (LINE)'];

mkdirSync(PUBLIC_OUT, { recursive: true });
mkdirSync(PRIVATE_OUT, { recursive: true });

async function measure(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    tiny: [...document.querySelectorAll('body *')]
      .filter((el) => (el as HTMLElement).innerText?.trim() && el.children.length === 0)
      .filter((el) => !el.closest('.leaflet-container'))
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 13)
      .map((el) => (el as HTMLElement).innerText.trim().slice(0, 40)),
  }));
}

test.describe('UI admin-auth', () => {
  test('public /login and /about: no overflow, 13px floor, decorative art @admin-auth', async ({ page }, testInfo) => {
    const log = attachDebugLogging(page);
    for (const route of ['/login', '/about']) {
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 900 });
        await page.goto(route);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        const m = await measure(page);
        log.push(`${route} @${w}: ${JSON.stringify(m)}`);
        expect(m.scrollWidth, `${route} @${w} scrolls horizontally`).toBeLessThanOrEqual(m.clientWidth);
        expect(m.tiny, `${route} @${w} text under 13px`).toEqual([]);
        await page.screenshot({ path: `${PUBLIC_OUT}/${TAG}-${route.slice(1)}-${w}.png`, fullPage: true });
      }
    }
    await page.goto('/login');
    await expect(page.locator('img[src*="login-hero"]')).toHaveAttribute('alt', '');
    await page.goto('/about');
    await expect(page.locator('img[src*="about-header"]')).toHaveAttribute('alt', '');
    await flushDebugLog(log, testInfo);
    expect(log.filter((l) => l.includes('PAGEERROR'))).toEqual([]);
  });

  test('/admin every tab and /profile at three widths @admin-auth', async ({ page }, testInfo) => {
    test.skip(!SESSION, 'requires E2E_BMS_SESSION_ID');
    const log = attachDebugLogging(page);
    await loginWithSession(page, SESSION!, log);
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('/admin');
      await expect(page.getByRole('heading', { level: 1, name: 'ตั้งค่าระบบ' })).toBeVisible();
      for (const tab of ADMIN_TABS) {
        await page.getByRole('tab', { name: tab }).click();
        await page.waitForLoadState('networkidle').catch(() => log.push(`/admin ${tab} @${w}: networkidle timeout`));
        const m = await measure(page);
        const sticky = await page.evaluate(
          () => getComputedStyle(document.querySelector('section[aria-label="แผนที่โรงพยาบาล"]')!).position === 'sticky',
        );
        log.push(`/admin ${tab} @${w}: ${JSON.stringify({ ...m, sticky })}`);
        expect(m.scrollWidth, `/admin ${tab} @${w} scrolls horizontally`).toBeLessThanOrEqual(m.clientWidth);
        expect(m.tiny, `/admin ${tab} @${w} text under 13px`).toEqual([]);
        expect(sticky, `/admin @${w} two columns`).toBe(w === 1440);
        await page.screenshot({ path: `${PRIVATE_OUT}/${TAG}-admin-${ADMIN_TABS.indexOf(tab)}-${w}.png`, fullPage: true });
      }
      await page.goto('/profile');
      await expect(page.getByRole('heading', { level: 1, name: 'โปรไฟล์และการแจ้งเตือน' })).toBeVisible();
      const p = await measure(page);
      log.push(`/profile @${w}: ${JSON.stringify(p)}`);
      expect(p.scrollWidth).toBeLessThanOrEqual(p.clientWidth);
      expect(p.tiny).toEqual([]);
      await page.screenshot({ path: `${PRIVATE_OUT}/${TAG}-profile-${w}.png`, fullPage: true });
    }
    await flushDebugLog(log, testInfo);
    expect(log.filter((l) => l.includes('PAGEERROR'))).toEqual([]);
  });
});
```

- [ ] **Step 3: Start the isolated synthetic environment**

Run this from the **main checkout** after the branch is merged: Turbopack breaks on worktree `node_modules` symlinks, and webpack breaks PGlite.

```bash
SCRATCH=$(mktemp -d)
USE_PGLITE=true PGLITE_PATH="$SCRATCH/pglite" SEED_DEMO_DATA=true DEV_AUTH_BYPASS=true NODE_ENV=development \
NEXTAUTH_SECRET=$(openssl rand -hex 32) ENCRYPTION_KEY=$(openssl rand -hex 32) \
NEXTAUTH_URL=http://127.0.0.1:3101 AUTH_TRUST_HOST=true BMS_VALIDATE_URL=http://127.0.0.1:9/x \
DEV_HOSPITAL_TUNNEL_URL= ADMIN_ALLOWED_CIDS= READONLY_LOGIN_HCODES= MOPH_ALERTS_ENABLED=false \
CLINICAL_CHAT_ENABLED=false DEV_SIMULATION_ENABLED=false \
npx next dev -p 3101 --hostname 127.0.0.1 > "$SCRATCH/dev.log" 2>&1 &
echo $! > "$SCRATCH/dev.pid"
until curl -sf -o /dev/null http://127.0.0.1:3101/login; do sleep 2; done; echo READY
```

Expected: `READY`. With `DEV_AUTH_BYPASS=true`, an empty `ADMIN_ALLOWED_CIDS` and `NODE_ENV=development`, the dev session is ADMIN and `isAdminAuthorized` passes (non-production), so `/admin` renders. If it never comes up, read `$SCRATCH/dev.log` before changing anything.

- [ ] **Step 4: Run the E2E**

```bash
E2E_BMS_SESSION_ID=dev-session-ui-check PLAYWRIGHT_BASE_URL=http://127.0.0.1:3101 npx playwright test tests/e2e/ui-admin-auth.spec.ts tests/e2e/ui-foundation.spec.ts
```

Expected: every test PASSES. The debug log prints per route, tab and width:
- `scrollWidth <= clientWidth`;
- `tiny: []`;
- `sticky` true only at 1440.

**Acceptance:**
- `/login`, `/about`, `/profile` and all eight `/admin` tabs at 1440/1024/768 have `scrollWidth == clientWidth` and zero leaf text under 13px;
- `/admin` is two columns only at 1440;
- the `ui-foundation` kiosk test still hides the shell.

If an assertion fails, read the attached debug log (the JSON names the offending text) and fix the owning component. Never loosen an assertion. For a wide admin table, `DataTable` scrolls inside its own container, so a page-level overflow means a non-table element (usually a fixed `min-w-[…]` or an unwrapped flex row).

- [ ] **Step 5: Review the screenshots, then stop the server**

Open the `/login` and `/about` shots in `docs/ui-foundation-screenshots/` and the `/admin` and `/profile` shots in `e2e-private/ui-admin-auth/`. Check:
- the login matches the approved mockup (form left, hero right, calm);
- the about art reads as decoration beside the title;
- admin tabs are Thai, with no stacked-cell table (B1) and the map beside the panel at 1440;
- profile checkboxes are clearly tappable.

```bash
kill "$(cat "$SCRATCH/dev.pid")"; rm -rf "$SCRATCH"
git status --short e2e-private   # expect nothing (gitignored)
```

- [ ] **Step 6: Final verification**

```bash
npx vitest run --maxWorkers=6
npx tsc --noEmit
npm run lint
npm run build
node -e "const a=require('./eslint-rules/design-allowlist.json');console.log(Object.keys(a.files).length, a.maxEntries)"
```

Expected: everything is green. The two printed numbers are equal, and both are 4 lower than before Task 3 (10 10 if no sibling sub-project merged allowlist changes in between).

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/helpers/session-login.ts tests/e2e/ui-admin-auth.spec.ts tests/e2e/ui-foundation.spec.ts docs/ui-foundation-screenshots/after-login-*.png docs/ui-foundation-screenshots/after-about-*.png
git commit -m "test(e2e): admin/auth layout checks across widths

Synthetic run at 1440/1024/768: /login and /about (public, screenshots
committed), /profile and all eight /admin tabs (screenshots in gitignored
e2e-private/) — no horizontal scroll, no text under 13px, admin two columns
only when the content box allows. The session login helper is shared with
ui-foundation.spec.ts.

Co-Authored-By: <implementer's harness attribution>"
```

**Deploy is not part of this plan.** It needs explicit user approval. Use the standard pattern: rollback tag `kk-lrms-app:rollback-<date>-pre-ui-admin-auth`, a `BUILD_SHA` build, a health check, and a 3-minute sync-log watch.
