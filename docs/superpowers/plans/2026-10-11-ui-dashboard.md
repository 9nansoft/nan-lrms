# Provincial Dashboard (`/`) Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the 1,134-line provincial dashboard into a thin composition of focused, Thai-first sections on the direction-C foundation. KPI tiles must never cramp at sidebar widths, numbers must never wrap, and the kiosk must not change.

**Architecture:**
- **Data:** `useProvinceDashboard` owns all wiring (SWR, debounced SSE, browser poll, onboarding hooks, derived counts).
- **Sections:** each card on `/` is its own component under `src/components/dashboard/province/`, built from foundation blocks (`PageHeader`, `SectionCard`, `KpiTile`, `KpiGrid`, `EmptyState`, `RiskChip`).
- **Kiosk:** the kiosk JSX moves verbatim into `KioskDashboard` behind a characterization test.
- **Shared copy:** alert and vital tooltip copy lives in definition modules that kiosk and normal mode both read.
- **Page:** `page.tsx` only composes.

**Tech Stack:** Next.js 16 App Router (package.json `^16.2.4`), React 19, Tailwind CSS 4 (`@theme`, built-in container queries), shadcn/ui + Base UI tooltip/dialog, SWR, lucide-react, Leaflet, Vitest + RTL (jsdom), Playwright, ESLint 9 flat config.

**Spec:** `docs/superpowers/specs/2026-10-11-ui-dashboard-design.md` (committed together with this plan). Foundation spec and plan: `docs/superpowers/specs/2026-10-11-ui-foundation-design.md`, `docs/superpowers/plans/2026-10-11-ui-foundation.md`. Executors read the dashboard spec first.

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
- `html { font-size: 18px }` stays (rem utilities across the app depend on it). The new type scale is in **px**. **Compute widths with an 18px rem:** `px-4` = 18px, `px-6` = 27px, `p-5` = 22.5px, `gap-3` = 13.5px, and Tailwind `md:` is 864px.
- KPI numbers come from server aggregates, never `rows.length` (count-provenance rule).
- All user-facing messages are in Thai and follow **what happened · since when · what to do**.
- Kiosk mode keeps working: the shell must render the sidebar as `<aside>` and the top bar as `<header className="sticky …">`. The existing `html.kiosk-mode aside` / `header.sticky` rules hide them.
- Gates per commit: `npx vitest run <touched tests>`, then `npx tsc --noEmit` and `npm run lint` green. Run the full `npx vitest run --maxWorkers=6` at the end of tasks 4, 8, 13 and 14.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Sub-project 2 constraints:**
- **No behaviour or data changes.** Keep the same SWR keys and intervals, the same SSE debounce (`SSE_REFRESH_DEBOUNCE_MS`), the same browser-poll and onboarding hooks, the same hrefs and the same `data-testid`s.
- **Kiosk is frozen.** From Task 4 on, `tests/unit/components/dashboard/province/KioskDashboard.test.tsx` must stay green after every task. Never edit a `variant === 'kiosk'` / `isKiosk` branch except to move it.
- **Thai-first labels.** Keep the standard abbreviations ANC, CPD, HR3, SLA, GA, AN, HN, HOSxP, Apgar. Thresholds quoted in copy come from config (`ANC_OPS`, `REFERRAL_SLA`, `ANC_LAST_VISIT_MAX_AGE_DAYS`, `RISK_LEVELS`), never literals.
- **No ad-hoc design values in new code.** No raw palette classes and no hex in `className` / `style`; use token classes, `COLOR` or `withAlpha(COLOR.x, a)`. `eslint-rules/design-allowlist.json` may only shrink: Task 10 removes `ProvinceMapLeaflet.tsx` and Task 13 removes `src/app/(provincial)/page.tsx`.
- **PDPA.** Patient names render only through the existing `maskName`. Authenticated screenshots go to the gitignored `e2e-private/` and are never committed.
- **Git.** Work on `main` locally and never push.

### Spec deviations (decided while planning, with reasons)

The design-level deviations D1–D12 are in the spec. These are the plan-level ones:

1. **Section components land before the page swap.** Tasks 5–12 build and test each section in isolation; Task 13 replaces `page.tsx` in one reviewed diff. Until Task 13, the old inline normal-mode code and the new sections coexist. The kiosk is the exception: Task 4 wires it immediately, because it is a pure move and its test protects every later task.
2. **`KpiTile` padding drops from `px-5` to `px-4`, and `KpiGrid` uses a 150px minimum.** At 1440px the left column inside a card is about 671px, and four tiles need 640px. With 160px and `px-5` the vitals row fell to 3 + 1.
3. **The overview panel is not a `SectionCard`.** Its body must be a flex column that fills a fixed sticky height so the map can grow. It uses the same surface vocabulary (`rounded-2xl bg-surface-card shadow-soft`, `h2.text-title.text-brand`).
4. **The `ProvinceMapLeaflet.tsx` allowlist entry is removed** by moving the kiosk hex literals into `src/config/map-palette.ts`. The lint guard covers only `src/app/**` and `src/components/**`, and config palettes are its sanctioned home.
5. **One copy fix in moved code.** `describeHosxpSyncHelp` returns the "check the server log" help for an `ERROR` caused only by `lastError`. Before, that case fell through to "ระบบกำลังเริ่มการเชื่อมต่อ HOSxP", which is false. It is pinned in Task 1.

## Review Focus

1. **Kiosk identical:** `KioskDashboard.test.tsx` (Task 4) must stay green through Tasks 5–14 untouched. A diff to that test file after Task 4 is a red flag.
2. **Count provenance:** every `KpiTile` `count` traces to `/api/dashboard` aggregates (`summary`, `alerts`, `trends`, `continuum`, `stageKPIs`). Task 13 includes the grep, and the page test pins `totalActive` over `patients.length`.
3. **No interactive nesting:** `KpiTile` with `href` + `hint` renders the hint button as a sibling of a stretched link (Task 2). `DataTable` rows need `rowLabel` (Task 3).
4. **Sticky overview under the sticky header:** `--app-header-h` from `useCssHeightVar` (Task 11) is checked in E2E after scrolling (Task 14).
5. **Thai copy accuracy:** every label says what the number counts, with thresholds from config. Delivered-row labels match the `getStageKPIs` SQL (Task 9); alert copy matches `REFERRAL_SLA` / `ANC_OPS` (Task 6).

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/hosxp-sync-status.ts` | HOSxP sync status, detail, help, report (pure) | 1 |
| `src/config/sse-status.ts` | SSE state → kiosk stream text, Thai label, tone | 1 |
| `src/components/shared/{KpiTile,KpiGrid,HintButton,PageHeader}.tsx` | Tile without interactive nesting, responsive grid, hint button, header freshness label | 2 |
| `src/components/shared/DataTable.tsx` | Own scroll container, honest sticky header, Enter/Space rows with required `rowLabel` | 3 |
| `tests/helpers/dashboard-fixtures.ts` | Shared `/api/dashboard` fixtures | 4 |
| `src/components/dashboard/province/KioskDashboard.tsx` | Kiosk layout (verbatim move) | 4 |
| `src/hooks/useProvinceDashboard.ts` | All dashboard data wiring + derived counts | 5 |
| `src/components/dashboard/province/{alert-definitions.tsx,AlertsSection.tsx}`, `src/components/dashboard/AlertBar.tsx` | Alert defs shared by kiosk ribbon + Thai section | 6 |
| `src/components/dashboard/province/{metric-hints.tsx,LaborVitalsSection.tsx,ContinuumSection.tsx}`, `src/components/dashboard/{ProvinceVitalsStrip,shared}.tsx` | Labour vitals + continuum; shared hint copy; fluid `BarStrip` | 7 |
| `src/config/risk-levels.ts`, `src/components/dashboard/HighRiskPatientList.tsx`, `src/components/dashboard/province/HighRiskSection.tsx` | `shortLabelTh`; light-mode restyle; section wrapper | 8 |
| `src/components/dashboard/{StageKPICards,ShiftSummary}.tsx`, `src/components/dashboard/province/CareStageSection.tsx` | Care stages + shift summary | 9 |
| `src/config/design-tokens.ts` (`withAlpha`), `src/config/map-palette.ts`, `src/components/dashboard/{ProvinceMapLeaflet,HospitalTable}.tsx` | Map tokens; Thai hospital sort bar | 10 |
| `src/hooks/useCssHeightVar.ts`, `src/components/layout/AppHeader.tsx`, `src/components/dashboard/province/{OverviewModeToggle,ProvinceOverviewPanel,ProvinceOverviewDialog}.tsx` | Sticky overview panel + dialog | 11 |
| `src/components/dashboard/province/{DashboardHeaderActions,HosxpSyncDialog,OnboardingWebhookAlert}.tsx` | Header actions, diagnostics dialog, webhook alert | 12 |
| `src/app/(provincial)/page.tsx`, `eslint-rules/design-allowlist.json` | Thin composition; allowlist shrink | 13 |
| `tests/e2e/ui-foundation.spec.ts` | Dashboard layout E2E + synthetic visual run | 14 |

---

### Task 1: Pure HOSxP-sync and SSE status helpers

**Files:**
- Create: `src/lib/hosxp-sync-status.ts`, `src/config/sse-status.ts`
- Test: `tests/unit/lib/hosxp-sync-status.test.ts`, `tests/unit/config/sse-status.test.ts`

**Interfaces:**
- Consumes: `OnboardHosxpSyncState` (`@/hooks/useOnboardHosxpSync`, type-only), `SseConnectionState` (`@/hooks/useSSE`, type-only).
- Produces:
  - `type HosxpSyncStatus = 'ERROR' | 'QUERYING' | 'RUNNING' | 'SKIPPED' | 'STARTING'`
  - `HOSXP_SYNC_STATUS_TH: Record<HosxpSyncStatus, string>`
  - `hosxpSyncTone(status): 'danger' | 'ok' | 'neutral'`
  - `deriveHosxpSyncStatus(state)`, `describeHosxpSyncDetail(state, status)`, `describeHosxpSyncHelp(state, status)`
  - `formatSyncTime(value?)`, `formatCounts(counts?)`, `buildHosxpSyncReport(state, status, help)`
  - `SSE_STATUS_META: Record<SseConnectionState, { stream: string; labelTh: string; tone: 'ok' | 'neutral' | 'warn' }>`

The page is **not** rewired here; Task 13 deletes its inline copies (lines 46–145 and 399–441 of today's `page.tsx`).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/lib/hosxp-sync-status.test.ts
import { describe, it, expect } from 'vitest';
import {
  HOSXP_SYNC_STATUS_TH,
  buildHosxpSyncReport,
  deriveHosxpSyncStatus,
  describeHosxpSyncDetail,
  describeHosxpSyncHelp,
  formatCounts,
  formatSyncTime,
  hosxpSyncTone,
  type HosxpSyncStatus,
} from '@/lib/hosxp-sync-status';
import type { OnboardHosxpSyncState } from '@/hooks/useOnboardHosxpSync';

const s = (o: Partial<OnboardHosxpSyncState> = {}): OnboardHosxpSyncState => ({ ran: true, ...o });

describe('deriveHosxpSyncStatus', () => {
  it.each<[OnboardHosxpSyncState | null, HosxpSyncStatus]>([
    [null, 'STARTING'],
    [s({ error: 'missing_bms_session' }), 'ERROR'],
    [s({ lastError: 'timeout' }), 'ERROR'],
    [s({ phase: 'failed' }), 'ERROR'],
    [s({ phase: 'querying_hosxp', error: 'x' }), 'ERROR'],
    [s({ phase: 'querying_hosxp' }), 'QUERYING'],
    [s({ started: true }), 'RUNNING'],
    [s({ alreadyRunning: true }), 'RUNNING'],
    [s({ ran: false }), 'SKIPPED'],
    [s(), 'STARTING'],
  ])('%o → %s', (state, expected) => {
    expect(deriveHosxpSyncStatus(state)).toBe(expected);
  });
});

describe('describeHosxpSyncDetail', () => {
  it('prefers the error, then lastError', () => {
    expect(describeHosxpSyncDetail(s({ error: 'e1', lastError: 'e2' }), 'ERROR')).toBe('e1');
    expect(describeHosxpSyncDetail(s({ lastError: 'e2' }), 'ERROR')).toBe('e2');
  });
  it('summarises cycles while running', () => {
    expect(describeHosxpSyncDetail(s({ successCount: 2, cycleCount: 3 }), 'RUNNING')).toBe(
      'scheduled · 2/3 cycles',
    );
  });
  it('names a skipped or starting loop', () => {
    expect(describeHosxpSyncDetail(s({ ran: false }), 'SKIPPED')).toBe('NO BMS SESSION');
    expect(describeHosxpSyncDetail(null, 'STARTING')).toBe('CONNECTING');
  });
});

describe('describeHosxpSyncHelp', () => {
  it.each([
    ['hospital_not_registered', 'โรงพยาบาลนี้ยังไม่ได้เปิดใช้งานในทะเบียน KK-LRMS'],
    ['missing_bms_session', 'ยังไม่ได้รับ BMS session จาก HOSxP launcher'],
    ['invalid_bms_url', 'BMS URL จาก session ไม่ถูกต้อง'],
    ['other', 'ตรวจสอบรายละเอียดจาก server log หากข้อความด้านล่างยังไม่พอ'],
  ])('error %s → actionable Thai help', (error, help) => {
    expect(describeHosxpSyncHelp(s({ error }), 'ERROR')).toBe(help);
  });
  it('a lastError-only ERROR points at the log, never "starting" (copy fix)', () => {
    expect(describeHosxpSyncHelp(s({ lastError: 'timeout' }), 'ERROR')).toBe(
      'ตรวจสอบรายละเอียดจาก server log หากข้อความด้านล่างยังไม่พอ',
    );
  });
  it('running and starting', () => {
    expect(describeHosxpSyncHelp(s({ started: true }), 'RUNNING')).toBe('ระบบกำลังดึงข้อมูลจาก HOSxP เป็นรอบอัตโนมัติ');
    expect(describeHosxpSyncHelp(null, 'STARTING')).toBe('ระบบกำลังเริ่มการเชื่อมต่อ HOSxP');
  });
});

describe('tone and Thai labels', () => {
  it('maps status to a tone', () => {
    expect(hosxpSyncTone('ERROR')).toBe('danger');
    expect(hosxpSyncTone('RUNNING')).toBe('ok');
    expect(hosxpSyncTone('QUERYING')).toBe('ok');
    expect(hosxpSyncTone('SKIPPED')).toBe('neutral');
  });
  it('every status has a Thai label', () => {
    for (const k of ['ERROR', 'QUERYING', 'RUNNING', 'SKIPPED', 'STARTING'] as const) {
      expect(HOSXP_SYNC_STATUS_TH[k]).toMatch(/[฀-๿]/);
    }
  });
});

describe('formatting and report', () => {
  it('formatSyncTime handles empty, unparseable and Bangkok time', () => {
    expect(formatSyncTime(null)).toBe('none yet');
    expect(formatSyncTime('garbage')).toBe('garbage');
    expect(formatSyncTime('2026-10-11T03:04:05Z')).toContain('10:04:05');
  });
  it('formatCounts joins key=value pairs', () => {
    expect(formatCounts({ rows: 4, upserted: 2 })).toBe('rows=4, upserted=2');
    expect(formatCounts(undefined)).toBe('');
  });
  it('report carries status, errors and the step log', () => {
    const state = s({
      error: 'boom',
      lastSteps: [
        { at: '2026-10-11T03:00:00Z', cycle: 3, name: 'fetch_ipt', status: 'success', message: 'ok', counts: { rows: 4 } },
      ],
    });
    const report = buildHosxpSyncReport(state, 'ERROR', 'help');
    expect(report).toContain('KK-LRMS HOSxP Sync Report');
    expect(report).toContain('STATUS: ERROR');
    expect(report).toContain('- error=boom');
    expect(report).toContain('- [2026-10-11T03:00:00Z] cycle=3 SUCCESS fetch_ipt: ok (rows=4)');
    expect(buildHosxpSyncReport(null, 'STARTING', 'h')).toContain('- no step log recorded yet');
  });
});
```

```ts
// tests/unit/config/sse-status.test.ts
import { describe, it, expect } from 'vitest';
import { SSE_STATUS_META } from '@/config/sse-status';

describe('SSE_STATUS_META', () => {
  it('keeps the kiosk stream strings byte-identical (kiosk is frozen)', () => {
    expect(SSE_STATUS_META.connected.stream).toBe('SSE · STREAM OK');
    expect(SSE_STATUS_META.connecting.stream).toBe('SSE · CONNECTING');
    expect(SSE_STATUS_META.reconnecting.stream).toBe('SSE · RECONNECTING');
  });
  it('gives normal mode a Thai label and a tone', () => {
    expect(SSE_STATUS_META.connected).toMatchObject({ labelTh: 'อัปเดตสด', tone: 'ok' });
    expect(SSE_STATUS_META.connecting.tone).toBe('neutral');
    expect(SSE_STATUS_META.reconnecting.tone).toBe('warn');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/unit/lib/hosxp-sync-status.test.ts tests/unit/config/sse-status.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/hosxp-sync-status"` (and `@/config/sse-status`).

- [ ] **Step 3: Implement**

```ts
// src/lib/hosxp-sync-status.ts
// Pure presentation helpers for the browser-driven HOSxP sync shown on `/`.
// Moved out of src/app/(provincial)/page.tsx (UI sub-project 2) so the header
// chip, the diagnostic dialog and the copyable report cannot disagree. The
// English status codes stay in the report: IT tickets quote them.
import type { OnboardHosxpSyncState } from '@/hooks/useOnboardHosxpSync';

export type HosxpSyncStatus = 'ERROR' | 'QUERYING' | 'RUNNING' | 'SKIPPED' | 'STARTING';

export const HOSXP_SYNC_STATUS_TH: Record<HosxpSyncStatus, string> = {
  ERROR: 'ผิดพลาด',
  QUERYING: 'กำลังดึงข้อมูล',
  RUNNING: 'ทำงานอยู่',
  SKIPPED: 'ไม่ได้เริ่ม',
  STARTING: 'กำลังเริ่ม',
};

export type HosxpSyncTone = 'danger' | 'ok' | 'neutral';

export function hosxpSyncTone(status: HosxpSyncStatus): HosxpSyncTone {
  if (status === 'ERROR') return 'danger';
  if (status === 'RUNNING' || status === 'QUERYING') return 'ok';
  return 'neutral';
}

export function deriveHosxpSyncStatus(state: OnboardHosxpSyncState | null): HosxpSyncStatus {
  if (state?.error || state?.lastError || state?.phase === 'failed') return 'ERROR';
  if (state?.phase === 'querying_hosxp') return 'QUERYING';
  if (state?.started || state?.alreadyRunning) return 'RUNNING';
  if (state?.ran === false) return 'SKIPPED';
  return 'STARTING';
}

export function describeHosxpSyncDetail(state: OnboardHosxpSyncState | null, status: HosxpSyncStatus): string {
  if (state?.error) return state.error;
  if (state?.lastError) return state.lastError;
  if (status === 'RUNNING' || status === 'QUERYING') {
    return `${state?.phase ?? 'scheduled'} · ${state?.successCount ?? 0}/${state?.cycleCount ?? 0} cycles`;
  }
  if (status === 'SKIPPED') return 'NO BMS SESSION';
  return 'CONNECTING';
}

const HELP_BY_ERROR: Record<string, string> = {
  hospital_not_registered: 'โรงพยาบาลนี้ยังไม่ได้เปิดใช้งานในทะเบียน KK-LRMS',
  missing_bms_session: 'ยังไม่ได้รับ BMS session จาก HOSxP launcher',
  invalid_bms_url: 'BMS URL จาก session ไม่ถูกต้อง',
};
const HELP_CHECK_LOG = 'ตรวจสอบรายละเอียดจาก server log หากข้อความด้านล่างยังไม่พอ';

export function describeHosxpSyncHelp(state: OnboardHosxpSyncState | null, status: HosxpSyncStatus): string {
  if (state?.error) return HELP_BY_ERROR[state.error] ?? HELP_CHECK_LOG;
  if (status === 'ERROR') return HELP_CHECK_LOG;
  if (status === 'RUNNING' || status === 'QUERYING') return 'ระบบกำลังดึงข้อมูลจาก HOSxP เป็นรอบอัตโนมัติ';
  return 'ระบบกำลังเริ่มการเชื่อมต่อ HOSxP';
}

export function formatSyncTime(value?: string | null): string {
  if (!value) return 'none yet';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatCounts(counts?: Record<string, number>): string {
  if (!counts) return '';
  return Object.entries(counts)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}

export function buildHosxpSyncReport(
  state: OnboardHosxpSyncState | null,
  status: string,
  help: string,
): string {
  const lines = [
    'KK-LRMS HOSxP Sync Report',
    `Generated: ${new Date().toISOString()}`,
    '',
    `STATUS: ${status}`,
    `PHASE: ${state?.phase ?? 'unknown'}`,
    `HCODE: ${state?.hcode ?? 'unknown'}`,
    `CONNECTION: ${state?.connectionStatus ?? 'unknown'}`,
    `DB TYPE: ${state?.databaseType ?? 'not detected'}`,
    `HELP: ${help}`,
    `LAST CYCLE: ${state?.lastRunAt ?? 'none'}`,
    `LAST SUCCESS: ${state?.lastSuccessAt ?? 'none'}`,
    `LAST ERROR: ${state?.lastErrorAt ?? 'none'} ${state?.lastError ?? ''}`.trim(),
    `NEXT CYCLE: ${state?.nextRunAt ?? 'none'}`,
    `HOSPITAL SYNC: ${state?.hospitalLastSyncAt ?? 'none'}`,
    `CYCLES: ${state?.successCount ?? 0} successful / ${state?.cycleCount ?? 0} attempted`,
    '',
    'Counters:',
    `- IPT local: active=${state?.activePatients ?? 0}, cached=${state?.cachedPatients ?? 0}, latest=${state?.latestPatientSyncedAt ?? 'none'}`,
    `- IPT source: read=${state?.lastStats?.activePatientsRead ?? 0}, synced=${state?.lastStats?.activePatientsSynced ?? 0}`,
    `- ANC local: pregnancies=${state?.activeAncJourneys ?? 0}, latest=${state?.latestAncSyncedAt ?? 'none'}`,
    `- ANC source: read=${state?.lastStats?.anc.sourcePatientsRead ?? 0}, mapped=${state?.lastStats?.anc.sourcePatientsMapped ?? 0}, synced=${state?.lastStats?.anc.patientsSynced ?? 0}`,
    `- ANC visits: read=${state?.lastStats?.anc.servicesRead ?? 0}, mapped=${state?.lastStats?.anc.servicesMapped ?? 0}`,
    `- ANC risk: risk=${state?.lastStats?.anc.risksMapped ?? 0}, classifying=${state?.lastStats?.anc.classifyingMapped ?? 0}`,
    `- Partograph: read=${state?.lastStats?.partographRowsRead ?? 0}, upserted=${state?.lastStats?.partographRowsUpserted ?? 0}`,
    `- Referrals: active=${state?.activeReferrals ?? 0}, outgoing=${state?.outgoingReferrals ?? 0}, incoming=${state?.incomingReferrals ?? 0}`,
  ];

  if (state?.error || state?.detail || state?.lastError || state?.lastStats?.anc.error) {
    lines.push(
      '',
      'Errors:',
      `- error=${state?.error ?? 'none'}`,
      `- detail=${state?.detail ?? 'none'}`,
      `- lastError=${state?.lastError ?? 'none'}`,
      `- ancError=${state?.lastStats?.anc.error ?? 'none'}`,
      `- ancSkipped=${state?.lastStats?.anc.skippedReason ?? 'none'}`,
    );
  }

  lines.push('', 'Step log:');
  const steps = state?.lastSteps ?? [];
  if (steps.length === 0) {
    lines.push('- no step log recorded yet');
  } else {
    for (const step of steps) {
      const counts = formatCounts(step.counts);
      lines.push(
        `- [${step.at}] cycle=${step.cycle} ${step.status.toUpperCase()} ${step.name}: ${step.message}${counts ? ` (${counts})` : ''}${step.detail ? ` | ${step.detail}` : ''}`,
      );
    }
  }

  return lines.join('\n');
}
```

```ts
// src/config/sse-status.ts
// Live SSE health → what each dashboard mode shows. `stream` is the frozen
// kiosk footer text; `labelTh` + `tone` drive the normal-mode header chip.
import type { SseConnectionState } from '@/hooks/useSSE';

export interface SseStatusMeta {
  stream: string;
  labelTh: string;
  tone: 'ok' | 'neutral' | 'warn';
}

export const SSE_STATUS_META: Record<SseConnectionState, SseStatusMeta> = {
  connected: { stream: 'SSE · STREAM OK', labelTh: 'อัปเดตสด', tone: 'ok' },
  connecting: { stream: 'SSE · CONNECTING', labelTh: 'กำลังเชื่อมต่อข้อมูลสด…', tone: 'neutral' },
  reconnecting: {
    stream: 'SSE · RECONNECTING',
    labelTh: 'ขาดการเชื่อมต่อ กำลังเชื่อมใหม่…',
    tone: 'warn',
  },
};
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/unit/lib/hosxp-sync-status.test.ts tests/unit/config/sse-status.test.ts`
Expected: PASS (every `it.each` row).

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add src/lib/hosxp-sync-status.ts src/config/sse-status.ts tests/unit/lib/hosxp-sync-status.test.ts tests/unit/config/sse-status.test.ts
git commit -m "refactor(dashboard): extract HOSxP-sync and SSE status helpers from page.tsx

Pure, tested functions so the header chip, diagnostic dialog and copyable
report share one derivation. Help text for a lastError-only ERROR now points
at the log instead of claiming the connection is still starting.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `KpiTile` without interactive nesting, `KpiGrid`, `HintButton`, `PageHeader` label

**Files:**
- Create: `src/components/shared/KpiGrid.tsx`, `src/components/shared/HintButton.tsx`
- Modify: `src/components/shared/KpiTile.tsx` (full replacement), `src/components/shared/PageHeader.tsx`
- Test: `tests/unit/components/shared/page-blocks.test.tsx` (append)

**Interfaces:**
- Consumes: `KpiTip` (`{ title; body; trigger: ReactElement; children; side? }`), `FreshnessBadge` (`label?` prop already exists).
- Produces:
  - `KpiTile({ label, count, unit?, tone?: 'default'|'high'|'warn'|'ok', href?, hint?: { title; body }, sub?: ReactNode, testId?, className? })`. The root `div` carries `data-testid`; the value carries `data-kpi-value`; the label carries `data-kpi-label`.
  - `KpiGrid({ min?: 'sm'|'md', className?, children })`, where sm = `minmax(150px,1fr)` and md = `minmax(200px,1fr)`.
  - `HintButton({ label, title, body, className? })`, a button named `คำอธิบาย: {label}`.
  - `PageHeader` `freshness?: { lastSyncAt; syncStatus?; label? }`.

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/components/shared/page-blocks.test.tsx`; add `within` to the `@testing-library/react` import)

```tsx
import { KpiGrid } from '@/components/shared/KpiGrid';

describe('KpiTile — sub-project 2', () => {
  it('href + hint: the hint button is a sibling of the link, never inside it', () => {
    render(
      <KpiTile label="เสี่ยงสูง" count={2} href="/x" hint={{ title: 'ความหมาย', body: 'นับจาก…' }} />,
    );
    const link = screen.getByRole('link', { name: 'เสี่ยงสูง 2' });
    const hint = screen.getByRole('button', { name: 'คำอธิบาย: เสี่ยงสูง' });
    expect(link.contains(hint)).toBe(false);
    expect(within(link).queryByRole('button')).toBeNull();
  });
  it('the number never wraps and is tagged for the E2E one-line check', () => {
    render(<KpiTile label="รอคลอด" count={1169} />);
    const value = screen.getByText('1,169');
    expect(value.className).toContain('whitespace-nowrap');
    expect(value).toHaveAttribute('data-kpi-value');
    expect(screen.getByText('รอคลอด')).toHaveAttribute('data-kpi-label');
  });
  it('renders a sub line, a test id on the root, and the ok tone', () => {
    render(<KpiTile label="ส่งต่อ" count={0} tone="ok" sub="ไม่มีส่งต่อค้างเกิน SLA" testId="t" />);
    const root = screen.getByTestId('t');
    expect(root.className).toContain('bg-ok-tint');
    expect(within(root).getByText('ไม่มีส่งต่อค้างเกิน SLA')).toBeInTheDocument();
  });
});

describe('KpiGrid', () => {
  it('uses auto-fit columns with a minimum tile width', () => {
    const { container } = render(
      <KpiGrid>
        <span>a</span>
      </KpiGrid>,
    );
    expect((container.firstChild as HTMLElement).className).toContain('minmax(150px,1fr)');
  });
});

describe('PageHeader freshness label', () => {
  it('passes a custom label to the freshness badge', () => {
    render(
      <PageHeader
        title="ภาพรวมจังหวัดขอนแก่น"
        freshness={{ lastSyncAt: new Date().toISOString(), label: 'ข้อมูลหน้านี้ ณ' }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('ข้อมูลหน้านี้ ณ');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/components/shared/page-blocks.test.tsx`
Expected: FAIL. `@/components/shared/KpiGrid` does not resolve; once it exists, the sibling test fails because today the `KpiTip` trigger sits inside the `<Link>`.

- [ ] **Step 3: Implement**

```tsx
// src/components/shared/HintButton.tsx
// The one "what does this number mean?" affordance: an info button whose
// tooltip (KpiTip) explains, in Thai, exactly what is counted. It is a real
// <button>, so it must never sit inside a link — KpiTile renders it beside
// its stretched link.
'use client';

import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { KpiTip } from '@/components/shared/KpiTip';
import { cn } from '@/lib/utils';

export interface HintButtonProps {
  /** What the hint explains; the button is named "คำอธิบาย: {label}". */
  label: string;
  title: string;
  body: ReactNode;
  className?: string;
}

export function HintButton({ label, title, body, className }: HintButtonProps) {
  return (
    <KpiTip
      title={title}
      body={body}
      trigger={
        <button
          type="button"
          aria-label={`คำอธิบาย: ${label}`}
          className={cn(
            'relative z-10 -m-1 shrink-0 cursor-help rounded-full p-1 opacity-80 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-brand',
            className,
          )}
        />
      }
    >
      <Info aria-hidden="true" className="h-4 w-4" />
    </KpiTip>
  );
}
```

```tsx
// src/components/shared/KpiGrid.tsx
// Responsive KPI tile grid: as many columns as fit at the minimum width, so a
// tile never shrinks until Thai labels break one word per line (2026-10-11
// visual review at 1024px with the 232px sidebar). Widths assume the 18px
// root: a 150px tile leaves ~114px for a text-kpi number with px-4 padding.
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const MIN = {
  sm: 'grid-cols-[repeat(auto-fit,minmax(150px,1fr))]',
  md: 'grid-cols-[repeat(auto-fit,minmax(200px,1fr))]',
} as const;

export function KpiGrid({
  min = 'sm',
  className,
  children,
}: {
  min?: keyof typeof MIN;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn('grid gap-3', MIN[min], className)}>{children}</div>;
}
```

```tsx
// src/components/shared/KpiTile.tsx
// `count` must be a server aggregate (pagination.total / counts / summary),
// never rows.length of a row-limited fetch — the count-provenance rule.
//
// With `href` the tile carries a stretched link (an absolute overlay) instead
// of wrapping its content, so the optional hint button is a sibling of the
// link — never an interactive element nested inside one.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { HintButton } from '@/components/shared/HintButton';
import { cn } from '@/lib/utils';

export type KpiTone = 'default' | 'high' | 'warn' | 'ok';

const TONE: Record<KpiTone, { box: string; label: string; value: string; sub: string }> = {
  default: { box: 'bg-surface-card shadow-soft', label: 'text-ink-muted', value: 'text-brand', sub: 'text-ink-muted' },
  high: { box: 'bg-danger text-white', label: 'text-white', value: 'text-white', sub: 'text-white' },
  warn: { box: 'bg-warn-tint border border-warn/40', label: 'text-warn-text', value: 'text-warn-text', sub: 'text-warn-text' },
  ok: { box: 'bg-ok-tint border border-ok/40', label: 'text-ok-text', value: 'text-ok-text', sub: 'text-ok-text' },
};

export interface KpiTileProps {
  label: string;
  count: number;
  unit?: string;
  tone?: KpiTone;
  href?: string;
  hint?: { title: string; body: ReactNode };
  /** Secondary line under the number, e.g. "รับใหม่ 3 รายใน 24 ชม.". */
  sub?: ReactNode;
  testId?: string;
  className?: string;
}

export function KpiTile({ label, count, unit, tone = 'default', href, hint, sub, testId, className }: KpiTileProps) {
  const t = TONE[tone];
  const shown = Number.isFinite(count) ? count.toLocaleString('en-US') : '—';
  return (
    <div
      data-testid={testId}
      className={cn(
        'relative flex min-w-0 flex-col gap-1 rounded-2xl px-4 py-4',
        t.box,
        href && 'transition-transform hover:-translate-y-0.5',
        className,
      )}
    >
      {href && (
        <Link
          href={href}
          aria-label={`${label} ${shown}`}
          className="absolute inset-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <div data-kpi-label className={cn('min-w-0 text-label', t.label)}>
          {label}
        </div>
        {hint && <HintButton label={label} title={hint.title} body={hint.body} className={t.label} />}
      </div>
      <div data-kpi-value className={cn('whitespace-nowrap text-kpi tabular-nums', t.value)}>
        {shown}
        {unit && <span className="ml-1 text-body">{unit}</span>}
      </div>
      {sub && <div className={cn('text-caption', t.sub)}>{sub}</div>}
    </div>
  );
}
```

In `src/components/shared/PageHeader.tsx` make three edits:

1. Replace the `freshness` prop type.
   - Old: `  freshness?: { lastSyncAt: string | null; syncStatus?: string };`
   - New: `  freshness?: { lastSyncAt: string | null; syncStatus?: string; label?: string };`
2. Make the title column shrinkable.
   - Old: `      <div>`
   - New: `      <div className="min-w-0">`
3. Pass the label through.
   - Old: `          <FreshnessBadge className="mt-1" lastSyncAt={freshness.lastSyncAt} syncStatus={freshness.syncStatus} />`
   - New: `          <FreshnessBadge className="mt-1" lastSyncAt={freshness.lastSyncAt} syncStatus={freshness.syncStatus} label={freshness.label} />`

`FreshnessBadge` defaults `label` to `'ซิงค์ล่าสุด'`, so passing `undefined` keeps the old behaviour.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/components/shared/page-blocks.test.tsx`
Expected: PASS. The existing KpiTile tests ("high tone … white text", "href makes the whole tile a link named by label and count", the non-finite em dash) still pass: the root `div` keeps the tone classes, and the overlay link keeps the `label count` name.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add src/components/shared/KpiTile.tsx src/components/shared/KpiGrid.tsx src/components/shared/HintButton.tsx src/components/shared/PageHeader.tsx tests/unit/components/shared/page-blocks.test.tsx
git commit -m "fix(ui): KpiTile hint no longer nests a button inside a link; add KpiGrid

Tiles with href use a stretched-link overlay so the hint (HintButton) is a
sibling. Numbers never wrap; sub line, ok tone and E2E data hooks added.
KpiGrid gives tiles a 150px floor so Thai labels stop breaking per word.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `DataTable` — honest sticky header, Enter/Space rows, required `rowLabel`

**Files:**
- Modify: `src/components/shared/DataTable.tsx` (full replacement)
- Test: `tests/unit/components/shared/DataTable.test.tsx`

**Interfaces:**
- Produces: `DataTableProps<T>`:
  - `{ columns; rows; rowKey; rowRisk?; loading?; empty?; caption?; maxHeight?: number | string }`
  - `& ({ onRowClick: (row: T) => void; rowLabel: (row: T) => string } | { onRowClick?: undefined; rowLabel?: undefined })`
- Behaviour:
  - With `maxHeight`, the table scrolls in its own `[data-slot="table-container"]` and the header is `sticky top-0`. Without it, no sticky class is applied.
  - Clickable rows are focusable, carry `aria-label={rowLabel(row)}` and a focus ring, and activate on click, Enter and Space (Space calls `preventDefault`).

- [ ] **Step 1: Update the test.** Replace the last test, `'clickable rows respond to click and Enter'`, with the block below, and add `fireEvent` to the RTL import.

```tsx
  it('clickable rows are named, and activate on click, Enter and Space', async () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.an}
        onRowClick={onRowClick}
        rowLabel={(r) => `เปิดข้อมูล ${r.name}`}
      />,
    );
    const tr = screen.getByRole('row', { name: 'เปิดข้อมูล นาง ก.' });
    expect(tr).toHaveAttribute('tabindex', '0');
    await userEvent.click(tr);
    tr.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onRowClick).toHaveBeenCalledTimes(3);
    expect(onRowClick).toHaveBeenCalledWith(rows[1]);
    // Space must not scroll the page: the handler prevents the default.
    expect(fireEvent.keyDown(tr, { key: ' ' })).toBe(false);
    expect(within(tr).getByText('2.5')).toBeInTheDocument();
  });
  it('non-clickable rows are neither focusable nor labelled', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.an} />);
    const tr = screen.getByText('นาง ก.').closest('tr')!;
    expect(tr).not.toHaveAttribute('tabindex');
    expect(tr).not.toHaveAttribute('aria-label');
  });
  it('onRowClick without rowLabel does not compile', () => {
    // @ts-expect-error a clickable row must say what it opens
    const bad = <DataTable columns={columns} rows={rows} rowKey={(r) => r.an} onRowClick={() => {}} />;
    expect(bad).toBeTruthy();
  });
  it('maxHeight makes the table its own scroller and only then sticks the header', () => {
    const { container } = render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.an} maxHeight={320} />);
    const scroller = container.querySelector('[data-slot="table-container"]') as HTMLElement;
    expect(scroller.style.maxHeight).toBe('320px');
    expect(scroller.className).toContain('overflow-y-auto');
    expect(container.querySelector('thead')!.className).toContain('sticky');
  });
  it('an unbounded table does not claim a sticky header', () => {
    const { container } = render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.an} />);
    expect(container.querySelector('thead')!.className).not.toContain('sticky');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/components/shared/DataTable.test.tsx`
Expected: FAIL. There is no row named "เปิดข้อมูล นาง ก.", Space does not activate, `scroller` is the shadcn wrapper without `maxHeight`, and `tsc` would report the `@ts-expect-error` as unused.

- [ ] **Step 3: Implement**

```tsx
// src/components/shared/DataTable.tsx
'use client';
import type { KeyboardEvent, ReactNode } from 'react';
import { TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RiskLevel } from '@/types/domain';
import { cn } from '@/lib/utils';

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  numeric?: boolean;
  className?: string;
}

/** A clickable row must say what it opens: an unlabelled focusable <tr> is
 *  announced as a bare run of cell text. The row keeps role="row" — giving a
 *  <tr> role="button" would drop it out of table navigation. */
type RowActivation<T> =
  | { onRowClick: (row: T) => void; rowLabel: (row: T) => string }
  | { onRowClick?: undefined; rowLabel?: undefined };

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowRisk?: (row: T) => RiskLevel | null | undefined;
  loading?: boolean;
  empty?: ReactNode;
  caption?: string;
  /** Bounds the table height (px number or CSS length). The table then scrolls
   *  inside its own container and the header row sticks. Unbounded tables
   *  scroll with the page and claim no sticky header: inside an
   *  overflow-x wrapper a sticky <thead> would stick to a box that never
   *  scrolls vertically. */
  maxHeight?: number | string;
} & RowActivation<T>;

const RISK_ROW: Record<RiskLevel, string> = {
  [RiskLevel.LOW]: 'bg-ok-tint',
  [RiskLevel.MEDIUM]: 'bg-warn-tint',
  [RiskLevel.HIGH]: 'bg-danger-tint',
};

const SKELETON_ROWS = 3;

function activateOnKeys<T>(row: T, onRowClick: (row: T) => void) {
  return (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); // Space would otherwise scroll the page
    onRowClick(row);
  };
}

export function DataTable<T>(props: DataTableProps<T>) {
  const { columns, rows, rowKey, rowRisk, loading = false, empty, caption, maxHeight, onRowClick, rowLabel } = props;
  const bounded = maxHeight !== undefined;
  return (
    <div
      data-slot="table-container"
      className={cn('relative w-full overflow-x-auto', bounded && 'overflow-y-auto')}
      style={bounded ? { maxHeight } : undefined}
    >
      <table
        data-slot="table"
        aria-busy={loading ? 'true' : undefined}
        aria-label={caption}
        className="w-full caption-bottom"
      >
        {caption && <TableCaption className="sr-only">{caption}</TableCaption>}
        <TableHeader className={cn('bg-surface-muted', bounded && 'sticky top-0 z-10')}>
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
              const clickable = onRowClick && rowLabel;
              return (
                <TableRow
                  key={rowKey(row)}
                  className={cn(
                    risk && RISK_ROW[risk],
                    clickable &&
                      'cursor-pointer outline-none hover:brightness-[0.98] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
                  )}
                  tabIndex={clickable ? 0 : undefined}
                  aria-label={clickable ? rowLabel(row) : undefined}
                  onClick={clickable ? () => onRowClick(row) : undefined}
                  onKeyDown={clickable ? activateOnKeys(row, onRowClick) : undefined}
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
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/components/shared/DataTable.test.tsx`
Expected: PASS (all nine tests).

- [ ] **Step 5: Typecheck, lint, commit**

```bash
grep -rn "DataTable" src --include=*.tsx | grep -v "src/components/shared/DataTable.tsx"   # expect no callers that pass onRowClick
npx tsc --noEmit && npm run lint
git add src/components/shared/DataTable.tsx tests/unit/components/shared/DataTable.test.tsx
git commit -m "fix(ui): DataTable sticky header only when bounded; rows need a label and take Space

shadcn's overflow-x wrapper made the sticky <thead> stick to a box that never
scrolls. DataTable now owns its scroll container: maxHeight gives a working
sticky header, unbounded tables stop claiming one. Clickable rows require
rowLabel (type-enforced) and activate on Enter and Space.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Kiosk moved verbatim into `KioskDashboard` (characterization first)

**Files:**
- Create: `tests/helpers/dashboard-fixtures.ts`, `src/components/dashboard/province/KioskDashboard.tsx`
- Modify: `src/app/(provincial)/page.tsx` (kiosk branch → `<KioskDashboard/>`)
- Test: `tests/unit/components/dashboard/province/KioskDashboard.test.tsx`

**Interfaces:**
- Consumes: `AlertBar`, `ProvinceVitalsStrip`, `HighRiskPatientList` (variant `kiosk`), `ProvinceMap` (mode `kiosk`), `SectionLabel`, `KioskHeader`, `ErrorState`, `SSE_STATUS_META` (Task 1).
- Produces: `KioskDashboard(props: KioskDashboardProps)` where `KioskDashboardProps = { hospitals; summary; trends; continuum; alerts; highRiskPatients; hrLoading; updatedAt; dataStale; onRetry; freshCount; reportingCount; sseState; selectedHospital; onSelectHospital; onExit }`. Fixtures: `makeHospital`, `makeSummary`, `makeTrends`, `makeContinuum`, `makeStageKPIs`, `makeHighRiskPatient`.

- [ ] **Step 1: Write the shared fixtures**

```ts
// tests/helpers/dashboard-fixtures.ts
// Shared /api/dashboard fixtures for the dashboard tests (UI sub-project 2).
import { ConnectionStatus, HospitalLevel } from '@/types/domain';
import type {
  DashboardContinuum,
  DashboardHospital,
  DashboardStageKPIs,
  DashboardSummary,
  DashboardTrends,
  HighRiskPatient,
} from '@/types/api';

export function makeHospital(over: Partial<DashboardHospital> = {}): DashboardHospital {
  return {
    hcode: '10670',
    name: 'รพ.ขอนแก่น',
    level: HospitalLevel.A_S,
    connectionStatus: ConnectionStatus.ONLINE,
    lastSyncAt: new Date().toISOString(),
    counts: { low: 1, medium: 1, high: 1, total: 3 },
    ancCounts: { total: 10, hr3: 1 },
    partographQuality: { laborRecent: 0, withPartograph: 0 },
    syncStatus: 'OK',
    syncBlockedReason: null,
    ...over,
  };
}

export function makeSummary(over: Partial<DashboardSummary> = {}): DashboardSummary {
  return { totalActive: 12, totalHigh: 3, totalMedium: 4, totalLow: 5, ...over };
}

export function makeTrends(over: Partial<DashboardTrends> = {}): DashboardTrends {
  const shift = (label: string, admissions: number, delivered: number, referred: number) => ({
    label,
    windowStart: '2026-10-11T01:00:00.000Z',
    windowEnd: '2026-10-11T08:00:00.000Z',
    admissions,
    delivered,
    referred,
  });
  return {
    admissions24h: Array.from({ length: 24 }, (_, i) => i % 3),
    admissionsToday: 6,
    admissions7dAvg: 4.2,
    newByRisk24h: { high: 1, medium: 2, low: 0, total: 3 },
    currentShift: shift('เวรเช้า 08:00-16:00', 5, 2, 1),
    previousShift: shift('เวรดึก 00:00-08:00', 3, 1, 0),
    ...over,
  };
}

export function makeContinuum(over: Partial<DashboardContinuum> = {}): DashboardContinuum {
  return { anc: { total: 1169, hr3: 106, dueSoon: 172 }, referrals: { today: 2, last7d: 31 }, ...over };
}

export function makeStageKPIs(): DashboardStageKPIs {
  return {
    pregnancy: { total: 1169, low: 900, hr1: 100, hr2: 63, hr3: 106 },
    labor: { total: 10, low: 5, medium: 3, high: 2, admitted: 12, awaitingDelivery: 8, deliveredAdmitted: 4 },
    delivered: { total: 40, normal: 35, lowApgar: 3, lbw: 4 },
  };
}

export function makeHighRiskPatient(over: Partial<HighRiskPatient> = {}): HighRiskPatient {
  return {
    an: 'AN001',
    hn: 'HN001',
    name: 'สมศรี ใจดี',
    age: 28,
    gaWeeks: 38,
    cpdScore: 12,
    riskLevel: 'HIGH',
    hospital: 'รพ.ขอนแก่น',
    hcode: '10670',
    admitDate: new Date().toISOString(),
    deliveredAt: null,
    lastVitalAt: new Date().toISOString(),
    partographSeverity: null,
    partographAlertCount: null,
    maternalScreenLocalTier: null,
    maternalScreenEmergencyAcuity: null,
    maternalScreenIsComplete: null,
    maternalScreenAssessedAt: null,
    ...over,
  };
}
```

- [ ] **Step 2: Write the failing characterization test**

```tsx
// tests/unit/components/dashboard/province/KioskDashboard.test.tsx
// Characterization of the frozen kiosk (UI sub-project 2, decision 6). Written
// before the move; must stay green, unedited, through every later task.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KioskDashboard, type KioskDashboardProps } from '@/components/dashboard/province/KioskDashboard';
import {
  makeContinuum,
  makeHighRiskPatient,
  makeHospital,
  makeSummary,
  makeTrends,
} from '../../../../helpers/dashboard-fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/dashboard/ProvinceMap', () => ({
  ProvinceMap: ({ mode }: { mode?: string }) => <div data-testid="province-map" data-mode={mode ?? 'light'} />,
}));

function renderKiosk(over: Partial<KioskDashboardProps> = {}) {
  const props: KioskDashboardProps = {
    hospitals: [makeHospital(), makeHospital({ hcode: '10671', name: 'รพ.ชุมแพ' })],
    summary: makeSummary(),
    trends: makeTrends(),
    continuum: makeContinuum(),
    alerts: { referralAlerts: 2, overdueAnc: 3, dueSoon: 1 },
    highRiskPatients: [makeHighRiskPatient()],
    hrLoading: false,
    updatedAt: '2026-10-11T03:00:00Z',
    dataStale: false,
    onRetry: vi.fn(),
    freshCount: 7,
    reportingCount: 9,
    sseState: 'connected',
    selectedHospital: null,
    onSelectHospital: vi.fn(),
    onExit: vi.fn(),
    ...over,
  };
  return { props, ...render(<KioskDashboard {...props} />) };
}

describe('KioskDashboard (frozen kiosk)', () => {
  it('keeps the English kiosk labels and the war-room footer', () => {
    renderKiosk();
    expect(screen.getByText('ACTIVE ALERTS')).toBeInTheDocument();
    expect(screen.getByLabelText('ACTIVE ALERTS: 5')).toBeInTheDocument(); // 2 referral + 3 overdue ANC
    expect(screen.getByText('ACTIVE LABOR · PROVINCE')).toBeInTheDocument();
    expect(screen.getByText(/High-risk & Active labor/)).toBeInTheDocument();
    expect(screen.getByText('Province map')).toBeInTheDocument();
    expect(screen.getByText('PPHO WAR-ROOM')).toBeInTheDocument();
    expect(screen.getByText('SSE · STREAM OK')).toBeInTheDocument();
    expect(screen.getByText('7/9 DATA FRESH')).toBeInTheDocument();
    expect(screen.getByText('ESC TO EXIT')).toBeInTheDocument();
  });

  it('kiosk list: no tabs, no names, English columns, kiosk risk chip', () => {
    const { container } = renderKiosk();
    expect(screen.queryByText(/HIGH-RISK ONLY|เฉพาะเสี่ยงสูง/)).toBeNull();
    expect(screen.queryByText(/สมศรี/)).toBeNull();
    expect(screen.getByText('HOSPITAL')).toBeInTheDocument();
    expect(screen.getByText('PARTOGRAPH')).toBeInTheDocument();
    expect(container.querySelector('[data-risk="HIGH"]')?.textContent).toBe('HIGH');
  });

  it('renders the map in kiosk mode and no Thai page header', () => {
    renderKiosk();
    expect(screen.getByTestId('province-map')).toHaveAttribute('data-mode', 'kiosk');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('shows the cached-data banner when stale and retries', () => {
    const { props } = renderKiosk({ dataStale: true });
    expect(screen.getByRole('alert')).toHaveTextContent('การเชื่อมต่อล้มเหลว — แสดงข้อมูลเดิมจากแคช');
    fireEvent.click(screen.getByRole('button', { name: /ลองใหม่/ }));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it('reconnecting SSE is shown in the footer; exit calls onExit', () => {
    const { props } = renderKiosk({ sseState: 'reconnecting' });
    expect(screen.getByText('SSE · RECONNECTING')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exit kiosk mode' }));
    expect(props.onExit).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/unit/components/dashboard/province/KioskDashboard.test.tsx`
Expected: FAIL with `Failed to resolve import "@/components/dashboard/province/KioskDashboard"`.

- [ ] **Step 4: Create `KioskDashboard`.** The JSX is today's `page.tsx` lines 262–380, unchanged, except for these name substitutions:

| Today | Becomes |
|---|---|
| `exitKiosk` | `onExit` |
| `refreshAll` | `onRetry` |
| `reportingHospitals.length` | `reportingCount` |
| `openHospitalDetail` | `onSelectHospital` |
| `sseMeta` | `SSE_STATUS_META[sseState]` |

```tsx
// src/components/dashboard/province/KioskDashboard.tsx
// KIOSK MODE — 1920×1080 wall display, dark phosphor-glow palette.
// Moved verbatim from src/app/(provincial)/page.tsx in UI sub-project 2. The
// kiosk is NOT redesigned: KioskDashboard.test.tsx pins its labels and
// structure so normal-mode restyles cannot leak in.
'use client';

import { AlertBar } from '@/components/dashboard/AlertBar';
import { ProvinceVitalsStrip } from '@/components/dashboard/ProvinceVitalsStrip';
import { HighRiskPatientList } from '@/components/dashboard/HighRiskPatientList';
import { ProvinceMap } from '@/components/dashboard/ProvinceMap';
import { SectionLabel } from '@/components/dashboard/shared';
import { KioskHeader } from '@/components/dashboard/KioskHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { SSE_STATUS_META } from '@/config/sse-status';
import type { SseConnectionState } from '@/hooks/useSSE';
import type {
  DashboardAlerts,
  DashboardContinuum,
  DashboardHospital,
  DashboardSummary,
  DashboardTrends,
  HighRiskPatient,
} from '@/types/api';

export interface KioskDashboardProps {
  hospitals: DashboardHospital[];
  summary: DashboardSummary;
  trends: DashboardTrends;
  continuum: DashboardContinuum | null;
  alerts: DashboardAlerts;
  highRiskPatients: HighRiskPatient[];
  hrLoading: boolean;
  updatedAt: string | null;
  dataStale: boolean;
  onRetry: () => void;
  freshCount: number;
  reportingCount: number;
  sseState: SseConnectionState;
  selectedHospital: string | null;
  onSelectHospital: (hcode: string | null) => void;
  onExit: () => void;
}

export function KioskDashboard({
  hospitals,
  summary,
  trends,
  continuum,
  alerts,
  highRiskPatients,
  hrLoading,
  updatedAt,
  dataStale,
  onRetry,
  freshCount,
  reportingCount,
  sseState,
  selectedHospital,
  onSelectHospital,
  onExit,
}: KioskDashboardProps) {
  const ancFallback = continuum ? { hr3: continuum.anc.hr3, dueSoon: continuum.anc.dueSoon } : null;
  const sseMeta = SSE_STATUS_META[sseState];
  return (
    <div
      className="min-h-screen text-[var(--kiosk-ink)]"
      style={{
        background: 'var(--kiosk-bg)',
        backgroundImage:
          'radial-gradient(ellipse at 50% 0%, rgba(87,196,255,0.06), transparent 55%)',
      }}
    >
      <KioskHeader
        updatedAt={updatedAt}
        onExit={onExit}
        onlineCount={freshCount}
        totalCount={hospitals.length}
      />

      {dataStale && (
        <ErrorState
          variant="banner"
          message="การเชื่อมต่อล้มเหลว — แสดงข้อมูลเดิมจากแคช"
          lastUpdatedAt={updatedAt}
          onRetry={onRetry}
        />
      )}

      <div className="px-7 pt-4 pb-4 space-y-4">
        {/* 01 — Alerts ribbon (kiosk variant) */}
        <div
          className="border"
          style={{ borderColor: 'var(--kiosk-rule)', background: 'var(--kiosk-panel)' }}
        >
          <AlertBar alerts={alerts} />
        </div>

        {/* 02 — Province vitals (reuses normal component; will need kiosk variant later) */}
        <div
          className="border"
          style={{ borderColor: 'var(--kiosk-rule)', background: 'var(--kiosk-panel)' }}
        >
          <ProvinceVitalsStrip summary={summary} trends={trends} continuum={continuum} />
        </div>

        {/* 03+04 — HIGH-risk + Province map (side-by-side, kiosk privacy on list) */}
        <div className="grid grid-cols-12 gap-4">
          <div
            className="col-span-7 border p-4"
            style={{ borderColor: 'var(--kiosk-rule)', background: 'var(--kiosk-panel)' }}
          >
            <HighRiskPatientList
              patients={highRiskPatients}
              isLoading={hrLoading}
              variant="kiosk"
              maxRows={8}
              ancFallback={ancFallback}
              totalActive={summary?.totalActive}
              totalHigh={summary?.totalHigh}
            />
          </div>
          <div
            className="col-span-5 flex flex-col gap-3 border p-4"
            style={{ borderColor: 'var(--kiosk-rule)', background: 'var(--kiosk-panel)' }}
          >
            <SectionLabel idx={4} right={<span>{hospitals.length} NODES</span>}>
              Province map
            </SectionLabel>
            <div
              className="flex-1 border"
              style={{ borderColor: 'var(--kiosk-rule)', minHeight: 360 }}
            >
              <ProvinceMap
                hospitals={hospitals}
                selected={selectedHospital}
                onSelect={onSelectHospital}
                mode="kiosk"
                size="full"
              />
            </div>
            <div
              className="flex justify-between font-mono text-caption tracking-[0.12em]"
              style={{ color: 'var(--kiosk-dim)' }}
            >
              <span>
                <span style={{ color: 'var(--kiosk-high)' }}>●</span> HIGH
              </span>
              <span>
                <span style={{ color: 'var(--kiosk-med)' }}>●</span> MED
              </span>
              <span>
                <span style={{ color: 'var(--kiosk-low)' }}>●</span> LOW
              </span>
              <span>
                <span style={{ color: 'var(--kiosk-dim)' }}>○</span> IDLE
              </span>
              <span>
                <span style={{ color: 'var(--kiosk-high)' }}>✕</span> OFFLINE
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom status strip */}
      <div
        className="flex gap-5 border-t px-7 py-2 font-mono text-caption tracking-[0.14em]"
        style={{ borderColor: 'var(--kiosk-rule)', color: 'var(--kiosk-dim)' }}
      >
        <span>KK-LRMS</span>
        <span>PPHO WAR-ROOM</span>
        <span>MCH PROVINCIAL NETWORK</span>
        <span className="flex-1" />
        <span style={{ color: sseState === 'connected' ? undefined : 'var(--kiosk-med)' }}>
          {sseMeta.stream}
        </span>
        <span>
          {freshCount}/{reportingCount} DATA FRESH
        </span>
        <span style={{ color: 'var(--kiosk-ink)' }}>ESC TO EXIT</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire it into the page**

In `src/app/(provincial)/page.tsx`, make two edits.

1. **Imports.**
   - Old: `import { KioskHeader } from '@/components/dashboard/KioskHeader';`
   - New: `import { KioskDashboard } from '@/components/dashboard/province/KioskDashboard';`
2. **Kiosk branch.** Replace lines 258–382: from the comment block `  // ═══…` / `  // KIOSK MODE — 1920×1080 wall display, dark phosphor-glow palette` through the closing `  }` of `  if (isKiosk) {`, which is the line before the `  // NORMAL MODE` comment block. The replacement:

```tsx
  // KIOSK MODE — frozen wall display (src/components/dashboard/province/KioskDashboard.tsx)
  if (isKiosk) {
    return (
      <KioskDashboard
        hospitals={hospitals}
        summary={summary}
        trends={trends}
        continuum={continuum}
        alerts={alerts}
        highRiskPatients={highRiskPatients}
        hrLoading={hrLoading}
        updatedAt={updatedAt}
        dataStale={dataStale}
        onRetry={refreshAll}
        freshCount={freshCount}
        reportingCount={reportingHospitals.length}
        sseState={sseState}
        selectedHospital={selectedHospital}
        onSelectHospital={openHospitalDetail}
        onExit={exitKiosk}
      />
    );
  }
```

- [ ] **Step 6: Run the test, then the full suite**

Run: `npx vitest run tests/unit/components/dashboard/province/KioskDashboard.test.tsx`
Expected: PASS (5 tests).
Run: `npx vitest run --maxWorkers=6`
Expected: PASS, with the same count as before this task plus 5.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add tests/helpers/dashboard-fixtures.ts tests/unit/components/dashboard/province/KioskDashboard.test.tsx src/components/dashboard/province/KioskDashboard.tsx "src/app/(provincial)/page.tsx"
git commit -m "refactor(dashboard): move the kiosk layout verbatim into KioskDashboard

A characterization test pins the frozen kiosk (English labels, no names or
tabs, kiosk map, war-room footer, stale banner, exit) before any normal-mode
restyle, so later tasks cannot leak into the wall display.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `useProvinceDashboard` — one hook for all dashboard data

**Files:**
- Create: `src/hooks/useProvinceDashboard.ts`
- Test: `tests/unit/hooks/useProvinceDashboard.test.tsx`

**Interfaces:**
- Consumes: `useDashboard`, `useHighRiskPatients`, `useSSE`, `useBrowserPoll`, `useOnboardHosxpWebhook`, `useOnboardHosxpSync`, `debounceLeadingTrailing` + `SSE_REFRESH_DEBOUNCE_MS`, `classifySyncHealth`, `isNonReportingHcode`.
- Produces: `useProvinceDashboard(): ProvinceDashboard`, which returns:
  - **Dashboard payload:** `hospitals`, `summary`, `stageKPIs`, `alerts`, `trends`, `continuum`, `updatedAt`, `isLoading`, `error`.
  - **High-risk list:** `highRiskPatients`, `hrLoading`.
  - **Live state:** `sseState`, `hosxpSyncState`, `onboardingError: string | null`, `syncing`.
  - **Actions:** `refreshAll()`, `triggerSync(): Promise<void>`.
  - **Derived:** `dataStale`, `onlineCount`, `freshCount`, `reportingCount`, `ancFallback`.

  Also exports `type ProvinceDashboard = ReturnType<typeof useProvinceDashboard>`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/hooks/useProvinceDashboard.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ConnectionStatus } from '@/types/domain';
import { useProvinceDashboard } from '@/hooks/useProvinceDashboard';
import { makeContinuum, makeHospital, makeSummary } from '../../helpers/dashboard-fixtures';

type SseOpts = { onPatientUpdate?: () => void; onConnectionStatus?: () => void; onSyncComplete?: () => void };
const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  hrMutate: vi.fn(),
  runNow: vi.fn(async () => null),
  sse: {} as { onPatientUpdate?: () => void; onConnectionStatus?: () => void; onSyncComplete?: () => void },
  dash: {} as Record<string, unknown>,
}));

vi.mock('@/hooks/useDashboard', () => ({ useDashboard: () => h.dash }));
vi.mock('@/hooks/useHighRiskPatients', () => ({
  useHighRiskPatients: () => ({ patients: [], isLoading: false, mutate: h.hrMutate }),
}));
vi.mock('@/hooks/useSSE', () => ({
  useSSE: (o: SseOpts) => {
    h.sse = o;
    return { connectionState: 'reconnecting' };
  },
}));
vi.mock('@/hooks/useBrowserPoll', () => ({ useBrowserPoll: () => ({ state: { isRunning: true }, runNow: h.runNow }) }));
vi.mock('@/hooks/useOnboardHosxpWebhook', () => ({ useOnboardHosxpWebhook: () => ({ state: { ran: true, error: 'boom' } }) }));
vi.mock('@/hooks/useOnboardHosxpSync', () => ({ useOnboardHosxpSync: () => ({ state: { ran: false } }) }));

const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString();

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
  h.dash = {
    hospitals: [
      makeHospital({ hcode: '10670', connectionStatus: ConnectionStatus.ONLINE, lastSyncAt: hoursAgo(0.1) }),
      makeHospital({ hcode: '10671', connectionStatus: ConnectionStatus.OFFLINE, lastSyncAt: hoursAgo(3) }),
      makeHospital({ hcode: '99999', connectionStatus: ConnectionStatus.ONLINE, lastSyncAt: hoursAgo(0) }),
    ],
    summary: makeSummary(),
    stageKPIs: {},
    alerts: { referralAlerts: 0, overdueAnc: 0, dueSoon: 0 },
    trends: {},
    continuum: makeContinuum({ anc: { total: 5, hr3: 2, dueSoon: 3 } }),
    updatedAt: '2026-10-11T03:00:00Z',
    isLoading: false,
    error: undefined,
    mutate: h.mutate,
  };
});
afterEach(() => vi.useRealTimers());

describe('useProvinceDashboard', () => {
  it('derives counts like the page did — pseudo-hospitals excluded from freshness only', () => {
    const { result } = renderHook(() => useProvinceDashboard());
    expect(result.current.onlineCount).toBe(2); // includes 99999, as before
    expect(result.current.reportingCount).toBe(2); // 99999 excluded
    expect(result.current.freshCount).toBe(1); // 10671 is 3h stale
    expect(result.current.ancFallback).toEqual({ hr3: 2, dueSoon: 3 });
  });

  it('ancFallback is null without continuum', () => {
    h.dash.continuum = null;
    const { result } = renderHook(() => useProvinceDashboard());
    expect(result.current.ancFallback).toBeNull();
  });

  it('dataStale only when a fetch failed but a payload is cached', () => {
    h.dash.error = new Error('x');
    expect(renderHook(() => useProvinceDashboard()).result.current.dataStale).toBe(true);
    h.dash.updatedAt = null;
    expect(renderHook(() => useProvinceDashboard()).result.current.dataStale).toBe(false);
  });

  it('refreshAll revalidates both SWR keys; triggerSync polls first', async () => {
    const { result } = renderHook(() => useProvinceDashboard());
    act(() => result.current.refreshAll());
    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.hrMutate).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.triggerSync();
    });
    expect(h.runNow).toHaveBeenCalledTimes(1);
    expect(h.mutate).toHaveBeenCalledTimes(2);
  });

  it('SSE: connection events refetch the dashboard; patient events go through the debounce', () => {
    renderHook(() => useProvinceDashboard());
    h.sse.onConnectionStatus?.();
    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.hrMutate).not.toHaveBeenCalled();
    h.sse.onPatientUpdate?.(); // leading edge fires immediately
    h.sse.onPatientUpdate?.(); // coalesced into the trailing call
    expect(h.hrMutate).toHaveBeenCalledTimes(1);
  });

  it('passes through live state', () => {
    const { result } = renderHook(() => useProvinceDashboard());
    expect(result.current.sseState).toBe('reconnecting');
    expect(result.current.syncing).toBe(true);
    expect(result.current.onboardingError).toBe('boom');
    expect(result.current.hosxpSyncState).toEqual({ ran: false });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/hooks/useProvinceDashboard.test.tsx`
Expected: FAIL with `Failed to resolve import "@/hooks/useProvinceDashboard"`.

- [ ] **Step 3: Implement**

```ts
// src/hooks/useProvinceDashboard.ts
// All data wiring for the provincial dashboard `/` (UI sub-project 2). Moved
// out of page.tsx unchanged: same SWR keys/intervals, same SSE debounce, same
// browser poll. Derived counts are recomputed every render (classifySyncHealth
// reads the clock), exactly as the page did.
'use client';

import { useCallback, useMemo } from 'react';
import { debounceLeadingTrailing, SSE_REFRESH_DEBOUNCE_MS } from '@/lib/debounce';
import { useDashboard } from '@/hooks/useDashboard';
import { useHighRiskPatients } from '@/hooks/useHighRiskPatients';
import { useSSE } from '@/hooks/useSSE';
import { useBrowserPoll } from '@/hooks/useBrowserPoll';
import { useOnboardHosxpWebhook } from '@/hooks/useOnboardHosxpWebhook';
import { useOnboardHosxpSync } from '@/hooks/useOnboardHosxpSync';
import { ConnectionStatus as ConnectionStatusEnum } from '@/types/domain';
import { classifySyncHealth, isNonReportingHcode } from '@/config/hospital-network';

export function useProvinceDashboard() {
  // Auto-provisions HOSxP's webhook_setting row on first onboarding; no-op
  // without a BMS session / marketplace_token.
  const { state: onboardingState } = useOnboardHosxpWebhook();
  const { state: hosxpSyncState } = useOnboardHosxpSync();
  // Server-side polling is disabled in production: this browser poll keeps
  // this user's hospital fresh, and its SSE fan-out refreshes everyone.
  const { state: browserPollState, runNow } = useBrowserPoll();
  const dash = useDashboard();
  const hr = useHighRiskPatients();
  const { mutate } = dash;
  const hrMutate = hr.mutate;

  const refreshAll = useCallback(() => {
    mutate();
    hrMutate();
  }, [mutate, hrMutate]);

  // Manual refresh: run a poll cycle, then revalidate (the SSE fan-out stays
  // silent when no rows changed, but "ดึงข้อมูลทันที" must still feel live).
  const triggerSync = useCallback(async () => {
    await runNow();
    refreshAll();
  }, [runNow, refreshAll]);

  // Leading+trailing debounce — the 2026-07-17 79-req/s incident. Built over
  // the stable SWR mutates so the timer survives re-renders.
  const debouncedSseRefresh = useMemo(
    () =>
      debounceLeadingTrailing(() => {
        mutate();
        hrMutate();
      }, SSE_REFRESH_DEBOUNCE_MS),
    [mutate, hrMutate],
  );
  const { connectionState: sseState } = useSSE({
    onPatientUpdate: debouncedSseRefresh,
    onConnectionStatus: () => mutate(),
    onSyncComplete: debouncedSseRefresh,
  });

  const { hospitals, continuum } = dash;
  // Pseudo-hospitals (00000/99999) never sync: excluded from the freshness
  // numerator and denominator so this agrees with the status strip.
  const reporting = hospitals.filter((h) => !isNonReportingHcode(h.hcode));

  return {
    hospitals,
    summary: dash.summary,
    stageKPIs: dash.stageKPIs,
    alerts: dash.alerts,
    trends: dash.trends,
    continuum,
    updatedAt: dash.updatedAt,
    isLoading: dash.isLoading,
    error: dash.error,
    highRiskPatients: hr.patients,
    hrLoading: hr.isLoading,
    sseState,
    hosxpSyncState,
    onboardingError: onboardingState?.error ?? null,
    syncing: browserPollState.isRunning,
    refreshAll,
    triggerSync,
    // Fetch failed but SWR still holds the last good payload (Constitution VI).
    dataStale: Boolean(dash.error && dash.updatedAt),
    onlineCount: hospitals.filter((h) => h.connectionStatus === ConnectionStatusEnum.ONLINE).length,
    reportingCount: reporting.length,
    freshCount: reporting.filter((h) => classifySyncHealth(h.syncStatus, h.lastSyncAt) === 'ok').length,
    ancFallback: continuum ? { hr3: continuum.anc.hr3, dueSoon: continuum.anc.dueSoon } : null,
  };
}

export type ProvinceDashboard = ReturnType<typeof useProvinceDashboard>;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/hooks/useProvinceDashboard.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add src/hooks/useProvinceDashboard.ts tests/unit/hooks/useProvinceDashboard.test.tsx
git commit -m "refactor(dashboard): useProvinceDashboard owns the dashboard data wiring

Same SWR keys, SSE debounce and browser poll as page.tsx; derived freshness
counts exclude pseudo-hospitals exactly as before. Tested in isolation so the
page can become a thin composition.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Alert definitions shared by the kiosk ribbon and the Thai `AlertsSection`

**Files:**
- Create: `src/components/dashboard/province/alert-definitions.tsx`, `src/components/dashboard/province/AlertsSection.tsx`
- Modify: `src/components/dashboard/AlertBar.tsx`
- Test: `tests/unit/components/dashboard/province/AlertsSection.test.tsx`. Also re-run `tests/unit/components/AlertBar.test.tsx` and `KioskDashboard.test.tsx` **unchanged**.

**Interfaces:**
- Consumes: `ANC_OPS` (`@/config/anc-ops`), `REFERRAL_SLA` (`@/config/referral-sla`), `ANC_LAST_VISIT_MAX_AGE_DAYS` (`@/config/anc-freshness`), `SectionCard`, `KpiGrid`, `KpiTile`.
- Produces:
  - `ALERT_DEFINITIONS: readonly AlertDefinition[]`, where `AlertDefinition = { key: keyof DashboardAlerts; testId; href; label; kioskLabel; kioskDetail; zeroLabel; tooltipTitle; tooltipBody: ReactNode; kind: 'alarm' | 'workload' }`
  - `alarmTotal(alerts): number`
  - `AlertsSection({ alerts })`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/components/dashboard/province/AlertsSection.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { AlertsSection } from '@/components/dashboard/province/AlertsSection';
import { ALERT_DEFINITIONS, alarmTotal } from '@/components/dashboard/province/alert-definitions';
import { ANC_OPS } from '@/config/anc-ops';

const hot = { referralAlerts: 7, overdueAnc: 138, dueSoon: 172 };

describe('alert definitions', () => {
  it('sums only alarm kinds (due-soon is workload)', () => {
    expect(alarmTotal(hot)).toBe(145);
  });
  it('labels quote thresholds from config, not literals', () => {
    const labels = ALERT_DEFINITIONS.map((d) => d.label).join(' | ');
    expect(labels).toContain(`${ANC_OPS.followupWarnDays} วัน`);
    expect(labels).toContain(`≤${ANC_OPS.dueSoonDays} วัน`);
  });
});

describe('AlertsSection', () => {
  it('Thai tiles keep the board deep links and test ids', () => {
    render(<AlertsSection alerts={hot} />);
    expect(screen.getByRole('region', { name: 'งานที่ต้องจัดการ' })).toBeInTheDocument();
    const cases: Array<[string, string, string]> = [
      ['alert-referrals', '7', '/referrals?overdue=1'],
      ['alert-overdue-anc', '138', '/pregnancies?cohort=anc_stale'],
      ['alert-due-soon', '172', '/pregnancies?cohort=due_soon'],
    ];
    for (const [id, value, href] of cases) {
      const tile = screen.getByTestId(id);
      expect(within(tile).getByText(value)).toBeInTheDocument();
      expect(within(tile).getByRole('link')).toHaveAttribute('href', href);
    }
    expect(screen.getByText(/งานเร่งด่วนรวม 145 รายการ/)).toBeInTheDocument();
  });

  it('alarms go solid red, workload goes amber, and English labels are gone', () => {
    render(<AlertsSection alerts={hot} />);
    expect(screen.getByTestId('alert-referrals').className).toContain('bg-danger');
    expect(screen.getByTestId('alert-due-soon').className).toContain('bg-warn-tint');
    expect(screen.queryByText(/REFERRAL ACTION|OVERDUE ANC|ALL CLEAR|ACTIVE ALERTS|DUE ≤14/)).toBeNull();
  });

  it('zero alarms read as no urgent work, with the existing zero texts', () => {
    render(<AlertsSection alerts={{ referralAlerts: 0, overdueAnc: 0, dueSoon: 5 }} />);
    expect(screen.getByText(/^ไม่มีงานเร่งด่วน/)).toBeInTheDocument();
    const referral = screen.getByTestId('alert-referrals');
    expect(referral.className).toContain('bg-ok-tint');
    expect(within(referral).getByText('ไม่มีส่งต่อค้างเกิน SLA')).toBeInTheDocument();
  });

  it('every tile explains itself through a hint button outside its link', () => {
    render(<AlertsSection alerts={hot} />);
    const hint = screen.getByRole('button', { name: 'คำอธิบาย: ส่งต่อที่ต้องเร่งจัดการ' });
    expect(within(screen.getByTestId('alert-referrals')).getByRole('link').contains(hint)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/components/dashboard/province/AlertsSection.test.tsx`
Expected: FAIL with `Failed to resolve import "@/components/dashboard/province/AlertsSection"`.

- [ ] **Step 3: Implement the definitions and the section**

```tsx
// src/components/dashboard/province/alert-definitions.tsx
// One definition per dashboard alert tile, read by the kiosk ribbon (AlertBar,
// frozen English labels) and by normal mode (AlertsSection, Thai labels).
// hrefs, test ids and tooltip copy live here once so the two modes cannot
// drift, and every threshold in the copy comes from the config the server
// queries use (DashboardAlerts docs in src/types/api.ts).
import type { ReactNode } from 'react';
import type { DashboardAlerts } from '@/types/api';
import { ANC_OPS } from '@/config/anc-ops';
import { REFERRAL_SLA } from '@/config/referral-sla';
import { ANC_LAST_VISIT_MAX_AGE_DAYS } from '@/config/anc-freshness';

export interface AlertDefinition {
  key: keyof DashboardAlerts;
  testId: string;
  href: string;
  /** Normal-mode Thai label. */
  label: string;
  /** Kiosk ribbon label — the kiosk is not redesigned in sub-project 2. */
  kioskLabel: string;
  /** Kiosk ribbon detail line when the count is above zero. */
  kioskDetail: string;
  /** Shown in both modes when the count is zero. */
  zeroLabel: string;
  tooltipTitle: string;
  tooltipBody: ReactNode;
  /** `alarm` counts toward the alert total and turns red; `workload` is
   *  upcoming work (amber) and never raises the total on its own. */
  kind: 'alarm' | 'workload';
}

export const ALERT_DEFINITIONS: readonly AlertDefinition[] = [
  {
    key: 'referralAlerts',
    testId: 'alert-referrals',
    href: '/referrals?overdue=1',
    label: 'ส่งต่อที่ต้องเร่งจัดการ',
    kioskLabel: 'REFERRAL ACTION',
    kioskDetail: 'เกิน SLA / ฉุกเฉินยังไม่ถึง',
    zeroLabel: 'ไม่มีส่งต่อค้างเกิน SLA',
    tooltipTitle: 'เคสส่งต่อที่ต้องเร่งจัดการ',
    tooltipBody: (
      <>
        เคสส่งต่อสถานะ <strong>INITIATED</strong> ค้างเกิน{' '}
        <strong>{REFERRAL_SLA.overdueAfterHours} ชั่วโมง</strong> รวมกับเคส{' '}
        <strong>ฉุกเฉิน (EMERGENCY)</strong> ที่ยังไม่ถึงปลายทาง. ต่างจากเดิมที่นับเคสรอทั้งหมด
        (ตัวเลขไม่เคยลด) — ช่องนี้จะเป็นศูนย์ได้เมื่อจัดการทัน. คลิกเพื่อเปิดรายการที่กรองแล้ว.
      </>
    ),
    kind: 'alarm',
  },
  {
    key: 'overdueAnc',
    testId: 'alert-overdue-anc',
    href: '/pregnancies?cohort=anc_stale',
    label: `ขาดนัด ANC เกิน ${ANC_OPS.followupWarnDays} วัน`,
    kioskLabel: 'OVERDUE ANC',
    kioskDetail: `ขาดนัดเกิน ${ANC_OPS.followupWarnDays} วัน`,
    zeroLabel: 'ANC ครบทุกราย',
    tooltipTitle: 'หญิงตั้งครรภ์ขาดนัด ANC เกินเกณฑ์',
    tooltipBody: (
      <>
        นับเฉพาะทะเบียนครรภ์ที่ยัง active (ตัดรายคลอดแล้ว/หลุดติดตามออก เช่นเดียวกับหน้า
        ฝากครรภ์) ที่นัดล่าสุดผ่านมาเกิน <strong>{ANC_OPS.followupWarnDays} วัน</strong> —
        ตัวเลขเดียวกับช่อง MISSED ANC ของหน้าฝากครรภ์. ปฏิบัติ:
        ติดตามให้กลับมาตรวจครรภ์ก่อนหลุดการติดตามที่ {ANC_LAST_VISIT_MAX_AGE_DAYS} วัน.
      </>
    ),
    kind: 'alarm',
  },
  {
    key: 'dueSoon',
    testId: 'alert-due-soon',
    href: '/pregnancies?cohort=due_soon',
    label: `ใกล้ครบกำหนดคลอด ≤${ANC_OPS.dueSoonDays} วัน`,
    kioskLabel: `DUE ≤${ANC_OPS.dueSoonDays} DAYS`,
    kioskDetail: 'ใกล้ครบกำหนดคลอด',
    zeroLabel: 'ไม่มีครรภ์ใกล้คลอด',
    tooltipTitle: `ครรภ์ครบกำหนดภายใน ${ANC_OPS.dueSoonDays} วัน`,
    tooltipBody: (
      <>
        หญิงตั้งครรภ์ในทะเบียน active ที่ EDC อยู่ภายใน <strong>{ANC_OPS.dueSoonDays} วัน</strong>{' '}
        (รวมที่เลยกำหนดแล้ว) — ภาระงานคลอดที่กำลังมาถึงของทั้งจังหวัด ใช้วางแผนเตียง/ส่งต่อ.
        แทนที่ช่อง IN-TRANSIT เดิมซึ่งเป็นศูนย์ตลอดเพราะสถานะส่งต่อไม่ถูกอัปเดตจากต้นทาง.
      </>
    ),
    kind: 'workload',
  },
];

/** Only true alarms feed the headline total — due-soon is upcoming workload. */
export function alarmTotal(alerts: DashboardAlerts): number {
  return ALERT_DEFINITIONS.filter((d) => d.kind === 'alarm').reduce((sum, d) => sum + alerts[d.key], 0);
}
```

```tsx
// src/components/dashboard/province/AlertsSection.tsx
// งานที่ต้องจัดการ — the three actionable alert counts, each linking to its
// pre-filtered board (normal mode; the kiosk keeps AlertBar).
'use client';

import type { DashboardAlerts } from '@/types/api';
import { SectionCard } from '@/components/shared/SectionCard';
import { KpiGrid } from '@/components/shared/KpiGrid';
import { KpiTile, type KpiTone } from '@/components/shared/KpiTile';
import { ALERT_DEFINITIONS, alarmTotal, type AlertDefinition } from './alert-definitions';

const WORKLOAD_NOTE = 'ใกล้คลอดเป็นภาระงานล่วงหน้า ไม่นับรวม';

function toneFor(def: AlertDefinition, value: number): KpiTone {
  if (value <= 0) return 'ok';
  return def.kind === 'alarm' ? 'high' : 'warn';
}

export function AlertsSection({ alerts }: { alerts: DashboardAlerts }) {
  const total = alarmTotal(alerts);
  const description =
    total > 0
      ? `งานเร่งด่วนรวม ${total.toLocaleString('en-US')} รายการ — ส่งต่อเกิน SLA และขาดนัด ANC (${WORKLOAD_NOTE})`
      : `ไม่มีงานเร่งด่วน — ${WORKLOAD_NOTE}`;
  return (
    <SectionCard title="งานที่ต้องจัดการ" description={description}>
      <KpiGrid>
        {ALERT_DEFINITIONS.map((def) => {
          const value = alerts[def.key];
          return (
            <KpiTile
              key={def.key}
              testId={def.testId}
              label={def.label}
              count={value}
              href={def.href}
              tone={toneFor(def, value)}
              sub={value > 0 ? 'กดเพื่อเปิดรายชื่อ' : def.zeroLabel}
              hint={{ title: def.tooltipTitle, body: def.tooltipBody }}
            />
          );
        })}
      </KpiGrid>
    </SectionCard>
  );
}
```

- [ ] **Step 4: Route the kiosk ribbon through the definitions (its output stays identical)**

In `src/components/dashboard/AlertBar.tsx`:

1. Add after the tooltip import: `import { ALERT_DEFINITIONS, alarmTotal } from '@/components/dashboard/province/alert-definitions';`
2. Replace the total.
   - Old: `  const total = alerts.referralAlerts + alerts.overdueAnc;`
   - New: `  const total = alarmTotal(alerts);`
3. Replace the three `<AlertTile … />` elements (lines 145–193, from `      <AlertTile` with `testId="alert-referrals"` through the `/>` after the due-soon `tooltipBody`) with:

```tsx
      {ALERT_DEFINITIONS.map((d) => (
        <AlertTile
          key={d.key}
          testId={d.testId}
          href={d.href}
          label={d.kioskLabel}
          value={alerts[d.key]}
          zeroLabel={d.zeroLabel}
          detail={d.kioskDetail}
          tooltipTitle={d.tooltipTitle}
          tooltipBody={d.tooltipBody}
          hotColor={d.kind === 'workload' ? 'var(--risk-medium)' : undefined}
        />
      ))}
```

4. Add one line to the file's header comment: `// Kiosk-only since UI sub-project 2; normal mode renders province/AlertsSection.`

The rendered strings are identical: the config values are 24 h / 35 / 14 / 60 days, the same numbers as the old literals.

- [ ] **Step 5: Run the new test plus the frozen ones**

Run: `npx vitest run tests/unit/components/dashboard/province/AlertsSection.test.tsx tests/unit/components/AlertBar.test.tsx tests/unit/components/dashboard/province/KioskDashboard.test.tsx`
Expected: PASS. AlertBar and KioskDashboard tests pass **unedited**.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add src/components/dashboard/province/alert-definitions.tsx src/components/dashboard/province/AlertsSection.tsx src/components/dashboard/AlertBar.tsx tests/unit/components/dashboard/province/AlertsSection.test.tsx
git commit -m "feat(dashboard): Thai alert tiles from definitions shared with the kiosk ribbon

AlertsSection replaces 'ALL CLEAR / REFERRAL ACTION' with Thai labels that
state what is counted; thresholds come from REFERRAL_SLA / ANC_OPS. The
kiosk AlertBar reads the same definitions and renders exactly as before.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Labour vitals and care-continuum sections; shared hint copy; fluid `BarStrip`

**Files:**
- Create: `src/components/dashboard/province/metric-hints.tsx`, `src/components/dashboard/province/LaborVitalsSection.tsx`, `src/components/dashboard/province/ContinuumSection.tsx`
- Modify: `src/components/dashboard/ProvinceVitalsStrip.tsx` (hint copy from `metric-hints`), `src/components/dashboard/shared.tsx` (`BarStrip` gains `fluid` and `label`)
- Test: `tests/unit/components/dashboard/province/LaborVitalsSection.test.tsx`, `tests/unit/components/dashboard/province/ContinuumSection.test.tsx`

**Interfaces:**
- Consumes: `SectionCard`, `KpiGrid`, `KpiTile`, `HintButton`, `RiskBar`, `BarStrip`, `ANC_REGISTRY_LABEL_TH`, `ANC_REGISTRY_CRITERIA_TH`, `ANC_OPS`.
- Produces:
  - `VITALS_HINTS: { active; high; medium; low }` (`MetricHint = { title: string; body: ReactNode }`) and `admissionsHint(today, avg7d): MetricHint`
  - `LaborVitalsSection({ summary, trends })`, `ContinuumSection({ continuum })`
  - `BarStrip({ …, fluid?: boolean, label?: string })`

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/unit/components/dashboard/province/LaborVitalsSection.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LaborVitalsSection } from '@/components/dashboard/province/LaborVitalsSection';
import { makeSummary, makeTrends } from '../../../../helpers/dashboard-fixtures';

describe('LaborVitalsSection', () => {
  it('shows the server counts as Thai KPI tiles', () => {
    render(<LaborVitalsSection summary={makeSummary()} trends={makeTrends()} />);
    expect(screen.getByRole('region', { name: 'ห้องคลอดทั้งจังหวัด' })).toBeInTheDocument();
    const active = screen.getByTestId('vital-active');
    expect(within(active).getByText('12')).toBeInTheDocument();
    expect(within(active).getByText('รับใหม่ 3 รายใน 24 ชม.')).toBeInTheDocument();
    expect(screen.getByTestId('vital-high').className).toContain('bg-danger');
    expect(screen.getByTestId('vital-medium').className).toContain('bg-warn-tint');
    expect(screen.getByTestId('risk-legend')).toHaveTextContent('เสี่ยงต่ำ 5 · ปานกลาง 4 · สูง 3');
  });
  it('zero high risk is not a red tile', () => {
    render(<LaborVitalsSection summary={makeSummary({ totalHigh: 0 })} trends={makeTrends()} />);
    expect(screen.getByTestId('vital-high').className).not.toContain('bg-danger');
  });
  it('24h admissions: Thai summary, Thai chart name, Thai axis', () => {
    render(<LaborVitalsSection summary={makeSummary()} trends={makeTrends()} />);
    const adm = screen.getByTestId('admissions-24h');
    expect(adm).toHaveTextContent('วันนี้ 6 ราย · เฉลี่ย 7 วัน 4.2 ราย/วัน');
    expect(within(adm).getByRole('img', { name: 'จำนวนรับเข้ารายชั่วโมง 24 ชั่วโมงล่าสุด' })).toBeInTheDocument();
    expect(within(adm).getByText('ตอนนี้')).toBeInTheDocument();
  });
  it('no English mono labels, and every tile has a hint', () => {
    render(<LaborVitalsSection summary={makeSummary()} trends={makeTrends()} />);
    expect(screen.queryByText(/ACTIVE LABOR|ADMISSIONS|HIGH RISK|MEDIUM|NOW/)).toBeNull();
    expect(screen.getByRole('button', { name: 'คำอธิบาย: ผู้คลอดในห้องคลอด' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'คำอธิบาย: CPD เสี่ยงสูง' })).toBeInTheDocument();
  });
});
```

```tsx
// tests/unit/components/dashboard/province/ContinuumSection.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ContinuumSection } from '@/components/dashboard/province/ContinuumSection';
import { ANC_REGISTRY_LABEL_TH } from '@/config/anc-freshness';
import { makeContinuum } from '../../../../helpers/dashboard-fixtures';

describe('ContinuumSection', () => {
  it('links each board number to its board', () => {
    render(<ContinuumSection continuum={makeContinuum()} />);
    expect(screen.getByRole('region', { name: 'ฝากครรภ์และการส่งต่อ' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `${ANC_REGISTRY_LABEL_TH} 1,169` })).toHaveAttribute('href', '/pregnancies');
    expect(screen.getByRole('link', { name: 'ครรภ์เสี่ยงสูง HR3 106' })).toHaveAttribute('href', '/pregnancies?risk=HR3');
    expect(screen.getByRole('link', { name: /ใกล้คลอด ≤\d+ วัน 172/ })).toHaveAttribute('href', '/pregnancies?cohort=due_soon');
    const ref = screen.getByTestId('continuum-referrals');
    expect(within(ref).getByText('31')).toBeInTheDocument();
    expect(within(ref).getByText('วันนี้ 2 ราย')).toBeInTheDocument();
  });
  it('HR3 is amber, not red — red is reserved for acute intrapartum risk', () => {
    render(<ContinuumSection continuum={makeContinuum()} />);
    expect(screen.getByTestId('continuum-hr3').className).toContain('bg-warn-tint');
  });
  it('the ANC registry tile explains its criteria', () => {
    render(<ContinuumSection continuum={makeContinuum()} />);
    expect(screen.getByRole('button', { name: `คำอธิบาย: ${ANC_REGISTRY_LABEL_TH}` })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/unit/components/dashboard/province/LaborVitalsSection.test.tsx tests/unit/components/dashboard/province/ContinuumSection.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Create the shared hint copy (moved verbatim from `ProvinceVitalsStrip.tsx`)**

```tsx
// src/components/dashboard/province/metric-hints.tsx
// Tooltip copy for the labour vitals, shared by the kiosk ProvinceVitalsStrip
// and the normal-mode LaborVitalsSection. Mirrors the SQL in
// services/dashboard.ts (getDashboardSummary / getDashboardTrends) so the
// explanation cannot drift from the metric without a code change.
import type { ReactNode } from 'react';

export interface MetricHint {
  title: string;
  body: ReactNode;
}

export const VITALS_HINTS = {
  active: {
    title: 'ผู้ป่วยในห้องคลอดทั้งจังหวัด',
    body: (
      <>
        จำนวนผู้ป่วยที่ยังอยู่ในห้องคลอด (<strong>labor_status = ACTIVE</strong>) รวมทุก รพ.
        ใน จ.ขอนแก่นที่เปิดใช้งานในระบบ KK-LRMS. ตัวเลข <strong>+N ราย/24h</strong> =
        จำนวนรับใหม่ในรอบ 24 ชม.ที่ผ่านมา. แถบสีด้านล่างเป็นสัดส่วนตามระดับความเสี่ยง CPD ของ
        score ล่าสุด — LOW (เขียว) / MED (ส้ม) / HIGH (แดง). คะแนน CPD คำนวณจาก
        src/services/cpd-score.ts.
      </>
    ),
  },
  high: {
    title: 'ผู้ป่วยเสี่ยงสูง (CPD HIGH)',
    body: (
      <>
        ผู้ป่วย <strong>labor_status = ACTIVE</strong> ที่ <strong>CPD score ล่าสุด</strong>{' '}
        อยู่ในเกณฑ์ HIGH ตาม src/config/risk-levels.ts. ▲ <strong>+N</strong> = รับใหม่ใน 24
        ชม.ล่าสุดที่ปัจจุบันอยู่ในระดับนี้. ปฏิบัติ: เฝ้าระวังใกล้ชิด พร้อมส่งต่อ รพ.ที่มี
        ศักยภาพสูงกว่าถ้าจำเป็น.
      </>
    ),
  },
  medium: {
    title: 'ผู้ป่วยเสี่ยงปานกลาง (CPD MEDIUM)',
    body: (
      <>
        ผู้ป่วย <strong>labor_status = ACTIVE</strong> ที่ CPD score ล่าสุดอยู่ในเกณฑ์ MEDIUM.
        ▲ <strong>+N</strong> = รับใหม่ใน 24 ชม.ล่าสุดที่ปัจจุบันอยู่ในระดับนี้. ปฏิบัติ:
        ติดตามดูแลตามแนวทาง, ทบทวนคะแนน CPD ถ้าอาการเปลี่ยน.
      </>
    ),
  },
  low: {
    title: 'ผู้ป่วยเสี่ยงต่ำ (CPD LOW)',
    body: (
      <>
        ผู้ป่วย <strong>labor_status = ACTIVE</strong> ที่ CPD score ล่าสุดอยู่ในเกณฑ์ LOW
        (ปกติ). ▲ <strong>+N</strong> = รับใหม่ใน 24 ชม.ล่าสุดที่ปัจจุบันอยู่ในระดับนี้.
      </>
    ),
  },
} satisfies Record<string, MetricHint>;

export function admissionsHint(today: number, avg7d: number): MetricHint {
  return {
    title: 'รับเข้าห้องคลอดในรอบ 24 ชั่วโมง',
    body: (
      <>
        กราฟแท่งแสดงจำนวนผู้ป่วยรับเข้าใหม่ <strong>ทุกชั่วโมงตลอด 24 ชม.ล่าสุด</strong>{' '}
        (เวลาประเทศไทย, Asia/Bangkok). <strong>{today} today</strong> =
        รับเข้าตั้งแต่ 00:00 ของวันนี้.{' '}
        <strong>avg {avg7d.toFixed(1)}</strong> = ค่าเฉลี่ยรับเข้าต่อวันใน 7
        วันที่ผ่านมา. ถ้า today สูงกว่า avg อย่างเห็นได้ชัด แสดงว่ามีการรับเข้าผิดปกติ
        ควรตรวจสอบสาเหตุ.
      </>
    ),
  };
}
```

- [ ] **Step 4: Point the kiosk strip at the shared copy (output identical)**

In `src/components/dashboard/ProvinceVitalsStrip.tsx`:

1. Add the import: `import { VITALS_HINTS, admissionsHint } from './province/metric-hints';`
2. In `ProvinceVitalsStrip`, before `return (`, add: `  const adm = admissionsHint(trends.admissionsToday, trends.admissions7dAvg);`
3. In each `<CellWithTooltip>`, delete the `title="…"` line and the whole `body={ … }` prop (from `body={` to its closing `}` line), then insert the replacement:

| Lines | First old line | Replacement |
|---|---|---|
| 80–89 | `          title="ผู้ป่วยในห้องคลอดทั้งจังหวัด"` | `          title={VITALS_HINTS.active.title}` + `          body={VITALS_HINTS.active.body}` |
| 134–142 | `          title="ผู้ป่วยเสี่ยงสูง (CPD HIGH)"` | `          title={VITALS_HINTS.high.title}` + `          body={VITALS_HINTS.high.body}` |
| 154–161 | `          title="ผู้ป่วยเสี่ยงปานกลาง (CPD MEDIUM)"` | `          title={VITALS_HINTS.medium.title}` + `          body={VITALS_HINTS.medium.body}` |
| 173–179 | `          title="ผู้ป่วยเสี่ยงต่ำ (CPD LOW)"` | `          title={VITALS_HINTS.low.title}` + `          body={VITALS_HINTS.low.body}` |
| 192–202 | `          title="รับเข้าห้องคลอดในรอบ 24 ชั่วโมง"` | `          title={adm.title}` + `          body={adm.body}` |

4. Add a header-comment line: `// Kiosk-only since UI sub-project 2; normal mode renders province/LaborVitalsSection + ContinuumSection.`

- [ ] **Step 5: Make `BarStrip` able to fill its container (kiosk call sites unchanged)**

In `src/components/dashboard/shared.tsx`, replace the `BarStrip` function (lines 194–224, from `export function BarStrip({` to its closing `}`) with:

```tsx
export function BarStrip({
  values,
  width = 280,
  height = 26,
  color = 'var(--accent-navy)',
  fluid = false,
  label = '24-hour admissions',
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  /** Stretch to the container width (bars are drawn in a width×height viewBox). */
  fluid?: boolean;
  /** Accessible name of the chart. */
  label?: string;
}) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const bw = width / values.length;
  return (
    <svg
      width={fluid ? '100%' : width}
      height={height}
      viewBox={fluid ? `0 0 ${width} ${height}` : undefined}
      preserveAspectRatio={fluid ? 'none' : undefined}
      className="block"
      role="img"
      aria-label={label}
    >
      {values.map((v, i) => (
        <rect
          key={i}
          x={i * bw + 0.5}
          y={height - (v / max) * (height - 2)}
          width={Math.max(1, bw - 1)}
          height={(v / max) * (height - 2)}
          fill={color}
          opacity={v === 0 ? 0.2 : 0.85}
        />
      ))}
    </svg>
  );
}
```

- [ ] **Step 6: Create the sections**

```tsx
// src/components/dashboard/province/LaborVitalsSection.tsx
// ห้องคลอดทั้งจังหวัด — active labour by CPD risk plus the 24-hour admission
// histogram. Every number is a /api/dashboard aggregate (summary / trends).
'use client';

import type { DashboardSummary, DashboardTrends } from '@/types/api';
import { SectionCard } from '@/components/shared/SectionCard';
import { KpiGrid } from '@/components/shared/KpiGrid';
import { KpiTile } from '@/components/shared/KpiTile';
import { HintButton } from '@/components/shared/HintButton';
import { BarStrip, RiskBar } from '@/components/dashboard/shared';
import { VITALS_HINTS, admissionsHint } from './metric-hints';

const AXIS = ['−24 ชม.', '−18', '−12', '−6', 'ตอนนี้'] as const;
const fmt = (n: number) => n.toLocaleString('en-US');

export function LaborVitalsSection({ summary, trends }: { summary: DashboardSummary; trends: DashboardTrends }) {
  const fresh = trends.newByRisk24h;
  const adm = admissionsHint(trends.admissionsToday, trends.admissions7dAvg);
  return (
    <SectionCard
      title="ห้องคลอดทั้งจังหวัด"
      description="ผู้คลอดที่ยังอยู่ในห้องคลอดทุกโรงพยาบาล แยกตามระดับความเสี่ยง CPD ล่าสุด"
    >
      <KpiGrid>
        <KpiTile
          testId="vital-active"
          label="ผู้คลอดในห้องคลอด"
          count={summary.totalActive}
          sub={`รับใหม่ ${fmt(fresh.total)} รายใน 24 ชม.`}
          hint={VITALS_HINTS.active}
        />
        <KpiTile
          testId="vital-high"
          label="CPD เสี่ยงสูง"
          count={summary.totalHigh}
          tone={summary.totalHigh > 0 ? 'high' : 'default'}
          sub={`รับใหม่ใน 24 ชม. ${fmt(fresh.high)} ราย`}
          hint={VITALS_HINTS.high}
        />
        <KpiTile
          testId="vital-medium"
          label="CPD เสี่ยงปานกลาง"
          count={summary.totalMedium}
          tone={summary.totalMedium > 0 ? 'warn' : 'default'}
          sub={`รับใหม่ใน 24 ชม. ${fmt(fresh.medium)} ราย`}
          hint={VITALS_HINTS.medium}
        />
        <KpiTile
          testId="vital-low"
          label="CPD เสี่ยงต่ำ"
          count={summary.totalLow}
          sub={`รับใหม่ใน 24 ชม. ${fmt(fresh.low)} ราย`}
          hint={VITALS_HINTS.low}
        />
      </KpiGrid>

      <div className="mt-4">
        <RiskBar low={summary.totalLow} medium={summary.totalMedium} high={summary.totalHigh} height={8} />
        <p data-testid="risk-legend" className="mt-1.5 text-label text-ink-muted">
          <span className="text-ok-text">เสี่ยงต่ำ {fmt(summary.totalLow)}</span> ·{' '}
          <span className="text-warn-text">ปานกลาง {fmt(summary.totalMedium)}</span> ·{' '}
          <span className="text-danger-text">สูง {fmt(summary.totalHigh)}</span>
        </p>
      </div>

      <div data-testid="admissions-24h" className="mt-5 border-t border-border pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="flex items-center gap-1.5 text-body-lg text-ink">
            รับเข้าห้องคลอดรายชั่วโมง (24 ชม.ล่าสุด)
            <HintButton label="รับเข้าห้องคลอดรายชั่วโมง" title={adm.title} body={adm.body} className="text-ink-muted" />
          </h3>
          <p className="text-label text-ink-muted">
            วันนี้ <b className="tabular-nums text-ink">{fmt(trends.admissionsToday)}</b> ราย · เฉลี่ย 7 วัน{' '}
            <b className="tabular-nums text-ink">{trends.admissions7dAvg.toFixed(1)}</b> ราย/วัน
          </p>
        </div>
        <div className="mt-2">
          <BarStrip
            values={trends.admissions24h}
            width={480}
            height={40}
            color="var(--brand)"
            fluid
            label="จำนวนรับเข้ารายชั่วโมง 24 ชั่วโมงล่าสุด"
          />
          <div className="mt-1 flex justify-between text-caption text-ink-muted">
            {AXIS.map((a) => (
              <span key={a}>{a}</span>
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
```

```tsx
// src/components/dashboard/province/ContinuumSection.tsx
// ฝากครรภ์และการส่งต่อ — the same headline numbers the pregnancies and
// referrals boards show (getAncBoardCounts / getReferralOpsCounts), each a
// link into its board.
'use client';

import type { DashboardContinuum } from '@/types/api';
import { SectionCard } from '@/components/shared/SectionCard';
import { KpiGrid } from '@/components/shared/KpiGrid';
import { KpiTile } from '@/components/shared/KpiTile';
import { ANC_REGISTRY_CRITERIA_TH, ANC_REGISTRY_LABEL_TH } from '@/config/anc-freshness';
import { ANC_OPS } from '@/config/anc-ops';

export function ContinuumSection({ continuum }: { continuum: DashboardContinuum }) {
  const { anc, referrals } = continuum;
  return (
    <SectionCard title="ฝากครรภ์และการส่งต่อ" description="ตัวเลขเดียวกับหน้าฝากครรภ์และหน้าส่งต่อ — กดเพื่อเปิดรายการ">
      <KpiGrid>
        <KpiTile
          testId="continuum-anc"
          label={ANC_REGISTRY_LABEL_TH}
          count={anc.total}
          href="/pregnancies"
          hint={{ title: ANC_REGISTRY_LABEL_TH, body: ANC_REGISTRY_CRITERIA_TH }}
        />
        {/* Amber, not red: red is reserved for acute intrapartum risk (same
            rule as the province map pins). */}
        <KpiTile
          testId="continuum-hr3"
          label="ครรภ์เสี่ยงสูง HR3"
          count={anc.hr3}
          tone={anc.hr3 > 0 ? 'warn' : 'default'}
          href="/pregnancies?risk=HR3"
        />
        <KpiTile
          testId="continuum-due-soon"
          label={`ใกล้คลอด ≤${ANC_OPS.dueSoonDays} วัน`}
          count={anc.dueSoon}
          tone={anc.dueSoon > 0 ? 'warn' : 'default'}
          href="/pregnancies?cohort=due_soon"
        />
        <KpiTile
          testId="continuum-referrals"
          label="ส่งต่อ 7 วันล่าสุด"
          count={referrals.last7d}
          sub={`วันนี้ ${referrals.today.toLocaleString('en-US')} ราย`}
          href="/referrals"
        />
      </KpiGrid>
    </SectionCard>
  );
}
```

- [ ] **Step 7: Run the new tests plus the frozen kiosk**

Run: `npx vitest run tests/unit/components/dashboard/province/LaborVitalsSection.test.tsx tests/unit/components/dashboard/province/ContinuumSection.test.tsx tests/unit/components/dashboard/province/KioskDashboard.test.tsx`
Expected: PASS. The kiosk test is unedited.

- [ ] **Step 8: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add src/components/dashboard/province/metric-hints.tsx src/components/dashboard/province/LaborVitalsSection.tsx src/components/dashboard/province/ContinuumSection.tsx src/components/dashboard/ProvinceVitalsStrip.tsx src/components/dashboard/shared.tsx tests/unit/components/dashboard/province/LaborVitalsSection.test.tsx tests/unit/components/dashboard/province/ContinuumSection.test.tsx
git commit -m "feat(dashboard): Thai labour-vitals and continuum sections on a responsive grid

Replaces the 5-column vitals strip that squeezed 'เคสในห้องคลอด' to one word
per line inside the shell. Tooltip copy is shared with the kiosk strip;
BarStrip can fill its container. HR3 is amber per the map's red-is-acute rule.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: High-risk list — light-mode restyle and `HighRiskSection`

**Files:**
- Modify: `src/config/risk-levels.ts` (`shortLabelTh`), `src/components/dashboard/HighRiskPatientList.tsx` (light branch only)
- Create: `src/components/dashboard/province/HighRiskSection.tsx`
- Test:
  - Update `tests/unit/components/HighRiskPatientList.test.tsx` (Thai tab names, "ไม่มีข้อมูล").
  - Create `tests/unit/components/HighRiskPatientList-light.test.tsx` and `tests/unit/components/dashboard/province/HighRiskSection.test.tsx`.

**Interfaces:**
- Consumes: `RiskChip` (shared, `children` override + `...rest` passes `data-risk`), `EmptyState`, `RISK_LEVELS`, `classifyRiskLevel`, `COLOR`, `ANC_OPS`.
- Produces:
  - `RiskLevelConfig.shortLabelTh` (`'ต่ำ' | 'ปานกลาง' | 'สูง'`)
  - `HighRiskPatientListProps.embedded?: boolean`
  - `HighRiskSection({ patients, isLoading, totalActive, totalHigh, ancFallback })`

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/unit/components/HighRiskPatientList-light.test.tsx
// UI sub-project 2: Thai, token-styled light variant; kiosk branch untouched.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HighRiskPatientList } from '@/components/dashboard/HighRiskPatientList';
import { RISK_LEVELS } from '@/config/risk-levels';
import { COLOR } from '@/config/design-tokens';
import { RiskLevel } from '@/types/domain';
import { hexToRgb } from '../../helpers/color';
import { makeHighRiskPatient } from '../../helpers/dashboard-fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe('HighRiskPatientList — light (Thai) variant', () => {
  it('config carries short Thai risk labels', () => {
    expect(RISK_LEVELS[RiskLevel.HIGH].shortLabelTh).toBe('สูง');
    expect(RISK_LEVELS[RiskLevel.MEDIUM].shortLabelTh).toBe('ปานกลาง');
    expect(RISK_LEVELS[RiskLevel.LOW].shortLabelTh).toBe('ต่ำ');
  });
  it('Thai column headers', () => {
    render(<HighRiskPatientList patients={[makeHighRiskPatient()]} />);
    for (const h of ['ความเสี่ยง', 'ผู้คลอด', 'โรงพยาบาล', 'รับเข้า / นาน', 'สัญญาณชีพล่าสุด', 'พาร์โทกราฟ', 'หมายเหตุ']) {
      expect(screen.getByText(h)).toBeInTheDocument();
    }
    expect(screen.queryByText(/^(RISK|PATIENT|HOSPITAL|LAST VITAL|NOTE)$/)).toBeNull();
  });
  it('risk renders through the shared RiskChip: short text, full Thai name, data-risk kept', () => {
    const { container } = render(<HighRiskPatientList patients={[makeHighRiskPatient()]} />);
    const chip = container.querySelector('[data-risk="HIGH"]')!;
    expect(chip.textContent).toBe('สูง');
    expect(chip).toHaveAttribute('aria-label', 'เสี่ยงสูง');
  });
  it('CPD score colour follows RISK_LEVELS (7 is MEDIUM), not the old >= 6 rule', () => {
    render(<HighRiskPatientList patients={[makeHighRiskPatient({ cpdScore: 7, riskLevel: 'MEDIUM' })]} />);
    fireEvent.click(screen.getByText(/ทั้งหมดในห้องคลอด/));
    expect(screen.getByText('7').style.color).toBe(hexToRgb(COLOR.riskMediumText));
  });
  it('embedded drops the old section label (the SectionCard owns the title)', () => {
    render(<HighRiskPatientList patients={[makeHighRiskPatient()]} embedded />);
    expect(screen.queryByText(/High-risk & Active labor/)).toBeNull();
  });
  it('the empty state is tab-aware and uses EmptyState', () => {
    render(<HighRiskPatientList patients={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('ไม่มีผู้คลอดเสี่ยงสูงในห้องคลอดขณะนี้');
    fireEvent.click(screen.getByText(/ทั้งหมดในห้องคลอด/));
    expect(screen.getByRole('status')).toHaveTextContent('ไม่มีผู้คลอดในห้องคลอดขณะนี้');
  });
  it('the loading skeleton uses the same grid as the rows', () => {
    const { container } = render(<HighRiskPatientList patients={[]} isLoading />);
    const header = container.querySelector('.grid') as HTMLElement;
    const skeleton = container.querySelectorAll('.grid')[1] as HTMLElement;
    expect(skeleton.style.gridTemplateColumns).toBe(header.style.gridTemplateColumns);
    expect(skeleton.children.length).toBe(12);
  });
  it('kiosk keeps its English columns and chip', () => {
    const { container } = render(<HighRiskPatientList patients={[makeHighRiskPatient()]} variant="kiosk" />);
    expect(screen.getByText('RISK')).toBeInTheDocument();
    expect(container.querySelector('[data-risk="HIGH"]')!.textContent).toBe('HIGH');
  });
});
```

```tsx
// tests/unit/components/dashboard/province/HighRiskSection.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HighRiskSection } from '@/components/dashboard/province/HighRiskSection';
import { makeHighRiskPatient } from '../../../../helpers/dashboard-fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe('HighRiskSection', () => {
  it('titles the list in Thai and quotes the server total, not the row count', () => {
    render(
      <HighRiskSection patients={[makeHighRiskPatient()]} isLoading={false} totalActive={1234} totalHigh={9} ancFallback={null} />,
    );
    expect(screen.getByRole('region', { name: 'ผู้คลอดเสี่ยงสูงและในห้องคลอด' })).toBeInTheDocument();
    expect(screen.getByText(/ในห้องคลอดทั้งจังหวัด 1,234 ราย/)).toBeInTheDocument();
    expect(screen.getByText(/เฉพาะเสี่ยงสูง/)).toHaveTextContent('9');
    expect(screen.queryByText(/High-risk & Active labor/)).toBeNull();
  });
});
```

Update `tests/unit/components/HighRiskPatientList.test.tsx` (string swaps only):

```bash
sed -i -e 's#/HIGH-RISK ONLY/#/เฉพาะเสี่ยงสูง/#g' -e 's#/ALL ACTIVE/#/ทั้งหมดในห้องคลอด/#g' -e 's#/no data/#/ไม่มีข้อมูล/#g' tests/unit/components/HighRiskPatientList.test.tsx
```

Also rename two test titles to match: `'renders tab counts (HIGH-RISK ONLY and ALL ACTIVE)'` becomes `'renders tab counts (เฉพาะเสี่ยงสูง and ทั้งหมดในห้องคลอด)'`, and `'shows no-data text for null lastVitalAt'` keeps its name.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/unit/components/HighRiskPatientList.test.tsx tests/unit/components/HighRiskPatientList-light.test.tsx tests/unit/components/dashboard/province/HighRiskSection.test.tsx`
Expected: FAIL. The Thai tab names are not found, `shortLabelTh` is undefined, and `HighRiskSection` does not resolve.

- [ ] **Step 3: Add `shortLabelTh` to the risk config**

In `src/config/risk-levels.ts`, make two edits.

1. In `interface RiskLevelConfig`, after `  labelTh: string;`, add:

   ```ts
     /** Compact Thai label for dense chips (accessible name stays labelTh). */
     shortLabelTh: string;
   ```

2. In `RISK_LEVELS`, add `shortLabelTh` after each `labelTh` line:

   | After | Add |
   |---|---|
   | `labelTh: 'เสี่ยงต่ำ',` | `shortLabelTh: 'ต่ำ',` |
   | `labelTh: 'เสี่ยงปานกลาง',` | `shortLabelTh: 'ปานกลาง',` |
   | `labelTh: 'เสี่ยงสูง',` | `shortLabelTh: 'สูง',` |

- [ ] **Step 4: Restyle the light branch of `HighRiskPatientList.tsx`.** Each edit gives the exact current text and its replacement. Kiosk branches are untouched.

**E1: Imports.**

Old:

```tsx
import { MIN_TEXT_PX } from '@/config/design-tokens';
import { cn, formatRelativeTime, buildPatientId } from '@/lib/utils';
```

New:

```tsx
import { COLOR, MIN_TEXT_PX } from '@/config/design-tokens';
import { RISK_LEVELS, classifyRiskLevel } from '@/config/risk-levels';
import { ANC_OPS } from '@/config/anc-ops';
import { RiskLevel } from '@/types/domain';
import { RiskChip as SharedRiskChip } from '@/components/shared/RiskChip';
import { EmptyState } from '@/components/shared/EmptyState';
import { cn, formatRelativeTime, buildPatientId } from '@/lib/utils';
```

**E2: Props.**

Old:

```tsx
  totalActive?: number | null;
  totalHigh?: number | null;
}
```

New:

```tsx
  totalActive?: number | null;
  totalHigh?: number | null;
  /** Inside a SectionCard that already titles the list: omit the legacy
   *  SectionLabel header. Kiosk and HospitalDetailDialog leave it false. */
  embedded?: boolean;
}
```

**E3: Kiosk chip renamed, light chip added.**

- Old: `function RiskChip({ riskLevel, variant }: { riskLevel: string; variant: 'light' | 'kiosk' }) {`
- New: `function KioskRiskChip({ riskLevel, variant }: { riskLevel: string; variant: 'light' | 'kiosk' }) {`

Then insert this immediately before the line `/** Where this woman is in her labour, for a board that lists everyone admitted`:

```tsx
/** Light variant: the shared RiskChip, so colour and Thai naming match every
 *  other screen. Unknown values render as plain text rather than looking safe. */
function LightRiskChip({ riskLevel }: { riskLevel: string }) {
  const level = riskLevel in RISK_LEVELS ? (riskLevel as RiskLevel) : null;
  if (!level) return <span className="text-caption text-ink-muted">{riskLevel || '—'}</span>;
  return (
    <SharedRiskChip level={level} size="sm" data-risk={riskLevel}>
      {RISK_LEVELS[level].shortLabelTh}
    </SharedRiskChip>
  );
}

```

**E4: Thai "no data".**

- Old: `  if (!iso) return { text: 'no data', stale: true };`
- New: `  if (!iso) return { text: 'ไม่มีข้อมูล', stale: true };`

**E5: The skeleton follows the real grid.** Replace the whole `function SkeletonRow(...) { ... }` (lines 188–206) with:

```tsx
function SkeletonRow({
  variant,
  gridCols,
  count,
}: {
  variant: 'light' | 'kiosk';
  /** The same template the rows use — one source, no hand-kept copy. */
  gridCols: string;
  count: number;
}) {
  const barBg = variant === 'kiosk' ? 'bg-white/10' : 'bg-surface-muted';
  return (
    <div
      className="grid items-center gap-2 border-b px-2 py-2"
      style={{
        gridTemplateColumns: gridCols,
        borderColor: variant === 'kiosk' ? 'var(--kiosk-rule)' : 'var(--rule-hair)',
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn('h-3 animate-pulse rounded', barBg)} />
      ))}
    </div>
  );
}
```

**E6: Signature.**

Old:

```tsx
  ancFallback,
  totalActive,
  totalHigh,
}: HighRiskPatientListProps) {
```

New:

```tsx
  ancFallback,
  totalActive,
  totalHigh,
  embedded = false,
}: HighRiskPatientListProps) {
```

**E7: Light columns (Thai).** Replace the block that starts at `    : [` and ends at `      ];` (lines 258–271) with:

```tsx
    : [
        { key: 'risk', label: 'ความเสี่ยง', w: 76 },
        { key: 'anhn', label: 'AN / HN', w: 130 },
        { key: 'patient', label: 'ผู้คลอด', w: 0 }, // flex 1
        { key: 'ga', label: 'GA', w: 44 },
        { key: 'cpd', label: 'CPD', w: 44 },
        { key: 'hospital', label: 'โรงพยาบาล', w: 150 },
        { key: 'admit', label: 'รับเข้า / นาน', w: 84 },
        { key: 'labor', label: 'สถานะ', w: 88 },
        { key: 'vital', label: 'สัญญาณชีพล่าสุด', w: 96 },
        { key: 'partograph', label: 'พาร์โทกราฟ', w: 110 },
        { key: 'screen', label: 'คัดกรอง (เงา)', w: 140 },
        { key: 'note', label: 'หมายเหตุ', w: 220 },
      ];
```

**E8: Legacy header only when not embedded.**

Old:

```tsx
      <SectionLabel idx={1} right={<span>AUTO-SORT · HIGH → MED · {counts.total} ACTIVE</span>}>
        High-risk &amp; Active labor
      </SectionLabel>
```

New:

```tsx
      {!embedded && (
        <SectionLabel idx={1} right={<span>AUTO-SORT · HIGH → MED · {counts.total} ACTIVE</span>}>
          High-risk &amp; Active labor
        </SectionLabel>
      )}
```

**E9: Thai tabs with state.** These tabs render only in light mode.

First edit.

Old:

```tsx
            { k: 'high', l: 'HIGH-RISK ONLY', n: counts.high },
            { k: 'all', l: 'ALL ACTIVE', n: counts.total },
          ].map((x) => (
            <button
              key={x.k}
              onClick={() => setTab(x.k as 'high' | 'all')}
              className={cn(
                'border-b-2 bg-transparent px-3.5 py-2 font-mono text-caption tracking-[0.08em]',
```

New:

```tsx
            { k: 'high', l: 'เฉพาะเสี่ยงสูง', n: counts.high },
            { k: 'all', l: 'ทั้งหมดในห้องคลอด', n: counts.total },
          ].map((x) => (
            <button
              key={x.k}
              type="button"
              aria-pressed={tab === x.k}
              onClick={() => setTab(x.k as 'high' | 'all')}
              className={cn(
                'border-b-2 bg-transparent px-3.5 py-2 text-label',
```

Second edit, so the Thai header row is not set in mono.

Old:

```tsx
          className="grid gap-2 border-t border-b px-2 py-2 font-mono text-caption tracking-[0.1em]"
```

New:

```tsx
          className={cn(
            'grid gap-2 border-t border-b px-2 py-2 text-caption',
            isKiosk ? 'font-mono tracking-[0.1em]' : 'font-semibold',
          )}
```

**E10: Skeleton call.**

- Old: `              <SkeletonRow key={i} variant={variant} />`
- New: `              <SkeletonRow key={i} variant={variant} gridCols={gridCols} count={columns.length} />`

**E11: Empty state.** Replace from `        ) : shown.length === 0 ? (` through the `          </div>` that closes the empty block, which is the line before `        ) : (` (lines 335–360), with:

```tsx
        ) : shown.length === 0 ? (
          isKiosk ? (
            <div
              className="border-b px-2 py-8 text-center font-mono text-caption"
              style={{ color: inkMuted, borderColor: ruleHair }}
            >
              <div>ไม่มีผู้คลอดเสี่ยงสูงในห้องคลอดขณะนี้</div>
              {ancFallback && (ancFallback.hr3 > 0 || ancFallback.dueSoon > 0) && (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                  <span>เฝ้าระวังล่วงหน้า:</span>
                  <Link
                    href="/pregnancies?risk=HR3"
                    className="underline decoration-dotted underline-offset-2"
                    style={{ color: 'var(--risk-high)' }}
                  >
                    ครรภ์เสี่ยงสูง HR3 {ancFallback.hr3} ราย
                  </Link>
                  <Link
                    href="/pregnancies?cohort=due_soon"
                    className="underline decoration-dotted underline-offset-2"
                    style={{ color: 'var(--risk-medium)' }}
                  >
                    ใกล้คลอด ≤14 วัน {ancFallback.dueSoon} ราย
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              illustration="ward"
              className="mt-3 shadow-none"
              title={tab === 'high' ? 'ไม่มีผู้คลอดเสี่ยงสูงในห้องคลอดขณะนี้' : 'ไม่มีผู้คลอดในห้องคลอดขณะนี้'}
              description={
                ancFallback && (ancFallback.hr3 > 0 || ancFallback.dueSoon > 0) ? (
                  <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                    <span>เฝ้าระวังล่วงหน้า:</span>
                    <Link
                      href="/pregnancies?risk=HR3"
                      className="text-danger-text underline decoration-dotted underline-offset-2"
                    >
                      ครรภ์เสี่ยงสูง HR3 {ancFallback.hr3} ราย
                    </Link>
                    <Link
                      href="/pregnancies?cohort=due_soon"
                      className="text-warn-text underline decoration-dotted underline-offset-2"
                    >
                      ใกล้คลอด ≤{ANC_OPS.dueSoonDays} วัน {ancFallback.dueSoon} ราย
                    </Link>
                  </span>
                ) : undefined
              }
            />
          )
```

The kiosk block above is today's block, unchanged.

**E12: Row hover token.**

- Old: `                  !isKiosk && 'hover:bg-slate-50',`
- New: `                  !isKiosk && 'hover:bg-surface-muted',`

**E13: Row-0 critical gradient from the token.**

Old:

```tsx
                        : 'linear-gradient(to right, rgba(239,68,68,0.08), transparent 40%)'
```

New:

```tsx
                        : `linear-gradient(to right, ${COLOR.riskHighTint}, transparent 40%)`
```

**E14: Risk chip per variant.**

- Old: `                  <RiskChip riskLevel={p.riskLevel} variant={variant} />`
- New: `                  {isKiosk ? <KioskRiskChip riskLevel={p.riskLevel} variant={variant} /> : <LightRiskChip riskLevel={p.riskLevel} />}`

**E15: CPD score colour from config in light mode.** The kiosk keeps `>= 6 / >= 4`; see spec D5.

Old:

```tsx
                    color:
                      p.cpdScore >= 6
                        ? isKiosk
                          ? 'var(--kiosk-high)'
                          : 'var(--risk-high)'
                        : p.cpdScore >= 4
                          ? isKiosk
                            ? 'var(--kiosk-med)'
                            : 'var(--risk-medium)'
                          : isKiosk
                            ? 'var(--kiosk-low)'
                            : 'var(--risk-low)',
```

New:

```tsx
                    color: isKiosk
                      ? p.cpdScore >= 6
                        ? 'var(--kiosk-high)'
                        : p.cpdScore >= 4
                          ? 'var(--kiosk-med)'
                          : 'var(--kiosk-low)'
                      : RISK_LEVELS[classifyRiskLevel(p.cpdScore)].textColor,
```

- [ ] **Step 5: Create `HighRiskSection`**

```tsx
// src/components/dashboard/province/HighRiskSection.tsx
// ผู้คลอดเสี่ยงสูงและในห้องคลอด — the province roster in a SectionCard. The
// header counts are server aggregates (summary.totalActive / totalHigh); the
// patients array is row-limited and never used for a count.
'use client';

import { SectionCard } from '@/components/shared/SectionCard';
import { HighRiskPatientList } from '@/components/dashboard/HighRiskPatientList';
import type { HighRiskPatient } from '@/types/api';

export interface HighRiskSectionProps {
  patients: HighRiskPatient[];
  isLoading: boolean;
  totalActive: number;
  totalHigh: number;
  ancFallback: { hr3: number; dueSoon: number } | null;
}

export function HighRiskSection({ patients, isLoading, totalActive, totalHigh, ancFallback }: HighRiskSectionProps) {
  return (
    <SectionCard
      title="ผู้คลอดเสี่ยงสูงและในห้องคลอด"
      description={`เรียงตามคะแนน CPD จากสูงไปต่ำ · ในห้องคลอดทั้งจังหวัด ${totalActive.toLocaleString('en-US')} ราย`}
    >
      <HighRiskPatientList
        embedded
        patients={patients}
        isLoading={isLoading}
        ancFallback={ancFallback}
        totalActive={totalActive}
        totalHigh={totalHigh}
      />
    </SectionCard>
  );
}
```

- [ ] **Step 6: Run the list, section and kiosk tests, then the full suite**

Run: `npx vitest run tests/unit/components/HighRiskPatientList tests/unit/components/dashboard/province`
Expected: PASS for every `HighRiskPatientList*.test.tsx` and every province test. The KioskDashboard test is unedited.
Run: `npx vitest run --maxWorkers=6`
Expected: PASS.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add src/config/risk-levels.ts src/components/dashboard/HighRiskPatientList.tsx src/components/dashboard/province/HighRiskSection.tsx tests/unit/components/HighRiskPatientList.test.tsx tests/unit/components/HighRiskPatientList-light.test.tsx tests/unit/components/dashboard/province/HighRiskSection.test.tsx
git commit -m "feat(dashboard): Thai, token-styled high-risk list in a SectionCard

Light variant: Thai tabs/columns, shared RiskChip, CPD colour from
RISK_LEVELS (was a hardcoded >=6/>=4 that disagreed with the config),
tab-aware EmptyState, skeleton derived from the row grid. Kiosk unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Care stages and shift summary

**Files:**
- Modify: `src/components/dashboard/StageKPICards.tsx` (full replacement), `src/components/dashboard/ShiftSummary.tsx` (full replacement)
- Create: `src/components/dashboard/province/CareStageSection.tsx`
- Test: `tests/unit/components/dashboard/province/CareStageSection.test.tsx`, `tests/unit/components/dashboard/ShiftSummary.test.tsx`

**Interfaces:**
- Consumes: `DashboardStageKPIs`, `DashboardTrends`, `SectionCard`, `KpiGrid`, `KpiTile`.
- Produces: `StageKPICards({ stageKPIs })` (same props), `CareStageSection({ stageKPIs })`, `ShiftSummary({ trends })` (same props, now a `SectionCard`).

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/unit/components/dashboard/province/CareStageSection.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CareStageSection } from '@/components/dashboard/province/CareStageSection';
import { makeStageKPIs } from '../../../../helpers/dashboard-fixtures';

describe('CareStageSection', () => {
  it('three stage cards link to their boards', () => {
    render(<CareStageSection stageKPIs={makeStageKPIs()} />);
    expect(screen.getByRole('region', { name: 'ระยะการดูแล' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ANC กำลังติดตาม/ })).toHaveAttribute('href', '/pregnancies');
    expect(screen.getByRole('link', { name: /ในห้องคลอด/ })).toHaveAttribute('href', '/hospitals');
    expect(screen.getByRole('link', { name: /คลอดแล้ว · เดือนนี้/ })).toHaveAttribute('href', '/outcomes');
  });
  it('row labels are Thai and say what getStageKPIs counts', () => {
    render(<CareStageSection stageKPIs={makeStageKPIs()} />);
    const delivered = screen.getByRole('link', { name: /คลอดแล้ว · เดือนนี้/ });
    expect(within(delivered).getByText('ทารกปกติ').closest('[title]')).toHaveAttribute(
      'title',
      'Apgar 5 นาที ≥ 7 และน้ำหนักแรกเกิด ≥ 2,500 ก.',
    );
    expect(within(delivered).getByText('Apgar 5 นาที < 7')).toBeInTheDocument();
    expect(within(delivered).getByText('น้ำหนักแรกเกิด < 2,500 ก.')).toBeInTheDocument();
    expect(screen.getByText('CPD เสี่ยงสูง')).toBeInTheDocument();
    expect(screen.queryByText(/^(NORMAL|LOW APGAR|LBW|HIGH|LOW)$/)).toBeNull();
  });
  it('totals never wrap', () => {
    render(<CareStageSection stageKPIs={makeStageKPIs()} />);
    expect(screen.getByText('1,169').className).toContain('whitespace-nowrap');
  });
});
```

```tsx
// tests/unit/components/dashboard/ShiftSummary.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ShiftSummary } from '@/components/dashboard/ShiftSummary';
import { makeTrends } from '../../../helpers/dashboard-fixtures';

describe('ShiftSummary', () => {
  it('is a Thai section with current vs previous shift tiles', () => {
    render(<ShiftSummary trends={makeTrends()} />);
    expect(screen.getByRole('region', { name: 'สรุปเวร' })).toBeInTheDocument();
    expect(screen.getByText('เวรเช้า 08:00-16:00')).toBeInTheDocument();
    expect(screen.getByText('เปรียบเทียบกับ เวรดึก 00:00-08:00')).toBeInTheDocument();
    const adm = screen.getByTestId('shift-admissions');
    expect(within(adm).getByText('รับเข้า')).toBeInTheDocument();
    expect(within(adm).getByText('5')).toBeInTheDocument();
    expect(within(adm).getByText('เวรก่อน 3')).toBeInTheDocument();
    expect(screen.queryByText(/SHIFT SUMMARY|ADMISSIONS|DELIVERED|REFERRED/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/unit/components/dashboard/province/CareStageSection.test.tsx tests/unit/components/dashboard/ShiftSummary.test.tsx`
Expected: FAIL. `CareStageSection` does not resolve, and `ShiftSummary` has no region or Thai text.

- [ ] **Step 3: Implement**

```tsx
// src/components/dashboard/StageKPICards.tsx
// StageKPICards — care-continuum 3-up strip. Each card links to its board
// (2026-07-09): the dashboard summarises, the boards operate. The delivered
// card is labelled by its real window (Bangkok month). UI sub-project 2: Thai
// row labels that state exactly what getStageKPIs counts; tokens; no wraps.
'use client';

import Link from 'next/link';
import type { DashboardStageKPIs } from '@/types/api';
import { KpiGrid } from '@/components/shared/KpiGrid';

interface StageKPICardsProps {
  stageKPIs: DashboardStageKPIs;
}

interface StageRow {
  label: string;
  value: number;
  color: string;
  title?: string;
}

interface StageCardProps {
  title: string;
  total: number;
  href: string;
  rows: StageRow[];
}

function StageCard({ title, total, href, rows }: StageCardProps) {
  return (
    <Link
      href={href}
      className="block min-w-0 rounded-2xl bg-surface-card p-4 shadow-soft outline-none transition-colors hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-brand"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-body-lg text-ink">{title}</div>
        <div data-kpi-value className="whitespace-nowrap text-kpi-sm tabular-nums text-brand">
          {total.toLocaleString('en-US')}
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.label} title={r.title} className="flex items-center gap-2 text-label text-ink-muted">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
            <span className="min-w-0 flex-1">{r.label}</span>
            <span className="font-semibold tabular-nums text-ink">{r.value.toLocaleString('en-US')}</span>
          </div>
        ))}
      </div>
    </Link>
  );
}

export function StageKPICards({ stageKPIs }: StageKPICardsProps) {
  return (
    <KpiGrid min="md">
      <StageCard
        title="ANC กำลังติดตาม"
        total={stageKPIs.pregnancy.total}
        href="/pregnancies"
        rows={[
          { label: 'เสี่ยงต่ำ', value: stageKPIs.pregnancy.low, color: 'var(--risk-low)' },
          { label: 'HR1', value: stageKPIs.pregnancy.hr1, color: 'var(--risk-medium)' },
          { label: 'HR2', value: stageKPIs.pregnancy.hr2, color: 'var(--risk-medium)' },
          { label: 'HR3', value: stageKPIs.pregnancy.hr3, color: 'var(--risk-high)' },
        ]}
      />
      <StageCard
        title="ในห้องคลอด"
        total={stageKPIs.labor.admitted}
        href="/hospitals"
        rows={[
          // Labouring vs delivered-and-postpartum are both admitted. Neutral
          // colours: these are stages, not risk ("delivered" is not "safe" —
          // PPH happens exactly then). CPD high stays as the clinical signal.
          { label: 'รอคลอด', value: stageKPIs.labor.awaitingDelivery, color: 'var(--ink)' },
          { label: 'คลอดแล้ว', value: stageKPIs.labor.deliveredAdmitted, color: 'var(--ink-muted)' },
          { label: 'CPD เสี่ยงสูง', value: stageKPIs.labor.high, color: 'var(--risk-high)' },
        ]}
      />
      <StageCard
        title="คลอดแล้ว · เดือนนี้"
        total={stageKPIs.delivered.total}
        href="/outcomes"
        rows={[
          // normal = total − newborns with apgar_5min < 7 OR birth_weight_g < 2500
          {
            label: 'ทารกปกติ',
            value: stageKPIs.delivered.normal,
            color: 'var(--risk-low)',
            title: 'Apgar 5 นาที ≥ 7 และน้ำหนักแรกเกิด ≥ 2,500 ก.',
          },
          { label: 'Apgar 5 นาที < 7', value: stageKPIs.delivered.lowApgar, color: 'var(--risk-medium)' },
          { label: 'น้ำหนักแรกเกิด < 2,500 ก.', value: stageKPIs.delivered.lbw, color: 'var(--risk-high)' },
        ]}
      />
    </KpiGrid>
  );
}
```

```tsx
// src/components/dashboard/province/CareStageSection.tsx
'use client';

import type { DashboardStageKPIs } from '@/types/api';
import { SectionCard } from '@/components/shared/SectionCard';
import { StageKPICards } from '@/components/dashboard/StageKPICards';

export function CareStageSection({ stageKPIs }: { stageKPIs: DashboardStageKPIs }) {
  return (
    <SectionCard title="ระยะการดูแล" description="ฝากครรภ์ → ห้องคลอด → คลอดแล้ว · กดการ์ดเพื่อเปิดหน้ารายการ">
      <StageKPICards stageKPIs={stageKPIs} />
    </SectionCard>
  );
}
```

```tsx
// src/components/dashboard/ShiftSummary.tsx
// ShiftSummary — "this shift vs. last" for the coordinator. Wired to
// DashboardTrends since 2026-04-21 (server aggregates). UI sub-project 2:
// a Thai SectionCard of KpiTiles.
'use client';

import type { DashboardTrends } from '@/types/api';
import { SectionCard } from '@/components/shared/SectionCard';
import { KpiGrid } from '@/components/shared/KpiGrid';
import { KpiTile } from '@/components/shared/KpiTile';

interface ShiftSummaryProps {
  trends: DashboardTrends;
}

export function ShiftSummary({ trends }: ShiftSummaryProps) {
  const { currentShift, previousShift } = trends;
  const rows = [
    { key: 'admissions', label: 'รับเข้า', now: currentShift.admissions, prev: previousShift.admissions },
    { key: 'delivered', label: 'คลอด', now: currentShift.delivered, prev: previousShift.delivered },
    { key: 'referred', label: 'ส่งต่อ', now: currentShift.referred, prev: previousShift.referred },
  ] as const;

  return (
    <SectionCard
      title="สรุปเวร"
      description={previousShift.label ? `เปรียบเทียบกับ ${previousShift.label}` : undefined}
      actions={
        <span
          className="text-label text-ink-muted"
          title={`เวรปัจจุบันเริ่ม ${new Date(currentShift.windowStart).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`}
        >
          {currentShift.label || '—'}
        </span>
      }
    >
      <KpiGrid>
        {rows.map((r) => (
          <KpiTile
            key={r.key}
            testId={`shift-${r.key}`}
            label={r.label}
            count={r.now}
            sub={`เวรก่อน ${r.prev.toLocaleString('en-US')}`}
          />
        ))}
      </KpiGrid>
    </SectionCard>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/unit/components/dashboard/province/CareStageSection.test.tsx tests/unit/components/dashboard/ShiftSummary.test.tsx tests/unit/components/dashboard/province/KioskDashboard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add src/components/dashboard/StageKPICards.tsx src/components/dashboard/ShiftSummary.tsx src/components/dashboard/province/CareStageSection.tsx tests/unit/components/dashboard/province/CareStageSection.test.tsx tests/unit/components/dashboard/ShiftSummary.test.tsx
git commit -m "feat(dashboard): Thai care-stage cards and shift summary on tokens

Row labels now say what getStageKPIs counts (ทารกปกติ = Apgar5 >= 7 and
>= 2,500 g; Apgar 5 นาที < 7; น้ำหนักแรกเกิด < 2,500 ก.) instead of NORMAL /
LOW APGAR / LBW. Shift summary becomes a SectionCard of KpiTiles.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Map palette from tokens; Thai hospital sort bar

**Files:**
- Modify: `src/config/design-tokens.ts` (add `withAlpha`), `src/components/dashboard/ProvinceMapLeaflet.tsx`, `src/components/dashboard/HospitalTable.tsx`, `eslint-rules/design-allowlist.json`
- Create: `src/config/map-palette.ts`
- Test:
  - `tests/unit/config/map-palette.test.ts`
  - Append to `tests/unit/config/design-tokens.test.ts`
  - Update `tests/unit/components/HospitalTable.test.tsx`

**Interfaces:**
- Produces:
  - `withAlpha(hex, alpha): string`, which returns `rgba(r, g, b, a)`
  - `MapPalette`, `mapPalette(mode)`, `mapLegendTheme(mode)`, `mapBackground(mode)`
  - The `HospitalTable` sort bar reads "เรียงตาม:" with ความรุนแรง / ชื่อ / จำนวนผู้คลอด / ระดับ (`aria-pressed`), then "N แห่ง".

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/config/map-palette.test.ts
import { describe, it, expect } from 'vitest';
import { COLOR } from '@/config/design-tokens';
import { mapBackground, mapLegendTheme, mapPalette } from '@/config/map-palette';

describe('map palette', () => {
  it('light palette derives every colour from the tokens', () => {
    expect(mapPalette('light')).toEqual({
      boundaryStroke: COLOR.brand,
      boundaryFill: 'rgba(46, 58, 135, 0.06)',
      amphoeStroke: 'rgba(46, 58, 135, 0.18)',
      high: COLOR.riskHigh,
      med: COLOR.riskMedium,
      low: COLOR.riskLow,
      idle: COLOR.inkSubtle,
      pinStroke: COLOR.surfaceCard,
      tooltipBg: COLOR.surfaceCard,
      tooltipInk: COLOR.ink,
    });
  });
  it('kiosk palette is byte-identical to the pre-redesign values (kiosk is frozen)', () => {
    expect(mapPalette('kiosk')).toEqual({
      boundaryStroke: '#6ba7e5',
      boundaryFill: 'rgba(107, 167, 229, 0.08)',
      amphoeStroke: 'rgba(107, 167, 229, 0.18)',
      high: '#e05c5c',
      med: '#e0a03a',
      low: '#4fb58a',
      idle: '#7f8fad',
      pinStroke: '#06121f',
      tooltipBg: '#0b1b2e',
      tooltipInk: '#e6ecf5',
    });
  });
  it('legend and canvas: light from tokens, kiosk unchanged', () => {
    expect(mapLegendTheme('light')).toMatchObject({ ink: COLOR.ink, inkMuted: COLOR.inkMuted, unknown: COLOR.inkSubtle });
    expect(mapLegendTheme('kiosk')).toMatchObject({ ink: '#e6ecf5', pinBorder: '#06121f', unknown: '#94a3b8' });
    expect(mapBackground('light')).toBe('var(--surface-muted)');
    expect(mapBackground('kiosk')).toBe('#06121f');
  });
});
```

Append to `tests/unit/config/design-tokens.test.ts`, adding `withAlpha` to its import from `@/config/design-tokens`:

```ts
describe('withAlpha', () => {
  it('turns a token hex into rgba', () => {
    expect(withAlpha('#2E3A87', 0.06)).toBe('rgba(46, 58, 135, 0.06)');
    expect(withAlpha(COLOR.surfaceCard, 0.92)).toBe('rgba(255, 255, 255, 0.92)');
  });
});
```

Update `tests/unit/components/HospitalTable.test.tsx`:

1. Replace the `'renders sort chip controls'` body with:

   ```tsx
       render(<HospitalTable hospitals={sampleHospitals} />);
       expect(screen.getByText('เรียงตาม:')).toBeTruthy();
       for (const name of [/^ความรุนแรง/, /^ชื่อ/, /^จำนวนผู้คลอด/, /^ระดับ/]) {
         expect(screen.getByRole('button', { name })).toBeTruthy();
       }
       expect(screen.getByRole('button', { name: /^ความรุนแรง/ })).toHaveAttribute('aria-pressed', 'true');
       expect(screen.queryByText(/SEVERITY|SORT:/)).toBeNull();
   ```

2. Replace `    fireEvent.click(screen.getByText(/NAME/));` with `    fireEvent.click(screen.getByRole('button', { name: /^ชื่อ/ }));`, and rename that test `'clicking ชื่อ sort chip toggles order'`.

3. Replace `    expect(screen.getByText(/2 NODES/)).toBeTruthy();` with `    expect(screen.getByText('2 แห่ง')).toBeTruthy();`.

4. Add this test:

   ```tsx
     it('labels the labour count in Thai', () => {
       render(<HospitalTable hospitals={sampleHospitals} />);
       expect(screen.getAllByText('ห้องคลอด').length).toBe(2);
       expect(screen.queryByText('LB')).toBeNull();
     });
   ```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/unit/config/map-palette.test.ts tests/unit/config/design-tokens.test.ts tests/unit/components/HospitalTable.test.tsx`
Expected: FAIL. `@/config/map-palette` does not resolve, `withAlpha` is not exported, and the Thai sort labels are missing.

- [ ] **Step 3: Add `withAlpha` and the palette module**

Append to `src/config/design-tokens.ts`:

```ts
/** A token colour at partial opacity, for canvases that cannot use
 *  Tailwind's `/alpha` syntax (Leaflet paths, inline legends). */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
```

```ts
// src/config/map-palette.ts
// Province-map colours. Light mode derives from the design tokens; the kiosk
// set is the frozen dark palette (UI sub-project 2 does not redesign the
// kiosk), kept here byte-identical so components carry no hex literals.
import { COLOR, withAlpha } from '@/config/design-tokens';

export type MapMode = 'light' | 'kiosk';

export interface MapPalette {
  boundaryStroke: string;
  boundaryFill: string;
  amphoeStroke: string;
  high: string;
  med: string;
  low: string;
  idle: string;
  pinStroke: string;
  tooltipBg: string;
  tooltipInk: string;
}

const KIOSK: MapPalette = {
  boundaryStroke: '#6ba7e5',
  boundaryFill: 'rgba(107, 167, 229, 0.08)',
  amphoeStroke: 'rgba(107, 167, 229, 0.18)',
  high: '#e05c5c',
  med: '#e0a03a',
  low: '#4fb58a',
  idle: '#7f8fad',
  pinStroke: '#06121f',
  tooltipBg: '#0b1b2e',
  tooltipInk: '#e6ecf5',
};

const LIGHT: MapPalette = {
  boundaryStroke: COLOR.brand,
  boundaryFill: withAlpha(COLOR.brand, 0.06),
  amphoeStroke: withAlpha(COLOR.brand, 0.18),
  high: COLOR.riskHigh,
  med: COLOR.riskMedium,
  low: COLOR.riskLow,
  idle: COLOR.inkSubtle,
  pinStroke: COLOR.surfaceCard,
  tooltipBg: COLOR.surfaceCard,
  tooltipInk: COLOR.ink,
};

export function mapPalette(mode: MapMode): MapPalette {
  return mode === 'kiosk' ? KIOSK : LIGHT;
}

export interface MapLegendTheme {
  bg: string;
  ink: string;
  inkMuted: string;
  border: string;
  pinBorder: string;
  /** Dot colour for "UNKNOWN / ยังไม่ sync". */
  unknown: string;
}

export function mapLegendTheme(mode: MapMode): MapLegendTheme {
  return mode === 'kiosk'
    ? {
        bg: 'rgba(11, 27, 46, 0.85)',
        ink: '#e6ecf5',
        inkMuted: 'rgba(230,236,245,0.7)',
        border: 'rgba(107,167,229,0.3)',
        pinBorder: '#06121f',
        unknown: '#94a3b8',
      }
    : {
        bg: withAlpha(COLOR.surfaceCard, 0.92),
        ink: COLOR.ink,
        inkMuted: COLOR.inkMuted,
        border: withAlpha(COLOR.brand, 0.22),
        pinBorder: COLOR.surfaceCard,
        unknown: COLOR.inkSubtle,
      };
}

/** Canvas behind the map tiles (also the loading placeholder). */
export function mapBackground(mode: MapMode): string {
  return mode === 'kiosk' ? '#06121f' : 'var(--surface-muted)';
}
```

- [ ] **Step 4: Point `ProvinceMapLeaflet.tsx` at the palette module.** Map behaviour, legend copy and the dark hover tooltip are unchanged.

1. **Import.**
   - Old: `import { COLOR, MIN_TEXT_PX } from '@/config/design-tokens';`
   - New: two lines, `import { COLOR, MIN_TEXT_PX } from '@/config/design-tokens';` then `import { mapBackground, mapLegendTheme, mapPalette, type MapPalette } from '@/config/map-palette';`
2. **Delete the old palette.** Remove the whole `function buildPalette(mode: 'light' | 'kiosk') { … }` (lines 207–234).
3. **`riskColor` type.**
   - Old: `  palette: ReturnType<typeof buildPalette>,`
   - New: `  palette: MapPalette,`
4. **Palette call.**
   - Old: `  const palette = buildPalette(mode);`
   - New: `  const palette = mapPalette(mode);`
5. **Tooltip high ink.**
   - Old: `  const highInk = buildPalette('kiosk').high;`
   - New: `  const highInk = mapPalette('kiosk').high;`
6. **Loading canvas.**
   - Old: `          background: mode === 'kiosk' ? '#06121f' : 'var(--surface-cool)',`
   - New: `          background: mapBackground(mode),`
7. **Map canvas.**
   - Old: `        background: mode === 'kiosk' ? '#06121f' : '#eef1f6',`
   - New: `        background: mapBackground(mode),`
8. **Legend colours.** In `MapStatusLegend`, replace these four lines:

   ```tsx
     const bg = isKiosk ? 'rgba(11, 27, 46, 0.85)' : 'rgba(255, 255, 255, 0.92)';
     const ink = isKiosk ? '#e6ecf5' : '#0b1b2e';
     const inkMuted = isKiosk ? 'rgba(230,236,245,0.7)' : 'rgba(11,27,46,0.65)';
     const border = isKiosk ? 'rgba(107,167,229,0.3)' : 'rgba(43,58,140,0.22)';
   ```

   with:

   ```tsx
     const theme = mapLegendTheme(mode);
     const { bg, ink, inkMuted, border } = theme;
   ```

9. **Legend UNKNOWN dot.**
   - Old: `    { color: '#94a3b8', label: 'UNKNOWN', sub: 'ยังไม่ sync' },`
   - New: `    { color: theme.unknown, label: 'UNKNOWN', sub: 'ยังไม่ sync' },`
10. **Legend pin border.**
    - Old:

      ```tsx
                      border: `1.5px solid ${isKiosk ? '#06121f' : '#ffffff'}`,
      ```

    - New:

      ```tsx
                      border: `1.5px solid ${theme.pinBorder}`,
      ```


- [ ] **Step 5: Thai sort bar and labels in `HospitalTable.tsx`**

1. **Sort-bar container.** Thai text is not set in mono.
   - Old: `        className="flex items-center gap-3 border-b px-3 py-2 font-mono text-caption tracking-[0.1em]"`
   - New: `        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 text-label"`

2. **Sort chips.**

   Old:

   ```tsx
           <span>SORT:</span>
           {[
             { k: 'severity' as SortKey, l: 'SEVERITY' },
             { k: 'name' as SortKey, l: 'NAME' },
             { k: 'total' as SortKey, l: 'TOTAL' },
             { k: 'level' as SortKey, l: 'LEVEL' },
           ].map((x) => (
             <button
               key={x.k}
               onClick={() => handleSort(x.k)}
   ```

   New:

   ```tsx
           <span>เรียงตาม:</span>
           {[
             { k: 'severity' as SortKey, l: 'ความรุนแรง' },
             { k: 'name' as SortKey, l: 'ชื่อ' },
             { k: 'total' as SortKey, l: 'จำนวนผู้คลอด' },
             { k: 'level' as SortKey, l: 'ระดับ' },
           ].map((x) => (
             <button
               key={x.k}
               type="button"
               aria-pressed={sortKey === x.k}
               onClick={() => handleSort(x.k)}
   ```

3. **Count.**
   - Old: `        <span className="ml-auto">{hospitals.length} NODES</span>`
   - New: `        <span className="ml-auto tabular-nums">{hospitals.length} แห่ง</span>`

4. **Labour metric.**

   Old:

   ```tsx
                     title={`Active labor: ${h.counts.total} ราย`}
                   >
                     <span
                       className="font-mono text-caption uppercase tracking-[0.08em]"
                       style={{ color: inkMuted }}
                     >
                       LB
                     </span>{' '}
   ```

   New:

   ```tsx
                     title={`ผู้คลอดในห้องคลอด ${h.counts.total} ราย`}
                   >
                     <span className="text-caption" style={{ color: inkMuted }}>
                       ห้องคลอด
                     </span>{' '}
   ```

5. **ANC tooltip.**
   - Old:

     ```tsx
                       title={`ANC registry: ${h.ancCounts.total} · HR3: ${h.ancCounts.hr3}`}
     ```

   - New:

     ```tsx
                       title={`ฝากครรภ์ที่ติดตาม ${h.ancCounts.total} ราย · HR3 ${h.ancCounts.hr3} ราย`}
     ```


6. **Sync tooltip.**

   Old:

   ```tsx
                         ? `Last sync: ${new Date(h.lastSyncAt).toLocaleString('th-TH')}`
                         : 'ยังไม่เคย sync'
   ```

   New:

   ```tsx
                         ? `ซิงค์ล่าสุด ${new Date(h.lastSyncAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`
                         : 'ยังไม่เคยซิงค์'
   ```

Status words (ONLINE / OFFLINE / BLOCKED / NO SYNC) stay as they are (spec D8).

- [ ] **Step 6: Shrink the lint allowlist**

In `eslint-rules/design-allowlist.json`:
1. Delete the `"src/components/dashboard/ProvinceMapLeaflet.tsx": …` entry.
2. Change `"maxEntries": 16` to `"maxEntries": 15`.

Then run:

```bash
npx eslint src/components/dashboard/ProvinceMapLeaflet.tsx src/components/dashboard/HospitalTable.tsx src/config/map-palette.ts
```

Expected: 0 problems. If a `hex` report remains in `ProvinceMapLeaflet.tsx`, move that literal into `src/config/map-palette.ts` (kiosk value unchanged) instead of re-adding the allowlist entry.

- [ ] **Step 7: Run tests, typecheck, lint, commit**

```bash
npx vitest run tests/unit/config tests/unit/components/HospitalTable.test.tsx tests/unit/pages/hospitals.test.tsx tests/unit/eslint tests/unit/components/dashboard/province/KioskDashboard.test.tsx
npx tsc --noEmit && npm run lint
git add src/config/design-tokens.ts src/config/map-palette.ts src/components/dashboard/ProvinceMapLeaflet.tsx src/components/dashboard/HospitalTable.tsx eslint-rules/design-allowlist.json tests/unit/config/map-palette.test.ts tests/unit/config/design-tokens.test.ts tests/unit/components/HospitalTable.test.tsx
git commit -m "feat(dashboard): map palette from tokens; Thai hospital sort bar

Light map colours, canvas and legend derive from COLOR (withAlpha); the
frozen kiosk palette moves byte-identical into config/map-palette.ts, so the
ProvinceMapLeaflet allowlist entry is gone. HospitalTable sorts read
ความรุนแรง / ชื่อ / จำนวนผู้คลอด / ระดับ with aria-pressed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Sticky overview panel under the shell header; overview dialog

**Files:**
- Create:
  - `src/hooks/useCssHeightVar.ts`
  - `src/components/dashboard/province/OverviewModeToggle.tsx`
  - `src/components/dashboard/province/ProvinceOverviewPanel.tsx`
  - `src/components/dashboard/province/ProvinceOverviewDialog.tsx`
- Modify: `src/components/layout/AppHeader.tsx`
- Test:
  - `tests/unit/hooks/useCssHeightVar.test.tsx`
  - `tests/unit/components/dashboard/province/ProvinceOverview.test.tsx`
  - Re-run `tests/unit/components/layout/AppShell.test.tsx`

**Interfaces:**
- Produces:
  - `useCssHeightVar(ref: RefObject<HTMLElement | null>, name: \`--${string}\`): void`, which sets `name` on `<html>` to the element's height in px, follows resizes, and removes it on unmount. Without `ResizeObserver` it publishes once.
  - `AppHeader` publishes `--app-header-h`.
  - `type OverviewMode = 'map' | 'list'` and `OverviewModeToggle({ mode, onChange, onBrand? })`.
  - `ProvinceOverviewPanel({ hospitals, onlineCount, selected, onSelect, mode, onModeChange, onExpand })`.
  - `ProvinceOverviewDialog({ open, onOpenChange, hospitals, onlineCount, selected, onSelect, mode, onModeChange })`.

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/unit/hooks/useCssHeightVar.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { useCssHeightVar } from '@/hooks/useCssHeightVar';

class RO {
  static last: RO | null = null;
  constructor(public cb: () => void) {
    RO.last = this;
  }
  observe() {}
  disconnect() {}
}

function Probe() {
  const ref = useRef<HTMLDivElement>(null);
  useCssHeightVar(ref, '--t-h');
  return <div ref={ref} />;
}

const read = () => document.documentElement.style.getPropertyValue('--t-h');

describe('useCssHeightVar', () => {
  let height = 88;
  beforeEach(() => {
    height = 88;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height }) as DOMRect);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('publishes the height, follows resizes and cleans up', () => {
    vi.stubGlobal('ResizeObserver', RO);
    const { unmount } = render(<Probe />);
    expect(read()).toBe('88px');
    height = 120;
    act(() => RO.last!.cb());
    expect(read()).toBe('120px');
    unmount();
    expect(read()).toBe('');
  });

  it('without ResizeObserver it still publishes once (jsdom, old browsers)', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { unmount } = render(<Probe />);
    expect(read()).toBe('88px');
    unmount();
    expect(read()).toBe('');
  });
});
```

```tsx
// tests/unit/components/dashboard/province/ProvinceOverview.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProvinceOverviewPanel } from '@/components/dashboard/province/ProvinceOverviewPanel';
import { ProvinceOverviewDialog } from '@/components/dashboard/province/ProvinceOverviewDialog';
import { makeHospital } from '../../../../helpers/dashboard-fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/dashboard/ProvinceMap', () => ({
  ProvinceMap: () => <div data-testid="province-map" />,
}));

const hospitals = [makeHospital(), makeHospital({ hcode: '10671', name: 'รพ.ชุมแพ' })];
const base = { hospitals, onlineCount: 1, selected: null, onSelect: vi.fn() };

describe('ProvinceOverviewPanel', () => {
  it('Thai header, one map, list below, sticky under the shell header', () => {
    render(<ProvinceOverviewPanel {...base} mode="map" onModeChange={vi.fn()} onExpand={vi.fn()} />);
    const panel = screen.getByRole('region', { name: 'ภาพรวมโรงพยาบาล' });
    expect(panel).toBe(screen.getByTestId('province-overview'));
    expect(screen.getByText(/เชื่อมต่ออยู่/)).toHaveTextContent('เชื่อมต่ออยู่ 1/2 แห่ง');
    expect(screen.getAllByTestId('province-map')).toHaveLength(1);
    expect(screen.getAllByTestId('hospital-row')).toHaveLength(2);
    expect(panel.className).toContain('@min-[1160px]:sticky');
    expect(panel.className).toContain('var(--app-header-h,0px)');
    expect(screen.queryByText(/HOSPITAL · SORTED BY SEVERITY|Province overview|EXPAND|MAP|LIST/)).toBeNull();
  });
  it('toggle and expand', () => {
    const onModeChange = vi.fn();
    const onExpand = vi.fn();
    render(<ProvinceOverviewPanel {...base} mode="map" onModeChange={onModeChange} onExpand={onExpand} />);
    expect(screen.getByRole('button', { name: 'แผนที่' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'รายชื่อ' }));
    expect(onModeChange).toHaveBeenCalledWith('list');
    fireEvent.click(screen.getByRole('button', { name: 'ขยายแผนที่เต็มจอ' }));
    expect(onExpand).toHaveBeenCalled();
  });
  it('list mode shows no map', () => {
    render(<ProvinceOverviewPanel {...base} mode="list" onModeChange={vi.fn()} onExpand={vi.fn()} />);
    expect(screen.queryByTestId('province-map')).toBeNull();
    expect(screen.getAllByTestId('hospital-row')).toHaveLength(2);
  });
});

describe('ProvinceOverviewDialog', () => {
  it('is a Thai, named dialog with map + list', () => {
    render(<ProvinceOverviewDialog {...base} open onOpenChange={vi.fn()} mode="map" onModeChange={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'ภาพรวมโรงพยาบาล' })).toBeInTheDocument();
    expect(screen.getByText(/กด ESC เพื่อปิด/)).toBeInTheDocument();
    expect(screen.getByTestId('province-map')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/unit/hooks/useCssHeightVar.test.tsx tests/unit/components/dashboard/province/ProvinceOverview.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the hook and publish the header height**

```ts
// src/hooks/useCssHeightVar.ts
// Publishes an element's rendered height as a CSS custom property on <html>,
// so sticky content below a sticky header can offset itself (the dashboard's
// overview panel sits under AppHeader + StatusStrip, whose height varies with
// wrapping). In kiosk mode the header is display:none and the value is 0px.
'use client';

import { useEffect, type RefObject } from 'react';

export function useCssHeightVar(ref: RefObject<HTMLElement | null>, name: `--${string}`): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(name, `${Math.round(el.getBoundingClientRect().height)}px`);
    publish();
    if (typeof ResizeObserver === 'undefined') return () => root.style.removeProperty(name);
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty(name);
    };
  }, [ref, name]);
}
```

In `src/components/layout/AppHeader.tsx`, make four edits.

1. Add `import { useRef } from 'react';` and `import { useCssHeightVar } from '@/hooks/useCssHeightVar';` to the imports.
2. Directly after `  const { breadcrumbs } = useBreadcrumbs();`, add:

   ```tsx
     const headerRef = useRef<HTMLElement>(null);
     // Sticky page content (the dashboard overview panel) offsets by this.
     useCssHeightVar(headerRef, '--app-header-h');
   ```

3. Attach the ref.
   - Old: `    <header className="sticky top-0 z-30 bg-surface-page">`
   - New: `    <header ref={headerRef} className="sticky top-0 z-30 bg-surface-page">`

- [ ] **Step 4: Implement the toggle, panel and dialog**

```tsx
// src/components/dashboard/province/OverviewModeToggle.tsx
'use client';

import { cn } from '@/lib/utils';

export type OverviewMode = 'map' | 'list';

const MODES: ReadonlyArray<{ mode: OverviewMode; label: string }> = [
  { mode: 'map', label: 'แผนที่' },
  { mode: 'list', label: 'รายชื่อ' },
];

export function OverviewModeToggle({
  mode,
  onChange,
  onBrand = false,
}: {
  mode: OverviewMode;
  onChange: (mode: OverviewMode) => void;
  /** Drawn on the brand-coloured dialog header. */
  onBrand?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="มุมมองภาพรวมโรงพยาบาล"
      className={cn('inline-flex rounded-lg p-0.5', onBrand ? 'bg-white/10' : 'bg-surface-muted')}
    >
      {MODES.map((m) => {
        const active = m.mode === mode;
        return (
          <button
            key={m.mode}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(m.mode)}
            className={cn(
              'rounded-md px-3 py-1 text-label transition-colors',
              active
                ? onBrand
                  ? 'bg-white text-brand-strong'
                  : 'bg-surface-card text-brand shadow-soft'
                : onBrand
                  ? 'text-white hover:bg-white/20'
                  : 'text-ink-muted hover:text-brand',
            )}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
```

```tsx
// src/components/dashboard/province/ProvinceOverviewPanel.tsx
// ภาพรวมโรงพยาบาล — the province map + hospital list. Rendered ONCE (the old
// page mounted two Leaflet maps: a desktop aside and a hidden mobile copy).
// When the page container is ≥ 1160px it is the sticky right column, offset
// by the shell header height (--app-header-h, published by AppHeader); below
// that it stacks after the sections with a 360px map.
'use client';

import { Expand } from 'lucide-react';
import type { DashboardHospital } from '@/types/api';
import { ProvinceMap } from '@/components/dashboard/ProvinceMap';
import { HospitalTable } from '@/components/dashboard/HospitalTable';
import { cn } from '@/lib/utils';
import { OverviewModeToggle, type OverviewMode } from './OverviewModeToggle';

export interface ProvinceOverviewPanelProps {
  hospitals: DashboardHospital[];
  onlineCount: number;
  selected: string | null;
  onSelect: (hcode: string | null) => void;
  mode: OverviewMode;
  onModeChange: (mode: OverviewMode) => void;
  onExpand: () => void;
}

const STICKY =
  '@min-[1160px]:sticky @min-[1160px]:top-[calc(var(--app-header-h,0px)_+_16px)] @min-[1160px]:h-[calc(100dvh_-_var(--app-header-h,0px)_-_32px)]';

export function ProvinceOverviewPanel({
  hospitals,
  onlineCount,
  selected,
  onSelect,
  mode,
  onModeChange,
  onExpand,
}: ProvinceOverviewPanelProps) {
  return (
    <section
      aria-label="ภาพรวมโรงพยาบาล"
      data-testid="province-overview"
      className={cn('flex min-w-0 flex-col overflow-hidden rounded-2xl bg-surface-card shadow-soft', STICKY)}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-title text-brand">ภาพรวมโรงพยาบาล</h2>
          <p className="text-caption text-ink-muted">
            เชื่อมต่ออยู่{' '}
            <span className="tabular-nums">
              {onlineCount}/{hospitals.length}
            </span>{' '}
            แห่ง
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <OverviewModeToggle mode={mode} onChange={onModeChange} />
          <button
            type="button"
            onClick={onExpand}
            aria-label="ขยายแผนที่เต็มจอ"
            title="ขยายเต็มจอ"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-label text-brand hover:bg-brand-soft"
          >
            <Expand aria-hidden="true" className="h-4 w-4" />
            ขยาย
          </button>
        </div>
      </header>
      {mode === 'map' ? (
        <>
          <div className="h-[360px] min-h-0 @min-[1160px]:h-auto @min-[1160px]:flex-1">
            <ProvinceMap hospitals={hospitals} selected={selected} onSelect={onSelect} size="full" />
          </div>
          {/* Row click → /hospitals/<hcode>; onSelect still fires so the map
              marker highlights during the route transition. */}
          <div className="min-h-0 border-t border-border @min-[1160px]:max-h-[36%] @min-[1160px]:shrink-0 @min-[1160px]:overflow-auto">
            <HospitalTable hospitals={hospitals} selected={selected} onSelect={onSelect} navigateOnClick />
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <HospitalTable hospitals={hospitals} selected={selected} onSelect={onSelect} navigateOnClick />
        </div>
      )}
    </section>
  );
}
```

```tsx
// src/components/dashboard/province/ProvinceOverviewDialog.tsx
// Full-viewport map + list. The list here toggle-selects (opening the
// hospital detail dialog via onSelect), unlike the panel, which navigates.
'use client';

import type { DashboardHospital } from '@/types/api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProvinceMap } from '@/components/dashboard/ProvinceMap';
import { HospitalTable } from '@/components/dashboard/HospitalTable';
import { cn } from '@/lib/utils';
import { OverviewModeToggle, type OverviewMode } from './OverviewModeToggle';

export interface ProvinceOverviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitals: DashboardHospital[];
  onlineCount: number;
  selected: string | null;
  onSelect: (hcode: string | null) => void;
  mode: OverviewMode;
  onModeChange: (mode: OverviewMode) => void;
}

export function ProvinceOverviewDialog({
  open,
  onOpenChange,
  hospitals,
  onlineCount,
  selected,
  onSelect,
  mode,
  onModeChange,
}: ProvinceOverviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[96vw] h-[92vh] w-[96vw] gap-0 overflow-hidden bg-surface-page p-0 sm:max-w-[96vw]">
        <DialogHeader className="flex flex-row flex-wrap items-center justify-between gap-4 border-b border-border bg-brand px-5 py-3">
          <div className="min-w-0">
            <DialogTitle className="text-title text-white">ภาพรวมโรงพยาบาล</DialogTitle>
            <DialogDescription className="text-label text-white/80">
              เชื่อมต่ออยู่ {onlineCount}/{hospitals.length} แห่ง · กด ESC เพื่อปิด
            </DialogDescription>
          </div>
          <div className="pr-10">
            <OverviewModeToggle mode={mode} onChange={onModeChange} onBrand />
          </div>
        </DialogHeader>
        <div
          className={cn(
            'grid min-h-0 flex-1 overflow-hidden',
            mode === 'map' ? 'grid-cols-[minmax(0,2fr)_minmax(420px,1fr)]' : 'grid-cols-1',
          )}
        >
          {mode === 'map' && (
            <div className="min-h-0 border-r border-border bg-surface-card">
              <ProvinceMap hospitals={hospitals} selected={selected} onSelect={onSelect} size="full" />
            </div>
          )}
          <div className="flex min-h-0 flex-col overflow-hidden bg-surface-card p-4">
            <div className="min-h-0 flex-1 overflow-auto">
              <HospitalTable hospitals={hospitals} selected={selected} onSelect={onSelect} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Run the new tests plus the shell**

Run: `npx vitest run tests/unit/hooks/useCssHeightVar.test.tsx tests/unit/components/dashboard/province/ProvinceOverview.test.tsx tests/unit/components/layout`
Expected: PASS. `AppShell.test.tsx` passes unchanged because the hook skips `ResizeObserver` under jsdom.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add src/hooks/useCssHeightVar.ts src/components/layout/AppHeader.tsx src/components/dashboard/province/OverviewModeToggle.tsx src/components/dashboard/province/ProvinceOverviewPanel.tsx src/components/dashboard/province/ProvinceOverviewDialog.tsx tests/unit/hooks/useCssHeightVar.test.tsx tests/unit/components/dashboard/province/ProvinceOverview.test.tsx
git commit -m "feat(dashboard): one sticky overview panel that clears the shell header

The pinned map used top:0 / 100vh-60px from the old navbar and slid under the
taller sticky header + status strip. AppHeader now publishes --app-header-h;
the panel sticks below it, mounts a single Leaflet map, and speaks Thai.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Header actions, HOSxP diagnostics dialog, webhook alert

**Files:**
- Create:
  - `src/components/dashboard/province/DashboardHeaderActions.tsx`
  - `src/components/dashboard/province/HosxpSyncDialog.tsx`
  - `src/components/dashboard/province/OnboardingWebhookAlert.tsx`
- Test:
  - `tests/unit/components/dashboard/province/DashboardHeaderActions.test.tsx`
  - `tests/unit/components/dashboard/province/HosxpSyncDialog.test.tsx`
  - `tests/unit/components/dashboard/province/OnboardingWebhookAlert.test.tsx`

**Interfaces:**
- Consumes: Task 1 helpers (`HOSXP_SYNC_STATUS_TH`, `hosxpSyncTone`, `buildHosxpSyncReport`, `formatSyncTime`, `formatCounts`, `SSE_STATUS_META`).
- Produces:
  - `DashboardHeaderActions({ sseState, hosxpStatus, hosxpDetail, onOpenHosxp, syncing, onSync, onKiosk })`
  - `HosxpSyncDialog({ open, onOpenChange, state, status, help })`
  - `OnboardingWebhookAlert({ error, onDismiss })`

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/unit/components/dashboard/province/DashboardHeaderActions.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DashboardHeaderActions } from '@/components/dashboard/province/DashboardHeaderActions';

const base = {
  sseState: 'connected' as const,
  hosxpStatus: 'RUNNING' as const,
  hosxpDetail: 'scheduled · 2/3 cycles',
  onOpenHosxp: vi.fn(),
  syncing: false,
  onSync: vi.fn(),
  onKiosk: vi.fn(),
};

describe('DashboardHeaderActions', () => {
  it('Thai live status, HOSxP status, sync and kiosk buttons', () => {
    render(<DashboardHeaderActions {...base} />);
    expect(screen.getByRole('status')).toHaveTextContent('อัปเดตสด');
    const hosxp = screen.getByRole('button', { name: /HOSxP: ทำงานอยู่/ });
    expect(hosxp).toHaveAttribute('title', 'scheduled · 2/3 cycles');
    fireEvent.click(hosxp);
    expect(base.onOpenHosxp).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /ดึงข้อมูลทันที/ }));
    expect(base.onSync).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /โหมดจอภาพ/ }));
    expect(base.onKiosk).toHaveBeenCalled();
    expect(screen.queryByText(/LIVE · SSE OK|HOSxP SYNC/)).toBeNull();
  });
  it('shows progress while a sync cycle runs', () => {
    render(<DashboardHeaderActions {...base} syncing />);
    expect(screen.getByRole('button', { name: /กำลังดึงข้อมูล…/ })).toBeDisabled();
  });
  it('error and reconnecting states are visible in the tones', () => {
    render(<DashboardHeaderActions {...base} sseState="reconnecting" hosxpStatus="ERROR" />);
    expect(screen.getByRole('status')).toHaveTextContent('ขาดการเชื่อมต่อ กำลังเชื่อมใหม่…');
    expect(screen.getByRole('status').className).toContain('bg-warn-tint');
    expect(screen.getByRole('button', { name: /HOSxP: ผิดพลาด/ }).className).toContain('bg-danger-tint');
  });
});
```

```tsx
// tests/unit/components/dashboard/province/HosxpSyncDialog.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HosxpSyncDialog } from '@/components/dashboard/province/HosxpSyncDialog';
import type { OnboardHosxpSyncState } from '@/hooks/useOnboardHosxpSync';

const state: OnboardHosxpSyncState = {
  ran: true,
  phase: 'querying_hosxp',
  successCount: 2,
  cycleCount: 3,
  lastSteps: [
    { at: '2026-10-11T03:00:00Z', cycle: 3, name: 'fetch_ipt', status: 'success', message: 'ok', counts: { rows: 4 } },
  ],
};

function setClipboard(writeText: (t: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}
afterEach(() => vi.restoreAllMocks());

describe('HosxpSyncDialog', () => {
  it('Thai title, verbatim diagnostic fields and step log', () => {
    render(<HosxpSyncDialog open onOpenChange={vi.fn()} state={state} status="QUERYING" help="ช่วยเหลือ" />);
    expect(screen.getByRole('dialog', { name: 'สถานะการดึงข้อมูลจาก HOSxP' })).toBeInTheDocument();
    expect(screen.getByText('QUERYING')).toBeInTheDocument();
    expect(screen.getByText('fetch_ipt')).toBeInTheDocument();
    expect(screen.getByText('rows=4')).toBeInTheDocument();
  });
  it('copies the report and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(<HosxpSyncDialog open onOpenChange={vi.fn()} state={state} status="QUERYING" help="h" />);
    fireEvent.click(screen.getByRole('button', { name: /คัดลอกรายงาน/ }));
    expect(await screen.findByText('คัดลอกแล้ว')).toBeInTheDocument();
    expect(writeText.mock.calls[0][0]).toContain('STATUS: QUERYING');
  });
  it('a failed copy says what to do instead of failing silently', async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    render(<HosxpSyncDialog open onOpenChange={vi.fn()} state={state} status="QUERYING" help="h" />);
    fireEvent.click(screen.getByRole('button', { name: /คัดลอกรายงาน/ }));
    expect(await screen.findByText(/คัดลอกไม่สำเร็จ — เลือกข้อความแล้วกด Ctrl\+C/)).toBeInTheDocument();
  });
  it('empty step log is explained in Thai', () => {
    render(<HosxpSyncDialog open onOpenChange={vi.fn()} state={{ ran: true }} status="STARTING" help="h" />);
    expect(screen.getByText(/ยังไม่มีบันทึกขั้นตอน/)).toBeInTheDocument();
  });
});
```

```tsx
// tests/unit/components/dashboard/province/OnboardingWebhookAlert.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OnboardingWebhookAlert } from '@/components/dashboard/province/OnboardingWebhookAlert';

describe('OnboardingWebhookAlert', () => {
  it('says what failed, shows the error, says what to do, and can be hidden', () => {
    const onDismiss = vi.fn();
    render(<OnboardingWebhookAlert error="HTTP 500 from HOSxP" onDismiss={onDismiss} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('ไม่สามารถอัปเดต webhook_setting บน HOSxP');
    expect(alert).toHaveTextContent('HTTP 500 from HOSxP');
    expect(alert).toHaveTextContent('วิธีแก้:');
    fireEvent.click(screen.getByRole('button', { name: 'ซ่อน' }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/unit/components/dashboard/province/DashboardHeaderActions.test.tsx tests/unit/components/dashboard/province/HosxpSyncDialog.test.tsx tests/unit/components/dashboard/province/OnboardingWebhookAlert.test.tsx`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

```tsx
// src/components/dashboard/province/DashboardHeaderActions.tsx
// PageHeader actions for `/`: live-update status, HOSxP sync status (opens
// the diagnostics dialog), manual sync with progress, kiosk.
'use client';

import { Info, Monitor, RefreshCw } from 'lucide-react';
import type { SseConnectionState } from '@/hooks/useSSE';
import { SSE_STATUS_META, type SseStatusMeta } from '@/config/sse-status';
import { HOSXP_SYNC_STATUS_TH, hosxpSyncTone, type HosxpSyncStatus, type HosxpSyncTone } from '@/lib/hosxp-sync-status';
import { cn } from '@/lib/utils';

const SSE_CHIP: Record<SseStatusMeta['tone'], { box: string; dot: string }> = {
  ok: { box: 'bg-ok-tint text-ok-text', dot: 'bg-ok' },
  neutral: { box: 'bg-surface-muted text-ink-muted', dot: 'bg-ink-subtle' },
  warn: { box: 'bg-warn-tint text-warn-text', dot: 'bg-warn' },
};

const HOSXP_CHIP: Record<HosxpSyncTone, { box: string; dot: string }> = {
  danger: { box: 'border-danger/40 bg-danger-tint text-danger-text', dot: 'bg-danger' },
  ok: { box: 'border-ok/40 bg-ok-tint text-ok-text', dot: 'bg-ok' },
  neutral: { box: 'border-border bg-surface-card text-ink-muted', dot: 'bg-ink-subtle' },
};

export interface DashboardHeaderActionsProps {
  sseState: SseConnectionState;
  hosxpStatus: HosxpSyncStatus;
  hosxpDetail: string;
  onOpenHosxp: () => void;
  syncing: boolean;
  onSync: () => void;
  onKiosk: () => void;
}

export function DashboardHeaderActions({
  sseState,
  hosxpStatus,
  hosxpDetail,
  onOpenHosxp,
  syncing,
  onSync,
  onKiosk,
}: DashboardHeaderActionsProps) {
  const sse = SSE_STATUS_META[sseState];
  const sseChip = SSE_CHIP[sse.tone];
  const hosxpChip = HOSXP_CHIP[hosxpSyncTone(hosxpStatus)];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span role="status" className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-label', sseChip.box)}>
        <span aria-hidden="true" className={cn('h-2.5 w-2.5 rounded-full', sseChip.dot)} />
        {sse.labelTh}
      </span>
      <button
        type="button"
        onClick={onOpenHosxp}
        title={hosxpDetail}
        className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1 text-label', hosxpChip.box)}
      >
        <span aria-hidden="true" className={cn('h-2.5 w-2.5 rounded-full', hosxpChip.dot)} />
        HOSxP: {HOSXP_SYNC_STATUS_TH[hosxpStatus]}
        <Info aria-hidden="true" className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onSync}
        disabled={syncing}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-card px-3 py-1.5 text-label text-ink transition-colors hover:bg-brand-soft disabled:opacity-60"
      >
        <RefreshCw aria-hidden="true" className={cn('h-4 w-4', syncing && 'animate-spin')} />
        {syncing ? 'กำลังดึงข้อมูล…' : 'ดึงข้อมูลทันที'}
      </button>
      <button
        type="button"
        onClick={onKiosk}
        title="เปิดโหมดจอภาพ (Kiosk Mode)"
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-label text-white transition-colors hover:bg-brand-strong"
      >
        <Monitor aria-hidden="true" className="h-4 w-4" />
        โหมดจอภาพ
      </button>
    </div>
  );
}
```

```tsx
// src/components/dashboard/province/OnboardingWebhookAlert.tsx
// Shown when auto-provisioning HOSxP's webhook_setting failed on first
// onboarding: what failed, the server's error, and what to do.
'use client';

import { AlertTriangle } from 'lucide-react';

export function OnboardingWebhookAlert({ error, onDismiss }: { error: string; onDismiss: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-danger/40 bg-danger-tint px-4 py-3 text-body text-ink">
      <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-danger-text">ไม่สามารถอัปเดต webhook_setting บน HOSxP</p>
        <p className="break-words text-caption text-ink-muted">{error}</p>
        <p className="text-caption text-ink-muted">
          วิธีแก้: เปิด KK-LRMS จากเมนูใน HOSxP อีกครั้ง หากยังไม่หาย แจ้งผู้ดูแลระบบพร้อมข้อความด้านบน
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-lg border border-border bg-surface-card px-3 py-1 text-label text-ink-muted hover:bg-brand-soft"
      >
        ซ่อน
      </button>
    </div>
  );
}
```

```tsx
// src/components/dashboard/province/HosxpSyncDialog.tsx
// HOSxP browser-sync diagnostics (moved from page.tsx, UI sub-project 2).
// Field keys stay English on purpose: they mirror the copyable report that
// IT staff paste into tickets. Title, buttons and prose are Thai.
'use client';

import { useState, type ReactNode } from 'react';
import { Copy } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { OnboardHosxpSyncState } from '@/hooks/useOnboardHosxpSync';
import { buildHosxpSyncReport, formatCounts, formatSyncTime, type HosxpSyncStatus } from '@/lib/hosxp-sync-status';
import { cn } from '@/lib/utils';

type StepStatus = NonNullable<OnboardHosxpSyncState['lastSteps']>[number]['status'];
const STEP_TONE: Record<StepStatus, string> = {
  error: 'text-danger-text',
  warning: 'text-warn-text',
  success: 'text-ok-text',
  running: 'text-ink-muted',
  info: 'text-ink-muted',
};

type CopyState = 'idle' | 'copied' | 'failed';
const COPY_LABEL: Record<CopyState, string> = {
  idle: 'คัดลอกรายงาน',
  copied: 'คัดลอกแล้ว',
  failed: 'คัดลอกไม่สำเร็จ — เลือกข้อความแล้วกด Ctrl+C',
};

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-muted">{k}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </>
  );
}

export interface HosxpSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: OnboardHosxpSyncState | null;
  status: HosxpSyncStatus;
  help: string;
}

export function HosxpSyncDialog({ open, onOpenChange, state, status, help }: HosxpSyncDialogProps) {
  const [copy, setCopy] = useState<CopyState>('idle');
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(buildHosxpSyncReport(state, status, help));
      setCopy('copied');
      window.setTimeout(() => setCopy('idle'), 1800);
    } catch {
      setCopy('failed');
    }
  };
  const anc = state?.lastStats?.anc;
  const steps = state?.lastSteps ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(1120px,calc(100vw-32px))] max-w-none gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border bg-surface-card px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
            <DialogTitle className="text-title text-brand">สถานะการดึงข้อมูลจาก HOSxP</DialogTitle>
            <button
              type="button"
              onClick={copyReport}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1 text-label text-ink-muted hover:bg-surface-muted"
            >
              <Copy aria-hidden="true" className="h-4 w-4" />
              {COPY_LABEL[copy]}
            </button>
          </div>
          <DialogDescription className="text-body text-ink-muted">{help}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[calc(92vh-96px)] space-y-3 overflow-y-auto bg-surface-card p-5 text-body text-ink-muted">
          <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-2 font-mono text-label">
            <Row k="STATUS">
              <span className="font-semibold">{status}</span>
            </Row>
            <Row k="PHASE">{state?.phase ?? 'unknown'}</Row>
            <Row k="HCODE">{state?.hcode ?? 'unknown'}</Row>
            <Row k="CONNECTION">{state?.connectionStatus ?? 'unknown'}</Row>
            <Row k="DB TYPE">{state?.databaseType ?? 'not detected'}</Row>
            <Row k="INTERVAL">
              {state?.intervalMs ? `${Math.round(state.intervalMs / 1000)} seconds` : 'not started'}
            </Row>
            <Row k="LAST CYCLE">{formatSyncTime(state?.lastRunAt)}</Row>
            <Row k="LAST SUCCESS">{formatSyncTime(state?.lastSuccessAt)}</Row>
            <Row k="NEXT CYCLE">{formatSyncTime(state?.nextRunAt)}</Row>
            <Row k="HOSPITAL SYNC">{formatSyncTime(state?.hospitalLastSyncAt)}</Row>
            <Row k="PATIENTS">
              IPT {state?.activePatients ?? 0} active · {state?.cachedPatients ?? 0} cached
            </Row>
            <Row k="ACTIVE ANC">
              {state?.activeAncJourneys ?? 0} pregnancies · latest {formatSyncTime(state?.latestAncSyncedAt)}
            </Row>
            <Row k="ANC SOURCE">
              HOSxP {anc?.sourcePatientsRead ?? 0} read · {anc?.sourcePatientsMapped ?? 0} mapped ·{' '}
              {anc?.patientsSynced ?? 0} synced
            </Row>
            <Row k="ANC VISITS">
              {anc?.servicesRead ?? 0} read · {anc?.servicesMapped ?? 0} mapped
            </Row>
            <Row k="ANC RISK DATA">
              risk {anc?.risksMapped ?? 0} · classifying {anc?.classifyingMapped ?? 0}
            </Row>
            <Row k="HOSxP SOURCE READ">
              IPT {state?.lastStats?.activePatientsRead ?? 0} · partograph {state?.lastStats?.partographRowsRead ?? 0}
            </Row>
            <Row k="REFERRALS">
              {state?.activeReferrals ?? 0} active · out {state?.outgoingReferrals ?? 0} · in{' '}
              {state?.incomingReferrals ?? 0}
            </Row>
            <Row k="CYCLES">
              {state?.successCount ?? 0} successful / {state?.cycleCount ?? 0} attempted
            </Row>
            {state?.statusCode && <Row k="HTTP">{state.statusCode}</Row>}
            {state?.stage && <Row k="FAILED AT">{state.stage}</Row>}
          </dl>

          {(state?.error || state?.lastError) && (
            <div className="rounded-lg border border-danger/40 bg-danger-tint px-3 py-2 font-mono text-label leading-relaxed text-ink">
              <div className="font-semibold text-danger-text">{state.error ?? 'HOSxP sync cycle failed'}</div>
              {state.detail && <div className="mt-1">{state.detail}</div>}
              {state.lastError && <div className="mt-1">{state.lastError}</div>}
            </div>
          )}

          {!state?.error && !state?.lastError && (
            <div className="rounded-lg border border-border bg-surface-muted px-3 py-2 font-mono text-label leading-relaxed text-ink">
              {anc?.error
                ? `ANC sync failed: ${anc.error}`
                : anc?.skippedReason
                  ? `ANC not synced: ${anc.skippedReason}`
                  : state?.phase === 'querying_hosxp'
                    ? 'กำลัง query HOSxP: active labour patients, active ANC, ANC visits และ partograph observations'
                    : state?.successCount
                      ? `รอบล่าสุดสำเร็จ: IPT ${state.lastStats?.activePatientsSynced ?? 0}, ANC ${anc?.patientsSynced ?? 0}, visits ${anc?.servicesMapped ?? 0}, partograph ${state.lastStats?.partographRowsUpserted ?? 0}`
                      : 'เริ่ม loop แล้ว กำลังรอผล sync รอบแรกจาก HOSxP'}
            </div>
          )}

          <div className="rounded-lg border border-border font-mono text-label">
            <div className="flex items-center justify-between border-b border-border bg-surface-muted px-3 py-2">
              <span className="font-semibold text-ink">Step log</span>
              <span className="text-ink-muted">latest cycle · {steps.length} entries</span>
            </div>
            <div className="max-h-[260px] divide-y divide-border overflow-auto">
              {steps.length === 0 ? (
                <div className="px-3 py-3 text-ink-muted">ยังไม่มีบันทึกขั้นตอน — รอรอบซิงค์ถัดไป หรือโหลดหน้านี้ใหม่</div>
              ) : (
                steps.map((step, index) => (
                  <div key={`${step.cycle}-${step.name}-${index}`} className="grid grid-cols-[92px_1fr] gap-3 px-3 py-2">
                    <div className="text-ink-muted">
                      <div>{formatSyncTime(step.at)}</div>
                      <div className={cn('mt-0.5 uppercase', STEP_TONE[step.status])}>{step.status}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-ink">{step.name}</div>
                      <div className="mt-0.5 text-ink-muted">{step.message}</div>
                      {step.counts && <div className="mt-1 text-ink-muted">{formatCounts(step.counts)}</div>}
                      {step.detail && <div className="mt-1 whitespace-pre-wrap text-danger-text">{step.detail}</div>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <div className="text-label font-semibold text-ink">ตรวจสอบ</div>
            <p className="mt-1 leading-relaxed">
              การซิงค์จะเริ่มเมื่อเปิดหน้านี้จาก HOSxP/BMS session ที่ถูกต้อง และรหัสโรงพยาบาลเปิดใช้งานใน KK-LRMS แล้ว
              หากสถานะเป็น ERROR ให้แก้ไขตามรายการด้านบน แล้วโหลดหน้านี้ใหม่
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run tests/unit/components/dashboard/province`
Expected: PASS (all province tests, including the unedited kiosk test).

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add src/components/dashboard/province/DashboardHeaderActions.tsx src/components/dashboard/province/HosxpSyncDialog.tsx src/components/dashboard/province/OnboardingWebhookAlert.tsx tests/unit/components/dashboard/province/DashboardHeaderActions.test.tsx tests/unit/components/dashboard/province/HosxpSyncDialog.test.tsx tests/unit/components/dashboard/province/OnboardingWebhookAlert.test.tsx
git commit -m "feat(dashboard): Thai header actions, HOSxP diagnostics dialog, webhook alert

Live status, HOSxP status, sync-with-progress and kiosk move into PageHeader
actions. The 220-line diagnostics dialog leaves page.tsx (field keys stay
English to match the copyable report); a failed copy now says what to do.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Thin `page.tsx` composition

**Files:**
- Modify: `src/app/(provincial)/page.tsx` (full replacement), `eslint-rules/design-allowlist.json`
- Test: `tests/unit/pages/dashboard.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–12; `HospitalDetailDialog({ hcode, hospital, allHighRiskPatients, open, onClose })`; `useKioskMode()`; `useSetBreadcrumbs`.
- Produces: `DashboardPage` (default export) at ≤ ~250 lines with no inline data logic. It renders `OnlineUsersBadge` zero times (the shell's `AppHeader` renders it once).

- [ ] **Step 1: Write the failing page test**

```tsx
// tests/unit/pages/dashboard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import DashboardPage from '@/app/(provincial)/page';
import type { ProvinceDashboard } from '@/hooks/useProvinceDashboard';
import {
  makeContinuum,
  makeHighRiskPatient,
  makeHospital,
  makeStageKPIs,
  makeSummary,
  makeTrends,
} from '../../helpers/dashboard-fixtures';

const h = vi.hoisted(() => ({
  dash: {} as Record<string, unknown>,
  kiosk: { isKiosk: false, toggleKiosk: () => {}, exitKiosk: () => {} },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/' }));
vi.mock('@/hooks/useProvinceDashboard', () => ({ useProvinceDashboard: () => h.dash }));
vi.mock('@/hooks/useKioskMode', () => ({ useKioskMode: () => h.kiosk }));
vi.mock('@/components/dashboard/ProvinceMap', () => ({ ProvinceMap: () => <div data-testid="province-map" /> }));
vi.mock('@/components/dashboard/OnlineUsersBadge', () => ({
  OnlineUsersBadge: () => <span data-testid="online-users-badge" />,
}));
vi.mock('@/components/dashboard/HospitalDetailDialog', () => ({ HospitalDetailDialog: () => null }));

function baseDash(over: Partial<ProvinceDashboard> = {}): ProvinceDashboard {
  return {
    hospitals: [makeHospital(), makeHospital({ hcode: '10671', name: 'รพ.ชุมแพ' })],
    summary: makeSummary(),
    stageKPIs: makeStageKPIs(),
    alerts: { referralAlerts: 7, overdueAnc: 138, dueSoon: 172 },
    trends: makeTrends(),
    continuum: makeContinuum(),
    updatedAt: new Date().toISOString(),
    isLoading: false,
    error: undefined,
    highRiskPatients: [makeHighRiskPatient()],
    hrLoading: false,
    sseState: 'connected',
    hosxpSyncState: null,
    onboardingError: null,
    syncing: false,
    refreshAll: vi.fn(),
    triggerSync: vi.fn(async () => {}),
    dataStale: false,
    onlineCount: 2,
    reportingCount: 2,
    freshCount: 1,
    ancFallback: { hr3: 106, dueSoon: 172 },
    ...over,
  };
}

beforeEach(() => {
  h.dash = baseDash();
  h.kiosk = { isKiosk: false, toggleKiosk: () => {}, exitKiosk: () => {} };
});

describe('Provincial dashboard page', () => {
  it('composes the Thai sections under one page heading', () => {
    render(<DashboardPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'ภาพรวมจังหวัดขอนแก่น' })).toBeInTheDocument();
    for (const name of [
      'งานที่ต้องจัดการ',
      'ห้องคลอดทั้งจังหวัด',
      'ฝากครรภ์และการส่งต่อ',
      'ผู้คลอดเสี่ยงสูงและในห้องคลอด',
      'ระยะการดูแล',
      'สรุปเวร',
      'ภาพรวมโรงพยาบาล',
    ]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    expect(screen.getAllByTestId('province-map')).toHaveLength(1);
  });

  it('renders no OnlineUsersBadge of its own (AppHeader already does)', () => {
    render(<DashboardPage />);
    expect(screen.queryAllByTestId('online-users-badge')).toHaveLength(0);
  });

  it('has no English war-room labels in normal mode', () => {
    render(<DashboardPage />);
    expect(
      screen.queryByText(/ALL CLEAR|ACTIVE ALERTS|REFERRAL ACTION|ACTIVE LABOR|ADMISSIONS · LAST 24H|SHIFT SUMMARY|PPHO WAR-ROOM|NODES|Province overview/),
    ).toBeNull();
  });

  it('KPI counts come from server aggregates, not row lengths', () => {
    h.dash = baseDash({ summary: makeSummary({ totalActive: 1234 }), highRiskPatients: [makeHighRiskPatient()] });
    render(<DashboardPage />);
    expect(within(screen.getByTestId('vital-active')).getByText('1,234')).toBeInTheDocument();
  });

  it('kiosk mode renders the frozen kiosk instead', () => {
    h.kiosk = { ...h.kiosk, isKiosk: true };
    render(<DashboardPage />);
    expect(screen.getByText('PPHO WAR-ROOM')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('loading, error-without-cache and stale-cache states', () => {
    h.dash = baseDash({ isLoading: true });
    const { unmount } = render(<DashboardPage />);
    expect(screen.getByText('กำลังโหลดภาพรวมจังหวัด...')).toBeInTheDocument();
    unmount();

    h.dash = baseDash({ error: new Error('boom'), updatedAt: null });
    const second = render(<DashboardPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('ไม่สามารถโหลดข้อมูลภาพรวมจังหวัดได้');
    expect(screen.getByRole('alert')).toHaveTextContent('วิธีแก้:');
    second.unmount();

    h.dash = baseDash({ error: new Error('x'), dataStale: true });
    render(<DashboardPage />);
    expect(screen.getByText('การเชื่อมต่อล้มเหลว — แสดงข้อมูลเดิมจากแคช')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('webhook onboarding error is actionable and dismissible', () => {
    h.dash = baseDash({ onboardingError: 'HTTP 500' });
    render(<DashboardPage />);
    expect(screen.getByText('ไม่สามารถอัปเดต webhook_setting บน HOSxP')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ซ่อน' }));
    expect(screen.queryByText('ไม่สามารถอัปเดต webhook_setting บน HOSxP')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/pages/dashboard.test.tsx`
Expected: FAIL. Today's page calls the real hooks and renders "Province overview", three `OnlineUsersBadge`s (the mock makes two of them visible), and no `h1`.

- [ ] **Step 3: Replace `src/app/(provincial)/page.tsx`**

```tsx
// Provincial dashboard `/` — province-wide situational awareness for ward
// nurses and coordinators. UI sub-project 2 (2026-10-11): a thin composition
// over useProvinceDashboard (SWR + debounced SSE + browser poll) and the
// section components in src/components/dashboard/province/. The kiosk keeps
// its own frozen dark layout (KioskDashboard).
// Spec: docs/superpowers/specs/2026-10-11-ui-dashboard-design.md
'use client';

import { useState } from 'react';
import { useSetBreadcrumbs } from '@/components/layout/BreadcrumbContext';
import { useKioskMode } from '@/hooks/useKioskMode';
import { useProvinceDashboard } from '@/hooks/useProvinceDashboard';
import { PageHeader } from '@/components/shared/PageHeader';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { HospitalDetailDialog } from '@/components/dashboard/HospitalDetailDialog';
import { ShiftSummary } from '@/components/dashboard/ShiftSummary';
import { KioskDashboard } from '@/components/dashboard/province/KioskDashboard';
import { DashboardHeaderActions } from '@/components/dashboard/province/DashboardHeaderActions';
import { OnboardingWebhookAlert } from '@/components/dashboard/province/OnboardingWebhookAlert';
import { AlertsSection } from '@/components/dashboard/province/AlertsSection';
import { LaborVitalsSection } from '@/components/dashboard/province/LaborVitalsSection';
import { ContinuumSection } from '@/components/dashboard/province/ContinuumSection';
import { HighRiskSection } from '@/components/dashboard/province/HighRiskSection';
import { CareStageSection } from '@/components/dashboard/province/CareStageSection';
import { ProvinceOverviewPanel } from '@/components/dashboard/province/ProvinceOverviewPanel';
import { ProvinceOverviewDialog } from '@/components/dashboard/province/ProvinceOverviewDialog';
import { HosxpSyncDialog } from '@/components/dashboard/province/HosxpSyncDialog';
import type { OverviewMode } from '@/components/dashboard/province/OverviewModeToggle';
import {
  deriveHosxpSyncStatus,
  describeHosxpSyncDetail,
  describeHosxpSyncHelp,
} from '@/lib/hosxp-sync-status';

export default function DashboardPage() {
  useSetBreadcrumbs([{ label: 'แดชบอร์ด' }]);
  const d = useProvinceDashboard();
  const { isKiosk, toggleKiosk, exitKiosk } = useKioskMode();
  const [overviewMode, setOverviewMode] = useState<OverviewMode>('map');
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [selectedHospital, setSelectedHospital] = useState<string | null>(null);
  const [detailHcode, setDetailHcode] = useState<string | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [hosxpOpen, setHosxpOpen] = useState(false);

  // Map pin or list row: highlight the marker and open the hospital detail.
  const openHospitalDetail = (hcode: string | null) => {
    setSelectedHospital(hcode);
    if (hcode) setDetailHcode(hcode);
  };

  if (d.isLoading) return <LoadingState message="กำลังโหลดภาพรวมจังหวัด..." />;

  // Fetch failed with nothing cached — an all-zero dashboard is
  // indistinguishable from an empty province, so show the failure instead.
  if (d.error && !d.updatedAt) {
    return (
      <ErrorState
        message="ไม่สามารถโหลดข้อมูลภาพรวมจังหวัดได้"
        detail={d.error instanceof Error ? d.error.message : String(d.error)}
        remedy="ตรวจสอบการเชื่อมต่อเครือข่าย แล้วกด ลองใหม่ หากยังไม่ได้ แจ้งผู้ดูแลระบบ"
        onRetry={d.refreshAll}
      />
    );
  }

  if (isKiosk) {
    return (
      <KioskDashboard
        hospitals={d.hospitals}
        summary={d.summary}
        trends={d.trends}
        continuum={d.continuum}
        alerts={d.alerts}
        highRiskPatients={d.highRiskPatients}
        hrLoading={d.hrLoading}
        updatedAt={d.updatedAt}
        dataStale={d.dataStale}
        onRetry={d.refreshAll}
        freshCount={d.freshCount}
        reportingCount={d.reportingCount}
        sseState={d.sseState}
        selectedHospital={selectedHospital}
        onSelectHospital={openHospitalDetail}
        onExit={exitKiosk}
      />
    );
  }

  const hosxpStatus = deriveHosxpSyncStatus(d.hosxpSyncState);

  return (
    <div className="@container min-h-full bg-surface-page">
      {/* Fetch failed but SWR still holds the last good payload — keep it on
          screen with its timestamp (Constitution VI). */}
      {d.dataStale && (
        <ErrorState
          variant="banner"
          message="การเชื่อมต่อล้มเหลว — แสดงข้อมูลเดิมจากแคช"
          lastUpdatedAt={d.updatedAt}
          remedy="ระบบจะลองใหม่อัตโนมัติทุก 30 วินาที หรือกด ลองใหม่"
          onRetry={d.refreshAll}
        />
      )}
      <div className="flex flex-col gap-5 px-4 py-5 md:px-6">
        <PageHeader
          title="ภาพรวมจังหวัดขอนแก่น"
          subtitle="ผู้คลอดและหญิงตั้งครรภ์ทุกโรงพยาบาลที่ส่งข้อมูลเข้า KK-LRMS"
          freshness={{ lastSyncAt: d.updatedAt, label: 'ข้อมูลหน้านี้ ณ' }}
          actions={
            <DashboardHeaderActions
              sseState={d.sseState}
              hosxpStatus={hosxpStatus}
              hosxpDetail={describeHosxpSyncDetail(d.hosxpSyncState, hosxpStatus)}
              onOpenHosxp={() => setHosxpOpen(true)}
              syncing={d.syncing}
              onSync={() => void d.triggerSync()}
              onKiosk={toggleKiosk}
            />
          }
        />
        {d.onboardingError && !onboardingDismissed && (
          <OnboardingWebhookAlert error={d.onboardingError} onDismiss={() => setOnboardingDismissed(true)} />
        )}
        {/* Two columns only when the page itself (not the viewport) is wide
            enough: the shell sidebar takes 232px. */}
        <div className="grid grid-cols-1 items-start gap-5 @min-[1160px]:grid-cols-[minmax(0,1fr)_400px]">
          <div className="flex min-w-0 flex-col gap-5">
            <AlertsSection alerts={d.alerts} />
            <LaborVitalsSection summary={d.summary} trends={d.trends} />
            {d.continuum && <ContinuumSection continuum={d.continuum} />}
            <HighRiskSection
              patients={d.highRiskPatients}
              isLoading={d.hrLoading}
              totalActive={d.summary.totalActive}
              totalHigh={d.summary.totalHigh}
              ancFallback={d.ancFallback}
            />
            <CareStageSection stageKPIs={d.stageKPIs} />
            <ShiftSummary trends={d.trends} />
          </div>
          <ProvinceOverviewPanel
            hospitals={d.hospitals}
            onlineCount={d.onlineCount}
            selected={selectedHospital}
            onSelect={openHospitalDetail}
            mode={overviewMode}
            onModeChange={setOverviewMode}
            onExpand={() => setOverviewOpen(true)}
          />
        </div>
      </div>

      <HospitalDetailDialog
        hcode={detailHcode}
        hospital={d.hospitals.find((h) => h.hcode === detailHcode)}
        allHighRiskPatients={d.highRiskPatients}
        open={detailHcode !== null}
        onClose={() => setDetailHcode(null)}
      />
      <ProvinceOverviewDialog
        open={overviewOpen}
        onOpenChange={setOverviewOpen}
        hospitals={d.hospitals}
        onlineCount={d.onlineCount}
        selected={selectedHospital}
        onSelect={openHospitalDetail}
        mode={overviewMode}
        onModeChange={setOverviewMode}
      />
      <HosxpSyncDialog
        open={hosxpOpen}
        onOpenChange={setHosxpOpen}
        state={d.hosxpSyncState}
        status={hosxpStatus}
        help={describeHosxpSyncHelp(d.hosxpSyncState, hosxpStatus)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Shrink the allowlist**

In `eslint-rules/design-allowlist.json`:
1. Delete the `"src/app/(provincial)/page.tsx": …` entry (the gold `text-[#ffe89a]` is gone).
2. Change `"maxEntries": 15` to `"maxEntries": 14`.

- [ ] **Step 5: Run the page test, then the structural checks**

Run: `npx vitest run tests/unit/pages/dashboard.test.tsx`
Expected: PASS (7 tests).

```bash
wc -l "src/app/(provincial)/page.tsx"                                         # expect ≤ 250 (≈ 200)
grep -n "OnlineUsersBadge\|SectionLabel\|useSSE\|useDashboard\b" "src/app/(provincial)/page.tsx"   # expect no output
grep -nE "\.length" "src/app/(provincial)/page.tsx" src/components/dashboard/province/*.tsx
```

The last grep is the count-provenance check. Expected output is only:
- `hospitals.length` in `ProvinceOverviewPanel` / `ProvinceOverviewDialog` (the "เชื่อมต่ออยู่ X/Y แห่ง" annotation; `/api/dashboard` returns every hospital, not a row-limited page)
- `steps.length` in `HosxpSyncDialog`
- `KioskDashboard` (frozen kiosk, unchanged)

No `KpiTile` `count` may use `.length`.

- [ ] **Step 6: Full suite, typecheck, lint, build**

```bash
npx vitest run --maxWorkers=6
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all green and lint 0 problems. The build compiles `@min-[1160px]:` container variants and `@container` without CSS errors. If the build reports an unknown variant, the Tailwind 4 container-query syntax is wrong: fix the class, never drop the layout rule.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(provincial)/page.tsx" eslint-rules/design-allowlist.json tests/unit/pages/dashboard.test.tsx
git commit -m "feat(dashboard): provincial dashboard becomes a thin Thai composition

page.tsx drops from 1,134 to ~200 lines: PageHeader with freshness and
actions, section cards on a content-width (container query) two-column grid,
one sticky overview panel, kiosk via KioskDashboard. The page no longer
renders OnlineUsersBadge (AppHeader does) or client-derived freshness counts.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: E2E layout checks and the synthetic visual run

**Files:**
- Modify: `tests/e2e/ui-foundation.spec.ts` (add a dashboard test and a kiosk-button test)
- Create (output, gitignored): `e2e-private/ui-dashboard/*.png`

**Interfaces:**
- Consumes: the running app (`PLAYWRIGHT_BASE_URL`) with `E2E_BMS_SESSION_ID`, plus the `data-kpi-value`, `data-kpi-label` and `data-testid="province-overview"` hooks (Tasks 2 and 11).

- [ ] **Step 1: Add the dashboard tests**

In `tests/e2e/ui-foundation.spec.ts`:

1. After the line `const SESSION = process.env.E2E_BMS_SESSION_ID;`, add:

   ```ts
   // Dashboard screenshots can show masked names / AN — gitignored e2e-private only.
   const DASH_OUT = 'e2e-private/ui-dashboard';
   ```

2. After `mkdirSync(PRIVATE_OUT, { recursive: true });`, add `mkdirSync(DASH_OUT, { recursive: true });`.
3. Inside `test.describe('UI foundation', () => { … })`, after the kiosk test, add:

```ts
  test('provincial dashboard: no overflow, KPI numbers on one line, one presence badge @dashboard', async ({ page }, testInfo) => {
    test.skip(!SESSION, 'requires E2E_BMS_SESSION_ID');
    const log = attachDebugLogging(page);
    await login(page, log);
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      const dash = page
        .waitForResponse((r) => new URL(r.url()).pathname === '/api/dashboard', { timeout: 20_000 })
        .catch(() => null);
      await page.goto('/');
      const res = await dash;
      log.push(`/ @${w}: /api/dashboard ${res ? res.status() : 'no request'}`);
      await expect(page.getByRole('heading', { level: 1, name: 'ภาพรวมจังหวัดขอนแก่น' })).toBeVisible();
      const m = await page.evaluate(() => {
        const lines = (el: HTMLElement) =>
          Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
        const values = [...document.querySelectorAll<HTMLElement>('[data-kpi-value]')];
        const labels = [...document.querySelectorAll<HTMLElement>('[data-kpi-label]')];
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          kpis: values.length,
          wrappedValues: values.filter((el) => lines(el) > 1).map((el) => el.textContent?.trim()),
          overflowingValues: values.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent?.trim()),
          tallLabels: labels.filter((el) => lines(el) > 2).map((el) => el.textContent?.trim()),
          presenceBadges: document.querySelectorAll('[aria-label$="online users"]').length,
          twoColumns: getComputedStyle(document.querySelector('[data-testid="province-overview"]')!).position === 'sticky',
        };
      });
      log.push(`/ @${w}: ${JSON.stringify(m)}`);
      expect(m.scrollWidth, `/ @${w} scrolls horizontally`).toBeLessThanOrEqual(m.clientWidth);
      expect(m.kpis).toBeGreaterThan(10);
      expect(m.wrappedValues, `/ @${w} KPI numbers wrapped`).toEqual([]);
      expect(m.overflowingValues, `/ @${w} KPI numbers overflow their tile`).toEqual([]);
      expect(m.tallLabels, `/ @${w} KPI labels over two lines`).toEqual([]);
      expect(m.presenceBadges, `/ @${w} online-users badge count`).toBe(1);
      expect(m.twoColumns).toBe(w === 1440); // container ≥ 1160px only at 1440
      await page.screenshot({ path: `${DASH_OUT}/${TAG}-root-${w}.png`, fullPage: true });
    }

    // The sticky overview panel must stay below the sticky shell header.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.getByTestId('province-overview')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForTimeout(200);
    const pos = await page.evaluate(() => ({
      headerBottom: document.querySelector('header.sticky')!.getBoundingClientRect().bottom,
      panelTop: document.querySelector('[data-testid="province-overview"]')!.getBoundingClientRect().top,
      scrollY: window.scrollY,
      headerVar: getComputedStyle(document.documentElement).getPropertyValue('--app-header-h'),
    }));
    log.push(`/ @1440 after scroll: ${JSON.stringify(pos)}`);
    expect(pos.scrollY).toBeGreaterThan(0);
    expect(pos.panelTop).toBeGreaterThanOrEqual(pos.headerBottom - 1);
    await page.screenshot({ path: `${DASH_OUT}/${TAG}-root-1440-scrolled.png` });
    await flushDebugLog(log, testInfo);
    expect(log.filter((l) => l.includes('PAGEERROR'))).toEqual([]);
  });

  test('kiosk button enters the frozen kiosk and hides the shell @dashboard', async ({ page }, testInfo) => {
    test.skip(!SESSION, 'requires E2E_BMS_SESSION_ID');
    const log = attachDebugLogging(page);
    await login(page, log);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.getByRole('button', { name: /โหมดจอภาพ/ }).click();
    await expect(page.getByText('PPHO WAR-ROOM')).toBeVisible();
    await expect(page.locator('header.sticky')).toBeHidden();
    await expect(page.locator('aside').first()).toBeHidden();
    log.push('kiosk via button: war-room footer visible, shell hidden');
    await page.screenshot({ path: `${DASH_OUT}/${TAG}-kiosk-1920.png` });
    await page.getByRole('button', { name: 'Exit kiosk mode' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'ภาพรวมจังหวัดขอนแก่น' })).toBeVisible();
    log.push('kiosk exit: page heading back');
    await flushDebugLog(log, testInfo);
    expect(log.filter((l) => l.includes('PAGEERROR'))).toEqual([]);
  });
```

- [ ] **Step 2: Start the isolated synthetic environment** (from the MAIN checkout, Turbopack; webpack breaks PGlite)

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

Expected: `READY`. If it never comes up, read `$SCRATCH/dev.log` before changing anything.

- [ ] **Step 3: Run the E2E**

```bash
E2E_BMS_SESSION_ID=dev-session-ui-check PLAYWRIGHT_BASE_URL=http://127.0.0.1:3101 npx playwright test tests/e2e/ui-foundation.spec.ts
```

Expected: every test PASSES. That covers the login test, the authenticated route sweep (which checks `/` at 1440/1024/768 with zero leaf text under 13px), the class-injection kiosk test, and the two new `@dashboard` tests.

The debug log prints, per width:
- `/api/dashboard 200`
- `scrollWidth <= clientWidth`
- empty `wrappedValues` / `overflowingValues` / `tallLabels`
- `presenceBadges: 1`
- `twoColumns` true only at 1440

After scrolling, `panelTop >= headerBottom`.

**Acceptance (all at 1440 / 1024 / 768):**
- `scrollWidth == clientWidth`
- zero leaf text under 13px
- KPI numbers on one line and inside their tiles
- one online-users badge
- kiosk hides the shell

If an assertion fails, read the attached debug log first (the JSON metrics line names the offending values) and fix the root cause in the owning component. Never loosen the assertion. For a label that exceeds two lines, prefer `KpiGrid min="md"` for that section over shortening copy that defines what is counted.

- [ ] **Step 4: Review the screenshots, then stop the server**

Open `e2e-private/ui-dashboard/after-root-{1440,1024,768}.png`, `after-root-1440-scrolled.png` and `after-kiosk-1920.png`. Check:
- Thai labels throughout (except the kiosk);
- no word-per-line wrapping;
- the panel sits under the header after scrolling;
- the kiosk looks as before.

```bash
kill "$(cat "$SCRATCH/dev.pid")"; rm -rf "$SCRATCH"
git status --short e2e-private   # expect nothing (gitignored)
```

- [ ] **Step 5: Final verification**

```bash
npx vitest run --maxWorkers=6
npx tsc --noEmit
npm run lint
npm run build
node -e "const a=require('./eslint-rules/design-allowlist.json');console.log(Object.keys(a.files).length, a.maxEntries)"   # expect: 14 14
```

Expected: everything green; the allowlist shows 14 entries with `maxEntries` 14.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/ui-foundation.spec.ts
git commit -m "test(e2e): dashboard layout checks — no overflow, one-line KPIs, sticky panel, kiosk

Synthetic-environment run at 1440/1024/768: no horizontal scroll, KPI numbers
on one line inside their tiles, labels at most two lines, one presence badge,
overview panel below the sticky header after scrolling, kiosk via button.
Screenshots stay in gitignored e2e-private/.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Deploy is not part of this plan.** It needs explicit user approval. Use the standard pattern: rollback tag `kk-lrms-app:rollback-<date>-pre-ui-dashboard`, `BUILD_SHA` build, health check, and a 3-minute sync-log watch.
