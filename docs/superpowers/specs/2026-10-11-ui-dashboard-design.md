# Provincial Dashboard `/` — Design Spec (Sub-project 2 of 5)

Date: 2026-10-11 · Status: draft for review · Owner: Chaiyaporn Suratemeekul

## Context

Sub-project 1 shipped the foundation: direction-C tokens (`src/config/design-tokens.ts`),
the Thai type scale with a 13px floor, shared page blocks (`PageHeader`, `SectionCard`,
`KpiTile`, `DataTable`, `EmptyState`, `RiskChip`, `FreshnessBadge`, `ErrorState`,
`LoadingState`), the sidebar `AppShell` with its `StatusStrip`, and the
`no-adhoc-design-values` lint guard. Page layouts were explicitly left to
sub-projects 2–5. Foundation spec: `docs/superpowers/specs/2026-10-11-ui-foundation-design.md`.

This spec covers the provincial dashboard `/` (`src/app/(provincial)/page.tsx`,
1,134 lines) and its kiosk mode.

### What is wrong today (measured 2026-10-11)

| Problem | Evidence |
|---|---|
| One 1,134-line file | Data wiring, SSE debounce, HOSxP-sync status derivation, a 220-line diagnostic dialog, the kiosk layout and the normal layout all live in `page.tsx` |
| KPI cells cramped inside the shell | Visual review (synthetic data) at 1024px (232px sidebar) and 1440px: "เคส ใน ห้อง คลอด" breaks one word per line; "ไม่มีส่งต่อค้างเกิน SLA" wraps heavily. Cause: the left column keeps a fixed `lg:` 520px map column, so at 1024px the left column is ~232px wide and the 5-column vitals grid (`1.2fr 1fr 1fr 1fr 1.6fr`) collapses |
| English mono labels for nurses | "ALL CLEAR", "REFERRAL ACTION", "ACTIVE LABOR · PROVINCE", "ADMISSIONS · LAST 24H", "SHIFT SUMMARY", "HIGH-RISK ONLY", "SORT: SEVERITY" |
| Duplicated chrome | `OnlineUsersBadge` renders three times on `/` (AppHeader, control strip, footer). The control strip's "X/Y ข้อมูลสด" and "UPDATED HH:MM" repeat the `StatusStrip`, but derive the fraction client-side |
| Sticky map hides under the header | The map column uses `top: 0; height: calc(100vh - 60px)`, written for the old 60px nav. The new sticky header plus status strip is taller, so the pinned map slides under it |
| Two Leaflet maps mounted | The desktop `<aside className="hidden lg:block">` and the mobile fallback (`lg:hidden`) both mount `ProvinceMap` |
| Risk colour drift | `HighRiskPatientList` colours the CPD score with hardcoded `>= 6` / `>= 4`, while `RISK_LEVELS` says HIGH ≥ 10, MEDIUM ≥ 5 |

## Decisions

### Binding (user, 2026-10-11)

- Direction C "Warm Public Health" tokens; ward nurses are the primary audience (legibility over density).
- Left sidebar shell; 13px minimum text outside kiosk; illustrations enabled (`EmptyState`).

### Binding (controller, this sub-project)

1. Split `page.tsx` into focused section components under `src/components/dashboard/province/`, plus a data hook. The page becomes a thin composition (≤ ~250 lines). Same SWR/SSE data, same server aggregates.
2. Normal mode adopts the foundation: `PageHeader` ("ภาพรวมจังหวัดขอนแก่น" + freshness), `KpiTile` rows for headline numbers (server counts only), `SectionCard` per section (replacing `SectionLabel` on `/`), `EmptyState` for empty lists, `DataTable` where a list is a plain table. `HighRiskPatientList` keeps its behaviour and is restyled, not rewritten.
3. Fix the visual-review findings: responsive grids with sensible minimum widths; numbers never wrap.
4. Thai-first labels (keep ANC, CPD, HR3, SLA). Copy must state exactly what each number counts.
5. Close the foundation debt that matters here: `DataTable` sticky header, `DataTable` row keyboard + accessible name, `KpiTile` hint nested inside a link, `OnlineUsersBadge` rendered twice.
6. Kiosk keeps its dark palette and scale and must not regress. No kiosk redesign.
7. Map (Leaflet) and charts: token restyle only, no functional change.
8. Verification: TDD per task; full suite + `tsc` + lint (0) + build; synthetic-environment visual run.

### Deviations (decided while designing, with reasons)

| # | Deviation | Reason |
|---|---|---|
| D1 | `DataTable` is not used on `/` | No section is a plain table. `HighRiskPatientList` is a grid list shared with kiosk and `HospitalDetailDialog`; `HospitalTable` is a two-line sortable list with SSE row-flash. The `DataTable` debt is still fixed (Task 3) because sub-projects 3–4 will use it |
| D2 | Clickable `DataTable` rows keep `role="row"` | Overriding a `<tr>`'s role to `button` removes it from table navigation in screen readers. The accessible name comes from a **required** `rowLabel` (enforced by the type), and Enter and Space both activate |
| D3 | `DataTable` sticky header only when `maxHeight` is set | Inside shadcn's `overflow-x-auto` wrapper a sticky `<thead>` sticks to a box that never scrolls vertically. `DataTable` now owns its scroll container: bounded tables scroll internally with a working sticky header; unbounded tables no longer claim one |
| D4 | Kiosk keeps `AlertBar` and `ProvinceVitalsStrip` with their English labels | Changing them would redesign the kiosk (decision 6). Their hrefs, test ids and tooltip copy move into shared definition modules, so kiosk and normal mode cannot drift |
| D5 | CPD score colour in normal mode uses `classifyRiskLevel`; kiosk keeps `>= 6 / >= 4` | Constitution: one risk-colour rule everywhere, no hardcoded thresholds. The kiosk is frozen, so its thresholds are recorded as a follow-up (see Out of scope) |
| D6 | Two-column layout keys on **content width** (container query ≥ 1160px), not viewport `lg` | The sidebar takes 232px (64px when collapsed), so viewport width says little about the space the page actually has |
| D7 | One map instance | The overview panel renders once and changes shape with CSS. The stacked layout now uses `size="full"` strokes, a visual-only change |
| D8 | Hospital status words (ONLINE / OFFLINE / BLOCKED / NO SYNC) stay English | They must match the map legend, which decision 7 freezes. Both are Thai-ified together in sub-project 4 (`/hospitals` owns that vocabulary) |
| D9 | HOSxP sync dialog keeps English field keys | They mirror the copyable report that IT staff paste into tickets. Title, buttons and prose become Thai |
| D10 | Page footer and the control strip's client-side counts are removed | Every footer item is duplicated by the shell: SSE state by the header actions, freshness by `StatusStrip` (server counts, count-provenance rule), users by `AppHeader`, and the kiosk button by the header actions |
| D11 | ANC HR3 tile uses the `warn` tone | It follows the map's rule that red is reserved for acute intrapartum risk. The old strip coloured the HR3 number red |
| D12 | The page header freshness reads "ข้อมูลหน้านี้ ณ HH:MM" from the payload's `updatedAt` | The province HOSxP sync time is already in `StatusStrip`. Labelling payload time as "ซิงค์ล่าสุด" would misstate its source. `PageHeader` gains `freshness.label` for this |

## Layout

```
PageHeader  ภาพรวมจังหวัดขอนแก่น · ข้อมูลหน้านี้ ณ HH:MM        [อัปเดตสด] [HOSxP: ทำงานอยู่ ⓘ] [ดึงข้อมูลทันที] [โหมดจอภาพ]
OnboardingWebhookAlert (only when HOSxP webhook provisioning failed)
┌──────────────── content ≥ 1160px: 2 columns ─────────────────┬─ 400px ─────────────┐
│ งานที่ต้องจัดการ           (AlertsSection)                    │ ภาพรวมโรงพยาบาล     │
│ ห้องคลอดทั้งจังหวัด         (LaborVitalsSection)               │ (sticky under the   │
│ ฝากครรภ์และการส่งต่อ        (ContinuumSection)                 │  header: map + list │
│ ผู้คลอดเสี่ยงสูงและในห้องคลอด (HighRiskSection)                 │  or list only)      │
│ ระยะการดูแล               (CareStageSection)                  │                     │
│ สรุปเวร                   (ShiftSummary)                      │                     │
└──────────────────────────────────────────────────────────────┴─────────────────────┘
< 1160px: one column; the overview panel follows the sections with a 360px map.
```

The section order is unchanged from today. KPI tiles sit in `KpiGrid`
(`repeat(auto-fit, minmax(150px, 1fr))`), and tile padding drops to `px-4`.
Widths are computed with the 18px root, so `px-6` is 27px and `p-5` is 22.5px:

| Viewport | Container | Layout | Inside a section card | Tiles per row |
|---|---|---|---|---|
| 1440px | ~1,193px (sidebar + scrollbar) | 2 columns; left column ~716px | ~671px | 4 (need 640px) |
| 1024px | 792px | 1 column | ~693px | 4 |
| 768px | 768px | 1 column | ~687px | 4 |

A 150px tile has about 114px for its number, which fits "1,169" in `text-kpi`
but not "1,169 ราย". Tile numbers are `whitespace-nowrap`, and tiles on `/`
carry no unit suffix (the label names what is counted). The map column is
400px.

## Component map

| File | Responsibility |
|---|---|
| `src/app/(provincial)/page.tsx` | Composition only: breadcrumbs, loading/error/stale states, kiosk switch, layout grid, dialog state |
| `src/hooks/useProvinceDashboard.ts` | All data wiring: `useDashboard`, `useHighRiskPatients`, debounced `useSSE`, `useBrowserPoll`, onboarding hooks, `refreshAll`, `triggerSync`, derived `dataStale` / `freshCount` / `reportingCount` / `onlineCount` / `ancFallback` |
| `src/hooks/useCssHeightVar.ts` | Publishes an element's height as a CSS variable; `AppHeader` publishes `--app-header-h` |
| `src/lib/hosxp-sync-status.ts` | Pure: status derivation, detail/help text, `formatSyncTime`, `formatCounts`, `buildHosxpSyncReport`, Thai status labels |
| `src/config/sse-status.ts` | SSE connection state → kiosk stream text + Thai label + tone |
| `src/config/map-palette.ts` | Leaflet palettes and legend theme (light from tokens; kiosk unchanged) |
| `src/components/shared/KpiGrid.tsx` | Responsive tile grid with minimum widths |
| `src/components/shared/HintButton.tsx` | Info button + `KpiTip` (one hint affordance) |
| `province/alert-definitions.tsx` | Alert tiles: key, test id, href, Thai label, kiosk label, kiosk detail, zero text, tooltip, kind (alarm/workload), `alarmTotal()` |
| `province/metric-hints.tsx` | Tooltip copy for the labour vitals (shared with kiosk `ProvinceVitalsStrip`) |
| `province/AlertsSection.tsx` | งานที่ต้องจัดการ |
| `province/LaborVitalsSection.tsx` | ห้องคลอดทั้งจังหวัด + 24-hour admissions |
| `province/ContinuumSection.tsx` | ฝากครรภ์และการส่งต่อ |
| `province/HighRiskSection.tsx` | `SectionCard` around `HighRiskPatientList embedded` |
| `province/CareStageSection.tsx` | `SectionCard` around `StageKPICards` |
| `province/ProvinceOverviewPanel.tsx` | Map/list panel + `OverviewModeToggle` |
| `province/ProvinceOverviewDialog.tsx` | Full-screen map + list dialog |
| `province/DashboardHeaderActions.tsx` | SSE chip, HOSxP status button, sync button, kiosk button |
| `province/HosxpSyncDialog.tsx` | HOSxP diagnostic dialog + copy report |
| `province/OnboardingWebhookAlert.tsx` | Actionable webhook-provisioning error |
| `province/KioskDashboard.tsx` | Kiosk layout, moved verbatim from `page.tsx` |
| `components/dashboard/{HighRiskPatientList,HospitalTable,StageKPICards,ShiftSummary,AlertBar,ProvinceVitalsStrip,shared}.tsx` | Existing; restyled or refactored in place as listed per section below |

## Sections

All numbers are server aggregates from `/api/dashboard` (`summary`, `alerts`,
`trends`, `continuum`, `stageKPIs`) or `/api/dashboard/high-risk`. No KPI
comes from `rows.length`.

### Header — `PageHeader` + `DashboardHeaderActions`

- Title "ภาพรวมจังหวัดขอนแก่น"; subtitle "ผู้คลอดและหญิงตั้งครรภ์ทุกโรงพยาบาลที่ส่งข้อมูลเข้า KK-LRMS".
- Freshness: `updatedAt`, labelled "ข้อมูลหน้านี้ ณ" (D12).
- SSE chip (`role="status"`):
  - connected: "อัปเดตสด" (ok)
  - connecting: "กำลังเชื่อมต่อข้อมูลสด…" (neutral)
  - reconnecting: "ขาดการเชื่อมต่อ กำลังเชื่อมใหม่…" (warn)
- HOSxP button: "HOSxP: ผิดพลาด / กำลังดึงข้อมูล / ทำงานอยู่ / ไม่ได้เริ่ม / กำลังเริ่ม". Tone is danger / ok / neutral. The `title` attribute keeps the existing detail text. Clicking opens `HosxpSyncDialog`.
- Sync button: "ดึงข้อมูลทันที", or "กำลังดึงข้อมูล…" with a spinning icon and `disabled` while a cycle runs.
- Kiosk button: "โหมดจอภาพ".

### งานที่ต้องจัดการ — `AlertsSection`

`KpiGrid` of three `KpiTile`s; each has a link and a hint.

| Test id | Thai label | href | Tone |
|---|---|---|---|
| `alert-referrals` | ส่งต่อที่ต้องเร่งจัดการ | `/referrals?overdue=1` | `high` if > 0, else `ok` |
| `alert-overdue-anc` | ขาดนัด ANC เกิน `ANC_OPS.followupWarnDays` วัน | `/pregnancies?cohort=anc_stale` | `high` if > 0, else `ok` |
| `alert-due-soon` | ใกล้ครบกำหนดคลอด ≤`ANC_OPS.dueSoonDays` วัน | `/pregnancies?cohort=due_soon` | `warn` if > 0, else `ok` |

- **Description:** "งานเร่งด่วนรวม N รายการ — ส่งต่อเกิน SLA และขาดนัด ANC (ใกล้คลอดเป็นภาระงานล่วงหน้า ไม่นับรวม)", or "ไม่มีงานเร่งด่วน — …" when the total is zero.
- **Total:** `alarmTotal()` sums only the `alarm` kinds, exactly as today.
- **Tile sub-line:** "กดเพื่อเปิดรายชื่อ" when hot, otherwise the existing zero text ("ไม่มีส่งต่อค้างเกิน SLA", "ANC ครบทุกราย", "ไม่มีครรภ์ใกล้คลอด").
- **Tooltip copy:** moved verbatim. The hardcoded 24 h / 35 / 14 / 60 days become `REFERRAL_SLA.overdueAfterHours`, `ANC_OPS.followupWarnDays`, `ANC_OPS.dueSoonDays` and `ANC_LAST_VISIT_MAX_AGE_DAYS`, so the text cannot drift from the query.

### ห้องคลอดทั้งจังหวัด — `LaborVitalsSection`

- **Description:** "ผู้คลอดที่ยังอยู่ในห้องคลอดทุกโรงพยาบาล แยกตามระดับความเสี่ยง CPD ล่าสุด".
- **Tiles:**

  | Label | Value | Sub-line | Tone |
  |---|---|---|---|
  | ผู้คลอดในห้องคลอด | `totalActive` | "รับใหม่ N รายใน 24 ชม." | default |
  | CPD เสี่ยงสูง | `totalHigh` | "รับใหม่ใน 24 ชม. N ราย" | `high` if > 0 |
  | CPD เสี่ยงปานกลาง | `totalMedium` | "รับใหม่ใน 24 ชม. N ราย" | `warn` if > 0 |
  | CPD เสี่ยงต่ำ | `totalLow` | "รับใหม่ใน 24 ชม. N ราย" | default |

- **Risk bar:** a full-width `RiskBar` with the Thai legend "เสี่ยงต่ำ N · ปานกลาง N · สูง N".
- **Admissions block:**
  - Heading "รับเข้าห้องคลอดรายชั่วโมง (24 ชม.ล่าสุด)" with a hint.
  - Line "วันนี้ N ราย · เฉลี่ย 7 วัน X.X ราย/วัน".
  - A fluid `BarStrip` with Thai `aria-label` "จำนวนรับเข้ารายชั่วโมง 24 ชั่วโมงล่าสุด", and axis labels "−24 ชม. · −18 · −12 · −6 · ตอนนี้".
- **Hints:** tooltip copy comes from `metric-hints.tsx`, which kiosk `ProvinceVitalsStrip` also uses.

### ฝากครรภ์และการส่งต่อ — `ContinuumSection` (only when `continuum` is present)

- **Description:** "ตัวเลขเดียวกับหน้าฝากครรภ์และหน้าส่งต่อ — กดเพื่อเปิดรายการ".
- **Tiles:**

  | Label | Value | Link | Tone / extra |
  |---|---|---|---|
  | `ANC_REGISTRY_LABEL_TH` | `anc.total` | `/pregnancies` | hint: `ANC_REGISTRY_CRITERIA_TH` |
  | ครรภ์เสี่ยงสูง HR3 | `anc.hr3` | `/pregnancies?risk=HR3` | `warn` (D11) |
  | ใกล้คลอด ≤N วัน | `anc.dueSoon` | `/pregnancies?cohort=due_soon` | `warn` if > 0 |
  | ส่งต่อ 7 วันล่าสุด | `referrals.last7d` | `/referrals` | sub-line "วันนี้ N ราย" |

### ผู้คลอดเสี่ยงสูงและในห้องคลอด — `HighRiskSection`

- **Section card:** `SectionCard`, description "เรียงตามคะแนน CPD จากสูงไปต่ำ · ในห้องคลอดทั้งจังหวัด N ราย" (`summary.totalActive`).
- **List:** `HighRiskPatientList` with a new `embedded` prop that drops its own `SectionLabel`.
- **Changes in normal (light) mode only; the kiosk branch is untouched:**
  - **Tabs:** "เฉพาะเสี่ยงสูง · N" / "ทั้งหมดในห้องคลอด · N", with `aria-pressed`.
  - **Column headers:**
    - ความเสี่ยง
    - AN / HN
    - ผู้คลอด
    - GA
    - CPD
    - โรงพยาบาล
    - รับเข้า / นาน
    - สถานะ
    - สัญญาณชีพล่าสุด
    - พาร์โทกราฟ
    - คัดกรอง (เงา)
    - หมายเหตุ
  - **Risk column:** shared `RiskChip` (size `sm`). The visible text is the new `RISK_LEVELS[*].shortLabelTh` (ต่ำ / ปานกลาง / สูง); the accessible name stays the full Thai label, and `data-risk` is kept.
  - **CPD score colour:** `RISK_LEVELS[classifyRiskLevel(score)].textColor` (D5).
  - **Vitals text:** "no data" becomes "ไม่มีข้อมูล".
  - **Empty list:** `EmptyState` (`ward`) with a tab-aware title — "ไม่มีผู้คลอดเสี่ยงสูงในห้องคลอดขณะนี้" or "ไม่มีผู้คลอดในห้องคลอดขณะนี้". The existing ANC pressure links stay in the description.
  - **Loading skeleton:** uses the same `gridTemplateColumns` as the rows, removing the hand-maintained second copy.
  - **Raw colours → tokens:** the row-0 critical gradient uses `COLOR.riskHighTint`; `hover:bg-slate-50` and `bg-slate-200` become `surface-muted`.
- `HospitalDetailDialog` uses the light variant and picks up the same Thai labels; this is intended.

### ระยะการดูแล — `CareStageSection` + `StageKPICards`

- **Section card:** description "ฝากครรภ์ → ห้องคลอด → คลอดแล้ว · กดการ์ดเพื่อเปิดหน้ารายการ".
- **Cards:** keep their links and totals. Each card is `rounded-2xl bg-surface-card shadow-soft`, with the total in `text-kpi-sm whitespace-nowrap`.
- **Row labels:**
  - ANC: เสี่ยงต่ำ / HR1 / HR2 / HR3
  - Labour: รอคลอด / คลอดแล้ว / CPD เสี่ยงสูง
  - Delivered this month: ทารกปกติ (title: "Apgar 5 นาที ≥ 7 และน้ำหนักแรกเกิด ≥ 2,500 ก.") / Apgar 5 นาที < 7 / น้ำหนักแรกเกิด < 2,500 ก.

  These match the SQL in `getStageKPIs`: `normal = total − (apgar_5min < 7 OR birth_weight_g < 2500)`.

### สรุปเวร — `ShiftSummary`

- Becomes a `SectionCard`. The shift label sits in the actions slot, keeping its `title` with the start time.
- Three `KpiTile`s: รับเข้า / คลอด / ส่งต่อ, each with the sub-line "เวรก่อน N".
- Footer: "เปรียบเทียบกับ {previousShift.label}".

### ภาพรวมโรงพยาบาล — `ProvinceOverviewPanel` + `ProvinceOverviewDialog`

- **Panel header:** "ภาพรวมโรงพยาบาล", with "เชื่อมต่ออยู่ X/Y แห่ง" beneath it.
- **Controls:**
  - `OverviewModeToggle` with "แผนที่" / "รายชื่อ" (`aria-pressed`).
  - "ขยาย" button (`aria-label` "ขยายแผนที่เต็มจอ").
- **Two-column layout:** the panel is `sticky` at `top: calc(var(--app-header-h) + 16px)` with height `calc(100dvh − var(--app-header-h) − 32px)`. The map fills the panel and the list takes at most 36%.
- **One column:** the map is 360px tall and the list sits below it.
- **List rows:** row click navigates (`navigateOnClick`).
- **Dialog:**
  - Header is `bg-brand`, with title "ภาพรวมโรงพยาบาล" and description "เชื่อมต่ออยู่ X/Y แห่ง · กด ESC เพื่อปิด".
  - The same toggle is drawn on the brand colour.
  - The list uses toggle-select, which opens `HospitalDetailDialog` as today.
  - The gold `text-[#ffe89a]` section number is removed, so its allowlist entry is deleted.
- **`HospitalTable` (light):**
  - The sort bar reads "เรียงตาม: ความรุนแรง · ชื่อ · จำนวนผู้คลอด · ระดับ" (`aria-pressed`), followed by "N แห่ง".
  - "LB" becomes "ห้องคลอด".
  - Tooltips are Thai.
  - Status words stay English (D8).
  - The redundant "HOSPITAL · SORTED BY SEVERITY" heading is dropped: it was wrong after re-sorting, and the sort bar already says it.
- **Map:**
  - The light palette, map background and legend colours come from `COLOR` via `withAlpha()`.
  - The kiosk palette is byte-identical but moves to `src/config/map-palette.ts`. With no hex literal left in a `style`, the `ProvinceMapLeaflet.tsx` lint-allowlist entry is deleted (the allowlist only shrinks).
  - The legend copy is unchanged (decision 7).

### States

| State | Behaviour |
|---|---|
| Loading | `LoadingState` with "กำลังโหลดภาพรวมจังหวัด..." |
| Error with no cached data | `ErrorState`: message "ไม่สามารถโหลดข้อมูลภาพรวมจังหวัดได้"; remedy "ตรวจสอบการเชื่อมต่อเครือข่าย แล้วกด ลองใหม่ หากยังไม่ได้ แจ้งผู้ดูแลระบบ"; retry |
| Error with cached data | Banner "การเชื่อมต่อล้มเหลว — แสดงข้อมูลเดิมจากแคช" showing the cached time, remedy "ระบบจะลองใหม่อัตโนมัติทุก 30 วินาที หรือกด ลองใหม่", and retry. Both modes, as today |
| Webhook provisioning failed | `OnboardingWebhookAlert`: "ไม่สามารถอัปเดต webhook_setting บน HOSxP" + error + "วิธีแก้: เปิด KK-LRMS จากเมนูใน HOSxP อีกครั้ง หากยังไม่หาย แจ้งผู้ดูแลระบบพร้อมข้อความด้านบน" + "ซ่อน" |
| Copy report failed | The dialog shows "คัดลอกไม่สำเร็จ — เลือกข้อความแล้วกด Ctrl+C". Today the failure is silent |

## Foundation debt closed here

- **`DataTable`:**
  - Owns its scroll container: with `maxHeight` it scrolls internally and the header sticks; without it, no sticky header is claimed (D3).
  - Clickable rows require `rowLabel` (enforced by the type), activate on Enter and Space (Space does not scroll the page), and show a focus ring (D2).
- **`KpiTile`:**
  - A tile with `href` uses a stretched-link overlay, so the `hint` button (`HintButton`) is a sibling of the link and never nested inside it.
  - Adds `sub`, `testId`, an `ok` tone, `whitespace-nowrap` on the number, and `data-kpi-value` / `data-kpi-label` hooks for E2E.
- **`PageHeader`:** gains `freshness.label`.
- **`OnlineUsersBadge`:** rendered only by `AppHeader`. The page renders it zero times.

## Kiosk rules

- `KioskDashboard` is the kiosk JSX moved verbatim. Its props are the values the page already computed, and its output is unchanged.
- A characterization test (written before the move) pins the kiosk behaviour:
  - English kiosk labels: "ACTIVE ALERTS", "ACTIVE LABOR · PROVINCE", "High-risk & Active labor", "PPHO WAR-ROOM", "ESC TO EXIT", "x/y DATA FRESH", "SSE · STREAM OK".
  - The map in `kiosk` mode.
  - No patient names and no tabs.
  - The local kiosk risk chip.

  The test stays green through every later task.
- Kiosk keeps using `AlertBar` and `ProvinceVitalsStrip` (shared definitions, English labels) and the kiosk branch of `HighRiskPatientList` (unchanged, including the `>= 6 / >= 4` CPD colours).
- The shell is still hidden by `html.kiosk-mode aside` and `header.sticky`. The overview panel is not rendered in kiosk mode.

## Out of scope

- Kiosk redesign, including Thai kiosk labels and kiosk CPD thresholds (follow-up: align kiosk score colours to `classifyRiskLevel`).
- Map behaviour, legend copy, and the hover tooltip (dark in both modes).
- `HospitalDetailDialog` layout (sub-project 4 owns `/hospitals` detail).
- Hospital status vocabulary (D8).
- New metrics.
- `alerts.dueSoon` and `continuum.anc.dueSoon` come from two queries (`getDashboardAlerts`, `getAncBoardCounts`) and are both shown, as today. Unifying them is a data change.
- `OnlineUsersBadge`'s dark tooltip palette (it stays allowlisted).

## Testing

- **Unit (Vitest):**
  - `hosxp-sync-status` (every status branch, help text, report).
  - `sse-status`.
  - `withAlpha`.
  - `map-palette` (light palette derives from tokens; kiosk byte-identical).
  - `useProvinceDashboard` (derived counts exclude pseudo-hospitals, `refreshAll`, `triggerSync`, SSE wiring, `dataStale`).
  - `useCssHeightVar`.
- **Component (RTL):**
  - `KpiTile` (no interactive nesting, sub-line, tones, nowrap), `KpiGrid`, `PageHeader` label.
  - `DataTable` (Space/Enter, `rowLabel`, sticky only when bounded, a `@ts-expect-error` for a missing `rowLabel`).
  - Every section: Thai labels, hrefs, tones, no English mono labels.
  - `HighRiskPatientList`: existing tests updated to the Thai labels, plus CPD colour from config, embedded, tab-aware empty state.
  - `HospitalTable`: Thai sort bar.
  - `KioskDashboard` characterization.
  - Page composition: one `h1`; every section region; zero `OnlineUsersBadge`; kiosk switch; loading/error/stale.
- **E2E (Playwright, synthetic environment):**
  - `/` at 1440 / 1024 / 768: `scrollWidth == clientWidth`, no leaf text under 13px, every `[data-kpi-value]` on one line, every `[data-kpi-label]` at most two lines, and exactly one online-users badge.
  - At 1440, the overview panel stays below the sticky header after scrolling.
  - The kiosk button hides the shell and shows the kiosk.
  - Debug logs per the constitution; screenshots only to the gitignored `e2e-private/ui-dashboard/`.
- **Gates:** full suite, `tsc --noEmit`, `npm run lint` (0 problems), `npm run build`.
