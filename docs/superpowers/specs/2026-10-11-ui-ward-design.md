# Ward board `/hospital-maternity-ward` + patient detail `/patients/[an]` — Design Spec (Sub-project 3 of 5)

Date: 2026-10-11 · Status: draft for review · Owner: Chaiyaporn Suratemeekul · Slug: `ward`

## Context

Sub-project 1 shipped the direction-C foundation: tokens, the Thai type scale with a 13px floor, shared blocks (`PageHeader`, `SectionCard`, `KpiTile`, `KpiGrid`, `HintButton`, `DataTable`, `EmptyState`, `RiskChip`, `FreshnessBadge`, `ErrorState`, `LoadingState`), the sidebar `AppShell`, and the `no-adhoc-design-values` lint guard. Sub-project 2 rebuilt `/` as a thin Thai composition and fixed `KpiTile` nesting, `KpiGrid`, `DataTable` (bounded sticky header, Enter/Space, required `rowLabel`, nested-control guard) and `PageHeader.freshness.label`.

This spec covers the two screens ward nurses use all shift:

- **Ward board** `/hospital-maternity-ward`: `src/app/(hospital)/hospital-maternity-ward/page.tsx` (595 lines), `WardLayoutViewFull` (379), `BedTileFull` (984), the `PatientDrawer` shell (494) and `BedMoveReasonModal` (89).
- **Patient detail** `/patients/[an]`: `src/app/(provincial)/patients/[an]/page.tsx` (1,039 lines) and `src/components/patient/*`: `PatientHeader`, `StickyPatientHeader`, `ReferralBanner`, `QuickStatsBar`, `CurrentVitalsPanel`, `LaborProgressCard`, `ClinicalData`, `CpdFactorBreakdown`, `AlertSummaryPanel`, plus the partograph tab.

### What is wrong today (read from the code, 2026-10-11)

| Problem | Evidence |
|---|---|
| Ward board ignores the tokens | ~300 inline `style` objects; slate hex (`#0F172A`, `#64748B`, `#F4F7FB`, `#E2E8F0`, `#CBD5E1`), a non-token blue `#1565C0`, a rainbow of per-domain hues (cyan vitals, indigo labour, violet contractions, rose FHR); three allowlist entries (page, `BedTileFull`, `WardLayoutViewFull`) |
| English mono labels for nurses | Masthead "Total Beds / Occupied / Available / Locked / High-risk", "LIVE · BMS SESSION API", "Refresh ↻", "Room 03", "04 BEDS · 01 OCC · 03 FREE", tile "BED", "Stage I · Active", "Action · Partogram +2h", "Vitals / Labour Progress / Contractions / Interventions", "Admit / Hrs / Last", "Allergy / NKDA", "Available / Ready for admission", drawer tabs "Vital Signs / Pre-labour / DR Med / …" |
| Raw English errors | Session failure renders `เกิดข้อผิดพลาด: BMS session response missing bms_url`: no cause, no remedy. A feed error shows the raw `error.message`. A failed bed-move reason lookup silently disables the confirm button |
| No last-sync time on the ward | Only a "LIVE" badge with the error hidden in a `title` attribute. Constitution VI requires "Offline — Last sync: [timestamp]" |
| Two counting rules (bug B1) | Masthead: `occupied = occupancy.length`, `free = total − occupied − locked`. Room header: occupied excludes locked beds. A patient whose bed is later locked in HOSxP is counted as occupied **and** locked (free under-counted by one) and is **hidden** on the board, because `BedTileFull` returns `LockedTile` before it looks at the occupant |
| Duplicated clinical heuristic | The prolonged-latent rule (`≥12 h since admit and Cx unknown or < 4 cm`) is written twice (page KPI + `BedTileFull.classify`) |
| No empty states | A ward with zero beds renders a blank board; zero patients renders a grid of "Available" tiles with no message |
| Patient page zoom | Root `zoom: 1.15` bypasses the type scale. The partograph sits inside `zoom: 0.7`, and its 900-unit SVG is scaled to the column width, so its 13px text renders at about 9–10px |
| Patient sticky header misplaced (bug B2) | `StickyPatientHeader` is `fixed top-14 … md:left-60`, written for the retired 56px `TopNavBar` and 240px nav. Under the new shell it overlaps the sticky `AppHeader` and is misaligned with the 232px sidebar |
| Fixed six-column stats | `QuickStatsBar` uses `repeat(6, minmax(0,1fr))`: at 768px each tile is ~120px with 26px values ("G2 P1 A0 L1" overflows) |
| Ad-hoc severity tints | `color-mix(in srgb, #ef4444 …)` in `CurrentVitalsPanel`, `ClinicalData`, `CpdFactorBreakdown`, `ReferralBanner`, the ANC strip; pastel hex on the dark `PatientHeader` band |
| Hardcoded display thresholds in UI | ANC strip `< 4` / `< 8` visits and `> 28` days; GA term bands duplicated in `QuickStatsBar` and `ClinicalData`; CPD max `/ 14.5` literal |

## Decisions

### Binding (user, 2026-10-11)
- Direction C tokens; ward nurses are the primary audience (legibility over density); left sidebar shell; 13px minimum outside kiosk; illustrations enabled (`EmptyState`).

### Binding (controller, this sub-project)
1. Nurse legibility at **1024px** (ward PC, sidebar visible) and **768px** (tablet, drawer menu) first; 1440px must not regress.
2. Risk and status colour come only from `RiskChip` or token classes (`danger` / `warn` / `ok` / `brand`). Red is reserved for clinical alarm.
3. Thai-first labels. Keep the standard abbreviations ANC, CPD, HR1–HR3, GA, AN, HN, HOSxP, BMS, BP, FHR, SpO₂, O₂, Cx, IV, BW, Ht, BSA, Apgar, LMP, EDC.
4. `EmptyState` for every empty ward condition.
5. Every error is actionable Thai: **what happened · since when (when known) · what to do**.
6. **No clinical-logic change.** CPD scoring, partograph CDSS, vital thresholds, labour-phase cut-offs and the prolonged-latent rule keep their exact values. Duplicated rules are *moved* to one place unchanged.
7. Characterization tests are written before any ward-board restyle.

### Deviations (decided while designing, with reasons)

| # | Deviation | Reason |
|---|---|---|
| D1 | **Bug B1 is fixed**: an occupant always wins over the lock flag. The tile shows the patient plus a `warn` chip "เตียงถูกล็อกใน HOSxP"; counts use one rule everywhere (`occupied` includes them; `locked` counts only empty locked beds) | Hiding an admitted patient is a safety defect, and two counting rules for one number break constitution IV. `decideBedMoveAction` is unchanged: drops onto locked beds are still rejected |
| D2 | **Bug B2 is fixed**: `StickyPatientHeader` becomes `sticky` at `top: var(--app-header-h)` inside the content column | It was positioned for the retired nav and covered the shell header |
| D3 | The per-domain rainbow on bed tiles is removed. Sections get Thai headings on neutral surfaces; colour marks only stage and abnormal state | Direction C reserves hue for risk/status; a rose FHR heading read as an alarm on every tile |
| D4 | Stage pill tones keep today's mapping, expressed as tokens: prolonged latent → `danger` (solid), transition → `warn`, active → `ok`, latent → `brand` | Changing what colour a stage carries would be a clinical-display change |
| D5 | The FHR heartbeat dot is `brand`, not red, animates only under `motion-safe`, and renders only when an FHR is recorded | A red pulse on every tile implied an alarm regardless of the value, even with no reading |
| D6 | Patient page `zoom: 1.15` and partograph `zoom: 0.7` are removed. Legibility comes from the type scale (primary values `text-body`/`text-title`, labels `text-label`) | Zoom bypasses the 13px floor and the E2E font-size measurement |
| D7 | The partograph chart renders at **no less than its native 900px width** inside a horizontally scrolling card; vital trends move below it | At 1:1 its SVG text is the intended 13px. A scroll inside a card is acceptable; a page-level scroll is not |
| D8 | The KPI masthead counts are computed client-side from the complete HOSxP ward roster | `MATERNITY_WARDS`, `WARD_BEDS_INVENTORY` and `WARD_BEDS_OCCUPANCY_FULL` have no row limit; they are the server truth for one ward. The count-provenance rule targets row-limited fetches. The counting moves into `src/services/ward-board.ts` (one rule) |
| D9 | The tile KPI "High-risk" is renamed **"ระยะแฝงนาน"** with the rule shown as sub-line and hint | It never measured CPD risk; it counts the prolonged-latent heuristic. The copy must say what is counted |
| D10 | Drawer tab *contents* (Partograph, Vitals, Pre-labour … Discharge forms, ~6,200 lines) are out of scope; only the drawer shell (header, tab labels, width) is restyled | Size. They are follow-up work |
| D11 | Two primitives are extracted because they now appear twice: `StatusChip` (dashboard SSE chip + ward feed chip) and `DismissibleAlert` (`OnboardingWebhookAlert` + the bed-move error). Both sub-project 2 call sites keep identical output and tests | Constitution III |
| D12 | Display thresholds move from JSX into config **with unchanged values**: ANC strip `{ visitsMinimum: 4, visitsTarget: 8, lastVisitAlertDays: 28 }`, GA term bands (`< 34`, `< 37`, `> 41`), `CPD_MAX_SCORE = 14.5` (test-pinned against `CPD_FACTOR_WEIGHTS`) | Constitution IV. Divergent values are listed under Out of scope for the clinical owner |
| D13 | Drag-and-drop stays pointer-first. Opening the drawer by keyboard on the board is a follow-up | dnd-kit's wrapper already owns Space/Enter for keyboard drags; a nested open button needs `setActivatorNodeRef` work and its own tests |

## Component map

| File | Responsibility |
|---|---|
| `src/services/ward-board.ts` | **New.** `PROLONGED_LATENT_RULE`, `hoursSinceAdmit`, `classifyLabourStage`, `groupBedsByRoom`, `summarizeBeds` (one counting rule, B1). Pure |
| `src/lib/actionable-errors.ts` | **New.** `describeBmsSessionError`, `describeWardFeedError`, `describePatientLoadError` → `{ message, remedy, detail? }` for `ErrorState` |
| `src/config/ward-display.ts` | **New.** `LABOUR_STAGE_DISPLAY` (Thai label + tone per stage kind), `WARD_FEED_STATUS` (Thai label + tone per feed health) |
| `src/config/obstetric-display.ts` | **New.** `LABOUR_PHASE_LABEL_TH`, `classifyGaTerm`, `GA_TERM_LABEL_TH`, `CARE_STAGE_LABEL_TH` |
| `src/config/status-tone.ts` | **New.** `STATUS_TONE`: `ok`/`warn`/`danger`/`neutral` → tint, text, border-left, marker classes. Replaces every `color-mix(#hex)` tint |
| `src/config/anc-ops.ts` | Adds `ANC_SUMMARY_DISPLAY` + `classifyAncVisitCount` (values from the page) |
| `src/config/risk-levels.ts` | Adds `CPD_MAX_SCORE` |
| `src/components/shared/StatusChip.tsx` | **New.** Tone dot + Thai label pill, `role="status"` |
| `src/components/shared/DismissibleAlert.tsx` | **New.** Danger/warn alert with title, detail, "วิธีแก้", "ซ่อน" |
| `src/hooks/useMaternityWardStateFull.ts` | Adds `lastUpdatedAt`; exports `WARD_OCCUPANCY_REFRESH_MS` |
| `src/components/maternity/ward/WardHeaderActions.tsx` | **New.** Ward select, feed `StatusChip`, refresh button |
| `src/components/maternity/ward/WardKpis.tsx` | **New.** `KpiGrid` of five `KpiTile`s from `summarizeBeds` |
| `src/app/(hospital)/hospital-maternity-ward/page.tsx` | Composition only: states, header, alerts, KPIs, board, drawer |
| `src/components/maternity/{BedTileFull,WardLayoutViewFull,PatientDrawer,BedMoveReasonModal}.tsx` | Token restyle, Thai labels; logic via `ward-board.ts` |
| `src/components/patient/detail/{AncSummaryCard,ReferralHistoryCard,NewbornOutcomesCard,PartographWorkspace}.tsx` | **New.** Sections extracted from the 1,039-line page; `cdssTabBadge` (CDSS counts unchanged) |
| `src/app/(provincial)/patients/[an]/page.tsx` | Composition on `SectionCard`s; no zoom; Thai; actionable errors |
| `tests/helpers/ward-fixtures.ts`, `tests/e2e/helpers/{mock-bms,layout-metrics}.ts` | **New.** Shared nine-bed scenario; `page.route` BMS mock; layout metrics |
| `src/components/patient/*.tsx` (listed above) | Token restyle, Thai labels, responsive grids |

## Ward board

```
PageHeader  ห้องคลอด                                  [วอร์ด ▾] [● เชื่อมต่อ HOSxP สด] [⟳ รีเฟรช]
            {ชื่อวอร์ด} · อัปเดตอัตโนมัติทุก 20 วินาที
            ● ข้อมูล HOSxP ณ 14:02 · เมื่อสักครู่
[stale banner | webhook alert | bed-move alert]
section "สรุปเตียงในห้องคลอด": KpiGrid  เตียงทั้งหมด | มีผู้คลอด | เตียงว่าง | ปิดใช้งาน | ระยะแฝงนาน
[EmptyState "ไม่มีผู้คลอดในห้องคลอดขณะนี้" when occupied = 0]
ห้อง LR1   {room name}                          4 เตียง · มีผู้คลอด 1 · ว่าง 3
grid repeat(auto-fill, minmax(320px, 1fr)), gap 18px — bed tiles
PatientDrawer
```

Page padding is `px-4 md:px-6`. Breakpoints are viewport media queries, where `rem` is 16px (`md` 768, `lg` 1024, `xl` 1280); only spacing utilities use the 18px root (`px-6` = 27px, `gap-4` = 18px). Tiles per row:

| Viewport | Content width | Tiles/row (min 320 + gap 18) |
|---|---|---|
| 1440 | 1440 − 232 − 54 = 1,154 | 3 |
| 1024 | 1024 − 232 − 54 = 738 | 2 |
| 768 | 768 − 54 = 714 | 2 |

### Header
- `h1` "ห้องคลอด". Subtitle `{wardName} · อัปเดตอัตโนมัติทุก {WARD_OCCUPANCY_REFRESH_MS/1000} วินาที`.
- Freshness: `lastUpdatedAt` (time of the last successful occupancy fetch), label "ข้อมูล HOSxP ณ".
- Actions (`WardHeaderActions`):
  - Ward select, shown only with more than one ward. Label "วอร์ด"; options `{name} ({ward})`; at least 40px tall for touch.
  - Feed `StatusChip`. The tooltip carries `error.message`.

    | Health | Label | Tone |
    |---|---|---|
    | ok | เชื่อมต่อ HOSxP สด | ok |
    | reconnecting | กำลังเชื่อมต่อ HOSxP ใหม่… | warn (pulse) |
    | error | ขาดการเชื่อมต่อ HOSxP | danger (pulse) |

  - Button "รีเฟรช" (`aria-label` "รีเฟรชข้อมูลเตียง") revalidates beds and occupancy.

### KPIs (`WardKpis`, `section aria-label="สรุปเตียงในห้องคลอด"`, `KpiGrid min="sm"`)

| Label | Value | Sub-line | Tone |
|---|---|---|---|
| เตียงทั้งหมด | `totalBeds` | — | default |
| มีผู้คลอด | `occupied` | "ใช้เตียง N%" (when total > 0) | default |
| เตียงว่าง | `free` | — | default |
| ปิดใช้งาน | `lockedEmpty` | "ล็อกใน HOSxP" | default |
| ระยะแฝงนาน | `prolongedLatent` | "รับเข้า ≥{minHours} ชม. · ปากมดลูก <{cervixBelowCm} ซม." | `high` if > 0 |

The last tile's hint: "นับผู้คลอดที่รับเข้ามาแล้วอย่างน้อย {minHours} ชั่วโมง และปากมดลูกยังไม่ถึง {cervixBelowCm} ซม. หรือยังไม่มีบันทึก — เกณฑ์เดียวกับป้ายบนการ์ดเตียง ควรประเมินตามเส้นปฏิบัติการของพาร์โทกราฟ". Numbers come from `PROLONGED_LATENT_RULE`.

### Room header (`WardLayoutViewFull`)
- `h2` = the room name (`room_name`, falling back to "ห้อง {roomno}") in `text-title text-brand`, with the caption "รหัสห้อง {roomno}".
- Summary (`formatRoomSummary`): "{total} เตียง · มีผู้คลอด {occupied} · ว่าง {free}", plus " · ปิดใช้งาน {lockedEmpty}" when > 0. Numbers are not zero-padded.
- Each room is a `section` with `data-testid="ward-room-{roomno}"`; its grid has `data-testid="ward-room-grid"`.

### Bed tile (`BedTileFull`), `rounded-2xl`, token surfaces, Sarabun with `tabular-nums`
1. **Head:** "เตียง {bedno}" (`text-title`) + stage pill (`text-label`) from `LABOUR_STAGE_DISPLAY`:

   | Kind | Label | Classes |
   |---|---|---|
   | prolongedLatent | ระยะแฝงนาน · ประเมินด่วน | `bg-danger text-white` |
   | transition | ระยะที่ 1 · ระยะเปลี่ยนผ่าน | `bg-warn-tint text-warn-text` |
   | active | ระยะที่ 1 · ระยะเร่ง | `bg-ok-tint text-ok-text` |
   | latent | ระยะที่ 1 · ระยะแฝง | `bg-brand-soft text-brand-strong` |

   The prolonged-latent tile gets `border-2 border-danger bg-danger-tint/40` and `data-stage="prolongedLatent"`. Every tile carries `data-stage`.
2. **Identity:** "AN {an} · HN {hn}". Allergy pill: "แพ้ยา" (`bg-danger text-white`, title "มีประวัติแพ้ยา N รายการ") or "ไม่มีประวัติแพ้ยา" (`ok` outline). Blood group pill (neutral outline, title "หมู่เลือด {grp}"). Maternal-screen pills unchanged (GC-H3/H4 rules and test ids kept). Lock chip "เตียงถูกล็อกใน HOSxP" (D1).
3. **Name:** `PatientPhoto` + masked name (`text-body-lg`) + "อายุ {n} ปี · G{g} · GA {ga} สัปดาห์".
4. **Admission:** แพทย์ / สิทธิ / ร่างกาย (`BW … kg · Ht … cm · BSA …`), then อาการแรกรับ (prediag; label in `warn-text`).
5. **สัญญาณชีพ (บันทึกพยาบาล):** BP, T, P, R, SpO₂, O₂ in a 3 × 2 grid. Keys `text-caption text-ink-muted`; values `text-body font-semibold`.
6. **ความก้าวหน้าการคลอด (พาร์โทกราฟ):** ปากมดลูก (bar + "{n} ซม."), ระดับส่วนนำ, ถุงน้ำ, ปวด "{n}/10". Bar colour mapping unchanged: < 4 → danger, ≥ 7 → warn, else brand.
7. **การหดรัดตัว:** "{freq}/10 นาที · {dur} วินาที · {strength}" · **FHR:** value in `text-title` + the brand pulse dot (D5).
8. **สารน้ำและยา:** IV · Oxytocin "{n} mU/นาที" · หยด "{n} หยด/นาที".
9. **Footer:** "รับเข้า HH:MM · นาน HH:MM ชม. · บันทึกล่าสุด HH:MM · {staff}".
- **Empty tile:** "เตียง {bedno}" + pill "เตียงว่าง"; body "ว่าง" / "พร้อมรับผู้คลอด".
- **Locked tile:** pill "ปิดใช้งาน"; body "ปิดบำรุง" / "ล็อกใน HOSxP".
- All `data-testid="bed-{bedno}"` hooks stay.

### Drawer shell (`PatientDrawer`)
- Tabs: พาร์โทกราฟ · สัญญาณชีพ · ก่อนคลอด · ระยะคลอด · ยา · ยาห้องคลอด · ภาวะแทรกซ้อน · ทารก · เตียง · จำหน่าย. Values and order are unchanged.
- Header labels: รับเข้า, แพทย์, สิทธิ, ร่างกาย, อาการแรกรับ, บันทึกล่าสุด, เตียง, ห้อง.
- Width: `w-full md:w-[85vw] lg:w-[70vw] xl:w-[60vw] max-w-[1100px]`.
- Slate → tokens.

### Bed-move modal
- Confirm button `bg-brand`.
- With zero reasons it shows "ยังโหลดเหตุผลการย้ายจาก HOSxP ไม่ได้ — ปิดหน้าต่างแล้วกด รีเฟรช หากยังไม่ได้ แจ้งผู้ดูแลระบบ" (`role="status"`) instead of a silently disabled button.

### States

| State | Behaviour |
|---|---|
| No BMS session | `EmptyState` (`stale`) title "เปิดหน้านี้จาก HOSxP เพื่อใช้งาน", description "หน้านี้อ่านข้อมูลเตียงจาก HOSxP ของโรงพยาบาลโดยตรง จึงต้องเปิดจากเมนู KK-LRMS ใน HOSxP (ไม่พบ BMS Session)" |
| Session error | `ErrorState` from `describeBmsSessionError(raw)` (table below); `detail` = raw message for IT |
| Loading | `LoadingState` "กำลังโหลดข้อมูลเตียงจาก HOSxP…" + skeleton grid |
| Initial feed error (no ward yet) | `ErrorState` from `describeWardFeedError(error)` + retry |
| Feed error with the board on screen | `ErrorState variant="banner"`: "ดึงข้อมูลเตียงจาก HOSxP ไม่สำเร็จ — แสดงข้อมูลเดิม", `lastUpdatedAt`, remedy "ระบบจะลองใหม่อัตโนมัติทุก 20 วินาที หรือกด ลองใหม่ …", retry |
| No maternity ward | `EmptyState` (`ward`) "ไม่พบห้องคลอดใน HOSxP"; description names `ward.is_maternity_ward = 'Y'` and `ward_active = 'Y'` and says to ask the HOSxP admin; action button "ลองใหม่" |
| Ward with zero beds | `EmptyState` (`ward`) "วอร์ดนี้ยังไม่มีเตียงใน HOSxP" + remedy |
| Zero occupants | `EmptyState` (`ward`) "ไม่มีผู้คลอดในห้องคลอดขณะนี้", description "เตียงว่าง {free} เตียง · ข้อมูล HOSxP อัปเดตทุก 20 วินาที". The bed grid still renders below |
| Webhook provisioning failed | `OnboardingWebhookAlert` (shared with `/`) |
| Bed move failed | `DismissibleAlert` with today's Thai copy as title/remedy; raw error as detail |
| Move rejected (locked / occupied) | `DismissibleAlert` (`warn`) with today's Thai copy |

`describeBmsSessionError` mapping (`detail` always carries the raw message):

| Raw message starts with / contains | message | remedy |
|---|---|---|
| `missing bms_url` | เซสชัน HOSxP ไม่มีที่อยู่เซิร์ฟเวอร์ BMS ของโรงพยาบาล | ปิดหน้านี้แล้วเปิด KK-LRMS จากเมนูใน HOSxP ใหม่อีกครั้งเพื่อสร้างเซสชันใหม่ หากยังพบข้อความนี้ แจ้งผู้ดูแล HOSxP ของโรงพยาบาลให้ตรวจการตั้งค่า BMS Session API (bms_url) |
| `missing bearer token` | เซสชัน HOSxP ไม่มีรหัสยืนยันตัวตน | (same remedy, naming bms_session_code) |
| `retrieval failed (HTTP 4xx)` | ไม่พบเซสชัน HOSxP หรือเซสชันหมดอายุ | เปิด KK-LRMS จากเมนูใน HOSxP ใหม่อีกครั้ง (ลิงก์เดิมใช้ซ้ำไม่ได้หลังหมดอายุ) |
| `retrieval failed (HTTP 5xx)` | บริการเซสชัน HOSxP ขัดข้องชั่วคราว | รอสักครู่แล้วเปิดจาก HOSxP ใหม่ หากเกิน 5 นาที แจ้งผู้ดูแลระบบ |
| `timed out` | เชื่อมต่อบริการเซสชัน HOSxP ไม่ทันเวลา (30 วินาที) | ตรวจสอบอินเทอร์เน็ตของเครื่องนี้ แล้วเปิดจาก HOSxP ใหม่ |
| `Cannot connect` | เชื่อมต่อบริการเซสชัน HOSxP ไม่ได้ | ตรวจสอบอินเทอร์เน็ตหรือไฟร์วอลล์ของเครื่องนี้ แล้วเปิดจาก HOSxP ใหม่ |
| anything else | เปิดเซสชัน HOSxP ไม่สำเร็จ | เปิด KK-LRMS จากเมนูใน HOSxP ใหม่อีกครั้ง หากยังไม่ได้ แจ้งผู้ดูแลระบบพร้อมข้อความด้านล่าง |

## Patient detail

```
StickyPatientHeader (sticky under the shell header once the band scrolls away)
[← ย้อนกลับ]                               ● ข้อมูลจาก HOSxP 14:02 · 10 นาทีที่แล้ว ⓘ
PatientHeader band (bg-brand-strong): masked name · คลอดอยู่ | AN · HN · อายุ · รับเข้า · น.น. | รพ.  [คะแนน CPD 11.5 / 14.5 · เสี่ยงสูง]
ReferralBanner (MEDIUM/HIGH)
QuickStatsBar: KpiGrid of 6 stat tiles
SectionCard ข้อมูลฝากครรภ์ (ANC) — AncRiskChip · ระยะการดูแล · [ดูรายละเอียดการฝากครรภ์ →]
SectionCard การส่งต่อ
SectionCard การคัดกรองความเสี่ยงมารดา (รอคลอด)  (flag-gated, unchanged gate)
[failed-feeds banner]
Tab bar: สรุป | พาร์โทกราฟ [วิกฤต 2] | การหดรัดตัว       ดูอย่างเดียว · มุมมองระดับจังหวัด  [พิมพ์]
```

- **Back bar:** button "ย้อนกลับ". `FreshnessBadge` (`lastSyncAt = patient.syncedAt`, label "ข้อมูลจาก HOSxP", test id `sync-stamp`) + `HintButton` with today's KpiTip copy.
- **`PatientHeader`:**
  - Band `bg-brand-strong text-white`.
  - Chips `bg-white/10`; labels AN, HN, อายุ, รับเข้า, น.น.
  - Weight-gain tone uses the tint tokens as text on the dark band (thresholds unchanged).
  - CPD tile:
    - background `RISK_LEVELS[level].textColor`
    - label "คะแนน CPD"
    - "/ {CPD_MAX_SCORE}"
    - `RISK_LEVELS[level].labelTh` (D12; replaces the ad-hoc "เฝ้าระวัง / ปกติ · LOW")
- **`ReferralBanner`:** background `RISK_LEVELS[level].bgColor`; the accent, score circle and badge come from tokens. Copy is unchanged; the badge shows `labelTh` without `toUpperCase()`.
- **`QuickStatsBar`:**
  - Tiles in `KpiGrid min="sm"`.
  - Labels: อายุ, G P A L, อายุครรภ์, ระยะเวลาในห้องคลอด, ปากมดลูก, สัญญาณชีพล่าสุด.
  - Sub-lines: `GA_TERM_LABEL_TH`, `LABOUR_PHASE_LABEL_TH`, "ข้อมูลเก่า" (was STALE).
  - Unit "สัปดาห์".
- **ANC SectionCard:**
  - `AncRiskChip`.
  - Care-stage chip from `CARE_STAGE_LABEL_TH`.
  - Four tiles: จำนวนครั้ง ANC "N / 8", ANC ครั้งสุดท้าย, วันแรกของประจำเดือนครั้งสุดท้าย (LMP), กำหนดคลอด (EDC).
  - Tile tones come from `classifyAncVisitCount` and `ANC_SUMMARY_DISPLAY.lastVisitAlertDays`.
- **Referrals SectionCard** "การส่งต่อ", description "{n} รายการ · สถานะเดียวกับกระดานส่งต่อ". Rows are unchanged (`Pill`, `FlagChip`), restyled with tokens.
- **Tabs:** buttons with `aria-pressed`, labelled สรุป / พาร์โทกราฟ / การหดรัดตัว. The CDSS badge keeps its counts and severity mapping (critical → danger, alert → warn, warn → brand). Right side: "ดูอย่างเดียว · มุมมองระดับจังหวัด" + "พิมพ์".
- **สรุป tab:**
  - Wrapper `@container`.
  - Two columns only at `@min-[1100px]` (true at 1440, not at 1024).
  - SectionCards: ทารกแรกเกิด ("{n} ราย"), สัญญาณชีพและความก้าวหน้า, ข้อมูลคลินิก.
- **พาร์โทกราฟ tab:**
  - `AlertSummaryPanel` (unchanged logic).
  - SectionCard "พาร์โทกราฟ" (description "ความก้าวหน้าการคลอดตามแบบ WHO · เลื่อนซ้าย–ขวาเมื่อจอแคบ"). Chart wrapper is `overflow-x-auto` with an inner `min-width: PARTOGRAPH_NATIVE_WIDTH` (900).
  - SectionCard "แนวโน้มสัญญาณชีพ" ("24 ชั่วโมงล่าสุด").
  - SectionCard "บันทึกการสังเกต" ("{n} รายการ"), using `DataTable` (`maxHeight 480`, caption "บันทึกการสังเกตพาร์โทกราฟ").
    - Headers: เวลา, ชั่วโมงที่, FHR, ปากมดลูก (ซม.), การหดรัดตัว /10 นาที, BP, ชีพจร, อุณหภูมิ.
    - Abnormal FHR/BP cells get `font-semibold text-danger-text` via the unchanged `sevFhr` / `sevBp`.
  - Empty: `EmptyState` "ยังไม่มีข้อมูลพาร์โทกราฟสำหรับผู้คลอดรายนี้". Error: `ErrorState` "ไม่สามารถโหลดข้อมูลพาร์โทกราฟได้" + remedy + retry.
- **Panels:**
  - `CurrentVitalsPanel` / `ClinicalData` / `CpdFactorBreakdown` tints come from `STATUS_TONE`.
  - Badges: "ผิดปกติ" / "เฝ้าระวัง" (were ALERT / WARN). Header count "ผิดปกติ {n} รายการ" (was "{n} CRITICAL").
  - English `labelEn` captions are dropped and the Thai label is promoted.
  - `CurrentVitalsPanel` is two columns only at `@min-[520px]`; `ClinicalData` uses `repeat(auto-fit,minmax(160px,1fr))`.
- **Load errors** (`describePatientLoadError(status)`), rendered as `ErrorState` + retry + "กลับหน้าแดชบอร์ด" link:

  | Status | message | remedy |
  |---|---|---|
  | 400 | รูปแบบรหัสผู้คลอดในลิงก์ไม่ถูกต้อง | เปิดผู้คลอดจากแดชบอร์ดหรือหน้ารายชื่อ — ลิงก์ต้องเป็น /patients/<รหัส รพ.>-<AN> เช่น /patients/10670-69000123 |
  | 404 | ไม่พบข้อมูลผู้คลอดรายนี้ | ผู้คลอดอาจจำหน่ายแล้วหรือยังไม่ซิงค์จาก HOSxP — ตรวจ AN แล้วกด ลองใหม่ หลังรอบซิงค์ถัดไป (ประมาณ 30 วินาที) |
  | other | โหลดข้อมูลผู้คลอดไม่สำเร็จ | ตรวจสอบการเชื่อมต่อเครือข่าย แล้วกด ลองใหม่ หากยังไม่ได้ แจ้งผู้ดูแลระบบ |

## Kiosk
Neither screen has a kiosk branch. `html.kiosk-mode` still hides the shell (`aside`, `header.sticky`). `StickyPatientHeader` must not use `header.sticky` (it is a `div`), so kiosk CSS does not hide it by accident. The dashboard kiosk is untouched; `KioskDashboard.test.tsx` must stay green.

## PDPA
Names render only through `maskName` (tile, drawer, header, sticky header, partograph header). E2E fixtures use synthetic names. Screenshots go only to the gitignored `e2e-private/ui-ward/`.

## Out of scope (follow-ups)
- Drawer tab contents (D10), `PrintForm`, `MaternalScreeningCard` internals, `PatientCard`, the lite `BedTile` / `WardLayoutView` (still used by tests only).
- **Three labour-phase cut-off sets disagree** (clinical owner to rule): bed tile (latent < 4, active 4–6, transition ≥ 7), `LaborProgressCard` (≤ 3 / ≤ 7 / > 7), `QuickStatsBar` (< 4 / ≤ 7 / > 7). This spec unifies the *wording* (`LABOUR_PHASE_LABEL_TH`), not the cut-offs.
- ANC strip thresholds (`< 4` minimum, `< 8` target, `> 28` days) differ from `ANC_OPS.minVisits = 5` and `followupWarnDays = 35` (clinical owner to rule).
- `ClinicalData` severity bands restate CPD thresholds for display (pre-existing; not touched).
- The journey page's private `STAGE_LABEL_TH` should import `CARE_STAGE_LABEL_TH` (owning sub-project).
- Keyboard drawer-open on the board (D13).

## Testing
- **Characterization first (Task 1):** ward board structure, grouping order, stage classification at the 12 h / 4 cm / 7 cm boundaries, masking, maternal-screen zero-DOM, click → drawer, KPI numbers, ward switch, refresh, page states; and the untested patient panels (`CurrentVitalsPanel`, `LaborProgressCard`, `QuickStatsBar`, `CpdFactorBreakdown`). Copy lives in a `COPY` table per file, so restyle tasks change only that table.
- **Unit:** `ward-board` (every rule + B1), `actionable-errors` (every branch), `ward-display`, `obstetric-display`, `status-tone`, `classifyAncVisitCount`, `CPD_MAX_SCORE`, `useMaternityWardStateFull.lastUpdatedAt`.
- **Component:** `StatusChip`, `DismissibleAlert` (+ `OnboardingWebhookAlert` unchanged), `WardHeaderActions`, `WardKpis`, `BedTileFull` (B1 lock chip, `data-stage`, motion-safe pulse), `BedMoveReasonModal` zero-reasons message, `StickyPatientHeader` (B2 classes), patient page (no `zoom`, Thai labels, no English mono labels, error states, partograph min-width).
- **Design-debt guard:** a test fails if any owned file contains a hex literal, a `slate-` class, `zoom`, or `uppercase`.
- **E2E (Playwright, synthetic env + `page.route` BMS mock):** ward at 1440/1024/768 (no page scroll, no text < 13px, 3/2/2 tiles per row, prolonged-latent KPI = 1); zero-occupant `EmptyState`; missing-`bms_url` session → actionable Thai; `/patients/10670-AN-2026-001` at three widths, plus the partograph chart ≥ 900px wide when present. Screenshots to `e2e-private/ui-ward/`.
- **Gates:** full suite, `tsc --noEmit`, `npm run lint` (0), `npm run build`; allowlist shrinks by six entries with `maxEntries` matching.
