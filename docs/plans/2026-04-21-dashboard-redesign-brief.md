# Main Dashboard — Redesign Brief for Claude Design

**Prepared:** 2026-04-21
**Owner:** Chaiyaporn Suratemeekul (chaiyaporn.suratemeekul@gmail.com)
**Target service:** [Claude Design](https://www.anthropic.com/news/claude-design-anthropic-labs) (Anthropic Labs, launched 2026-04-17 — palette icon on claude.ai)
**Target file to redesign:** `src/app/(provincial)/page.tsx`
**Status:** Discovery brief — Claude Design is invited to investigate the
current layout, identify weaknesses, and produce a live prototype +
Claude-Code handoff bundle.

---

## 0. How to send this to Claude Design

Claude Design accepts **five** input channels. Use all of them — a text
brief alone will underperform.

| # | Input | What to send | How |
|---|---|---|---|
| 1 | **This document (text)** | The full brief below | Paste into the Claude Design chat, or upload as `.docx` / `.pdf` (markdown → DOCX via pandoc if needed) |
| 2 | **Codebase** | This repo | "Point Claude at your codebase" during onboarding — it will auto-extract palette (`src/config/risk-levels.ts`), shadow system, Tailwind tokens, shadcn/ui components. Don't duplicate those in the brief. |
| 3 | **Screenshots** | 6 PNGs listed in §12 | Drag into the chat — these are what "investigate current layout" means. Without them the tool guesses. |
| 4 | **Web capture** | `http://localhost:3000/` (normal) and `?kiosk=1` | Run `npm run dev`, log in, use Claude Design's web-capture tool to grab the live page element-by-element. |
| 5 | **Design-system files** | none here — we use Tailwind + shadcn/ui, no Figma | Claude Design will infer this from (2). |

**Suggested opening prompt** (copy-paste into Claude Design):

> I'm redesigning the main dashboard of a provincial labor-room monitoring
> system. Read the attached brief (`2026-04-21-dashboard-redesign-brief.md`),
> ingest the codebase I've pointed you at, and use the screenshots I've
> attached as the "before" reference. Start by answering §10 Open Questions
> or stating the assumptions you're making in their place. Then deliver
> the artifacts listed in §8. Commit to one clear aesthetic direction from
> §12 before producing pixels — don't hedge.

---

### Scope & ground rules for the designer

This brief gives you everything needed to start; the "Open Questions"
section (§10) is what I'd like you to ask me about — or make defensible
assumptions for — before producing prototypes. Pick one direction from §12.

---

## 1. What is kk-lrms?

**Full name:** ระบบติดตามห้องคลอดจังหวัดขอนแก่น (KK-LRMS — Khon Kaen **Province** Labor Room Monitoring System). This is a provincial, multi-hospital network — **not** a single-hospital product. Every word of the design must reinforce that it spans the whole province.

**Mission ("OneLR — ห้องคลอดหนึ่งเดียว"):** a provincial risk-network view
that unites every labor room in Khon Kaen into a single monitored
continuum, with the goal of reducing maternal mortality from postpartum
hemorrhage (PPH) and obstructed labor. The dashboard is the central
situational-awareness surface that provincial MCH coordinators and the
PPHO war-room watch.

**Who watches this dashboard:**

| Persona | Device | Distance | What they need |
|---|---|---|---|
| **Provincial MCH coordinator** | Laptop / 24" monitor at desk | Arm's length | Drill down into hospitals & patients; act on alerts. |
| **PPHO war-room wall** | 55" / 65" TV in kiosk mode | 3–5 meters | Glanceable status; no mouse; nothing clickable needed. |
| **Hospital head nurse** | Office laptop / tablet | Arm's length | Compare own hospital vs. others; spot referral pressure. |
| **Night-shift on-call** | Phone / tablet from home | Close | Quick check: "any HIGH risk right now?" |

**Two layouts exist in the same page** (same data, different visual modes):

1. **Normal mode** — default, light theme, interactive, for desk use.
2. **Kiosk mode** — toggle via button (or auto-enter by URL param), full
   dark theme, large fonts, glow accents, for wall-mount TVs. Exits on ESC.

Both must be redesigned together — they share data and should feel like
the same product.

---

## 2. Current layout (as of 2026-04-21)

### Source file

`src/app/(provincial)/page.tsx` (205 lines) — orchestrates everything.

### Normal mode — row-by-row breakdown

| # | Section | Component | File |
|---|---|---|---|
| Header | Title + sync status chip + "ดึงข้อมูล" refresh + "โหมดจอภาพ" button | inline | `page.tsx` |
| Row 1 | Alert bar (3 tiles: referral / overdue-ANC / in-transit) — hidden if all 0 | `AlertBar` | `src/components/dashboard/AlertBar.tsx` |
| Row 2 | Stage KPI cards — ANC / ห้องคลอด / คลอดแล้ว (gradient tiles with risk-count pills) | `StageKPICards` | `src/components/dashboard/StageKPICards.tsx` |
| Row 3 | Labor-risk summary — 4 cards (total / high / medium / low) | `SummaryCards` | `src/components/dashboard/SummaryCards.tsx` |
| Row 4 | Donut (risk distribution, 2-col) + Connection summary (1-col) | `RiskDistributionChart` + `ConnectionSummary` | same folder |
| Row 5 | High-risk patient list (table on ≥md, cards on mobile) | `HighRiskPatientList` | same folder |
| Row 6 | Hospital comparison table (sortable) | `HospitalTable` | same folder |

### Kiosk mode — layout

Dark `bg-slate-900`, 3 rows:

1. **Hero KPIs** — 4 huge tiles (total / high / med / low) with colored glow
   (`kiosk-stat-glow-*`), 6xl numbers.
2. **Mid grid** — 12-col: left 4-col stack (donut + connection card), right
   8-col (high-risk patient list with glow title).
3. **Bottom** — full-width hospital table.

Header (`KioskHeader.tsx`) has: logo tile, live date (center), live clock
+ sync indicator + exit button (right).

### Data contract (what renders on screen)

All supplied by `useDashboard()` hook → `/api/dashboard` → `DashboardResponse`:

```ts
// src/types/api.ts (trimmed)
DashboardSummary  = { totalLow, totalMedium, totalHigh, totalActive }           // numbers only
DashboardHospital = { hcode, name, level, connectionStatus, lastSyncAt,
                      counts: { low, medium, high, total } }                    // per-hospital row
DashboardStageKPIs = {
  pregnancy: { total, low, hr1, hr2, hr3 },
  labor:     { total, low, medium, high },
  delivered: { total, normal, lowApgar, lbw }
}
DashboardAlerts   = { referralAlerts, overdueAnc, inTransitReferrals }
```

Plus `useHighRiskPatients()` → array of patients with
`{ an, hn, name, age, gaWeeks, cpdScore, riskLevel, hospital, hcode,
admitDate, lastVitalAt, partographSeverity?, partographAlertCount? }`.

Live updates: `useSSE()` pushes `onPatientUpdate` / `onConnectionStatus` /
`onSyncComplete` events that re-fetch. Dashboard must feel live; row
highlights animate on change (see `HospitalTable.tsx` lines 66-91).

---

## 3. Visual system already in use

- **Framework:** Next.js 15 App Router, React 19, TypeScript strict.
- **Styling:** Tailwind CSS 4, shadcn/ui primitives (`Badge`, `Table`, …).
- **Charts:** Recharts (donut today). Free to add bar/line/sparkline.
- **Icons:** `lucide-react`.
- **Fonts:** Thai-first UI; numbers use `font-mono` for tabular alignment.
- **Risk palette:** LOW = emerald, MEDIUM = amber, HIGH = red
  (defined in `src/config/risk-levels.ts` — treat as source of truth).
- **Card shadow:** `shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]`
  used everywhere — feel free to replace, but do it consistently.
- **Kiosk glow utilities:** `kiosk-stat-glow*`, `kiosk-text-glow`,
  `kiosk-wrap` — defined in `src/app/globals.css`.

---

## 4. Known pain points (what's wrong today)

Please verify these independently — open the app, flip between normal and
kiosk, and form your own list. These are my starting hypotheses, not gospel:

1. **Information redundancy.** "ห้องคลอด" counts in `StageKPICards`
   overlap with the 4 cards in `SummaryCards`. The user sees the same
   numbers twice, which steals vertical real estate and dilutes urgency.
2. **Alert bar is fragile.** It completely vanishes when all three alerts
   are zero — the page jumps. On a wall TV, a disappearing region is
   disorienting. It also doesn't communicate *which patient* triggered the
   alert — it's just a count.
3. **Row order isn't priority-driven.** The highest-signal content
   (HIGH-risk patient list) is row 5 in normal mode. A coordinator who
   loads the page should see "who needs help now" without scrolling.
4. **Kiosk and normal modes diverged.** They share components but look
   like different products — different spacing, different card radii,
   different header treatments. Maintenance burden + cognitive cost.
5. **Donut chart is large and low-information.** It takes ~40% of row 4
   width to show three numbers that also appear as 4 huge tiles. A stacked
   bar or segmented ring with trend arrow would probably communicate more.
6. **No time dimension.** Everything is "right now." There's no
   24h/7-day trend, no "admissions this shift," no "vs. yesterday." For
   a monitoring system this is a gap.
7. **Hospital table is a raw grid.** On kiosk (wall) it's unreadable
   from 3m. Needs either a map-style visual, or larger per-hospital
   cards, or a sorted "problem hospitals first" view.
8. **Sync / connection surfaced twice.** Header has the sync status chip
   + refresh button; `ConnectionSummary` card shows online/offline counts;
   hospital table shows per-hospital status. Consolidation opportunity.
9. **Mobile story is partial.** `HighRiskPatientList` has a card layout
   for mobile but the KPI cards and hospital table don't — they just wrap
   awkwardly. Phone experience for on-call nurses is underserved.

---

## 5. Design goals (what success looks like)

In priority order:

1. **Glanceable at 3 meters.** Kiosk mode must answer "is anyone in
   trouble right now?" in < 2 seconds from across the room.
2. **One clear hierarchy.** The eye should land on the highest-urgency
   signal first (high-risk patients + referral alerts), then context
   (totals, distribution), then breadth (per-hospital breakdown).
3. **No redundant numbers.** Every count on the page appears exactly
   once unless repeating it serves a distinct purpose.
4. **Temporal awareness.** Add at least one "how are we trending?" signal
   — admissions today, risk-level change vs. 24h ago, or similar.
5. **Same bones, two skins.** Normal and kiosk should share layout and
   hierarchy; only density, type scale, and palette differ.
6. **Responsive down to 390px.** Phone users should not get a broken
   desktop layout.
7. **Motion serves information.** The current row-flash on
   count-change is good. Keep that class of micro-animation. No gratuitous
   motion.
8. **Accessibility:** color is never the only signal; contrast passes
   WCAG AA even on dark kiosk; Thai text renders clearly at kiosk scale.

---

## 6. Hard constraints

- **Must stay in Next.js / Tailwind / shadcn/ui.** No new CSS-in-JS lib.
- **Data contract is fixed** for this pass — redesign around the fields
  listed in section 2. If you need a new field, call it out in "Open
  Questions" rather than assuming the API will change.
- **Thai-first.** All copy in Thai (English labels acceptable for
  technical chips like "LOW / HIGH / GA"). Keep existing Thai strings or
  suggest replacements.
- **Real-time.** Any layout must survive SSE updates without reflow
  jumps. Prefer fixed-height cards over content-sized ones where counts
  update live.
- **Kiosk stays one page, no scroll on 1080p TV.** Normal mode may scroll.
- **Risk palette stays** (emerald / amber / red). Re-harmonize other
  colors around it.
- **No auth/role changes** — this is purely presentational.

---

## 7. Non-goals

- Redesigning individual sub-pages (`/hospitals/[hcode]`, patient detail,
  referrals, outcomes). Those live elsewhere.
- Changing the navigation chrome (sidebar, breadcrumbs, top bar). Dashboard
  content area only.
- Building new analytics that require new API endpoints. If a chart is
  cheap with existing data, propose it; otherwise note it as "v2."

---

## 8. What I'd like Claude Design to produce

Claude Design outputs live HTML prototypes (not static mocks) plus a
Claude-Code handoff bundle. I'd like all of the following:

1. **Findings write-up** (text) — your own pain-point list after reading
   the codebase and looking at the screenshots. Confirm or deny §4's list.
2. **Information-architecture statement** (text) — the new row/zone order
   with one-sentence rationale per zone. This is the most important
   deliverable; everything else follows from it.
3. **Interactive HTML prototype — normal mode.** Top-of-page (above-the-
   fold) at ≥1920, ≥1280, and ≥390px. Use realistic data densities, not
   "3 hospitals / 2 patients" placeholder counts (see §10 for real
   numbers once I answer).
4. **Interactive HTML prototype — kiosk mode.** Same content, 55"/1080p
   landscape target, no scroll.
5. **Component delta table** — which files in `src/components/dashboard/`
   stay, change, merge, or retire. Reference by filename.
6. **Claude-Code handoff bundle** — export ready for me to drop into
   this repo (Tailwind 4 + shadcn/ui + Next.js 15 App Router).
7. **Open questions / assumptions** — what you had to guess at.

What I don't want: Figma files (we don't use it), static PNG mocks only
(the prototype is the deliverable), or a redesign that requires new API
endpoints beyond the data contract in §2.

---

## 9. Files to read first

In this order:

1. `src/app/(provincial)/page.tsx` — dashboard composition.
2. `src/components/dashboard/*.tsx` — every current component.
3. `src/types/api.ts` lines 6–31, 388–398 — data shapes.
4. `src/config/risk-levels.ts` — palette source of truth.
5. `src/app/globals.css` — kiosk glow utilities, pulse animations.
6. `src/hooks/useDashboard.ts` and `src/hooks/useHighRiskPatients.ts` —
   how data arrives and refreshes.
7. `docs/plans/2026-03-09-ui-redesign-design.md` — prior redesign notes
   (check what's already been tried and landed).

Run `npm run dev` and visit `/` after login to see the live page in both
modes. Seed data is already wired; no extra setup needed.

---

## 10. Open questions for me (Chaiyaporn)

> Please raise these (or your own) before mockups — I'd rather answer
> questions once than redo a pass. Email: chaiyaporn.suratemeekul@gmail.com

- The province has **26 community hospitals** (per `src/config/hospital-capabilities.ts`, capability tiers A_S/M1/F2). That's enough rows that a map visualization may beat a table — is a map desirable or a stretch?
- What's the typical simultaneous active-labor count across the province
  in peak vs. normal hours? (sets density targets for the patient list.)
- Is the kiosk TV landscape 1920×1080, or 4K? Any vertical orientation?
- Which alerts are "must never be missed"? (those earn persistent screen
  real estate; softer ones can collapse when zero.)
- Is there appetite for a province map visualization, or is a ranked
  list always sufficient?
- Any branding constraints from MoPH / Khon Kaen PPHO (logo lockup,
  approved typography, official color)?
- Does the on-call phone experience need parity, or is "view-only summary"
  acceptable on mobile?

---

## 11. Screenshots to attach alongside this brief

Capture these with the app running (`npm run dev`, log in, visit `/`).
Attach all six to the Claude Design chat — these are what "investigate
layout" actually means for a visual tool.

| # | Viewport | Mode | Path | What it shows |
|---|---|---|---|---|
| 1 | 1920 × 1080 | Normal | `/` | Full-page desktop view (scroll if needed; attach as tall screenshot) |
| 2 | 1920 × 1080 | Kiosk | `/?kiosk=1` | Full kiosk TV view (must fit one screen, no scroll) |
| 3 | 1280 × 800 | Normal | `/` | Laptop breakpoint |
| 4 | 390 × 844 | Normal | `/` | iPhone 15 — verify mobile wrap quirks |
| 5 | 1920 × 1080 | Normal | `/` with all HIGH-risk alerts active | Worst-case density (seed 3+ HIGH patients, 1+ referral alert) |
| 6 | 1920 × 1080 | Kiosk | `/?kiosk=1` at night | Same worst-case, kiosk skin — shows glow behavior |

Alternative: use Claude Design's **web-capture tool** and point it at the
running URL for element-level extraction instead of (or in addition to)
screenshots.

---

## 12. Aesthetic direction — pick ONE

Claude Design (and the `frontend-design` skill it inherits from) demands
a committed aesthetic, not hedging. Here are three directions I'd accept;
pick one before producing pixels, or propose a fourth and justify it.

### Option A — "Air-traffic control" (my default recommendation)

Dense, high-contrast, monospace-first. Tabular everywhere. Thin rules,
single accent color per severity. Feels like a command-center console
that a surgeon would trust. Think Stripe Atlas dashboards crossed with
Bloomberg Terminal restraint. Kiosk = inverted dark with phosphor-glow
severity hits.

**Why it fits:** the users are clinicians under time pressure; nothing
should feel playful. Numbers need to read at 3m.
**Fonts:** body — Inter Tight or IBM Plex Sans; numerics — JetBrains Mono
or Berkeley Mono; Thai — Noto Sans Thai Looped.
**Risk is:** sterile. Needs one memorable detail (maybe a live pulse
ribbon at the top of the kiosk) to avoid feeling generic.

### Option B — "Editorial medical"

Serif display headlines, generous whitespace, printed-journal feel with
data-viz that reads like a Financial Times chart. Kiosk = soft off-black
with warm accents, not harsh glow.

**Why it fits:** positions kk-lrms as authoritative/provincial; invites
the viewer to read, not just react. Good for the "OneLR" provincial
narrative.
**Risk is:** too slow for glanceable urgent use. Kiosk legibility at 3m
suffers if serif display leaks into data.

### Option C — "Calm clinical" (organic/healthcare)

Rounded corners, warm off-white palette, sage/terracotta accents, soft
shadows, paired with crisp data. Kiosk = deep forest-green with emerald
severity, not blackbox. Feels more nurse-station than war-room.

**Why it fits:** reduces stress for staff who stare at this for 12-hour
shifts. Humanizes what's otherwise a mortality-tracking tool.
**Risk is:** softness can mute urgency — HIGH-risk alerts need to punch
through the warmth without looking like a bug.

---

## 13. Meta: change log

- 2026-04-21 — initial brief + §0 rewrite for Claude Design (was
  originally written for a generic "Claude designer" before I confirmed
  Claude Design had launched 2026-04-17 as a distinct service).
