# Provincial List Pages — Design Spec (Sub-project 4 of 5)

Date: 2026-10-11 · Status: draft for review · Owner: Chaiyaporn Suratemeekul

## Context

Sub-project 1 shipped the foundation: tokens, the Thai type scale with a 13px floor, shared page blocks (`PageHeader`, `SectionCard`, `KpiTile`, `KpiGrid`, `HintButton`, `DataTable`, `EmptyState`, `RiskChip`, `FreshnessBadge`, `ErrorState`, `LoadingState`), the sidebar `AppShell`, and the `no-adhoc-design-values` lint guard. Sub-project 2 rebuilt `/` on it and fixed `KpiTile`/`KpiGrid`/`DataTable` debt. Foundation spec: `docs/superpowers/specs/2026-10-11-ui-foundation-design.md`. Dashboard spec: `docs/superpowers/specs/2026-10-11-ui-dashboard-design.md`.

This spec covers the provincial list pages and their two detail pages:

| Route | File | Lines |
|---|---|---|
| `/hospitals` | `src/app/(provincial)/hospitals/page.tsx` | 757 |
| `/hospitals/[hcode]` | `src/app/(provincial)/hospitals/[hcode]/page.tsx` | 1,792 |
| `/pregnancies` | `src/app/(provincial)/pregnancies/page.tsx` | 806 |
| `/pregnancies/[journeyId]` | `src/app/(provincial)/pregnancies/[journeyId]/page.tsx` | 2,972 |
| `/referrals` | `src/app/(provincial)/referrals/page.tsx` | 926 |
| `/outcomes` | `src/app/(provincial)/outcomes/page.tsx` | 519 |

### What is wrong today (measured 2026-10-11)

| Problem | Evidence |
|---|---|
| Roster overflows at 1440px | `/hospitals` roster grid `58px 1fr 60px 60px 64px 96px 16px` sits in the right pane of a `1.4fr 1fr` split. At 1440px that pane is about 450px wide inside its padding, while the fixed columns plus gaps need about 435px. The SYNC cell (`font-mono`, "13 วันที่แล้ว") then overflows the panel |
| Registry cut off at 768px | `/pregnancies` and `/referrals` switch to the desktop table at the viewport `md:` breakpoint (768px; media-query `rem` uses the 16px initial size, not the 18px root). The table sits in `min-w-[1250px]` / `min-w-[1220px]` inside `overflow-x-auto`, so at 768px the right-hand columns sit off-screen and the table scrolls sideways. `/outcomes` recent births does the same with `min-w-[980px]` |
| Four copies of one page pattern | Every page hand-builds the same header strip ("PROVINCIAL REGISTRY · …", "อัปเดตล่าสุด HH:MM · รีเฟรชอัตโนมัติทุก 30 วิ"), a bordered KPI strip of `KpiTip` cells, a filter row ("HOSPITAL:", "SORT:", "URGENCY:", "PERIOD:"), a `font-mono` grid table, a local `EmptyState`, and "SHOWING x–y OF n · PREV/NEXT" pagination. `/pregnancies` and `/referrals` also each inline the same 400ms debounced search and the same SWR + `lastUpdated` wiring |
| English mono labels for nurses | "ROSTER", "DATA SYNC", "ANC REGISTRY", "LABOR WARD", "PARTOGRAPH QUALITY", "PROVINCE-WIDE", "DUE ≤14D", "OVERDUE EDC", "MISSED ANC", "LTFU", "TODAY", "EMERGENCY", "STATUS:", "REFERRAL CORRIDORS", "TOTAL BIRTHS", "Recent births", "ON FLOOR", "2ND STAGE", "LABOR WARD", "ANC REGISTRY", "3RD TRIMESTER", "BACK", "Vital trends", "JOURNEY ID", "REFRESHING EVERY 30s" |
| `SectionLabel` still in use | 2 on `/hospitals`, 1 each on `/pregnancies`, `/referrals` and `/outcomes`, and 6 on `/pregnancies/[journeyId]` |
| Hospital status words in English, in three vocabularies | Map legend, map tooltip and `HospitalTable` say ONLINE / OFFLINE / BLOCKED / NO SYNC / UNKNOWN (sub-project 2 deviation D8 deferred them here). `ConnectionStatus`, `ConnectionSummary` and `InactiveHospitalList` each define "ออนไลน์ / ออฟไลน์ / ไม่ทราบ" separately. The `/hospitals` sync cell says "ถูกบล็อก" / "ยังไม่ซิงก์" |
| Copy drifts from config | `/referrals` says "ค้างเกิน 24 ชม." as a literal (it should use `REFERRAL_SLA.overdueAfterHours`). `/pregnancies` hard-codes "60 วัน", "14 วัน" and "42 สัปดาห์" in copy (they exist as `ANC_LAST_VISIT_MAX_AGE_DAYS`, `ANC_EDC_MAX_PAST_DAYS` and `ANC_MAX_GA_WEEKS`). `/outcomes` hard-codes `2500` g and Apgar `< 7` (they exist as `NEWBORN_THRESHOLDS`) |
| Chip text fails contrast | `FlagChip` and the referral `Pill` draw text in the marker colours. `--risk-medium` (#D08A00) on white is about 2.6:1, below AA. Foundation deviation 5 says chips use `*-text` on `*-tint` |
| Detail pages scaled with `zoom: 1.15` | Both detail pages zoom their whole tree by 1.15. This sits outside the type scale, so shared blocks on those pages render 15% larger than everywhere else. The journey page's right rail is `hidden lg:block`, so below a 1024px viewport the clinical summary (risk, next action) disappears. At 1024px with the sidebar, the main column is squeezed to about 317px (`lg:` 400px rail × 1.15). The hospital console's body split is a fixed `1.05fr 1fr` at every width |

## Decisions

### Binding (user, 2026-10-11)

- Use the direction-C "Warm Public Health" tokens.
- Ward nurses are the primary audience: legibility comes before density.
- Use the left sidebar shell.
- No text below 13px outside the kiosk.
- Illustrations are enabled (`EmptyState`).

### Binding (controller, this sub-project)

1. **One list-page pattern, extracted once and reused by all four list pages:**
   - `ListPageLayout`: `@container` root, stale banner, `PageHeader`.
   - `KpiGrid` summaries.
   - `FilterBar` family.
   - `ResponsiveTable` (a `DataTable` above a container width, cards below it).
   - `Pagination`.
   - `useDebouncedSearch` and `useListData`.
2. Fix the visual-review findings. Tables must fit or wrap gracefully, and no page may scroll horizontally at 1440, 1024 or 768px.
3. Replace `SectionLabel` with `SectionCard` on every page in scope.
4. Thai-first labels. Keep the abbreviations ANC, CPD, HR1–HR3, GA, AN, HN, EDC, LBW, Apgar, SLA, HOSxP and BMS. Thresholds quoted in copy come from config.
5. Counts come only from server aggregates: `pagination.total`, `counts`, `opsCounts`, `statusCounts`, `totalBirths`, and per-hospital `counts`/`ancCounts` from `/api/dashboard`.
6. Use `EmptyState` for every empty list.
7. Hospital status words (ONLINE / OFFLINE / BLOCKED / NO SYNC / UNKNOWN) and the map legend become Thai through one shared label map. The kiosk keeps its English words.
8. Same data, same SWR keys and intervals, same SSE debounce, same `data-testid`s. There are no behaviour or data changes beyond the documented bug fixes below.
9. The kiosk keeps its dark palette, scale and English labels.

### Deviations (decided while designing, with reasons)

| # | Deviation | Reason |
|---|---|---|
| L1 | **The `DataTable` row-click guard skips clicks whose target is inside a nested interactive element, using `closest('a[href],button,…')`. It is not a literal `e.target === e.currentTarget` check** | On a click, `e.target` is the `<td>` or a `<span>` inside it, almost never the `<tr>`. A literal equality check would ignore every click on cell text. The nested-control rule matches the keyboard guard already in `DataTable` (commit 8594c62). If sub-project 3 lands the same guard first, keep one copy |
| L2 | **Navigating rows keep a real link** | Pregnancy, birth and hospital rows were whole-row `<Link>`s. In `DataTable` the row activates through `onRowClick` (Enter/Space/click, one tab stop). The identifying cell also holds a `<Link tabIndex={-1}>`, so middle-click and "open in new tab" still work without adding a second tab stop. The guard (L1) stops a double navigation |
| L3 | **`ResponsiveTable` renders both views and lets a CSS container query pick one** | JS measurement flashes the wrong view on first paint. CSS `@container` has no flash and works in any parent. Row `data-testid`s live only on table rows. Cards use `…-card-…` ids, so unit tests (jsdom renders both views) never see duplicates |
| L4 | **Responsive breakpoints are container widths, not viewport widths** | This is the same reasoning as dashboard D6: the 232px sidebar makes viewport width meaningless. Page layouts query the `ListPageLayout` `@container` (two columns at ≥ 1160px, as on `/`). Each `ResponsiveTable` queries its own width: tables at ≥ 560px (`sm`) or ≥ 880px (`lg`) |
| L5 | **Hospital status labels follow the existing app words**: ออนไลน์ / ออฟไลน์ / ไม่ทราบ for connection, plus ระงับการซิงค์ / ยังไม่เคยซิงค์ for sync | `ConnectionStatus`, `ConnectionSummary` and `InactiveHospitalList` already say ออนไลน์ / ออฟไลน์ / ไม่ทราบ, so their tests and nurses' habits stay. All three now read the shared map, which closes the three-copies rule |
| L6 | **Two status classifications stay separate but share words.** Link status (connection + sync) drives the map dot and the `HospitalTable` badge. Sync health (data age) drives the `/hospitals` sync cell and KPI | They answer different questions, and the map deliberately colours BLOCKED amber so it does not merge with the red OFFLINE dot. Shared states (blocked, never-synced) use identical Thai words, and a test pins this |
| L7 | **Spelling "ซิงค์" everywhere on these pages** (was "ซิงก์") | The foundation's `describeSyncAge`, `FreshnessBadge` and `StatusStrip` already use "ซิงค์". One spelling across the shell |
| L8 | **Detail pages drop `zoom: 1.15`** | The zoom scales the shared blocks 15% past the type scale. That breaks the `KpiGrid` width maths and the "one visual language" goal, and the rail height had to be divided by 1.15 by hand. The foundation scale already raised all text (body 15px, floor 13px). `/patients/[an]` keeps its zoom until its owner migrates it |
| L9 | **The journey right rail stacks below the main column under 1160px container width** (was `hidden lg:block`) | This is a documented bug fix: below a 1024px viewport the rail, with its risk assessment and next action, was not rendered at all. The rail is sticky only in the two-column layout, at `top: calc(var(--app-header-h) + 16px)`, so it clears the shell header (the same fix as the dashboard overview panel) |
| L10 | **Detail pages get chrome-level adoption only** | That means `PageHeader`, the KPI strip as `KpiGrid` + `KpiTile`, `SectionCard` section headings, Thai headings, tab and group labels, the container-query layout, and no zoom. Clinical micro-labels inside previews and rails (BP, Hb, CERVIX, TDAP …) keep their current form. The two files total 4,764 lines, and restyling every inner widget would be a rewrite, which this plan does not attempt |
| L11 | **`FlagChip` gains `tone`; the referral `Pill` maps its status/urgency meta to tones** | This fixes the AA failure (text colour on white). `color` stays on `FlagChip` for the third consumer (`/patients/[an]`), which is not in scope |
| L12 | **`KpiTile` gains a toggle mode (`onSelect` + `selected`)** | The `/pregnancies` and `/referrals` KPI cells are filter toggles. The toggle is a stretched `<button aria-pressed>` overlay, exactly like the stretched link, so the hint button stays a sibling. `count` also accepts `null`/`undefined` and renders "—" |
| L13 | **The hospital-console "ขาดนัด" tile keeps its 14-day threshold**, which moves to config as `HOSPITAL_CONSOLE.ancOverdueAfterDays` (`src/config/hospital-network.ts`) | Changing it to `ANC_OPS.followupWarnDays` (35) would change what the number counts, which is a data change. The divergence is recorded for a clinical decision (see Out of scope) |

## Component map

| File | Responsibility |
|---|---|
| `src/config/hospital-status.ts` (new) | `classifyHospitalLink()`, `HOSPITAL_LINK_STATUS` (Thai label, Thai detail, tone, kiosk label), `hospitalLinkText()` (light), `kioskLinkText()` (frozen kiosk tooltip/pin/table strings, legacy precedence), `SYNC_HEALTH_TH`, `CONNECTION_LABEL_TH`, `MAP_LEGEND` |
| `src/config/list-page.ts` (new) | `LIST_PAGE` (per-page 20, search debounce 400ms, refresh 30s/60s), `PAGE_DATA_FRESHNESS_LABEL` ("ข้อมูลหน้านี้ ณ") |
| `src/hooks/useDebouncedSearch.ts` (new) | Typed term + debounced committed query; calls `onCommit` (reset to page 1) |
| `src/hooks/useListData.ts` (new) | SWR with `keepPreviousData` and refresh interval; returns `lastUpdatedAt` |
| `src/services/hospital-roster.ts` (new) | Pure: `summarizeRoster()` (KPI roll-ups), `groupRosterByLevel()` (level groups, busiest first, level stats) |
| `src/components/shared/ListPageLayout.tsx` (new) | `@container` page root, stale banner, `PageHeader` with the page-data freshness label |
| `src/components/shared/FilterBar.tsx` (new) | `FilterBar`, `SearchField`, `FilterSelect`, `FilterChips` |
| `src/components/shared/Pagination.tsx` (new) | "แสดง x–y จาก N {unit}" + ก่อนหน้า / หน้า p/t / ถัดไป |
| `src/components/shared/ResponsiveTable.tsx` (new) | `DataTable` ≥ container breakpoint, card list below, one shared empty state |
| `src/components/shared/DataTable.tsx` | Nested-control click guard (L1), `rowAttrs`, `isRowSelected`, `onRowPointerEnter` |
| `src/components/shared/KpiTile.tsx` | Toggle mode (L12); nullable `count` |
| `src/components/shared/SectionCard.tsx` | Optional `testId` |
| `src/components/shared/FlagChip.tsx` | `tone` (L11) |
| `src/components/referrals/chips.tsx` | `STATUS_META` / `URGENCY_META` / `AGE_META` carry a tone; `Pill`/`AgeChip` render through `FlagChip` |
| `src/components/dashboard/{ProvinceMapLeaflet,HospitalTable}.tsx`, `src/components/dashboard/MapStatusLegend.tsx` (moved out of the Leaflet file) | Read the shared status map; light = Thai, kiosk = unchanged |
| `src/components/shared/ConnectionStatus.tsx`, `src/components/dashboard/{ConnectionSummary,InactiveHospitalList}.tsx` | Labels from `CONNECTION_LABEL_TH` (same words) |
| The 6 page files | Rebuilt or re-chromed per the sections below |

## The list-page pattern

```
ListPageLayout  (@container root, bg-surface-page, px-4 md:px-6, gap-5)
├─ ErrorState banner  (cached data on screen after a failed refresh)
├─ PageHeader  h1 · subtitle · "ข้อมูลหน้านี้ ณ HH:MM · N นาทีที่แล้ว" · actions
├─ SectionCard  summary  → KpiGrid of KpiTile (links, toggles or plain)
├─ (optional) SectionCards side by side  @min-[900px]:grid-cols-2
└─ SectionCard  list     → FilterBar → ResponsiveTable → Pagination
```

- **Freshness.** The header shows the time this page's data was fetched (`useListData.lastUpdatedAt`) or, for `/hospitals`, the payload's `updatedAt`. It is labelled "ข้อมูลหน้านี้ ณ" (dashboard D12), because HOSxP sync time is already in `StatusStrip`. Before the first success the badge is omitted, never shown as "ยังไม่เคยซิงค์".
- **Stale.** A failed refresh with cached data shows "การเชื่อมต่อล้มเหลว — แสดงข้อมูลเดิมจากแคช" with the cached time, the remedy "ระบบจะลองใหม่อัตโนมัติทุก {N} วินาที หรือกด ลองใหม่", and retry. A failure with no data shows a page `ErrorState` with the remedy "ตรวจสอบการเชื่อมต่อเครือข่าย แล้วกด ลองใหม่ หากยังไม่ได้ แจ้งผู้ดูแลระบบ".
- **FilterBar.** A `role="group"` labelled "ตัวกรองรายการ". Every control has a visible Thai label, and the targets are 45px tall (`h-10` at the 18px root). The bar shows "ล้างตัวกรอง" only when a filter is active.
- **ResponsiveTable.**
  - Columns wrap (`whitespace-normal`) and numeric columns are right-aligned with tabular figures.
  - Below the breakpoint, rows become cards that carry the same facts, two to four lines each.
  - Empty → one `EmptyState` for both views.
- **Pagination.** Reads `pagination` only (count-provenance). It is hidden when there is a single page.

Widths (18px root; the container is the page root, inside the shell):

| Viewport | Page container | Inside page padding | Inside a `SectionCard` | `lg` table (880) | `sm` table (560) |
|---|---|---|---|---|---|
| 1440 | ~1,193 | ~1,139 | ~1,094 | table | table |
| 1024 | ~792 | ~738 | ~693 | cards | table |
| 768 | ~753 | ~699 | ~654 | cards | table |

## Hospital status vocabulary (`src/config/hospital-status.ts`)

| Link status | Rule (precedence top-down) | Thai label | Thai detail | Kiosk label | Tone |
|---|---|---|---|---|---|
| `blocked` | `syncStatus === 'BLOCKED'` | ระงับการซิงค์ | ระบบระงับการซิงค์ของโรงพยาบาลนี้ — {reason} | BLOCKED | warn |
| `online` | `ONLINE` and not `NEVER_SYNCED` | ออนไลน์ | เชื่อมต่อและซิงค์ข้อมูลปกติ | ONLINE | ok |
| `offline` | `OFFLINE` | ออฟไลน์ | ติดต่อตู้ BMS ของโรงพยาบาลไม่ได้ | OFFLINE | danger |
| `noSync` | `NEVER_SYNCED` | ยังไม่เคยซิงค์ | รอผู้ใช้จากโรงพยาบาลนี้เปิด KK-LRMS ครั้งแรก | NO SYNC | neutral |
| `unknown` | otherwise | ไม่ทราบ | ยังไม่ทราบสถานะการเชื่อมต่อ | UNKNOWN | neutral |

- **Precedence.** The order is identical to today's three inline copies (map dot, map tooltip, `HospitalTable`), and a table-driven test pins it.
- **Sync health (`SYNC_HEALTH_TH`):**

  | Class | Thai label |
  |---|---|
  | ok | ข้อมูลสด |
  | stale | ล่าช้าเกิน {`staleAfterMinutes`} นาที |
  | critical | ล่าช้าเกิน {`criticalAfterHours`} ชม. |
  | never | = `noSync` label |
  | blocked | = `blocked` label |

- **Map legend (light).** The heading "STATUS DOT" becomes "สถานะการเชื่อมต่อ". The items are ออนไลน์, ระงับการซิงค์, ออฟไลน์, and "ยังไม่เคยซิงค์ / ไม่ทราบ" (one grey dot). The text is in Sarabun, not mono.
- **Kiosk.** The legend, tooltip and pin titles stay byte-identical. The kiosk strings move into the config so components carry no copy.

## Per-page design

### `/hospitals` — โรงพยาบาลในเครือข่าย

- **Header:**
  - Title "โรงพยาบาลในเครือข่าย".
  - Subtitle "สถานะการส่งข้อมูล ห้องคลอด และทะเบียนฝากครรภ์ รายโรงพยาบาล".
  - Freshness is the payload `updatedAt`.
  - Actions hold the area toggle `FilterChips` "พื้นที่": "จ.ขอนแก่น · N" / "จังหวัดอื่น / ภายนอก · N". Switching clears the selection, as today.
- **Summary `KpiGrid`** (all roll-ups from `summarizeRoster()` over the complete `/api/dashboard` hospital list, which is not paginated, so these are sums of server aggregates):

  | Test id | Label | Value | Sub-line | Tone |
  |---|---|---|---|---|
  | `kpi-roster` | โรงพยาบาลในพื้นที่นี้ | hospitals | "มีผู้ป่วยในระบบ N แห่ง" | default |
  | `kpi-sync` | ข้อมูลสด (ซิงค์ภายใน {staleAfterMinutes} นาที) | ok count, unit "/ N แห่ง" | "ล่าช้า N · ยังไม่เคยซิงค์ N · ระงับการซิงค์ N" | warn if any need attention |
  | `kpi-anc` | `ANC_REGISTRY_LABEL_TH` | ANC total | "ครรภ์เสี่ยงสูง HR3 N ราย" | default |
  | `kpi-labor` | ผู้คลอดในห้องคลอด | active total | `RiskBar` + "เสี่ยงสูง N" | default |
  | `kpi-partograph` | การบันทึกพาร์โทกราฟ ({windowDays} วัน) | coverage %, unit "%" | "บันทึก a/b ราย · ต่ำกว่าเกณฑ์ N แห่ง" or "ทุกแห่งผ่านเกณฑ์" | warn if below threshold |

  Hints keep today's tooltip copy, in Thai, with "ONLINE" replaced by the shared label.

- **Body:** at ≥ 1160px container width, two columns `[minmax(0,1fr)_640px]`; one column below that.
  - **"แผนที่เครือข่ายโรงพยาบาล"** (`SectionCard`). Description: "ขนาดวงกลม = จำนวนผู้คลอด · สี = ความเสี่ยงสูงสุด · จุดมุม = สถานะการเชื่อมต่อ". The map is 360px tall in one column and fills the viewport height (minimum 480px) in two columns.
  - **"รายชื่อโรงพยาบาล"** (`SectionCard`):
    - Actions: "แสดง X จาก Y แห่ง".
    - `SearchField` "ค้นหาชื่อหรือรหัสโรงพยาบาล". It filters the roster only, as today.
    - Groups: one per level, in `HOSPITAL_LEVELS` order, busiest first. Each group has an `h3` "{nameTh} · N แห่ง", a line "ANC N · ห้องคลอด N · เสี่ยงสูง N", and a `ResponsiveTable` (`sm`).
    - In two columns the card body scrolls inside the viewport height. At 1440 the inner width is about 595px (about 580px after the pane scrollbar), above the 560px `sm` table breakpoint, so the table fits (fixes the SYNC overflow).
- **Roster columns:**
  - โรงพยาบาล: name link, plus "เสี่ยงสูง N" (danger) and "HR3 N" (warn) chips, plus the hcode.
  - ANC.
  - ห้องคลอด.
  - พาร์โทกราฟ.
  - ซิงค์ล่าสุด: dot plus relative age, or the `SYNC_HEALTH_TH` label for blocked/never.
- **Row behaviour.** Hovering a row selects its pin, and clicking opens `/hospitals/{hcode}`. A pin click highlights the row and scrolls it into view (unchanged behaviour). Rows keep `data-testid="hospital-row-{hcode}"`, `data-sync`, and `data-testid="parto-cell"`/`data-parto`.
- **Empty search:** `EmptyState` "ไม่พบโรงพยาบาลที่ตรงกับคำค้น" + "ลองค้นด้วยชื่อย่อ เช่น "พล" หรือรหัส 5 หลัก".

### `/pregnancies` — ฝากครรภ์ (ANC)

- **Header:**
  - Title "ฝากครรภ์ (ANC)".
  - Subtitle "ทะเบียนหญิงตั้งครรภ์ทั้งจังหวัด N ราย · ไม่รวมรายที่คลอดแล้ว อายุครรภ์เกิน {ANC_MAX_GA_WEEKS} สัปดาห์ หรือขาดการติดตามเกิน {ANC_LAST_VISIT_MAX_AGE_DAYS} วัน (ดูรายที่หลุดการติดตามได้ที่การ์ด หลุดการติดตาม)".
- **"ระดับความเสี่ยงทั้งจังหวัด"** (`SectionCard`). Description: "นับจากทะเบียนทั้งจังหวัด ไม่ขึ้นกับตัวกรอง — กดการ์ดเพื่อกรองรายชื่อ กดซ้ำเพื่อยกเลิก".
  - `kpi-anc-total` "หญิงตั้งครรภ์ทั้งหมด" = `counts.total`, with a `RiskBar`.
  - Toggles `risk-LOW` "ความเสี่ยงต่ำ", `risk-HR1` "HR1 · ความเสี่ยงระดับ 1", `risk-HR2` "HR2 · ความเสี่ยงระดับ 2", `risk-HR3` "HR3 · ความเสี่ยงสูง" (HR3 tone `warn`, per dashboard D11).
- **"กลุ่มที่ต้องติดตาม"** (`SectionCard`). Toggles fed by `opsCounts`, with hints moved from `COHORT_TIPS` and the literals replaced by config:

  | Test id | Label |
  |---|---|
  | `kpi-due-soon` | ครบกำหนดคลอดใน {dueSoonDays} วัน |
  | `kpi-overdue-edc` | เลยกำหนดคลอด ยังไม่มีบันทึกคลอด |
  | `kpi-anc-stale` | ห่างนัด ANC เกิน {followupWarnDays} วัน |
  | `kpi-low-visits` | ANC ไม่ถึง {minVisits} ครั้ง (GA ≥ {minVisitsGaWeeks} สัปดาห์) |
  | `kpi-near-term` | ใกล้คลอด GA ≥ {nearTermGaWeeks} สัปดาห์ |
  | `kpi-ltfu` | หลุดการติดตาม ({ANC_LAST_VISIT_MAX_AGE_DAYS}–{ltfuWindowDays} วัน) |

  `kpi-overdue-edc` and `kpi-ltfu` use the `warn` tone when greater than zero.

- **"รายชื่อหญิงตั้งครรภ์"** (`SectionCard`). Description `ANC_REGISTRY_CRITERIA_TH`; actions "ทั้งหมด N ราย" (`pagination.total`).
  - **FilterBar:**
    - ค้นหา: "ชื่อ / HN / โรงพยาบาล".
    - โรงพยาบาล (`filter-hospital`): "ทุกโรงพยาบาล", then "{name} ({count})".
    - เรียงตาม (`sort-select`).
  - **`ResponsiveTable` (`lg`):**

    | Column | Content |
    |---|---|
    | ผู้ป่วย | Masked name link · "HN … · อายุ N ปี" · age flag (อายุ < 20 / อายุ 35+) · G/P |
    | ความเสี่ยง | `AncRiskChip` |
    | GA | "N สัปดาห์" |
    | ANC | "N ครั้ง" |
    | ANC ล่าสุด | Date + follow-up chip |
    | กำหนดคลอด (EDC) | Date + due chip |
    | โรงพยาบาล | Hospital name |

    Rows keep `journey-row-{id}`, `data-due`, `data-followup` and `data-age-flag`, and open `/pregnancies/{id}`.
  - **Pagination** with unit "ราย".
  - **Empty:** `EmptyState` "ไม่พบข้อมูลฝากครรภ์". The description depends on the filters: "ไม่มีรายที่ตรงกับตัวกรอง — กด ล้างตัวกรอง" (with a button) or "ยังไม่มีข้อมูลฝากครรภ์ในทะเบียน — ข้อมูลจะปรากฏเมื่อโรงพยาบาลซิงค์จาก HOSxP".

### `/referrals` — การส่งต่อ

- **Header:** title "การส่งต่อ"; subtitle "ส่งต่อระหว่างโรงพยาบาลทั้งจังหวัด · ทั้งหมด N รายการ" (`statusCounts.total`).
- **"งานส่งต่อ"** (`SectionCard`). Description: "นับทั้งจังหวัดตามช่วงเวลาคงที่ ไม่ขึ้นกับตัวกรอง — กดการ์ดเพื่อกรองรายการ".

  | Test id | Label | Action | Tone |
  |---|---|---|---|
  | `kpi-today` | เริ่มส่งต่อวันนี้ | toggles "วันนี้" | default |
  | `kpi-7d` | ส่งต่อ 7 วันล่าสุด | toggles "7 วัน" | default |
  | `kpi-emergency` | ฉุกเฉิน ยังไม่ถึงปลายทาง | toggles urgency EMERGENCY | `high` if > 0 (acute) |
  | `kpi-highrisk` | ผู้ป่วยครรภ์เสี่ยง (HR1–HR3) | none | default |
  | `kpi-overdue` | ค้างเกิน {REFERRAL_SLA.overdueAfterHours} ชม. | toggles overdue | `warn` if > 0 |

- **Side by side at ≥ 900px** (only when insights have data, as today):
  - **"เส้นทางส่งต่อหลัก"** (`corridors-panel`): "สูงสุด N เส้นทาง", bars in `bg-brand`.
  - **"ปริมาณส่งต่อ 7 วันล่าสุด"** (`daily-volume`).
- **"รายการส่งต่อ"** (`SectionCard`). Actions: "หน้า p/t · ทั้งหมด N รายการ".
  - **FilterBar:**
    - ค้นหา: "เลขที่ส่งต่อ / HN / ชื่อผู้ป่วย".
    - สถานะ (ทั้งจังหวัด): chips with counts (`status-{STATUS}`, toggle).
    - ความเร่งด่วน: ทั้งหมด / ปกติ / เร่งด่วน / ฉุกเฉิน.
    - ช่วงเวลา: ทั้งหมด / วันนี้ / 7 วัน / 30 วัน.
    - ส่งต่อไปยัง (`filter-to-hospital`).
  - **`ResponsiveTable` (`lg`):**
    - เลขที่ส่งต่อ.
    - ผู้ป่วย: masked name, risk chip, "HN … · GA N".
    - ปลายทาง / ต้นทาง.
    - สถานะ: status pill over urgency pill.
    - การวินิจฉัย / เหตุผล.
    - เริ่มส่งต่อ: date/time + age chip.

    The row opens `ReferralDetailDialog`. Rows keep `referral-row-{id}`, `data-urgency` and `data-age`.
  - **Empty:** `EmptyState` (`referral`) "ไม่พบรายการส่งต่อ".

### `/outcomes` — ผลลัพธ์ทารก

- **Header:** title "ผลลัพธ์ทารก"; subtitle "ตัวชี้วัดทารกแรกเกิดทั้งจังหวัด · ช่วง{range}". Refresh stays at 60s.
- **FilterBar** (page level):
  - ช่วงเวลา: เดือนนี้ / 30 วัน / ทั้งหมด.
  - โรงพยาบาล (`filter-hospital`).
- **No data yet:** `EmptyState` (`stale`, warn) with the title "ยังไม่มีข้อมูลทารกจากการซิงค์ HOSxP ในช่วงที่เลือก" and the description "ระบบจะเติมข้อมูลย้อนหลังอัตโนมัติเมื่อรอบซิงค์ถัดไปทำงาน — ลองเลือกช่วง ทั้งหมด หรือกลับมาดูภายหลัง".
- **"ตัวชี้วัดทารกแรกเกิด"** (`SectionCard`):

  | Test id | Label | Value / sub-line | Tone |
  |---|---|---|---|
  | `kpi-total` | ทารกเกิดทั้งหมด | "ราย · {range}" | default |
  | `kpi-lbw` | น้ำหนักแรกเกิดน้อย (LBW < {lbwGrams} ก.) | sub "X.X% ของทารกทั้งหมด" | warn > 0 |
  | `kpi-apgar` | Apgar 5 นาที < {apgarLowAt5min} | — | warn > 0 |
  | `kpi-resus` | ได้รับการกู้ชีพ | sub "PPV / ใส่ท่อ / กดหน้าอก / ออกซิเจน" | warn > 0 |
  | `kpi-multiples` | ทารกจากครรภ์แฝด | sub "ทารกคนที่ 2 ขึ้นไป" | default |
  | `kpi-avg-weight` | น้ำหนักแรกเกิดเฉลี่ย | unit "กรัม"; "—" when 0 | default |

- **Side by side at ≥ 900px:**
  - **"จำนวนเกิดรายเดือน (6 เดือนล่าสุด)"** (`outcome-trend`).
  - **"ผลลัพธ์รายโรงพยาบาล · {range}"** (`hospital-outcomes`): a `DataTable` with โรงพยาบาล / เกิด / LBW (ร้อยละ) / Apgar 5 นาที < 7. Rows are `hospital-outcome-{hcode}`.
- **"การเกิดล่าสุด"** (`SectionCard`). Actions: "ล่าสุด N จาก M ราย · {range}" (`totalBirths`; an intentional subset label).
  - **`ResponsiveTable` (`lg`):**

    | Column | Content |
    |---|---|
    | มารดา | Masked name link |
    | ทารก | "คนที่ N · เพศ" |
    | น้ำหนัก | "N ก." + LBW chip |
    | Apgar 1/5 นาที | Scores |
    | กู้ชีพ | Chip when resuscitated |
    | เกิดเมื่อ | Date/time |
    | โรงพยาบาล | Hospital name |

    Rows keep `birth-row-{id}` and `data-low-apgar`, and open `/pregnancies/{journeyId}`. The LBW and Apgar checks use `NEWBORN_THRESHOLDS`.

### `/hospitals/[hcode]` — hospital console (chrome only, L10)

- **`ListPageLayout`:**
  - Title: hospital name.
  - Subtitle "ห้องคลอดและทะเบียนฝากครรภ์ของโรงพยาบาล · รหัส {hcode}{ · ระดับ {level}}".
  - Actions: a "รายชื่อโรงพยาบาล" back link (to `/hospitals`) and `ConnectionStatus`.
  - The per-feed stale banners stay, and their copy gains the remedy "ระบบจะลองใหม่อัตโนมัติ หรือกด ลองใหม่".
- **`KpiGrid`** (replaces the 7-column `KpiCell` strip):

  | Test id | Label | Value | Tone |
  |---|---|---|---|
  | `kpi-labor-total` | ผู้คลอดในห้องคลอด | `pagination.total`, `RiskBar` | default |
  | `kpi-labor-alarms` | สัญญาณชีพผิดปกติ | sub "ตรวจสอบทันที" / "ไม่มีสัญญาณเตือน" | high > 0 |
  | `kpi-labor-second-stage` | ปากมดลูก ≥ {nearSecondStageCervixCm} ซม. | sub "ใกล้ระยะเบ่งคลอด" | default |
  | `kpi-anc-total` | `ANC_REGISTRY_LABEL_TH` | `pagination.total`, `RiskBar` | default |
  | `kpi-anc-hr3` | ครรภ์เสี่ยงสูง HR3 | sub "X.X% ของทะเบียน" | warn > 0 |
  | `kpi-anc-overdue` | ห่างนัด ANC ≥ {ancOverdueAfterDays} วัน | — | warn > 0 |
  | `kpi-anc-due-week` | ครบกำหนดคลอดใน {ancDueWithinDays} วัน | — | default |
  | `kpi-refer-in` | จะส่งต่อมา (GA ≥ {referInMinGaWeeks} สัปดาห์) | sub "GA N · น้ำหนักทารก N · ความเสี่ยง N" | default |

  The old "OVERDUE / DUE 7d" cell was a two-number string ("3/5"). It becomes two tiles, so each number states what it counts.

- **Tabs:** "ห้องคลอด · N" (with "สัญญาณเตือน N" when there are alarms) and "ทะเบียนฝากครรภ์ · N".
- **List header:** "ห้องคลอด · เรียงตามความเสี่ยง CPD" or "ทะเบียนฝากครรภ์ · เรียงตามไตรมาสและความเสี่ยง", plus "แสดง X จาก Y ราย" or "Y ราย".
- **Groups:**
  - "ผู้คลอดทั้งหมด · เรียงตามคะแนน CPD".
  - "ไตรมาสที่ 3 (28 สัปดาห์ขึ้นไป)", "ไตรมาสที่ 2 (13–27 สัปดาห์)", "ไตรมาสที่ 1 (0–12 สัปดาห์)", "ไม่ทราบอายุครรภ์".
- **Body split:** `grid-cols-1 @min-[1000px]:grid-cols-[1.05fr_1fr]`. The list and preview stack below that width, and each pane is bounded in height only when split.
- **Refer-in pipeline:** becomes a `SectionCard` "ผู้คลอดที่จะส่งต่อมา · GA ≥ N สัปดาห์" with Thai table headers.
- **Characterization first.** There is no page test today, so one is written before any edit. It pins the server-aggregate KPIs, the tabs, the row navigation and the stale banners.

### `/pregnancies/[journeyId]` — journey detail (chrome only, L10)

- **Control strip:**
  - "BACK" → "ย้อนกลับ".
  - The sync stamp keeps `data-testid="sync-stamp"` and "ข้อมูลจาก HOSxP".
  - The stage pill shows Thai stage text without `toUpperCase()`.
- **Identity banner:**
  - The eyebrow becomes "ข้อมูลการตั้งครรภ์รายบุคคล".
  - The gradient is built from tokens (`--brand-soft` → `--surface-page` → `--surface-card`). This deletes the allowlist entry.
  - "BLOOD" → "หมู่เลือด".
- **Main:** `@container` with `@min-[1160px]:grid-cols-[minmax(0,1fr)_400px]`. The rail always renders: stacked below in one column, and sticky under the header in two columns (L9).
- **Sections** (`SectionLabel` → `SectionCard`):

  | Was | `SectionCard` title | Description |
  |---|---|---|
  | Vital trends | แนวโน้มสัญญาณชีพ | "N ครั้ง · เรียงจากเก่าไปใหม่ (ซ้าย → ขวา)" |
  | ANC visit timeline | ประวัติการฝากครรภ์ | "N ครั้ง" |
  | Labs · screening · PMH | ผลตรวจทางห้องปฏิบัติการ คัดกรอง และโรคประจำตัว | Lab flags in actions, or "ไม่พบค่าผิดปกติ" |
  | Immunization | วัคซีน | "Tdap N ครั้ง · ไข้หวัดใหญ่ N ครั้ง" |
  | Ultrasound & fetal wellbeing | อัลตราซาวด์และสุขภาพทารกในครรภ์ | "ไตรมาส 1 กำหนดอายุครรภ์ · ไตรมาส 2 ตรวจโครงสร้าง · ไตรมาส 3 ประเมินสุขภาพทารก" |
  | Newborn outcomes | ผลลัพธ์ทารกแรกเกิด | "N คน" |

- **Footer:** "รหัสการตั้งครรภ์ {id8} · รีเฟรชอัตโนมัติทุก {N} วินาที".

## States

| State | Behaviour |
|---|---|
| Loading (no data) | `LoadingState`, same Thai messages as today |
| Error, no data | `ErrorState`: "ไม่สามารถโหลดข้อมูล{หน้า}ได้" with the remedy (see pattern) and retry |
| Error, cached data | `ErrorState` banner through `ListPageLayout.stale` (`/hospitals` today; `/pregnancies`, `/referrals` and `/outcomes` gain it: previously they showed stale rows silently) |
| Empty list | `EmptyState` per page (above) |
| Filtered empty | `EmptyState` with a "ล้างตัวกรอง" action |

## Out of scope

- **Kiosk.** No kiosk changes: its legend, tooltip and table words are frozen and moved verbatim into config.
- **`/patients/[an]`** and its `SectionLabel`s, zoom and `FlagChip` colours. Its owner migrates them.
- **`/hospitals/[hcode]/pregnancies`.** It is a separate per-hospital ANC list, a natural fourth consumer of the pattern. Follow-up.
- **Inner clinical widgets** of the two detail pages (previews, rail cards, lab tiles, trend rows) beyond headings (L10).
- **Clinical decision: the hospital console counts "ขาดนัด" at ≥ 14 days, the province board at ≥ 35 days** (`ANC_OPS.followupWarnDays`). Both are now config values, so the decision is a one-line change.
- **Follow-up: the hospital console's labour row prints `cpd_score` with a `%` suffix.** A CPD score is points, not a percentage.
- **The dashboard's own literal "ข้อมูลหน้านี้ ณ".** It can adopt `PAGE_DATA_FRESHNESS_LABEL` in sub-project 2's fix wave.
- **New metrics or API changes.**

## Testing

- **Unit (Vitest):**
  - `hospital-status`: precedence table equal to the three legacy inline rules; shared words for blocked/never; kiosk strings verbatim.
  - `hospital-roster`: roll-ups, level grouping, busiest-first order, sums from `counts`.
  - `useDebouncedSearch`: commits after the delay, resets the page once, clear.
  - `useListData`: `keepPreviousData`, `lastUpdatedAt` set on success.
  - `list-page` config.
- **Component (RTL):**
  - `DataTable`: the nested-control click guard (a button in a cell does not fire the row; cell text does), `rowAttrs`, selected row, pointer enter.
  - `ResponsiveTable`: both views, container classes, one empty state, card ids distinct.
  - `KpiTile` toggle: `aria-pressed`, hint sibling, `null` count renders "—".
  - The `FilterBar` family (labels, `aria-pressed`, clear only when active).
  - `Pagination`: Thai range from `pagination`, hidden on one page.
  - `ListPageLayout`: one h1, freshness label omitted before first success, stale banner.
  - `FlagChip` tones.
  - Map legend (Thai light, English kiosk).
  - `HospitalTable` status word (Thai light, English kiosk).
- **Pages:** the existing `hospitals`, `pregnancies`, `referrals`, `outcomes` and `journey-detail` tests are kept and updated only where the copy changed (listed per task). Each page adds:
  - Thai labels present, English mono labels absent.
  - KPIs equal the server aggregates, not row counts.
  - `EmptyState`.
  - No `SectionLabel`.
  - A new hospital-console characterization test.
- **E2E (Playwright, synthetic environment):**
  - The four list pages, `/hospitals/10670`, and the first journey from `/pregnancies`, each at 1440, 1024 and 768.
  - Assertions on each:
    - `scrollWidth ≤ clientWidth`.
    - No leaf text under 13px.
    - Every `[data-kpi-value]` on one line.
    - The roster's last column inside its card at 1440.
    - At 1440 `/pregnancies` shows the table; at 768 it shows cards.
    - The journey rail visible at 768.
  - Debug logs per the constitution; screenshots only in the gitignored `e2e-private/ui-lists/`.
- **Gates:** full suite, `tsc --noEmit`, `npm run lint` (0 problems), `npm run build`.
