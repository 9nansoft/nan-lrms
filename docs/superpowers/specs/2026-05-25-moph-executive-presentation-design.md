# MOPH Executive Presentation — KK-LRMS Scale-Up Endorsement

**Date**: 2026-05-25
**Author**: Chaiyaporn Suratemeekul + Claude
**Status**: Design approved, ready for implementation plan
**Meeting**: Tomorrow noon (2026-05-26, ~12:00) — *tight build window, ~22 hours*
**Deliverable**: Single-file HTML slide deck (16:9, 1920×1080), Thai language, MOPH Government Formal visual style

---

## 1. Goal

Secure a 4-part endorsement from the MOPH executive management board to scale KK-LRMS from Khon Kaen province to Health Region 7 (7 provinces, ~150 community hospitals) and onward to a MOPH-managed national service.

**The four asks** (delivered as one ask in slide 11):

1. **หนังสือเห็นชอบจาก สป.สธ.** to expand KK-LRMS to all of Health Region 7
2. **Inclusion in Service Plan / Maternal Health KPI cycle** (FY 2570)
3. **Budget envelope** for production hosting + onboarding + ops staffing
4. **Mandate to integrate with HDC** (national health data lake)

## 2. Audience

Multi-stakeholder MOPH executive board:

| Stakeholder | Cares about | Slide that lands |
|---|---|---|
| Permanent Secretary / Deputy PS (HQ) | National vision, Service Plan alignment, ROI | 1, 9, 11 |
| Bureau of Reproductive Health (DoH) | MMR target, clinical rigor, ANC compliance | 2, 4, 8 |
| Inspector General — Region 7 / Provincial CMOs | Referral flow, operational execution, hospital onboarding | 3, 5, 7, 10 |
| Digital Health committee | PDPA, HOSxP interop, data sovereignty | 5, 6 |

Language: **Thai delivery, Thai slide copy.** Technical terms (CPD, partograph, HOSxP, BMS, HDC, PDPA) remain in English where convention requires.

## 3. Narrative arc — "From Province to Nation"

Three movements over 12 slides:

- **Hook + problem (slides 1–2)** — Khon Kaen is the only province doing this. Here's why every province needs it.
- **What we built (slides 3–7)** — Live product tour. Dashboard, clinical intelligence, cross-hospital tracking, every-hospital coverage, PDPA, operational maturity.
- **Why it scales + the ask (slides 8–12)** — Real patient story → 1→7→76 roadmap → 6-week onboarding execution proof → 4-part ask → close.

Total speaking budget: **13:25 + 1:35 buffer = 15:00.**

## 4. Slide-by-slide design

### Slide 1 — Cold open + title (40s)
- **Visual**: Centered Khon Kaen-lit map of Thailand (silhouette, gray with one navy/gold-pulsing province), MOPH crest top-left, KKPHO logo top-right, presenter ID at footer
- **Headline (Thai)**: *"ที่นี่... ทุกการคลอดถูกมองเห็นภายใน 30 วินาที"*
- **Subhead**: *"ขอนแก่นคือจังหวัดเดียวในประเทศไทยที่ทำสิ่งนี้ได้แล้ววันนี้"*
- **Footer**: KK-LRMS · สำนักงานสาธารณสุขจังหวัดขอนแก่น · [presenter name] · 26 พ.ค. 2569
- **Speaker open**: 5-second pause on map before first word.

### Slide 2 — MMR gap + information gap (90s)
- **Visual**: Split layout. **Left**: bar chart of Thailand MMR by region (national avg ~17/100k, higher in rural regions). **Right**: three-step pictogram: รพช. → โทร/LINE → สูติแพทย์ที่ รพศ. (label: ล่าช้า 30–90 นาที).
- **Headline**: *"ค่าเฉลี่ยซ่อนความเหลื่อมล้ำ — และข้อมูลผู้คลอดยังไม่ถึงสูติแพทย์ทันเวลา"*
- **Bullets**:
  - เป้าหมาย Service Plan: MMR ≤ 17/100,000 ภายในปี 2570
  - บางพื้นที่ชนบทยังเกินค่าเฉลี่ย
  - 26 รพช. ใน Region 7 ส่งต่อข้อมูลด้วยปากเปล่า / LINE
  - สูติแพทย์ไม่เห็น partograph / vital signs real-time → ตัดสินใจ refer ช้า
- **Source line**: ข้อมูล MMR — สำนักนโยบายและยุทธศาสตร์ กระทรวงสาธารณสุข ปี 2568

### Slide 3 — One dashboard, 26 hospitals (60s)
- **Visual**: Full-bleed dashboard screenshot (`dashboard-current.png` from repo root, or fresh capture). Three callout chips overlaid bottom-left, bottom-center, bottom-right:
  - **26 โรงพยาบาล**
  - **อัปเดตทุก 30 วินาที**
  - **CPD score อัตโนมัติ**
- **Headline**: *"หน้าจอเดียว — เห็นทุกห้องคลอดทั่วจังหวัด"*
- **Bullets** (overlay top-right card):
  - แม่ข่าย ขอนแก่น + ลูกข่าย 26 รพช.
  - ข้อมูลดึงจาก HOSxP อัตโนมัติ
  - ระดับความเสี่ยงแสดงเป็นสี เขียว / เหลือง / แดง
- **Caption**: "ภาพถ่ายจากระบบจริง · ข้อมูลตัวอย่างจาก demo dataset"

### Slide 4 — Clinical intelligence: CPD + Partograph (75s)
- **Visual**: Two-column. **Left**: CPD score panel screenshot + 8-factor table. **Right**: partograph chart screenshot showing alert/action lines.
- **Headline**: *"ปัญญาทางคลินิกที่ทำงานเงียบ ๆ ใน background"*
- **CPD column** (left):
  - คำนวณจาก 8 ปัจจัย: gravida, ANC visits, GA, ส่วนสูง, น้ำหนัก, fundal height, U/S fetal weight, hematocrit
  - คะแนน ≥ 10 → แนะนำ refer ทันที
- **Partograph column** (right):
  - Dilation + alert/action line ตามมาตรฐาน WHO
  - Vital signs แม่ + ทารก + contraction sync ทุก 30 วินาที
- **Speaker line**: "ทุกข้อมูลมาจาก HOSxP โดยตรง — ไม่มีการพิมพ์ซ้ำ ไม่มีข้อผิดพลาดจากมนุษย์"

### Slide 5 — Cross-hospital tracking via CID hash (60s)
- **Visual**: Flow diagram. Patient icon → รพช. A → arrow "Refer" → รพศ.ขอนแก่น. Above arrow: "CID hash matched (SHA-256, no plaintext)". Timeline at bottom: 14:23 admit → 14:45 refer → 16:10 arrive at KK Hospital with full history.
- **Headline**: *"ติดตามผู้ป่วยข้ามโรงพยาบาล โดยไม่เปิดเผยเลขบัตรประชาชน"*
- **Bullets**:
  - CID hash SHA-256 — ไม่เก็บ plaintext
  - Match ประวัติอัตโนมัติเมื่อ refer
  - สูติแพทย์รับ refer เห็น partograph + ANC + vital trend ก่อนรถถึง
  - ลดการสอบถามซ้ำที่ ER

### Slide 6 — Built for every hospital + PDPA by design (90s)
- **Visual**: Two-column. **Left** ("Coverage"): two pathway boxes — `HOSxP → BMS Session API auto-sync (browser-only)` and `non-HOSxP → Webhook REST API`. **Right** ("Privacy"): 5 green-checked rows.
- **Headline**: *"รองรับทุกระบบ HIS · ออกแบบให้สอดคล้อง PDPA ตั้งแต่วันแรก"*
- **Coverage column**:
  - HOSxP hospitals → auto-sync ทุก 30 วินาที (browser-only mode — PHI ไม่ออกจาก network)
  - Non-HOSxP hospitals → push ผ่าน Webhook API (API key + signed)
- **Privacy column** (5 ticks):
  - ✅ AES-256-GCM เข้ารหัสชื่อ + CID
  - ✅ CID hash SHA-256 สำหรับ match ข้ามโรงพยาบาล
  - ✅ Role-based access (สูติแพทย์ / พยาบาล / Admin)
  - ✅ Audit log ทุกการเข้าถึงข้อมูลผู้ป่วย
  - ✅ ชื่อผู้ป่วย mask บน dashboard (HN/AN เท่านั้น)

### Slide 7 — Built to run (60s)
- **Visual**: Six metric tiles in 3×2 grid. Numbers pulled from live system at build time:
  - **26** โรงพยาบาลเชื่อมต่อ
  - **{N}** ผู้ป่วยในระบบ
  - **{X}%** sync success rate (30 วัน)
  - **{Y} วัน** uptime ต่อเนื่อง
  - **463** unit + integration tests
  - **<2 sec** SQL query latency (SLA)
- **Headline**: *"ระบบใช้งานจริง — ไม่ใช่ prototype"*
- **Footer**: "ตัวเลขสด ณ [build time]"

### Slide 8 — One real patient (90s)
- **Visual**: Vertical timeline, 6–7 events. Color shifts yellow → red → green.
- **Headline**: *"หนึ่งเคส · หนึ่งชีวิต · ระบบทำงานได้จริง"*
- **Timeline (template — REAL CASE NEEDED)**:
  - 14:23 — G1 อายุ 17 รับเข้า รพช. [X]
  - 14:24 — KK-LRMS sync → CPD score **11 (High Risk)**
  - 14:25 — แจ้งเตือนถึงสูติแพทย์เวรที่ รพศ.ขอนแก่น
  - 14:30 — สูติแพทย์เปิด partograph + ANC history ของผู้ป่วย
  - 14:45 — ตัดสินใจ refer ทันที (เร็วกว่า workflow เดิม ~45 นาที)
  - 16:10 — ผู้ป่วยถึง รพศ. ทีมพร้อม, ข้อมูลเต็ม
  - 17:50 — C/S สำเร็จ · แม่และทารกปลอดภัย
- **Footer**: "ข้อมูลผ่านการ anonymize · ได้รับความเห็นชอบจาก [แพทย์ผู้รับผิดชอบ]"
- **Speaker close**: "นี่คือเหตุผลที่เรามาขอวันนี้ — เพื่อให้เคสแบบนี้เกิดขึ้นได้ในทุกจังหวัด"

### Slide 9 — Scale path: 1 → 7 → 76 (90s)
- **Visual**: Three-stage horizontal timeline with a growing Thailand map under each stage (1 province lit → 7 provinces in Region 7 lit → all 13 health regions lit).
- **Headline**: *"พร้อมขยาย · สถาปัตยกรรม multi-tenant พร้อมรองรับวันแรก"*
- **Stages**:
  - **2569 ✅** — ขอนแก่น (26 รพช.) — *operational today*
  - **2570 Q1–Q3 🎯** — เขตสุขภาพที่ 7 (7 จังหวัด, ~150 รพช.)
  - **2570 Q4 🎯** — เปิดเป็น MOPH-managed service
  - **2571 🎯** — ครบทุกเขตสุขภาพ
- **Notes**: 6 สัปดาห์ต่อจังหวัด (รายละเอียดในสไลด์ถัดไป), HOSxP เดิมไม่ต้องเปลี่ยน

### Slide 10 — Hospital onboarding in 6 weeks (60s)
- **Visual**: 6-week Gantt-style bar with 5 workstreams stacked.
- **Headline**: *"6 สัปดาห์ต่อจังหวัด · ทำคู่ขนานได้หลายจังหวัด"*
- **Bars**:
  - W1: ลงนาม MOU + กำหนดผู้ประสานงาน สสจ.
  - W2–3: เปิด BMS Session tunnel + ทดสอบ sync
  - W3–4: คัดกรองข้อมูล + อบรมพยาบาล/สูติแพทย์
  - W5: Pilot run 1 hospital
  - W6: Rollout 5+ hospitals + handover
- **Bullets**:
  - 1 ทีม technical (2 คน) รองรับ 3 จังหวัดพร้อมกัน
  - เขตสุขภาพที่ 7 (7 จังหวัด) → 2 ทีม · ~4 เดือน

### Slide 11 — The ask (60s)
- **Visual**: 4-quadrant grid. Each quadrant = navy box, gold icon, white title, gray subtitle.
  - **📜 หนังสือเห็นชอบจาก สป.สธ.** — ขยายผลสู่เขตสุขภาพที่ 7
  - **📋 บรรจุใน Service Plan** — Maternal Health KPI รอบ 2570
  - **💰 กรอบงบประมาณ FY 2570** — hosting + onboarding + ops staffing
  - **🔗 มอบหมายเชื่อมโยงกับ HDC** — ข้อมูล KK-LRMS → national health data lake
- **Headline**: *"สิ่งที่เราขอจากบอร์ดผู้บริหารวันนี้"*
- **Footer**: "ติดต่อ [presenter name] · [email] · [phone]"

### Slide 12 — Thank you + QR (30s)
- **Visual**: Khon Kaen labor-room photo (low opacity) + centered QR code → public `/about` page (`https://kk-lrms.bmscloud.in.th/about`).
- **Headline**: *"ขอบคุณบอร์ดผู้บริหารกระทรวงสาธารณสุข"*
- **Subhead**: *"ข้อมูลระบบเพิ่มเติม — สแกน QR"*
- **Footer**: KK-LRMS · สำนักงานสาธารณสุขจังหวัดขอนแก่น

## 5. Backup slides (kept hidden, for Q&A)

| # | Slide | Purpose |
|---|---|---|
| B1 | Technical stack one-pager | If Digital Health committee drills into architecture |
| B2 | Per-hospital onboarding cost (THB) breakdown | If PS asks for budget specifics |
| B3 | PDPA compliance — section-by-section mapping | If asked about legal compliance details |
| B4 | 6-month post-endorsement measurement plan | If asked "how will you prove it works?" |
| B5 | Risk register + mitigation | If asked about failure modes |
| B6 | Comparison with other regional initiatives | If asked "why not adopt program X instead?" |

Backup slides are accessible via direct navigation (anchor link / press 'B' key) — not in main flow.

## 6. Visual design system — MOPH Government Formal

**Colors** (CSS custom properties):
- `--moph-navy: #0c1d3d` — primary, title text, header bar
- `--moph-gold: #d4a017` — accent, dividers, ask quadrant icons
- `--moph-cream: #f5f3ed` — footer bar, alternate row background
- `--moph-paper: #ffffff` — slide background
- `--moph-ink: #0c1d3d` — body text
- `--moph-subtle: #6a7799` — sub-text, captions
- `--moph-rule: #e2e2e2` — dividers, borders

**Status colors** (for risk dots, sync states — match the live dashboard):
- `--risk-low: #22c55e` (green)
- `--risk-medium: #eab308` (yellow)
- `--risk-high: #ef4444` (red)

**Typography**:
- **Body / titles**: `'Sarabun', 'Noto Sans Thai', sans-serif`
- **Numerals / data**: `'IBM Plex Sans', system-ui, sans-serif`
- **Weight scale**: 400 (body), 600 (sub-titles), 700 (titles)

**Type scale** (1920×1080 slides):
- Mega title (slide 1): 72pt
- Slide title: 44pt
- Sub-headline: 24pt
- Body / bullet: 20pt
- Caption / footer: 14pt
- Eyebrow (uppercase, letter-spaced): 12pt

**Slide chrome** (every content slide):
- Top: 60px navy bar with gold-dot left, ministry attribution text right
- Bottom: 50px cream bar with `KK-LRMS · สสจ.ขอนแก่น · [date]` left, page number right
- Body: 56px outer padding, 48pt baseline grid
- Gold 4px × 64px divider under the slide title

**Layout primitives** (build as reusable CSS classes):
- `.slide` — full-bleed 1920×1080 container
- `.slide-header` — top navy bar
- `.slide-footer` — bottom cream bar
- `.slide-title` + `.slide-eyebrow` + `.slide-divider` — title block
- `.two-col` — split-screen layout (slides 2, 4, 6, 9)
- `.metric-tile` — large stat tile (slide 7)
- `.ask-quadrant` — 2×2 grid (slide 11)
- `.timeline-vertical` — slide 8 layout
- `.timeline-horizontal` — slide 9 layout
- `.gantt` — slide 10 layout

## 7. Implementation constraints

| Constraint | Decision |
|---|---|
| Aspect | 16:9 fixed (1920×1080) |
| Handout | None |
| Browser | Chrome / Edge / Safari on presenter laptop (latest) |
| Fonts | Google Fonts CDN with system-font fallback in case of no internet |
| Animation | None during talk (static slides); subtle CSS-only transitions between sections OK |
| Navigation | Arrow keys (← →), spacebar to advance, Home/End to jump, B-key for backup |
| Speaker notes | Press 'N' for overlay view (presenter laptop only, hidden on projected view) |
| Print fallback | Not required this round |
| Live demo | None — screenshots only |
| Data freshness | Slide 7 metrics: stamped at deck-build time, footer shows timestamp |

## 8. Open items (resolve TONIGHT for tomorrow noon)

> These are content gaps that block the build. The implementation plan will track them as tasks; the user must source them.

1. **Real patient case (slide 8)** — anonymized timeline of one referral. Owner: Dr. [presenter]. Needs: case date, anonymized presentation, sign-off from responsible physician.
2. **Live metrics (slide 7)** — pull at build time from production DB: total patients in registry, sync success % (last 30d), uptime days, real numbers replacing `{N}/{X}/{Y}` placeholders.
3. **MMR source citation (slide 2)** — exact year and document name from สำนักนโยบายและยุทธศาสตร์ สธ.
4. **Cost per province (slide 9 notes)** — rough THB estimate for hosting + onboarding (used as supporting line, not on-slide).
5. **Presenter name + contact (slides 1, 11)** — name, email, phone for slide 11 footer.
6. **MOPH crest + KKPHO logo files** — placed in `public/deck/` for embedding.
7. **Dashboard screenshot freshness** — confirm `dashboard-current.png` is current; if older than 3 days, capture fresh.
8. **Region 7 hospital count** — confirm "~150 hospitals" used in slides 6, 9, 10 is the right number.
9. **QR target URL (slide 12)** — confirm `/about` page is the right destination (or use a specific scale-up brief PDF).
10. **MOU template availability (slide 10 W1)** — if board asks "show us the MOU", be ready.

## 9. Build approach (high-level — full plan from writing-plans)

**Single HTML file**: `public/deck/index.html` + companion CSS + assets.

Rationale for single-file approach:
- 22-hour timeline forbids framework setup (no Reveal.js, no Marp, no build pipeline)
- One file → easy to email, easy to fall back to USB stick
- Inline `<style>` and inline CSS variables for theme — no build step
- Each slide is a `<section class="slide" id="slide-N">` — keyboard handler swaps `.active`
- Screenshots embedded as `<img src="../dashboard-current.png">` from repo root

**Files**:
- `public/deck/index.html` — the deck
- `public/deck/deck.css` — design tokens + layout primitives (extracted from inline for clarity)
- `public/deck/assets/` — logos, screenshots, QR code PNG
- `public/deck/speaker-notes.md` — full speaker script per slide (separate file, presenter reads on phone/laptop)

**Test plan**:
1. Open in Chrome 1920×1080 — every slide renders, no scroll, no overflow
2. Arrow-key navigation works
3. Backup slide hotkey (B) works
4. Presenter notes overlay (N) works
5. Time-to-speak dry run — confirm ≤ 15 min
6. Print preview — even though no handout needed, confirm it doesn't break weirdly if accidentally printed

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Google Fonts CDN blocked from meeting room network | Bundle `Sarabun` + `IBM Plex Sans` woff2 files locally in `public/deck/fonts/` |
| Presenter laptop runs older Chrome | Test on Chromium ≥ 110; avoid `:has()`, container queries |
| Projector defaults to 4:3 — slides letterboxed | Add `letterbox-safe` margin (5%) to all content blocks |
| Live metrics query fails at build time | Fall back to hard-coded numbers approved by author; render warning in footer |
| Real case (slide 8) not approved by tomorrow morning | Fall back to composite scenario explicitly labeled "ตัวอย่างเชิงเปรียบเทียบ" |
| Internet drops during talk → fonts swap | Pre-bundled font files (see row 1) + system-font fallback already in stack |
| MOPH crest / KKPHO logo not provided | Fall back to text-only ministry attribution on top bar |

## 11. Success criteria

- [ ] Deck renders correctly in Chrome 1920×1080
- [ ] All 12 main slides + 6 backup slides exist
- [ ] Timed dry-run lands at 13:00–15:00
- [ ] Real patient case included and signed-off
- [ ] Live metrics show real numbers (or approved fallback)
- [ ] No PHI visible on any screenshot
- [ ] All 4 asks legible from back row of meeting room (24pt+ on slide 11)
- [ ] Speaker notes file exists and is readable on phone in dim room
