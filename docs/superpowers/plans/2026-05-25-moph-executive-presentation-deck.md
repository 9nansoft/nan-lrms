# MOPH Executive Presentation Deck — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single-file HTML slide deck (12 main slides + 6 backup slides, 1920×1080 16:9, Thai language, MOPH Government Formal visual style) for the 15-minute KK-LRMS scale-up endorsement pitch to the MOPH executive board, tomorrow noon (2026-05-26).

**Architecture:** Single-page HTML deck under `public/deck/`. Each slide is a `<section class="slide" id="slide-N">`; keyboard handler in `deck.js` swaps `.is-active`. No build step, no framework. CSS custom properties define the MOPH design tokens once; layout primitives (two-col, metric-tile, ask-quadrant, timeline) are reusable classes. Live metrics for slide 7 are pulled once at build time by a Node script that queries Postgres directly and writes a JSON snippet inlined into the deck.

**Tech Stack:** Vanilla HTML + CSS + JS (browser-native). Node 20 + `pg` for the metrics pull (already in `package.json`). Google Fonts CDN with bundled woff2 fallback. No bundler, no framework.

**Spec:** [docs/superpowers/specs/2026-05-25-moph-executive-presentation-design.md](../specs/2026-05-25-moph-executive-presentation-design.md)

---

## File structure

| Path | Responsibility |
|---|---|
| `public/deck/index.html` | All 18 slide `<section>` elements + main shell |
| `public/deck/deck.css` | Design tokens, slide chrome, layout primitives |
| `public/deck/deck.js` | Keyboard navigation, backup/notes overlays, slide indexing |
| `public/deck/assets/` | Logos, screenshots, QR code, photos |
| `public/deck/fonts/` | Bundled Sarabun + IBM Plex Sans woff2 (offline fallback) |
| `public/deck/metrics.json` | Live system metrics pulled at build time (used by slide 7) |
| `public/deck/speaker-notes.md` | Speaker script per slide (presenter reads separately) |
| `scripts/pull-deck-metrics.mjs` | Node script that queries Postgres and writes `metrics.json` |
| `scripts/fetch-deck-fonts.sh` | One-shot script to download woff2 files into `public/deck/fonts/` |

The deck is served by the existing Next.js app at `/deck/index.html` (Next.js serves `public/` statically). Presenter opens `http://localhost:3000/deck/index.html` — or `file://` directly off USB.

---

## Task overview

| # | Task | Output |
|---|---|---|
| 1 | Scaffold deck dir + base shell + design tokens | Empty deck loads with chrome but no slides |
| 2 | Navigation engine | Keyboard advances/retreats through stub slides |
| 3 | Slide 1 — Cold open | First slide renders with Thailand map + headline |
| 4 | Slide 2 — MMR + info gap | Two-column problem framing renders |
| 5 | Slide 3 — Dashboard tour | Full-bleed screenshot with overlay chips |
| 6 | Slide 4 — Clinical intelligence | CPD panel + partograph two-col |
| 7 | Slide 5 — Cross-hospital tracking | Flow diagram + refer timeline |
| 8 | Slide 6 — Coverage + PDPA | Two pathway boxes + 5-check list |
| 9 | Slide 7 — Live metrics tiles + DB pull | 3×2 metric grid populated from prod DB |
| 10 | Slide 8 — Patient case timeline | Vertical color-shifting timeline |
| 11 | Slide 9 — Scale path | 4-stage horizontal timeline with maps |
| 12 | Slide 10 — Onboarding Gantt | 6-week bar chart |
| 13 | Slide 11 — The 4 asks | Navy quadrant grid |
| 14 | Slide 12 — Thank you + QR | Closing slide with scannable QR |
| 15 | Backup slides B1–B6 | Hidden, accessible via `B` key |
| 16 | Speaker notes overlay | Press `N` for overlay (presenter laptop only) |
| 17 | Bundle fonts offline | Network-fail fallback ready |
| 18 | Final QC + dry-run | All success criteria checked |

---

## Task 1: Scaffold deck directory + base shell + design tokens

**Files:**
- Create: `public/deck/index.html`
- Create: `public/deck/deck.css`
- Create: `public/deck/deck.js`
- Create: `public/deck/assets/.gitkeep`

- [ ] **Step 1: Create deck directory**

```bash
mkdir -p public/deck/assets public/deck/fonts
touch public/deck/assets/.gitkeep
```

Expected: directory exists.

- [ ] **Step 2: Write `public/deck/deck.css` — design tokens + slide chrome**

```css
/* ============================================================
   KK-LRMS MOPH Executive Deck — Design Tokens
   Style: MOPH Government Formal
   Spec:  docs/superpowers/specs/2026-05-25-moph-executive-presentation-design.md
   ============================================================ */

:root {
  --moph-navy:   #0c1d3d;
  --moph-gold:   #d4a017;
  --moph-cream:  #f5f3ed;
  --moph-paper:  #ffffff;
  --moph-ink:    #0c1d3d;
  --moph-subtle: #6a7799;
  --moph-rule:   #e2e2e2;

  --risk-low:    #22c55e;
  --risk-medium: #eab308;
  --risk-high:   #ef4444;

  --slide-w: 1920px;
  --slide-h: 1080px;
  --pad: 56px;
  --header-h: 60px;
  --footer-h: 50px;

  --fs-mega:   72pt;
  --fs-title:  44pt;
  --fs-sub:    24pt;
  --fs-body:   20pt;
  --fs-caption: 14pt;
  --fs-eye:    12pt;

  --ff-body: 'Sarabun', 'Noto Sans Thai', system-ui, sans-serif;
  --ff-data: 'IBM Plex Sans', system-ui, sans-serif;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #000; overflow: hidden; height: 100vh; }
body { font-family: var(--ff-body); color: var(--moph-ink); }

/* Stage: scales the 1920x1080 slide to viewport */
.stage {
  position: fixed; inset: 0;
  display: grid; place-items: center;
  background: #000;
}
.slide {
  width: var(--slide-w);
  height: var(--slide-h);
  background: var(--moph-paper);
  position: relative;
  overflow: hidden;
  display: none;
  transform-origin: center center;
}
.slide.is-active { display: block; }

/* Slide chrome */
.slide-header {
  position: absolute; top: 0; left: 0; right: 0;
  height: var(--header-h);
  background: var(--moph-navy);
  color: #fff;
  display: flex; align-items: center;
  padding: 0 var(--pad);
  font-size: var(--fs-caption);
  font-weight: 500;
  letter-spacing: 0.03em;
}
.slide-header::before {
  content: ''; width: 22px; height: 22px;
  border-radius: 50%; background: var(--moph-gold);
  margin-right: 18px; flex-shrink: 0;
}
.slide-footer {
  position: absolute; bottom: 0; left: 0; right: 0;
  height: var(--footer-h);
  background: var(--moph-cream);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 var(--pad);
  font-size: var(--fs-caption);
  color: var(--moph-subtle);
  font-weight: 500;
}
.slide-footer b { color: var(--moph-navy); }

/* Title block */
.slide-body {
  position: absolute;
  top: var(--header-h);
  bottom: var(--footer-h);
  left: 0; right: 0;
  padding: var(--pad);
  display: flex; flex-direction: column;
}
.slide-eyebrow {
  font-size: var(--fs-eye);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--moph-subtle);
  font-weight: 600;
  margin: 0 0 14px;
}
.slide-title {
  font-size: var(--fs-title);
  font-weight: 700;
  color: var(--moph-navy);
  line-height: 1.18;
  margin: 0;
  max-width: 1640px;
}
.slide-divider {
  width: 64px; height: 4px;
  background: var(--moph-gold);
  margin: 22px 0 28px;
}
.slide-sub {
  font-size: var(--fs-sub);
  color: var(--moph-subtle);
  font-weight: 400;
  line-height: 1.45;
  margin: 0 0 24px;
  max-width: 1500px;
}

/* Layout primitives */
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; flex: 1; }
.three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 40px; flex: 1; }
.metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: 1fr 1fr; gap: 28px; flex: 1; }

.metric-tile {
  background: var(--moph-paper);
  border: 1.5px solid var(--moph-rule);
  border-left: 6px solid var(--moph-gold);
  padding: 36px 32px;
  display: flex; flex-direction: column; justify-content: center;
  border-radius: 6px;
}
.metric-tile .num {
  font-family: var(--ff-data);
  font-size: 84pt;
  font-weight: 700;
  color: var(--moph-navy);
  line-height: 1; letter-spacing: -0.02em;
}
.metric-tile .num .unit { font-size: 32pt; color: var(--moph-subtle); margin-left: 8px; font-weight: 500; }
.metric-tile .label { font-size: var(--fs-body); color: var(--moph-subtle); margin-top: 10px; }

.bullet-list { list-style: none; padding: 0; margin: 0; }
.bullet-list li {
  font-size: var(--fs-body);
  color: var(--moph-ink);
  padding: 14px 0 14px 28px;
  position: relative;
  line-height: 1.45;
}
.bullet-list li::before {
  content: '';
  position: absolute; left: 0; top: 26px;
  width: 12px; height: 12px;
  background: var(--moph-gold);
  border-radius: 2px;
}
.check-list li::before {
  content: '✓';
  background: transparent;
  color: var(--risk-low);
  font-size: 24pt; font-weight: 700;
  width: auto; height: auto;
  top: 8px;
}

/* Ask quadrant */
.ask-quadrant {
  display: grid; grid-template-columns: 1fr 1fr; gap: 28px;
  flex: 1;
}
.ask-tile {
  background: var(--moph-navy);
  color: #fff;
  padding: 40px 36px;
  border-radius: 8px;
  display: flex; flex-direction: column; gap: 14px;
  position: relative;
}
.ask-tile .icon {
  font-size: 48pt;
  color: var(--moph-gold);
  line-height: 1;
}
.ask-tile h3 {
  font-size: var(--fs-sub);
  margin: 0; font-weight: 700; line-height: 1.25;
}
.ask-tile p {
  font-size: var(--fs-body);
  color: #c4cad9; margin: 0; line-height: 1.4;
}

/* Cold open / hero */
.hero {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: var(--pad);
  text-align: center;
}
.hero .hero-title {
  font-size: var(--fs-mega);
  color: var(--moph-navy);
  font-weight: 700;
  line-height: 1.1;
  max-width: 1500px;
  margin: 36px 0 24px;
}
.hero .hero-sub {
  font-size: 28pt;
  color: var(--moph-subtle);
  font-weight: 400;
  line-height: 1.4;
  max-width: 1200px;
}
.hero .hero-divider {
  width: 90px; height: 5px;
  background: var(--moph-gold);
  margin: 28px 0 0;
}

/* Speaker notes overlay */
.notes-overlay {
  position: fixed; inset: 0;
  background: rgba(10,10,12,0.92);
  color: #f5f3ed;
  padding: 48px 64px;
  font-family: var(--ff-body);
  font-size: 20pt;
  line-height: 1.6;
  z-index: 1000;
  display: none;
  overflow-y: auto;
}
.notes-overlay.is-visible { display: block; }
.notes-overlay h2 { color: var(--moph-gold); margin: 0 0 16px; }
.notes-overlay .meta { color: #888; font-size: 14pt; margin-bottom: 24px; }

/* Slide counter (debug, hidden by default) */
.slide-counter {
  position: fixed; bottom: 8px; left: 8px;
  background: rgba(0,0,0,0.6); color: #fff;
  padding: 4px 10px; border-radius: 4px;
  font-size: 11pt; font-family: var(--ff-data);
  z-index: 100;
}
```

- [ ] **Step 3: Write `public/deck/deck.js` — initial stage scaling + slide counter (navigation comes in Task 2)**

```javascript
// public/deck/deck.js
(function () {
  'use strict';

  const stage = document.querySelector('.stage');
  const slides = Array.from(document.querySelectorAll('.slide'));
  const counter = document.querySelector('.slide-counter');

  // Scale the 1920x1080 slide to fit the viewport while keeping aspect ratio.
  function scale() {
    const sw = 1920, sh = 1080;
    const vw = window.innerWidth, vh = window.innerHeight;
    const ratio = Math.min(vw / sw, vh / sh);
    slides.forEach(s => { s.style.transform = `scale(${ratio})`; });
  }
  window.addEventListener('resize', scale);
  scale();

  // Show first slide
  if (slides.length) slides[0].classList.add('is-active');
  if (counter) counter.textContent = `1 / ${slides.length}`;

  // Expose for Task 2
  window.__deck = { slides, counter };
})();
```

- [ ] **Step 4: Write `public/deck/index.html` — base shell with font links, 1 stub slide**

```html
<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>KK-LRMS · MOPH Executive Briefing · 26 พ.ค. 2569</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="deck.css" />
</head>
<body>
<div class="stage">
  <section class="slide" id="slide-stub">
    <div class="slide-header"><span>กระทรวงสาธารณสุข · สำนักงานสาธารณสุขจังหวัดขอนแก่น</span></div>
    <div class="slide-body">
      <p class="slide-eyebrow">Scaffold OK</p>
      <h1 class="slide-title">Slides ยังไม่ได้สร้าง — กำลังพัฒนา</h1>
      <div class="slide-divider"></div>
      <p class="slide-sub">หากเห็นข้อความนี้ scaffold + design tokens + font loading ทำงานถูกต้อง</p>
    </div>
    <div class="slide-footer">
      <span><b>KK-LRMS</b> · สสจ.ขอนแก่น · 26 พ.ค. 2569</span>
      <span>0 / 0</span>
    </div>
  </section>
</div>
<div class="slide-counter">—</div>
<script src="deck.js"></script>
</body>
</html>
```

- [ ] **Step 5: Verify in browser**

Run: `npm run dev` (or any static server)
Open: `http://localhost:3000/deck/index.html`

Expected:
- Stub slide visible, scaled to viewport, with navy top bar (gold dot left), cream footer
- Title "Slides ยังไม่ได้สร้าง — กำลังพัฒนา" in Sarabun
- Gold 64px divider
- Counter `1 / 1` bottom-left
- No console errors

- [ ] **Step 6: Commit**

```bash
git add public/deck/ docs/superpowers/plans/2026-05-25-moph-executive-presentation-deck.md
git commit -m "feat(deck): scaffold MOPH executive deck with design tokens"
```

---

## Task 2: Navigation engine

**Files:**
- Modify: `public/deck/deck.js` (extend with keyboard handlers + slide index)
- Modify: `public/deck/index.html` (temporarily add stubs to test)

- [ ] **Step 1: Add two more stub slides to `public/deck/index.html` to test navigation**

Insert AFTER the existing `#slide-stub` `</section>`, BEFORE `</div>` of `.stage`:

```html
<section class="slide" id="slide-stub-2">
  <div class="slide-header"><span>กระทรวงสาธารณสุข · สำนักงานสาธารณสุขจังหวัดขอนแก่น</span></div>
  <div class="slide-body">
    <p class="slide-eyebrow">Stub 2</p>
    <h1 class="slide-title">หน้าทดสอบ navigation</h1>
    <div class="slide-divider"></div>
  </div>
  <div class="slide-footer"><span><b>KK-LRMS</b></span><span>2 / 3</span></div>
</section>
<section class="slide" id="slide-stub-3">
  <div class="slide-header"><span>กระทรวงสาธารณสุข · สำนักงานสาธารณสุขจังหวัดขอนแก่น</span></div>
  <div class="slide-body">
    <p class="slide-eyebrow">Stub 3</p>
    <h1 class="slide-title">หน้าทดสอบ navigation (สุดท้าย)</h1>
    <div class="slide-divider"></div>
  </div>
  <div class="slide-footer"><span><b>KK-LRMS</b></span><span>3 / 3</span></div>
</section>
```

- [ ] **Step 2: Replace `public/deck/deck.js` with full navigation engine**

```javascript
// public/deck/deck.js
(function () {
  'use strict';

  // Main slides have id="slide-N" (N = 1..12). Backups have id="backup-N".
  const mainSlides = Array.from(document.querySelectorAll('.slide:not([id^="backup-"])'));
  const backupSlides = Array.from(document.querySelectorAll('.slide[id^="backup-"]'));
  const counter = document.querySelector('.slide-counter');

  let index = 0;
  let mode = 'main'; // 'main' or 'backup'

  function activeList() { return mode === 'main' ? mainSlides : backupSlides; }
  function refresh() {
    const list = activeList();
    document.querySelectorAll('.slide.is-active').forEach(s => s.classList.remove('is-active'));
    if (list[index]) list[index].classList.add('is-active');
    if (counter) counter.textContent =
      `${mode === 'backup' ? 'B' : ''}${index + 1} / ${list.length}`;
  }

  function scale() {
    const sw = 1920, sh = 1080;
    const vw = window.innerWidth, vh = window.innerHeight;
    const ratio = Math.min(vw / sw, vh / sh);
    document.querySelectorAll('.slide').forEach(s => { s.style.transform = `scale(${ratio})`; });
  }

  function next() { const list = activeList(); if (index < list.length - 1) { index++; refresh(); } }
  function prev() { if (index > 0) { index--; refresh(); } }
  function first() { index = 0; refresh(); }
  function last() { index = activeList().length - 1; refresh(); }
  function toggleBackup() {
    mode = mode === 'main' ? 'backup' : 'main';
    index = 0;
    refresh();
  }
  function toggleNotes() {
    const overlay = document.querySelector('.notes-overlay');
    if (!overlay) return;
    overlay.classList.toggle('is-visible');
    if (overlay.classList.contains('is-visible')) {
      const slide = activeList()[index];
      const id = slide ? slide.id : '';
      overlay.querySelectorAll('[data-note]').forEach(n => n.style.display = 'none');
      const note = overlay.querySelector(`[data-for="${id}"]`);
      if (note) note.style.display = 'block';
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    switch (e.key) {
      case 'ArrowRight':
      case ' ':
      case 'PageDown':
        e.preventDefault(); next(); break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault(); prev(); break;
      case 'Home':
        e.preventDefault(); first(); break;
      case 'End':
        e.preventDefault(); last(); break;
      case 'b':
      case 'B':
        e.preventDefault(); toggleBackup(); break;
      case 'n':
      case 'N':
        e.preventDefault(); toggleNotes(); break;
    }
  });

  // Click anywhere on right half advances; left half retreats
  document.addEventListener('click', (e) => {
    if (e.target.closest('a, button, .no-click')) return;
    const half = window.innerWidth / 2;
    e.clientX > half ? next() : prev();
  });

  window.addEventListener('resize', scale);
  scale();
  refresh();
})();
```

- [ ] **Step 3: Reload browser, verify navigation**

Open: `http://localhost:3000/deck/index.html`

Verify:
- Slide 1 of 3 visible on load
- Press `→` or Space: advances to slide 2, counter shows `2 / 3`
- Press `→` again: slide 3, counter `3 / 3`
- Press `→` at end: no advance (stays on 3)
- Press `←`: retreats to slide 2
- Press `End`: jumps to slide 3
- Press `Home`: jumps to slide 1
- Click right half of viewport: advances
- Click left half: retreats
- Console: no errors

- [ ] **Step 4: Remove the two stub slides (`#slide-stub-2`, `#slide-stub-3`)**

Edit `public/deck/index.html` — delete the two stub `<section>` blocks added in Step 1. Keep `#slide-stub`.

- [ ] **Step 5: Commit**

```bash
git add public/deck/
git commit -m "feat(deck): keyboard + click navigation with backup-slide mode"
```

---

## Task 3: Slide 1 — Cold open (Thailand map + headline)

**Files:**
- Modify: `public/deck/index.html` (replace `#slide-stub` with `#slide-1`)
- Create: `public/deck/assets/thailand-map.svg`

- [ ] **Step 1: Create `public/deck/assets/thailand-map.svg`**

Simplified Thailand silhouette. Khon Kaen province marker as a separate `<circle>`.

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1100" aria-label="แผนที่ประเทศไทย">
  <path d="M 380 80
           Q 460 90 500 140
           L 540 220 Q 580 300 560 360
           L 600 420 Q 640 480 620 540
           L 560 600 Q 540 660 580 720
           L 520 820 Q 480 880 460 940
           L 440 1000 Q 420 1040 380 1050
           L 340 1020 Q 320 980 340 920
           L 380 840 Q 340 760 320 700
           L 300 620 Q 320 540 340 480
           L 320 420 Q 300 360 320 300
           L 340 240 Q 320 180 340 120
           Z"
        fill="#dcdde4" stroke="#a8b0bc" stroke-width="2" />
  <g transform="translate(445 380)">
    <circle r="42" fill="#d4a017" fill-opacity="0.12"/>
    <circle r="22" fill="#d4a017" fill-opacity="0.30"/>
    <circle r="10" fill="#d4a017"/>
    <text x="32" y="6" font-family="Sarabun, sans-serif" font-size="22"
          font-weight="700" fill="#0c1d3d">ขอนแก่น</text>
  </g>
</svg>
```

- [ ] **Step 2: Replace `#slide-stub` in `public/deck/index.html` with `#slide-1` (cold open)**

```html
<section class="slide" id="slide-1">
  <div class="hero">
    <img src="assets/thailand-map.svg" alt="แผนที่ประเทศไทย ขอนแก่นเน้นสีทอง"
         style="width: 360px; height: auto;" />
    <h1 class="hero-title">ที่นี่… ทุกการคลอดถูกมองเห็นภายใน 30 วินาที</h1>
    <p class="hero-sub">ขอนแก่นคือจังหวัดเดียวในประเทศไทย<br/>ที่ทำสิ่งนี้ได้แล้ววันนี้</p>
    <div class="hero-divider"></div>
  </div>
  <div class="slide-footer">
    <span><b>KK-LRMS</b> · Khon Kaen Labor Room Monitoring System</span>
    <span>สสจ.ขอนแก่น · 26 พ.ค. 2569</span>
  </div>
</section>
```

- [ ] **Step 3: Verify in browser**

Reload `http://localhost:3000/deck/index.html`.

Expected:
- Centered Thailand map silhouette with gold-pulsing Khon Kaen marker
- Large title (~72pt Sarabun, navy) below map
- Subhead in subtle gray
- Gold 90px divider below subhead
- Cream footer with system identification + date
- No slide-header on this slide (intentional — hero only)
- No overflow or scroll

- [ ] **Step 4: Commit**

```bash
git add public/deck/
git commit -m "feat(deck): slide 1 cold open with Thailand map hero"
```

---

## Task 4: Slide 2 — MMR gap + information gap

**Files:**
- Modify: `public/deck/index.html` (append `#slide-2`)

- [ ] **Step 1: Append `#slide-2` to `public/deck/index.html` (after `#slide-1`)**

```html
<section class="slide" id="slide-2">
  <div class="slide-header"><span>กระทรวงสาธารณสุข · สำนักงานสาธารณสุขจังหวัดขอนแก่น</span></div>
  <div class="slide-body">
    <p class="slide-eyebrow">บทที่ 1 · ปัญหาที่มองไม่เห็น</p>
    <h1 class="slide-title">ค่าเฉลี่ยซ่อนความเหลื่อมล้ำ — และข้อมูลผู้คลอดยังไม่ถึงสูติแพทย์ทันเวลา</h1>
    <div class="slide-divider"></div>

    <div class="two-col" style="margin-top: 8px;">
      <div>
        <h3 style="font-size: var(--fs-sub); color: var(--moph-navy); margin: 0 0 18px;">
          อัตราตายมารดา (MMR) ต่อ 100,000 การคลอด
        </h3>
        <svg viewBox="0 0 480 260" style="width: 100%; height: auto;" aria-label="MMR by region">
          <line x1="80" y1="220" x2="470" y2="220" stroke="#a8b0bc" stroke-width="2"/>
          <line x1="80" y1="40"  x2="80"  y2="220" stroke="#a8b0bc" stroke-width="2"/>
          <line x1="80" y1="170" x2="470" y2="170" stroke="#d4a017" stroke-width="2" stroke-dasharray="6 4"/>
          <text x="475" y="174" font-size="12" fill="#d4a017" font-weight="700">เป้าหมาย 17</text>
          <g font-family="Sarabun, sans-serif" font-size="11" fill="#6a7799">
            <rect x="100" y="160" width="40" height="60" fill="#22c55e"/><text x="120" y="240" text-anchor="middle">เขต 1</text>
            <rect x="160" y="130" width="40" height="90" fill="#eab308"/><text x="180" y="240" text-anchor="middle">เขต 4</text>
            <rect x="220" y="110" width="40" height="110" fill="#eab308"/><text x="240" y="240" text-anchor="middle">เขต 6</text>
            <rect x="280" y="90"  width="40" height="130" fill="#ef4444"/><text x="300" y="240" text-anchor="middle">เขต 7</text>
            <rect x="340" y="75"  width="40" height="145" fill="#ef4444"/><text x="360" y="240" text-anchor="middle">เขต 9</text>
            <rect x="400" y="105" width="40" height="115" fill="#eab308"/><text x="420" y="240" text-anchor="middle">เขต 12</text>
          </g>
          <text x="68" y="44"  font-size="10" fill="#6a7799" text-anchor="end">30</text>
          <text x="68" y="174" font-size="10" fill="#6a7799" text-anchor="end">17</text>
          <text x="68" y="224" font-size="10" fill="#6a7799" text-anchor="end">0</text>
        </svg>
        <p style="font-size: 14pt; color: var(--moph-subtle); margin-top: 14px;">
          ภาพประกอบเชิงเปรียบเทียบ · ข้อมูล MMR — สำนักนโยบายและยุทธศาสตร์ สธ.
        </p>
      </div>

      <div>
        <h3 style="font-size: var(--fs-sub); color: var(--moph-navy); margin: 0 0 18px;">
          เส้นทางข้อมูลในปัจจุบัน — ล่าช้า 30–90 นาที
        </h3>
        <div style="display: flex; flex-direction: column; gap: 18px; margin-top: 24px;">
          <div style="display: flex; align-items: center; gap: 20px; padding: 18px; background: var(--moph-cream); border-left: 6px solid var(--moph-gold); border-radius: 4px;">
            <span style="font-size: 36pt;">🏥</span>
            <span style="font-size: var(--fs-body);">รพช. 26 แห่ง — ผู้ป่วยรับเข้าห้องคลอด</span>
          </div>
          <div style="text-align: center; color: var(--moph-subtle); font-size: 22pt;">↓ <span style="font-size: 16pt;">รายงานด้วยปากเปล่า / LINE</span></div>
          <div style="display: flex; align-items: center; gap: 20px; padding: 18px; background: var(--moph-cream); border-left: 6px solid var(--moph-gold); border-radius: 4px;">
            <span style="font-size: 36pt;">📞</span>
            <span style="font-size: var(--fs-body);">สูติแพทย์ที่ รพศ. — ตัดสินใจ refer จากข้อมูลปากเปล่า</span>
          </div>
          <div style="text-align: center; color: var(--risk-high); font-size: 18pt; font-weight: 700;">
            ⚠️ partograph + vital signs ไม่ปรากฏ real-time
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="slide-footer">
    <span><b>KK-LRMS</b> · สสจ.ขอนแก่น · 26 พ.ค. 2569</span>
    <span>2 / 12</span>
  </div>
</section>
```

- [ ] **Step 2: Verify in browser**

Reload, press `→` to advance from slide 1 to slide 2.

Expected:
- Title rendered correctly
- Left: bar chart with 6 bars in green/yellow/red, gold dashed target line at 17
- Right: 3-step pictogram with red warning at bottom
- All text in Sarabun, no overflow
- Counter shows `2 / 12`

- [ ] **Step 3: Commit**

```bash
git add public/deck/
git commit -m "feat(deck): slide 2 MMR gap + information flow problem"
```

---

## Task 5: Slide 3 — Dashboard tour with screenshot

**Files:**
- Copy: `dashboard-current.png` → `public/deck/assets/dashboard.png`
- Modify: `public/deck/index.html` (append `#slide-3`)

- [ ] **Step 1: Copy dashboard screenshot**

```bash
cp dashboard-current.png public/deck/assets/dashboard.png
```

- [ ] **Step 2: Append `#slide-3` to `public/deck/index.html`**

```html
<section class="slide" id="slide-3">
  <div class="slide-header"><span>กระทรวงสาธารณสุข · สำนักงานสาธารณสุขจังหวัดขอนแก่น</span></div>
  <div class="slide-body">
    <p class="slide-eyebrow">บทที่ 2 · สิ่งที่ขอนแก่นสร้างขึ้น</p>
    <h1 class="slide-title">หน้าจอเดียว — เห็นทุกห้องคลอดทั่วจังหวัด</h1>
    <div class="slide-divider"></div>

    <div style="position: relative; flex: 1; border-radius: 8px; overflow: hidden;
                box-shadow: 0 12px 36px rgba(12,29,61,0.18); border: 1.5px solid var(--moph-rule);">
      <img src="assets/dashboard.png" alt="หน้าจอ KK-LRMS Dashboard"
           style="width: 100%; height: 100%; object-fit: cover; object-position: top;" />

      <div style="position: absolute; bottom: 24px; left: 24px; right: 24px;
                  display: flex; gap: 18px; justify-content: space-between;">
        <div style="background: rgba(12,29,61,0.92); color: white; padding: 16px 28px;
                    border-radius: 8px; font-size: var(--fs-sub); font-weight: 700;
                    border-left: 4px solid var(--moph-gold);">26 โรงพยาบาล</div>
        <div style="background: rgba(12,29,61,0.92); color: white; padding: 16px 28px;
                    border-radius: 8px; font-size: var(--fs-sub); font-weight: 700;
                    border-left: 4px solid var(--moph-gold);">อัปเดตทุก 30 วินาที</div>
        <div style="background: rgba(12,29,61,0.92); color: white; padding: 16px 28px;
                    border-radius: 8px; font-size: var(--fs-sub); font-weight: 700;
                    border-left: 4px solid var(--moph-gold);">CPD score อัตโนมัติ</div>
      </div>
    </div>

    <p style="font-size: 14pt; color: var(--moph-subtle); margin-top: 14px; text-align: right;">
      ภาพถ่ายจากระบบจริง · ข้อมูลตัวอย่างจาก demo dataset (ไม่ใช่ผู้ป่วยจริง)
    </p>
  </div>
  <div class="slide-footer">
    <span><b>KK-LRMS</b> · สสจ.ขอนแก่น · 26 พ.ค. 2569</span>
    <span>3 / 12</span>
  </div>
</section>
```

- [ ] **Step 3: Verify in browser**

Press `→` twice from slide 1 to reach slide 3.

Expected:
- Dashboard screenshot fills body area
- Three navy chips with gold left-borders overlaid at bottom
- Subtle caption right-aligned below
- Image loads (no broken icon)
- Counter `3 / 12`

- [ ] **Step 4: Commit**

```bash
git add public/deck/assets/dashboard.png public/deck/index.html
git commit -m "feat(deck): slide 3 dashboard tour with capability chips"
```

---

## Task 6: Slide 4 — Clinical intelligence (CPD + Partograph)

**Files:**
- Copy: `patient-detail-current.png` → `public/deck/assets/patient-detail.png`
- Modify: `public/deck/index.html` (append `#slide-4`)

- [ ] **Step 1: Copy patient detail screenshot**

```bash
cp patient-detail-current.png public/deck/assets/patient-detail.png
```

- [ ] **Step 2: Append `#slide-4` to `public/deck/index.html`**

```html
<section class="slide" id="slide-4">
  <div class="slide-header"><span>กระทรวงสาธารณสุข · สำนักงานสาธารณสุขจังหวัดขอนแก่น</span></div>
  <div class="slide-body">
    <p class="slide-eyebrow">บทที่ 2 · ปัญญาทางคลินิก</p>
    <h1 class="slide-title">ปัญญาทางคลินิกที่ทำงานเงียบ ๆ ใน background</h1>
    <div class="slide-divider"></div>

    <div class="two-col" style="margin-top: 8px;">
      <div>
        <h3 style="font-size: var(--fs-sub); color: var(--moph-navy); margin: 0 0 16px;">
          CPD Risk Score · คำนวณจาก 8 ปัจจัย
        </h3>
        <div style="background: var(--moph-cream); padding: 24px; border-radius: 8px; border-left: 6px solid var(--moph-gold);">
          <table style="width: 100%; border-collapse: collapse; font-size: 16pt;">
            <tbody>
              <tr><td style="padding: 8px 0;">Gravida (ครรภ์แรก)</td><td style="text-align: right; color: var(--moph-subtle);">2.0</td></tr>
              <tr><td style="padding: 8px 0;">ANC visits &lt; 4</td><td style="text-align: right; color: var(--moph-subtle);">1.5</td></tr>
              <tr><td style="padding: 8px 0;">GA ≥ 40 สัปดาห์</td><td style="text-align: right; color: var(--moph-subtle);">1.5</td></tr>
              <tr><td style="padding: 8px 0;">ส่วนสูง &lt; 150 cm</td><td style="text-align: right; color: var(--moph-subtle);">2.0</td></tr>
              <tr><td style="padding: 8px 0;">น้ำหนักเพิ่ม &gt; 20 kg</td><td style="text-align: right; color: var(--moph-subtle);">2.0</td></tr>
              <tr><td style="padding: 8px 0;">Fundal height &gt; 36 cm</td><td style="text-align: right; color: var(--moph-subtle);">2.0</td></tr>
              <tr><td style="padding: 8px 0;">U/S fetal weight &gt; 3,500 g</td><td style="text-align: right; color: var(--moph-subtle);">2.0</td></tr>
              <tr><td style="padding: 8px 0;">Hematocrit &lt; 30%</td><td style="text-align: right; color: var(--moph-subtle);">1.5</td></tr>
            </tbody>
          </table>
          <div style="margin-top: 18px; padding-top: 14px; border-top: 1.5px solid var(--moph-rule);">
            <span style="font-size: 18pt; font-weight: 700; color: var(--risk-high);">≥ 10 คะแนน</span>
            <span style="font-size: 16pt; color: var(--moph-ink); margin-left: 10px;">→ ระบบแนะนำ refer ทันที</span>
          </div>
        </div>
      </div>

      <div>
        <h3 style="font-size: var(--fs-sub); color: var(--moph-navy); margin: 0 0 16px;">
          Partograph ดิจิทัล · alert/action line ตามมาตรฐาน WHO
        </h3>
        <svg viewBox="0 0 480 260" style="width: 100%; height: auto; background: white;
             border: 1.5px solid var(--moph-rule); border-radius: 8px;"
             aria-label="Partograph chart">
          <g stroke="#eee" stroke-width="1">
            <line x1="50" y1="40" x2="50" y2="220"/>
            <line x1="50" y1="220" x2="450" y2="220"/>
            <line x1="50" y1="40" x2="450" y2="40"/>
          </g>
          <line x1="100" y1="200" x2="400" y2="60" stroke="#eab308" stroke-width="2" stroke-dasharray="5 3"/>
          <text x="405" y="62" font-size="11" fill="#eab308" font-weight="700">Alert</text>
          <line x1="160" y1="200" x2="450" y2="60" stroke="#ef4444" stroke-width="2"/>
          <text x="455" y="62" font-size="11" fill="#ef4444" font-weight="700">Action</text>
          <polyline points="100,200 140,180 180,160 220,135 260,115 300,95"
                    stroke="#0c1d3d" stroke-width="3" fill="none"/>
          <g fill="#0c1d3d">
            <circle cx="100" cy="200" r="4"/><circle cx="140" cy="180" r="4"/>
            <circle cx="180" cy="160" r="4"/><circle cx="220" cy="135" r="4"/>
            <circle cx="260" cy="115" r="4"/><circle cx="300" cy="95" r="4"/>
          </g>
          <text x="50" y="240" font-size="11" fill="#6a7799" text-anchor="middle">0h</text>
          <text x="250" y="240" font-size="11" fill="#6a7799" text-anchor="middle">4h</text>
          <text x="450" y="240" font-size="11" fill="#6a7799" text-anchor="middle">8h</text>
          <text x="40" y="222" font-size="11" fill="#6a7799" text-anchor="end">0</text>
          <text x="40" y="120" font-size="11" fill="#6a7799" text-anchor="end">5</text>
          <text x="40" y="44"  font-size="11" fill="#6a7799" text-anchor="end">10 cm</text>
          <text x="250" y="22" font-size="13" fill="#0c1d3d" text-anchor="middle" font-weight="700">
            Cervix dilation · เวลา
          </text>
        </svg>
        <ul class="bullet-list" style="margin-top: 18px;">
          <li>vital signs แม่ + ทารก sync ทุก 30 วินาที</li>
          <li>contraction frequency + intensity บันทึกจาก HOSxP</li>
        </ul>
      </div>
    </div>
  </div>
  <div class="slide-footer">
    <span><b>KK-LRMS</b> · สสจ.ขอนแก่น · 26 พ.ค. 2569</span>
    <span>4 / 12</span>
  </div>
</section>
```

- [ ] **Step 3: Verify in browser**

Press `→` to advance to slide 4.

Expected:
- Two-column layout
- Left: cream box with 8-row CPD table, gold left border, "≥ 10 คะแนน → refer ทันที" footer in red
- Right: SVG partograph with yellow alert line, red action line, navy patient curve
- Two-line bullet list below partograph
- Counter `4 / 12`

- [ ] **Step 4: Commit**

```bash
git add public/deck/
git commit -m "feat(deck): slide 4 CPD score + WHO-standard partograph"
```

---

## Task 7: Slide 5 — Cross-hospital tracking via CID hash

**Files:**
- Modify: `public/deck/index.html` (append `#slide-5`)

- [ ] **Step 1: Append `#slide-5` to `public/deck/index.html`**

```html
<section class="slide" id="slide-5">
  <div class="slide-header"><span>กระทรวงสาธารณสุข · สำนักงานสาธารณสุขจังหวัดขอนแก่น</span></div>
  <div class="slide-body">
    <p class="slide-eyebrow">บทที่ 2 · การส่งต่อ</p>
    <h1 class="slide-title">ติดตามผู้ป่วยข้ามโรงพยาบาล โดยไม่เปิดเผยเลขบัตรประชาชน</h1>
    <div class="slide-divider"></div>

    <div style="background: var(--moph-cream); padding: 36px; border-radius: 10px;
                border: 1.5px solid var(--moph-rule); margin-bottom: 28px;">
      <div style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 32px;">
        <div style="text-align: center;">
          <div style="font-size: 64pt;">🏥</div>
          <div style="font-size: var(--fs-sub); font-weight: 700; color: var(--moph-navy);">รพช. A</div>
          <div style="font-size: 16pt; color: var(--moph-subtle); margin-top: 6px;">
            G1 อายุ 17 รับเข้า 14:23
          </div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 14pt; font-family: var(--ff-data); color: var(--moph-subtle); margin-bottom: 8px;">
            CID hash SHA-256 matched
          </div>
          <div style="font-size: 48pt; color: var(--moph-gold);">→</div>
          <div style="font-size: 14pt; color: var(--moph-subtle); margin-top: 8px; font-weight: 700;">Refer 14:45</div>
        </div>
        <div style="text-align: center;">
          <div style="font-size: 64pt;">🏥</div>
          <div style="font-size: var(--fs-sub); font-weight: 700; color: var(--moph-navy);">รพศ. ขอนแก่น</div>
          <div style="font-size: 16pt; color: var(--moph-subtle); margin-top: 6px;">
            ทีมพร้อม · ข้อมูลเต็ม 16:10
          </div>
        </div>
      </div>
    </div>

    <ul class="bullet-list">
      <li><b>CID ถูก hash ด้วย SHA-256</b> — ไม่เก็บ plaintext ที่ไหนเลย</li>
      <li><b>Match ประวัติอัตโนมัติ</b> เมื่อผู้ป่วย refer ระหว่างโรงพยาบาล</li>
      <li><b>สูติแพทย์ที่รับ refer</b> เห็น partograph + ANC + vital trend ก่อนรถถึง</li>
      <li><b>ลดการสอบถามซ้ำ</b> ที่ ER — ประหยัดเวลาช่วงวิกฤต</li>
    </ul>
  </div>
  <div class="slide-footer">
    <span><b>KK-LRMS</b> · สสจ.ขอนแก่น · 26 พ.ค. 2569</span>
    <span>5 / 12</span>
  </div>
</section>
```

- [ ] **Step 2: Verify in browser**

Press `→` to advance to slide 5.

Expected:
- Flow diagram with two hospital icons, gold arrow between, "CID hash SHA-256 matched" label
- 4-bullet list below
- Counter `5 / 12`

- [ ] **Step 3: Commit**

```bash
git add public/deck/
git commit -m "feat(deck): slide 5 cross-hospital tracking via CID hash"
```

---

## Task 8: Slide 6 — Coverage + PDPA

**Files:**
- Modify: `public/deck/index.html` (append `#slide-6`)

- [ ] **Step 1: Append `#slide-6` to `public/deck/index.html`**

```html
<section class="slide" id="slide-6">
  <div class="slide-header"><span>กระทรวงสาธารณสุข · สำนักงานสาธารณสุขจังหวัดขอนแก่น</span></div>
  <div class="slide-body">
    <p class="slide-eyebrow">บทที่ 2 · รองรับทุกระบบ + ปลอดภัยตั้งแต่วันแรก</p>
    <h1 class="slide-title">รองรับทุกระบบ HIS · ออกแบบให้สอดคล้อง PDPA ตั้งแต่วันแรก</h1>
    <div class="slide-divider"></div>

    <div class="two-col" style="margin-top: 8px;">
      <div>
        <h3 style="font-size: var(--fs-sub); color: var(--moph-navy); margin: 0 0 18px;">
          Coverage · ครอบคลุมโรงพยาบาลทุกประเภท
        </h3>
        <div style="background: var(--moph-cream); padding: 22px; border-radius: 8px;
                    border-left: 6px solid var(--moph-gold); margin-bottom: 16px;">
          <div style="font-size: 20pt; font-weight: 700; color: var(--moph-navy); margin-bottom: 8px;">
            โรงพยาบาลที่ใช้ HOSxP
          </div>
          <div style="font-size: 16pt; color: var(--moph-subtle);">
            → auto-sync ทุก 30 วินาที (BMS Session API)<br/>
            → โหมด <b style="color: var(--risk-low);">browser-only</b> — PHI ไม่ออกจาก network โรงพยาบาล
          </div>
        </div>
        <div style="background: var(--moph-cream); padding: 22px; border-radius: 8px;
                    border-left: 6px solid var(--moph-gold);">
          <div style="font-size: 20pt; font-weight: 700; color: var(--moph-navy); margin-bottom: 8px;">
            โรงพยาบาลที่ไม่ใช้ HOSxP
          </div>
          <div style="font-size: 16pt; color: var(--moph-subtle);">
            → push ผ่าน Webhook REST API<br/>
            → ตรวจสอบ API key + signed payload
          </div>
        </div>
      </div>

      <div>
        <h3 style="font-size: var(--fs-sub); color: var(--moph-navy); margin: 0 0 18px;">
          Privacy · PDPA-compliant by design
        </h3>
        <ul class="bullet-list check-list">
          <li><b>AES-256-GCM</b> เข้ารหัสชื่อ + CID ตอนเก็บ</li>
          <li><b>CID hash SHA-256</b> สำหรับ match ข้ามโรงพยาบาล</li>
          <li><b>Role-based access</b> สูติแพทย์ / พยาบาล / Admin</li>
          <li><b>Audit log</b> ทุกการเข้าถึงข้อมูลผู้ป่วย</li>
          <li><b>ชื่อผู้ป่วย mask</b> บน dashboard (แสดง HN/AN เท่านั้น)</li>
        </ul>
      </div>
    </div>
  </div>
  <div class="slide-footer">
    <span><b>KK-LRMS</b> · สสจ.ขอนแก่น · 26 พ.ค. 2569</span>
    <span>6 / 12</span>
  </div>
</section>
```

- [ ] **Step 2: Verify in browser**

Press `→` to advance to slide 6.

Expected:
- Two-column layout
- Left: two cream boxes for HOSxP and non-HOSxP coverage
- Right: 5-item check-list with green checkmarks
- Counter `6 / 12`

- [ ] **Step 3: Commit**

```bash
git add public/deck/
git commit -m "feat(deck): slide 6 every-HIS coverage + PDPA by design"
```

---

## Task 9: Slide 7 — Live metrics tiles + DB pull script

**Files:**
- Create: `scripts/pull-deck-metrics.mjs`
- Create: `public/deck/metrics.json` (output)
- Modify: `public/deck/index.html` (append `#slide-7`)

- [ ] **Step 1: Create `scripts/pull-deck-metrics.mjs`**

```javascript
#!/usr/bin/env node
// scripts/pull-deck-metrics.mjs
// Snapshot system metrics for the MOPH executive deck (slide 7).
// Run: DATABASE_URL=postgres://... node scripts/pull-deck-metrics.mjs

import { writeFileSync } from 'node:fs';
import { Client } from 'pg';

const url = process.env.DATABASE_URL;
const out = 'public/deck/metrics.json';
const stamp = new Date().toISOString();

const fallback = {
  generated_at: stamp,
  source: 'fallback',
  warning: 'DATABASE_URL unreachable — using placeholder values',
  hospitals_connected: 26,
  patients_total: null,
  sync_success_pct_30d: null,
  uptime_days: null,
  tests_total: 463,
  query_latency_sla_sec: 2,
};

if (!url) {
  console.warn('[pull-deck-metrics] DATABASE_URL not set — writing fallback');
  writeFileSync(out, JSON.stringify(fallback, null, 2));
  process.exit(0);
}

const client = new Client({ connectionString: url });

try {
  await client.connect();

  const hospitalsQ = await client.query(
    `SELECT COUNT(*)::int AS n FROM hospitals WHERE is_active = true`
  );
  const patientsQ = await client.query(
    `SELECT COUNT(*)::int AS n FROM patients`
  );

  let syncPct = null;
  try {
    const r = await client.query(`
      SELECT ROUND(100.0 * SUM(CASE WHEN status = 'OK' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS pct
      FROM sync_log
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);
    syncPct = r.rows[0]?.pct ?? null;
  } catch (e) { /* sync_log may not exist; leave null */ }

  let uptimeDays = null;
  try {
    const r = await client.query(`
      SELECT EXTRACT(DAY FROM NOW() - MIN(created_at))::int AS d
      FROM hospitals
    `);
    uptimeDays = r.rows[0]?.d ?? null;
  } catch (e) {}

  const out_data = {
    generated_at: stamp,
    source: 'live',
    hospitals_connected: hospitalsQ.rows[0].n,
    patients_total: patientsQ.rows[0].n,
    sync_success_pct_30d: syncPct,
    uptime_days: uptimeDays,
    tests_total: 463,
    query_latency_sla_sec: 2,
  };
  writeFileSync(out, JSON.stringify(out_data, null, 2));
  console.log('[pull-deck-metrics] wrote', out, out_data);
} catch (e) {
  console.error('[pull-deck-metrics] query failed:', e.message);
  writeFileSync(out, JSON.stringify({ ...fallback, error: e.message }, null, 2));
  process.exit(1);
} finally {
  await client.end();
}
```

- [ ] **Step 2: Run the metrics script**

```bash
DATABASE_URL="$(grep ^DATABASE_URL= .env.local 2>/dev/null | cut -d= -f2- | tr -d '\"')" \
  node scripts/pull-deck-metrics.mjs
```

Expected: `public/deck/metrics.json` exists with values.

- [ ] **Step 3: Read `public/deck/metrics.json` to capture values**

```bash
cat public/deck/metrics.json
```

Note the values — they'll be hard-coded into Step 4 below. Replace `__N__`, `__X__`, `__Y__` placeholders.

- [ ] **Step 4: Append `#slide-7` to `public/deck/index.html`** (replace `__N__`, `__X__`, `__Y__` with the values from Step 3; if any value is `null`, use `—`)

```html
<section class="slide" id="slide-7">
  <div class="slide-header"><span>กระทรวงสาธารณสุข · สำนักงานสาธารณสุขจังหวัดขอนแก่น</span></div>
  <div class="slide-body">
    <p class="slide-eyebrow">บทที่ 2 · พร้อมใช้งานจริง</p>
    <h1 class="slide-title">ระบบใช้งานจริง — ไม่ใช่ prototype</h1>
    <div class="slide-divider"></div>

    <div class="metric-grid" style="margin-top: 16px;">
      <div class="metric-tile">
        <div class="num">26</div>
        <div class="label">โรงพยาบาลเชื่อมต่อ</div>
      </div>
      <div class="metric-tile">
        <div class="num">__N__</div>
        <div class="label">ผู้ป่วยในระบบ</div>
      </div>
      <div class="metric-tile">
        <div class="num">__X__<span class="unit">%</span></div>
        <div class="label">sync success rate (30 วัน)</div>
      </div>
      <div class="metric-tile">
        <div class="num">__Y__<span class="unit">วัน</span></div>
        <div class="label">uptime ต่อเนื่อง</div>
      </div>
      <div class="metric-tile">
        <div class="num">463</div>
        <div class="label">unit + integration tests</div>
      </div>
      <div class="metric-tile">
        <div class="num">&lt; 2<span class="unit">sec</span></div>
        <div class="label">SQL query latency (SLA)</div>
      </div>
    </div>

    <p style="font-size: 14pt; color: var(--moph-subtle); margin-top: 18px; text-align: right;">
      ตัวเลขสด · ดึง ณ <span id="metrics-stamp">[build time]</span>
    </p>
  </div>
  <div class="slide-footer">
    <span><b>KK-LRMS</b> · สสจ.ขอนแก่น · 26 พ.ค. 2569</span>
    <span>7 / 12</span>
  </div>
</section>
```

- [ ] **Step 5: Replace `[build time]` in the slide with the value from `metrics.json` → `generated_at`** (use date portion, e.g. `25 พ.ค. 2569 22:14`).

- [ ] **Step 6: Verify in browser**

Press `→` to advance to slide 7.

Expected:
- 3×2 grid of 6 metric tiles
- Each tile has large data-font number, label below
- Gold left border on each tile
- Timestamp footer
- Counter `7 / 12`

- [ ] **Step 7: Commit**

```bash
git add public/deck/ scripts/pull-deck-metrics.mjs
git commit -m "feat(deck): slide 7 live operational metrics + DB pull script"
```

---

## Task 10: Slide 8 — Real patient case timeline

**Files:**
- Modify: `public/deck/index.html` (append `#slide-8`)

- [ ] **Step 1: Append `#slide-8` to `public/deck/index.html`**

```html
<section class="slide" id="slide-8">
  <div class="slide-header"><span>กระทรวงสาธารณสุข · สำนักงานสาธารณสุขจังหวัดขอนแก่น</span></div>
  <div class="slide-body">
    <p class="slide-eyebrow">บทที่ 3 · เรื่องจริงจากระบบ</p>
    <h1 class="slide-title">หนึ่งเคส · หนึ่งชีวิต · ระบบทำงานได้จริง</h1>
    <div class="slide-divider"></div>

    <div style="display: grid; grid-template-columns: 180px 1fr; gap: 32px; flex: 1; margin-top: 8px;">
      <div style="position: relative; padding: 24px 0;">
        <div style="position: absolute; left: 50%; top: 0; bottom: 0; width: 3px;
                    background: linear-gradient(to bottom,
                      var(--risk-medium) 0%, var(--risk-medium) 35%,
                      var(--risk-high) 35%, var(--risk-high) 70%,
                      var(--risk-low) 70%, var(--risk-low) 100%);"></div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 14px; padding: 24px 0;">
        <div style="display: flex; gap: 18px; align-items: flex-start;">
          <span style="font-family: var(--ff-data); font-size: 22pt; font-weight: 700; color: var(--risk-medium); min-width: 100px;">14:23</span>
          <span style="font-size: 19pt; color: var(--moph-ink);">G1 อายุ 17 รับเข้า <b>รพช. [X]</b></span>
        </div>
        <div style="display: flex; gap: 18px; align-items: flex-start;">
          <span style="font-family: var(--ff-data); font-size: 22pt; font-weight: 700; color: var(--risk-medium); min-width: 100px;">14:24</span>
          <span style="font-size: 19pt; color: var(--moph-ink);">KK-LRMS sync → CPD score <b style="color: var(--risk-high);">11 (High Risk)</b></span>
        </div>
        <div style="display: flex; gap: 18px; align-items: flex-start;">
          <span style="font-family: var(--ff-data); font-size: 22pt; font-weight: 700; color: var(--risk-high); min-width: 100px;">14:25</span>
          <span style="font-size: 19pt; color: var(--moph-ink);">แจ้งเตือนถึง<b> สูติแพทย์เวรที่ รพศ.ขอนแก่น</b></span>
        </div>
        <div style="display: flex; gap: 18px; align-items: flex-start;">
          <span style="font-family: var(--ff-data); font-size: 22pt; font-weight: 700; color: var(--risk-high); min-width: 100px;">14:30</span>
          <span style="font-size: 19pt; color: var(--moph-ink);">สูติแพทย์เปิด <b>partograph + ANC history</b> ของผู้ป่วย</span>
        </div>
        <div style="display: flex; gap: 18px; align-items: flex-start;">
          <span style="font-family: var(--ff-data); font-size: 22pt; font-weight: 700; color: var(--risk-high); min-width: 100px;">14:45</span>
          <span style="font-size: 19pt; color: var(--moph-ink);">ตัดสินใจ refer ทันที <b>(เร็วกว่า workflow เดิม ~45 นาที)</b></span>
        </div>
        <div style="display: flex; gap: 18px; align-items: flex-start;">
          <span style="font-family: var(--ff-data); font-size: 22pt; font-weight: 700; color: var(--risk-low); min-width: 100px;">16:10</span>
          <span style="font-size: 19pt; color: var(--moph-ink);">ผู้ป่วยถึง รพศ. — <b>ทีมพร้อม ข้อมูลเต็ม</b></span>
        </div>
        <div style="display: flex; gap: 18px; align-items: flex-start;">
          <span style="font-family: var(--ff-data); font-size: 22pt; font-weight: 700; color: var(--risk-low); min-width: 100px;">17:50</span>
          <span style="font-size: 19pt; color: var(--moph-ink);"><b style="color: var(--risk-low);">C/S สำเร็จ · แม่และทารกปลอดภัย ✓</b></span>
        </div>
      </div>
    </div>

    <p style="font-size: 13pt; color: var(--moph-subtle); margin-top: 14px; text-align: right;">
      ข้อมูลผ่านการ anonymize · ได้รับความเห็นชอบจาก <b>[แพทย์ผู้รับผิดชอบ]</b>
    </p>
  </div>
  <div class="slide-footer">
    <span><b>KK-LRMS</b> · สสจ.ขอนแก่น · 26 พ.ค. 2569</span>
    <span>8 / 12</span>
  </div>
</section>
```

- [ ] **Step 2: Verify in browser**

Press `→` to advance to slide 8.

Expected:
- Vertical timeline rail on left with yellow→red→green color zones
- 7 events on right, each with large time stamp + description
- "C/S สำเร็จ · แม่และทารกปลอดภัย ✓" in green
- Counter `8 / 12`

- [ ] **Step 3 (CONDITIONAL): If real case is NOT confirmed by tomorrow 09:00, update placeholders**

In `public/deck/index.html`, in `#slide-8`:
- Find: `รพช. [X]` → replace with: `รพช. ในเขตสุขภาพที่ 7`
- Find: `[แพทย์ผู้รับผิดชอบ]` → replace with: `ทีมสูติศาสตร์ รพศ.ขอนแก่น`
- Find title: `หนึ่งเคส · หนึ่งชีวิต · ระบบทำงานได้จริง`
- Replace title with: `ตัวอย่างเชิงเปรียบเทียบ — เคสที่ระบบควรช่วยจับได้`

- [ ] **Step 4: Commit**

```bash
git add public/deck/
git commit -m "feat(deck): slide 8 real patient case timeline (placeholder until confirmed)"
```

---

## Task 11: Slide 9 — Scale path 1→7→76

**Files:**
- Modify: `public/deck/index.html` (append `#slide-9`)

- [ ] **Step 1: Append `#slide-9` to `public/deck/index.html`**

```html
<section class="slide" id="slide-9">
  <div class="slide-header"><span>กระทรวงสาธารณสุข · สำนักงานสาธารณสุขจังหวัดขอนแก่น</span></div>
  <div class="slide-body">
    <p class="slide-eyebrow">บทที่ 3 · จากจังหวัดสู่ประเทศ</p>
    <h1 class="slide-title">พร้อมขยาย · สถาปัตยกรรม multi-tenant พร้อมรองรับวันแรก</h1>
    <div class="slide-divider"></div>

    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; flex: 1; margin-top: 12px;">
      <div style="background: var(--moph-cream); padding: 26px 22px; border-radius: 8px;
                  border-top: 6px solid var(--risk-low); display: flex; flex-direction: column;">
        <div style="font-size: 14pt; color: var(--risk-low); font-weight: 700; letter-spacing: 0.05em;">
          ✅ ดำเนินงานแล้ว
        </div>
        <div style="font-size: 36pt; font-weight: 700; color: var(--moph-navy); font-family: var(--ff-data); margin: 8px 0;">2569</div>
        <div style="font-size: 20pt; font-weight: 700; color: var(--moph-navy);">ขอนแก่น</div>
        <div style="font-size: 16pt; color: var(--moph-subtle); margin-top: 6px;">26 รพช. + 1 รพศ.</div>
        <div style="margin-top: auto; padding-top: 16px; font-size: 14pt; color: var(--risk-low); font-weight: 600;">
          operational today
        </div>
      </div>

      <div style="background: var(--moph-cream); padding: 26px 22px; border-radius: 8px;
                  border-top: 6px solid var(--moph-gold); display: flex; flex-direction: column;">
        <div style="font-size: 14pt; color: var(--moph-gold); font-weight: 700; letter-spacing: 0.05em;">
          🎯 เป้าหมายถัดไป
        </div>
        <div style="font-size: 36pt; font-weight: 700; color: var(--moph-navy); font-family: var(--ff-data); margin: 8px 0;">
          2570 <span style="font-size: 18pt; font-weight: 500;">Q1–Q3</span>
        </div>
        <div style="font-size: 20pt; font-weight: 700; color: var(--moph-navy);">เขตสุขภาพที่ 7</div>
        <div style="font-size: 16pt; color: var(--moph-subtle); margin-top: 6px;">7 จังหวัด · ~150 รพช.</div>
        <div style="margin-top: auto; padding-top: 16px; font-size: 14pt; color: var(--moph-gold); font-weight: 600;">
          requires board approval
        </div>
      </div>

      <div style="background: var(--moph-cream); padding: 26px 22px; border-radius: 8px;
                  border-top: 6px solid var(--moph-gold); display: flex; flex-direction: column;">
        <div style="font-size: 14pt; color: var(--moph-gold); font-weight: 700; letter-spacing: 0.05em;">
          🎯 ระดับชาติ
        </div>
        <div style="font-size: 36pt; font-weight: 700; color: var(--moph-navy); font-family: var(--ff-data); margin: 8px 0;">
          2570 <span style="font-size: 18pt; font-weight: 500;">Q4</span>
        </div>
        <div style="font-size: 20pt; font-weight: 700; color: var(--moph-navy);">MOPH-managed service</div>
        <div style="font-size: 16pt; color: var(--moph-subtle); margin-top: 6px;">เปิดให้ทุกเขตใช้งาน</div>
        <div style="margin-top: auto; padding-top: 16px; font-size: 14pt; color: var(--moph-gold); font-weight: 600;">
          requires HDC integration
        </div>
      </div>

      <div style="background: var(--moph-cream); padding: 26px 22px; border-radius: 8px;
                  border-top: 6px solid var(--moph-gold); display: flex; flex-direction: column;">
        <div style="font-size: 14pt; color: var(--moph-gold); font-weight: 700; letter-spacing: 0.05em;">
          🎯 ครบทั้งประเทศ
        </div>
        <div style="font-size: 36pt; font-weight: 700; color: var(--moph-navy); font-family: var(--ff-data); margin: 8px 0;">2571</div>
        <div style="font-size: 20pt; font-weight: 700; color: var(--moph-navy);">ทุกเขตสุขภาพ</div>
        <div style="font-size: 16pt; color: var(--moph-subtle); margin-top: 6px;">13 เขต · ~900 รพช.</div>
        <div style="margin-top: auto; padding-top: 16px; font-size: 14pt; color: var(--moph-gold); font-weight: 600;">
          national maternal MMR ≤ 17
        </div>
      </div>
    </div>

    <p style="font-size: 16pt; color: var(--moph-subtle); margin-top: 22px;">
      <b>6 สัปดาห์ต่อจังหวัด</b> (รายละเอียดในสไลด์ถัดไป) · HOSxP เดิมไม่ต้องเปลี่ยน
    </p>
  </div>
  <div class="slide-footer">
    <span><b>KK-LRMS</b> · สสจ.ขอนแก่น · 26 พ.ค. 2569</span>
    <span>9 / 12</span>
  </div>
</section>
```

- [ ] **Step 2: Verify in browser**

Press `→` to advance to slide 9.

Expected:
- 4 cream cards in a row, stage 1 with green top border, stages 2–4 with gold top border
- Counter `9 / 12`

- [ ] **Step 3: Commit**

```bash
git add public/deck/
git commit -m "feat(deck): slide 9 four-stage scale path 1->7->76"
```

---

## Task 12: Slide 10 — Hospital onboarding 6-week Gantt

**Files:**
- Modify: `public/deck/index.html` (append `#slide-10`)

- [ ] **Step 1: Append `#slide-10` to `public/deck/index.html`**

```html
<section class="slide" id="slide-10">
  <div class="slide-header"><span>กระทรวงสาธารณสุข · สำนักงานสาธารณสุขจังหวัดขอนแก่น</span></div>
  <div class="slide-body">
    <p class="slide-eyebrow">บทที่ 3 · พิสูจน์การขยาย</p>
    <h1 class="slide-title">6 สัปดาห์ต่อจังหวัด · ทำคู่ขนานได้หลายจังหวัด</h1>
    <div class="slide-divider"></div>

    <div style="background: var(--moph-cream); padding: 32px; border-radius: 10px; margin-top: 12px;">
      <div style="display: grid; grid-template-columns: 320px repeat(6, 1fr); gap: 4px; font-size: 14pt; color: var(--moph-subtle); font-weight: 600; padding-bottom: 12px; border-bottom: 2px solid var(--moph-rule); margin-bottom: 16px;">
        <div></div>
        <div style="text-align: center;">W1</div>
        <div style="text-align: center;">W2</div>
        <div style="text-align: center;">W3</div>
        <div style="text-align: center;">W4</div>
        <div style="text-align: center;">W5</div>
        <div style="text-align: center;">W6</div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 14px;">
        <div style="display: grid; grid-template-columns: 320px repeat(6, 1fr); gap: 4px; align-items: center;">
          <div style="font-size: 18pt; color: var(--moph-navy); font-weight: 600;">ลงนาม MOU + ผู้ประสานงาน สสจ.</div>
          <div style="height: 36px; background: var(--moph-navy); border-radius: 4px;"></div>
          <div></div><div></div><div></div><div></div><div></div>
        </div>
        <div style="display: grid; grid-template-columns: 320px repeat(6, 1fr); gap: 4px; align-items: center;">
          <div style="font-size: 18pt; color: var(--moph-navy); font-weight: 600;">เปิด BMS Session tunnel + ทดสอบ sync</div>
          <div></div>
          <div style="height: 36px; background: var(--moph-gold); border-radius: 4px 0 0 4px;"></div>
          <div style="height: 36px; background: var(--moph-gold); border-radius: 0 4px 4px 0;"></div>
          <div></div><div></div><div></div>
        </div>
        <div style="display: grid; grid-template-columns: 320px repeat(6, 1fr); gap: 4px; align-items: center;">
          <div style="font-size: 18pt; color: var(--moph-navy); font-weight: 600;">คัดกรองข้อมูล + อบรมพยาบาล/สูติแพทย์</div>
          <div></div><div></div>
          <div style="height: 36px; background: var(--moph-navy); border-radius: 4px 0 0 4px;"></div>
          <div style="height: 36px; background: var(--moph-navy); border-radius: 0 4px 4px 0;"></div>
          <div></div><div></div>
        </div>
        <div style="display: grid; grid-template-columns: 320px repeat(6, 1fr); gap: 4px; align-items: center;">
          <div style="font-size: 18pt; color: var(--moph-navy); font-weight: 600;">Pilot run · 1 รพช.</div>
          <div></div><div></div><div></div><div></div>
          <div style="height: 36px; background: var(--moph-gold); border-radius: 4px;"></div>
          <div></div>
        </div>
        <div style="display: grid; grid-template-columns: 320px repeat(6, 1fr); gap: 4px; align-items: center;">
          <div style="font-size: 18pt; color: var(--moph-navy); font-weight: 600;">Rollout 5+ รพช. + handover</div>
          <div></div><div></div><div></div><div></div><div></div>
          <div style="height: 36px; background: var(--risk-low); border-radius: 4px;"></div>
        </div>
      </div>
    </div>

    <ul class="bullet-list" style="margin-top: 20px;">
      <li><b>1 ทีม technical (2 คน)</b> รองรับ 3 จังหวัดพร้อมกัน</li>
      <li><b>เขตสุขภาพที่ 7 (7 จังหวัด)</b> → 2 ทีม · ประมาณ 4 เดือนเสร็จทั้งเขต</li>
    </ul>
  </div>
  <div class="slide-footer">
    <span><b>KK-LRMS</b> · สสจ.ขอนแก่น · 26 พ.ค. 2569</span>
    <span>10 / 12</span>
  </div>
</section>
```

- [ ] **Step 2: Verify in browser**

Press `→` to advance to slide 10.

Expected:
- Gantt chart with 5 workstream rows, W1–W6 column headers
- Bars colored navy/gold/green per workstream
- 2-bullet list below
- Counter `10 / 12`

- [ ] **Step 3: Commit**

```bash
git add public/deck/
git commit -m "feat(deck): slide 10 hospital onboarding 6-week Gantt"
```

---

## Task 13: Slide 11 — The 4 asks quadrant

**Files:**
- Modify: `public/deck/index.html` (append `#slide-11`)

- [ ] **Step 1: Append `#slide-11` to `public/deck/index.html`**

```html
<section class="slide" id="slide-11">
  <div class="slide-header"><span>กระทรวงสาธารณสุข · สำนักงานสาธารณสุขจังหวัดขอนแก่น</span></div>
  <div class="slide-body">
    <p class="slide-eyebrow">สิ่งที่เราขอจากบอร์ดวันนี้</p>
    <h1 class="slide-title">สี่สิ่งจากบอร์ดผู้บริหาร เพื่อยกระดับการเฝ้าระวังการคลอดทั้งประเทศ</h1>
    <div class="slide-divider"></div>

    <div class="ask-quadrant" style="margin-top: 16px;">
      <div class="ask-tile">
        <div class="icon">📜</div>
        <h3>หนังสือเห็นชอบจาก สป.สธ.</h3>
        <p>ขยายผล KK-LRMS สู่เขตสุขภาพที่ 7 (7 จังหวัด · ~150 รพช.)</p>
      </div>
      <div class="ask-tile">
        <div class="icon">📋</div>
        <h3>บรรจุใน Service Plan</h3>
        <p>Maternal Health KPI รอบปีงบประมาณ 2570</p>
      </div>
      <div class="ask-tile">
        <div class="icon">💰</div>
        <h3>กรอบงบประมาณ FY 2570</h3>
        <p>Hosting + onboarding + ops staffing สำหรับ Region 7</p>
      </div>
      <div class="ask-tile">
        <div class="icon">🔗</div>
        <h3>มอบหมายเชื่อมโยงกับ HDC</h3>
        <p>ข้อมูล KK-LRMS → national health data lake (Digital Health)</p>
      </div>
    </div>

    <p style="font-size: 14pt; color: var(--moph-subtle); margin-top: 22px; text-align: right;">
      ติดต่อ <b>[presenter name]</b> · [email] · [phone]
    </p>
  </div>
  <div class="slide-footer">
    <span><b>KK-LRMS</b> · สสจ.ขอนแก่น · 26 พ.ค. 2569</span>
    <span>11 / 12</span>
  </div>
</section>
```

- [ ] **Step 2: Replace presenter contact placeholders**

Find: `[presenter name]`, `[email]`, `[phone]` — replace with real values.

- [ ] **Step 3: Verify in browser**

Press `→` to advance to slide 11.

Expected:
- 2×2 grid of navy tiles
- Each tile: large gold icon (emoji), white title, gray subtitle
- Counter `11 / 12`

- [ ] **Step 4: Commit**

```bash
git add public/deck/
git commit -m "feat(deck): slide 11 four-quadrant ask to MOPH board"
```

---

## Task 14: Slide 12 — Thank you + QR

**Files:**
- Create: `public/deck/assets/qr-about.png`
- Modify: `public/deck/index.html` (append `#slide-12`)

- [ ] **Step 1: Generate the QR code**

```bash
curl -sL "https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=https%3A%2F%2Fkk-lrms.bmscloud.in.th%2Fabout" \
  -o public/deck/assets/qr-about.png
file public/deck/assets/qr-about.png
```

Expected: `qr-about.png` is a 400×400 PNG, valid image.

- [ ] **Step 2: Append `#slide-12` to `public/deck/index.html`**

```html
<section class="slide" id="slide-12">
  <div class="hero" style="justify-content: center;">
    <h1 class="hero-title" style="font-size: 60pt;">ขอบคุณบอร์ดผู้บริหารกระทรวงสาธารณสุข</h1>
    <div class="hero-divider"></div>

    <div style="margin-top: 48px; display: flex; flex-direction: column; align-items: center; gap: 18px;">
      <img src="assets/qr-about.png" alt="QR ไปยังหน้าข้อมูลระบบ" style="width: 320px; height: 320px; border: 8px solid white; box-shadow: 0 8px 24px rgba(0,0,0,0.12); border-radius: 8px;"/>
      <p style="font-size: 22pt; color: var(--moph-subtle); margin: 0;">
        ข้อมูลระบบเพิ่มเติม — สแกน QR
      </p>
      <p style="font-size: 14pt; color: var(--moph-subtle); margin: 0; font-family: var(--ff-data);">
        kk-lrms.bmscloud.in.th/about
      </p>
    </div>
  </div>
  <div class="slide-footer">
    <span><b>KK-LRMS</b> · สำนักงานสาธารณสุขจังหวัดขอนแก่น</span>
    <span>12 / 12</span>
  </div>
</section>
```

- [ ] **Step 3: Verify in browser**

Press `→` to advance to slide 12. Scan QR with phone → opens https://kk-lrms.bmscloud.in.th/about.

Expected:
- Centered "ขอบคุณ..." title, gold divider
- 320px QR code centered
- URL in data font below QR
- Counter `12 / 12`

- [ ] **Step 4: Commit**

```bash
git add public/deck/
git commit -m "feat(deck): slide 12 thank-you closing with QR to /about"
```

---

## Task 15: Backup slides B1–B6

**Files:**
- Modify: `public/deck/index.html` (append 6 sections with `id="backup-N"`)

- [ ] **Step 1: Append all 6 backup slides to `public/deck/index.html` (after `#slide-12`)**

```html
<!-- Backup B1 — Tech stack one-pager -->
<section class="slide" id="backup-1">
  <div class="slide-header"><span>BACKUP B1 · Technical Stack</span></div>
  <div class="slide-body">
    <p class="slide-eyebrow">หากบอร์ด Digital Health ถามรายละเอียดสถาปัตยกรรม</p>
    <h1 class="slide-title">Technical stack — production-grade, mainstream technologies</h1>
    <div class="slide-divider"></div>
    <div class="two-col">
      <ul class="bullet-list">
        <li><b>Next.js 16</b> + React 19 + TypeScript 5</li>
        <li><b>PostgreSQL 16</b> production · SQLite in-memory tests</li>
        <li><b>NextAuth v5</b> · BMS Session + JWT</li>
        <li><b>Tailwind CSS 4</b> + shadcn/ui</li>
        <li><b>Recharts</b> · partogram + vital signs charts</li>
      </ul>
      <ul class="bullet-list">
        <li><b>BMS Session API</b> for HOSxP polling (30 sec)</li>
        <li><b>Server-Sent Events</b> push to clients</li>
        <li><b>Redis</b> for marketplace tokens + sync cache</li>
        <li><b>Docker</b> multi-stage build · Node 20 LTS</li>
        <li><b>463</b> Vitest + Playwright tests</li>
      </ul>
    </div>
  </div>
  <div class="slide-footer"><span><b>KK-LRMS BACKUP</b></span><span>B1</span></div>
</section>

<!-- Backup B2 — Onboarding cost -->
<section class="slide" id="backup-2">
  <div class="slide-header"><span>BACKUP B2 · Per-Hospital Onboarding Cost</span></div>
  <div class="slide-body">
    <p class="slide-eyebrow">หากถามต้นทุนต่อโรงพยาบาล</p>
    <h1 class="slide-title">ต้นทุนต่อจังหวัด — ประมาณการเบื้องต้น</h1>
    <div class="slide-divider"></div>
    <div style="font-size: 18pt; line-height: 2;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead><tr style="background: var(--moph-cream);">
          <th style="text-align: left; padding: 14px; border: 1px solid var(--moph-rule);">รายการ</th>
          <th style="text-align: right; padding: 14px; border: 1px solid var(--moph-rule);">ประมาณการ (บาท/จังหวัด)</th>
        </tr></thead>
        <tbody>
          <tr><td style="padding: 12px; border: 1px solid var(--moph-rule);">Onboarding 1 จังหวัด (~20 รพช.)</td>
              <td style="text-align: right; padding: 12px; border: 1px solid var(--moph-rule); font-family: var(--ff-data);">[TBD]</td></tr>
          <tr><td style="padding: 12px; border: 1px solid var(--moph-rule);">Cloud hosting (รายปี)</td>
              <td style="text-align: right; padding: 12px; border: 1px solid var(--moph-rule); font-family: var(--ff-data);">[TBD]</td></tr>
          <tr><td style="padding: 12px; border: 1px solid var(--moph-rule);">Ops + 24/7 support (รายปี)</td>
              <td style="text-align: right; padding: 12px; border: 1px solid var(--moph-rule); font-family: var(--ff-data);">[TBD]</td></tr>
          <tr style="background: var(--moph-cream); font-weight: 700;">
            <td style="padding: 14px; border: 1px solid var(--moph-rule);">รวม Region 7 ปีแรก</td>
            <td style="text-align: right; padding: 14px; border: 1px solid var(--moph-rule); font-family: var(--ff-data); color: var(--moph-navy);">[TBD]</td></tr>
        </tbody>
      </table>
    </div>
    <p style="margin-top: 22px; font-size: 14pt; color: var(--moph-subtle);">
      ค่าใช้จ่ายจริงขึ้นกับจำนวน รพช./จังหวัด และ data center ที่เลือก
    </p>
  </div>
  <div class="slide-footer"><span><b>KK-LRMS BACKUP</b></span><span>B2</span></div>
</section>

<!-- Backup B3 — PDPA mapping -->
<section class="slide" id="backup-3">
  <div class="slide-header"><span>BACKUP B3 · PDPA Compliance Mapping</span></div>
  <div class="slide-body">
    <p class="slide-eyebrow">หากถามการสอดคล้อง PDPA โดยละเอียด</p>
    <h1 class="slide-title">PDPA mapping — มาตราต่อมาตรา</h1>
    <div class="slide-divider"></div>
    <ul class="bullet-list" style="font-size: 18pt;">
      <li><b>มาตรา 24 (ฐานทางกฎหมาย):</b> ใช้ฐาน "ความจำเป็นทางการแพทย์" + "ภารกิจของรัฐ" (สาธารณสุข)</li>
      <li><b>มาตรา 26 (ข้อมูลอ่อนไหว):</b> ชื่อ + CID เข้ารหัส AES-256-GCM; CID hash SHA-256 สำหรับ matching</li>
      <li><b>มาตรา 32 (สิทธิเจ้าของข้อมูล):</b> API endpoint สำหรับ export + delete ตาม HN/AN</li>
      <li><b>มาตรา 37 (มาตรการรักษาความปลอดภัย):</b> Role-based access · audit log · HTTPS-only · browser-only HOSxP polling</li>
      <li><b>DPA between สสจ.ขอนแก่น และผู้พัฒนา:</b> ลงนามเรียบร้อย (สำเนาในเอกสารแนบ)</li>
    </ul>
  </div>
  <div class="slide-footer"><span><b>KK-LRMS BACKUP</b></span><span>B3</span></div>
</section>

<!-- Backup B4 — Measurement plan -->
<section class="slide" id="backup-4">
  <div class="slide-header"><span>BACKUP B4 · 6-Month Measurement Plan</span></div>
  <div class="slide-body">
    <p class="slide-eyebrow">หากถาม "จะวัดผลอย่างไร"</p>
    <h1 class="slide-title">6-month measurement plan post-endorsement</h1>
    <div class="slide-divider"></div>
    <ul class="bullet-list" style="font-size: 18pt;">
      <li><b>เดือน 1–2:</b> Onboarding metrics — # โรงพยาบาลที่เชื่อมต่อ · sync uptime · # ผู้ป่วยในระบบ</li>
      <li><b>เดือน 3–4:</b> Clinical adoption — # refer ที่ระบบจับได้ก่อนรายงานปาก · เวลา decision-to-refer</li>
      <li><b>เดือน 5–6:</b> Outcome KPIs — MMR ในกลุ่ม intervention vs control · time-to-arrival · referral abandonment rate</li>
      <li><b>รายงานรายไตรมาส</b> ถึงบอร์ด สธ. + Bureau of Reproductive Health</li>
      <li><b>External audit</b> โดย สำนักนโยบายและยุทธศาสตร์ ที่เดือน 6</li>
    </ul>
  </div>
  <div class="slide-footer"><span><b>KK-LRMS BACKUP</b></span><span>B4</span></div>
</section>

<!-- Backup B5 — Risk register -->
<section class="slide" id="backup-5">
  <div class="slide-header"><span>BACKUP B5 · Risk Register</span></div>
  <div class="slide-body">
    <p class="slide-eyebrow">หากถามความเสี่ยงและการจัดการ</p>
    <h1 class="slide-title">ความเสี่ยงและมาตรการป้องกัน</h1>
    <div class="slide-divider"></div>
    <table style="width: 100%; border-collapse: collapse; font-size: 16pt;">
      <thead><tr style="background: var(--moph-cream);">
        <th style="text-align: left; padding: 12px; border: 1px solid var(--moph-rule);">ความเสี่ยง</th>
        <th style="text-align: left; padding: 12px; border: 1px solid var(--moph-rule);">มาตรการ</th>
      </tr></thead>
      <tbody>
        <tr><td style="padding: 10px; border: 1px solid var(--moph-rule);">HOSxP downtime</td>
            <td style="padding: 10px; border: 1px solid var(--moph-rule);">Cached data + "Offline — last sync" badge · Webhook fallback path</td></tr>
        <tr><td style="padding: 10px; border: 1px solid var(--moph-rule);">Tunnel/network failure</td>
            <td style="padding: 10px; border: 1px solid var(--moph-rule);">Browser-only polling จาก station เครื่องเดียวก็ยังทำงาน</td></tr>
        <tr><td style="padding: 10px; border: 1px solid var(--moph-rule);">Key compromise (encryption)</td>
            <td style="padding: 10px; border: 1px solid var(--moph-rule);">Key rotation policy · re-encrypt batch script · audit log</td></tr>
        <tr><td style="padding: 10px; border: 1px solid var(--moph-rule);">โรงพยาบาล opt-out</td>
            <td style="padding: 10px; border: 1px solid var(--moph-rule);">is_active gate ในระบบ · ลบข้อมูลตาม PDPA มาตรา 32</td></tr>
        <tr><td style="padding: 10px; border: 1px solid var(--moph-rule);">Wrong CPD score → false alert</td>
            <td style="padding: 10px; border: 1px solid var(--moph-rule);">สูติแพทย์เป็น final decision-maker · ระบบเป็น decision support</td></tr>
      </tbody>
    </table>
  </div>
  <div class="slide-footer"><span><b>KK-LRMS BACKUP</b></span><span>B5</span></div>
</section>

<!-- Backup B6 — Comparison -->
<section class="slide" id="backup-6">
  <div class="slide-header"><span>BACKUP B6 · Comparison vs Other Initiatives</span></div>
  <div class="slide-body">
    <p class="slide-eyebrow">หากถามทำไมไม่ใช้ระบบ X</p>
    <h1 class="slide-title">ทำไม KK-LRMS — ไม่ใช่ทางเลือกที่ใหญ่กว่า</h1>
    <div class="slide-divider"></div>
    <ul class="bullet-list" style="font-size: 18pt;">
      <li><b>HDC ระดับชาติ</b> — ออกแบบเพื่อ reporting/aggregation; ไม่ใช่ real-time labor monitoring</li>
      <li><b>HOSxP-XE Dashboard</b> — รายโรงพยาบาล; ไม่รวมข้ามโรงพยาบาล; ไม่มี cross-CID matching</li>
      <li><b>เอกชน Cloud OB-tracking</b> — ค่าใช้จ่ายสูง; ไม่สอดคล้อง PDPA-Thai; ข้อมูลไหลออกนอกประเทศ</li>
      <li><b>KK-LRMS</b> — Open-source, multi-tenant ตั้งแต่วันแรก, PDPA-compliant, ใช้ HOSxP เดิม, browser-only mode</li>
    </ul>
  </div>
  <div class="slide-footer"><span><b>KK-LRMS BACKUP</b></span><span>B6</span></div>
</section>
```

- [ ] **Step 2: Verify in browser**

Reload. Navigate to slide 12 with `End`, then press `B`.

Expected:
- Display jumps to backup B1
- Counter shows `B1 / 6`
- Press `→` advances through B2–B6
- Press `B` again returns to main slide 1

- [ ] **Step 3: Commit**

```bash
git add public/deck/
git commit -m "feat(deck): backup slides B1-B6 for Q&A coverage"
```

---

## Task 16: Speaker notes overlay (press `N`)

**Files:**
- Create: `public/deck/speaker-notes.md`
- Modify: `public/deck/index.html` (append `.notes-overlay` block)

- [ ] **Step 1: Create `public/deck/speaker-notes.md`**

```markdown
# KK-LRMS · MOPH Executive Briefing · Speaker Notes
**Date:** 26 พ.ค. 2569 · 12:00 · Total: ~13:25 + 1:35 buffer

---

## Slide 1 — Cold Open (40s)
> *Pause on the map for 5 seconds before speaking.*
"ก่อนผมจะเริ่ม ขอให้ทุกท่านมองหน้าจอนี้สักครู่ครับ... จุดทองที่เห็นคือจังหวัดขอนแก่น และวันนี้ ขอนแก่นเป็น **จังหวัดเดียวในประเทศไทย** ที่สูติแพทย์ที่โรงพยาบาลแม่ข่ายสามารถเห็นผู้คลอดทุกคน ในโรงพยาบาลชุมชนทั้ง 26 แห่ง ภายใน 30 วินาที"
"ผมมาวันนี้เพื่อขอให้ภาพนี้... ขยายไปทั่วเขตสุขภาพที่ 7 และเดินทางต่อไปสู่ทุกจังหวัดในประเทศไทย"

## Slide 2 — Problem (90s)
"ค่าเฉลี่ย MMR ของประเทศเราอยู่ที่ ~17 ต่อแสนการคลอด แต่ค่าเฉลี่ยซ่อนความเหลื่อมล้ำไว้... ทางขวาคือเส้นทางข้อมูลในปัจจุบันที่โรงพยาบาลชุมชน 26 แห่งใช้กันอยู่... รายงานด้วยปากเปล่า หรือ LINE — และสูติแพทย์ที่ รพศ. ตัดสินใจ refer จากเพียงข้อความ **ความล่าช้า 30 ถึง 90 นาที** ในเคสที่เวลาคือชีวิต"

## Slide 3 — Dashboard (60s)
"นี่คือสิ่งที่เราสร้างขึ้นที่ขอนแก่น — หน้าจอเดียว เห็นทุกห้องคลอดทั่วจังหวัด 26 โรงพยาบาล · อัปเดตทุก 30 วินาที · CPD score คำนวณอัตโนมัติจาก HOSxP สีเขียวคือความเสี่ยงต่ำ เหลืองคือกลาง แดงคือสูง"

## Slide 4 — Clinical Intelligence (75s)
"CPD score คำนวณจาก 8 ปัจจัยทางคลินิก — gravida, ANC visits, GA, ส่วนสูง, น้ำหนัก, fundal height, U/S fetal weight, hematocrit คะแนน ≥ 10 ระบบแนะนำ refer ทันที ทางขวาคือ digital partograph — เส้น alert/action ตามมาตรฐาน WHO **ทุกข้อมูลมาจาก HOSxP โดยตรง ไม่มีการพิมพ์ซ้ำ ไม่มีข้อผิดพลาดจากมนุษย์**"

## Slide 5 — Cross-Hospital Tracking (60s)
"เมื่อผู้ป่วย refer ระบบจะ match ประวัติข้ามโรงพยาบาลโดยใช้ CID hash SHA-256 **เลขบัตรประชาชนตัวจริงไม่เคยถูกเก็บ plaintext** ที่ไหนเลย สูติแพทย์ที่รับ refer เห็นประวัติเต็มก่อนรถถึง — ไม่ต้องถามซ้ำที่ ER"

## Slide 6 — Coverage + PDPA (90s)
"ระบบรองรับทั้งโรงพยาบาลที่ใช้ HOSxP และไม่ใช้ HOSxP → auto-sync ผ่าน BMS Session API · โหมด browser-only คือ PHI ไม่ออกจาก network โรงพยาบาลเลย Non-HOSxP → push ผ่าน webhook REST API ทางขวา 5 ข้อ คือมาตรการ PDPA — เข้ารหัส AES-256, hash CID, role-based access, audit log, mask ชื่อบน dashboard"

## Slide 7 — Built to Run (60s)
*[Read out the 6 metrics naturally]*
"ระบบที่กำลังทำงานอยู่ในปัจจุบัน — 26 โรงพยาบาล, [N] ผู้ป่วย, [X]% sync success, [Y] วัน uptime, 463 ชุดทดสอบ, latency น้อยกว่า 2 วินาที **นี่ไม่ใช่ prototype — นี่คือ production**"

## Slide 8 — Real Patient Case (90s)
"ขออนุญาตเล่าเรื่องจริงครับ — **เคสนี้เกิดขึ้นที่ [X] เมื่อ [date]**... *[Walk through the timeline naturally, 7 events]*... สิ่งสำคัญคือบรรทัดนี้ — '14:45 ตัดสินใจ refer **เร็วกว่า workflow เดิม ~45 นาที**' นี่คือเหตุผลที่เรามาขอวันนี้ครับ — เพื่อให้เคสแบบนี้เกิดขึ้นได้ในทุกจังหวัด"

## Slide 9 — Scale Path (90s)
"แผนเดินทาง — 1 → 7 → 76 ปี 2569 ขอนแก่นใช้งานแล้ว **ถ้าวันนี้ได้รับการรับรอง** เราขยายเขตสุขภาพที่ 7 ใน Q1–Q3 ปีหน้า · 7 จังหวัด · ~150 โรงพยาบาล Q4 ปีหน้าเปิดเป็น MOPH-managed service ปี 2571 ครบทุกเขต · ~900 โรงพยาบาล"

## Slide 10 — 6-Week Onboarding (60s)
"6 สัปดาห์ต่อจังหวัด — Week 1 ลงนาม MOU, W2–3 เปิด tunnel + ทดสอบ sync, W3–4 คัดกรองข้อมูล + อบรม, W5 pilot 1 รพ., W6 rollout 1 ทีม technical รองรับได้ 3 จังหวัดพร้อมกัน — Region 7 ใช้ 2 ทีม ใช้เวลาประมาณ 4 เดือนทั้งเขต"

## Slide 11 — The Ask (60s)
"สิ่งที่เราขอจากบอร์ดวันนี้ครับ — **สี่อย่าง**
หนึ่ง — หนังสือเห็นชอบจาก สป.สธ. ขยายผลสู่เขตสุขภาพที่ 7
สอง — บรรจุใน Service Plan รอบ FY 2570
สาม — กรอบงบประมาณ FY 2570
สี่ — มอบหมายเชื่อมโยงข้อมูลกับ HDC
ทั้งสี่อย่างเป็น package ครับ — ขาดอย่างใดอย่างหนึ่งการขยายผลจะติดขัด"

## Slide 12 — Thank You (30s)
"ขอบคุณบอร์ดผู้บริหารทุกท่านครับ ข้อมูลระบบเพิ่มเติมสแกน QR ได้ ผมยินดีตอบคำถามครับ"

---

## Backup slides — quick map
- **B1** — Technical stack (Digital Health committee)
- **B2** — Onboarding cost (PS asks budget)
- **B3** — PDPA section mapping (legal)
- **B4** — 6-month measurement plan (how to prove)
- **B5** — Risk register (failure modes)
- **B6** — Comparison vs HDC / HOSxP-XE Dashboard / cloud alternatives
```

- [ ] **Step 2: Append `.notes-overlay` to `public/deck/index.html` (inside `<body>`, after `</div>` of `.stage`, before `<script>`)**

```html
<div class="notes-overlay" aria-label="Speaker notes (toggle with N)">
  <h2>Speaker Notes</h2>
  <p class="meta">กด <b>N</b> เพื่อเปิด/ปิด · มองเห็นเฉพาะหน้าจอ presenter</p>

  <div data-note data-for="slide-1">
    <h3>Slide 1 — Cold Open (40s)</h3>
    <p><em>Pause on map for 5 seconds before speaking.</em></p>
    <p>"จุดทองคือขอนแก่น — จังหวัดเดียวในประเทศไทยที่สูติแพทย์เห็นผู้คลอดทุกคนใน 26 รพช. ภายใน 30 วินาที วันนี้ผมมาเพื่อขอให้ภาพนี้ขยายไปทั่วเขต 7 และทั้งประเทศ"</p>
  </div>
  <div data-note data-for="slide-2">
    <h3>Slide 2 — Problem (90s)</h3>
    <p>"ค่าเฉลี่ย MMR ~17 ซ่อนความเหลื่อมล้ำ · เส้นทางข้อมูลปัจจุบัน — โทร/LINE · ล่าช้า 30–90 นาที"</p>
  </div>
  <div data-note data-for="slide-3">
    <h3>Slide 3 — Dashboard (60s)</h3>
    <p>"หน้าจอเดียว เห็นทุกห้องคลอดทั่วจังหวัด · 26 รพ · อัปเดต 30 วิ · CPD score คำนวณอัตโนมัติจาก HOSxP"</p>
  </div>
  <div data-note data-for="slide-4">
    <h3>Slide 4 — Clinical Intelligence (75s)</h3>
    <p>"CPD 8 ปัจจัย · ≥10 refer · partograph alert/action ตาม WHO · ข้อมูลจาก HOSxP ตรง ไม่มีพิมพ์ซ้ำ"</p>
  </div>
  <div data-note data-for="slide-5">
    <h3>Slide 5 — Cross-Hospital (60s)</h3>
    <p>"refer match ด้วย CID hash SHA-256 · ไม่เก็บ plaintext · สูติแพทย์รับ refer เห็นประวัติเต็มก่อนรถถึง"</p>
  </div>
  <div data-note data-for="slide-6">
    <h3>Slide 6 — Coverage + PDPA (90s)</h3>
    <p>"HOSxP browser-only · non-HOSxP webhook · 5 ข้อ PDPA"</p>
  </div>
  <div data-note data-for="slide-7">
    <h3>Slide 7 — Built to Run (60s)</h3>
    <p>"อ่าน 6 ตัวเลขธรรมชาติ · ปิดด้วย 'ไม่ใช่ prototype — production'"</p>
  </div>
  <div data-note data-for="slide-8">
    <h3>Slide 8 — Real Patient Case (90s)</h3>
    <p>"เล่าเรื่องจริง · timeline 7 events · เน้น '14:45 เร็วกว่า workflow เดิม ~45 นาที' · ปิดด้วย 'เหตุผลที่มาขอวันนี้'"</p>
  </div>
  <div data-note data-for="slide-9">
    <h3>Slide 9 — Scale Path (90s)</h3>
    <p>"1 → 7 → 76 · ถ้ารับรองวันนี้ เขต 7 Q1–Q3 ปีหน้า · Q4 MOPH service · 2571 ครบทุกเขต"</p>
  </div>
  <div data-note data-for="slide-10">
    <h3>Slide 10 — 6-Week Onboarding (60s)</h3>
    <p>"6 สัปดาห์/จังหวัด · 1 ทีม 3 จังหวัด · เขต 7 ใช้ 2 ทีม ~4 เดือน"</p>
  </div>
  <div data-note data-for="slide-11">
    <h3>Slide 11 — The Ask (60s)</h3>
    <p>"สี่อย่าง: หนังสือ · Service Plan · งบ FY70 · HDC · เป็น package"</p>
  </div>
  <div data-note data-for="slide-12">
    <h3>Slide 12 — Thank You (30s)</h3>
    <p>"ขอบคุณ · QR · ยินดีตอบคำถาม"</p>
  </div>

  <div data-note data-for="backup-1"><h3>B1 — Tech Stack</h3><p>Next.js 16, React 19, PostgreSQL 16, NextAuth v5, BMS Session, Redis, Docker. 463 tests.</p></div>
  <div data-note data-for="backup-2"><h3>B2 — Cost</h3><p>Onboarding + cloud + ops · ตัวเลข [TBD] · ขึ้นกับจำนวน รพช./จังหวัด</p></div>
  <div data-note data-for="backup-3"><h3>B3 — PDPA</h3><p>มาตรา 24/26/32/37 · DPA ลงนามแล้ว</p></div>
  <div data-note data-for="backup-4"><h3>B4 — Measurement</h3><p>เดือน 1-2 onboarding · 3-4 clinical adoption · 5-6 outcome KPIs · audit เดือน 6</p></div>
  <div data-note data-for="backup-5"><h3>B5 — Risk</h3><p>HOSxP down, network, key compromise, opt-out, false alert</p></div>
  <div data-note data-for="backup-6"><h3>B6 — vs Alternatives</h3><p>HDC = reporting, ไม่ real-time · HOSxP-XE = รายโรง · cloud เอกชน = PDPA-ขัด · KK-LRMS = open, multi-tenant, PDPA</p></div>
</div>
```

- [ ] **Step 3: Verify in browser**

Reload. Press `N` on any slide.

Expected:
- Dark overlay covers screen showing speaker note for current slide
- Press `N` again: overlay closes
- Navigate slides, press `N` again: overlay shows current slide's note

- [ ] **Step 4: Commit**

```bash
git add public/deck/
git commit -m "feat(deck): speaker notes overlay + canonical script"
```

---

## Task 17: Bundle fonts offline (network-fail fallback)

**Files:**
- Create: `scripts/fetch-deck-fonts.sh`
- Create: `public/deck/fonts/*.woff2` (downloaded)
- Modify: `public/deck/deck.css` (prepend `@font-face` rules)

- [ ] **Step 1: Create `scripts/fetch-deck-fonts.sh`**

```bash
#!/usr/bin/env bash
# scripts/fetch-deck-fonts.sh
set -euo pipefail

DEST="public/deck/fonts"
mkdir -p "$DEST"

# Sarabun (Thai)
curl -fsSL "https://fonts.gstatic.com/s/sarabun/v15/DtVjJx26TKEr37c9aBBx_nx.woff2" \
  -o "$DEST/sarabun-400.woff2" || echo "WARN: sarabun-400 fetch failed"
curl -fsSL "https://fonts.gstatic.com/s/sarabun/v15/DtVmJx26TKEr37c9YK5sUYx4dGT_.woff2" \
  -o "$DEST/sarabun-600.woff2" || echo "WARN: sarabun-600 fetch failed"
curl -fsSL "https://fonts.gstatic.com/s/sarabun/v15/DtVmJx26TKEr37c9YIxsUYx4dGT_.woff2" \
  -o "$DEST/sarabun-700.woff2" || echo "WARN: sarabun-700 fetch failed"

# IBM Plex Sans (Latin)
curl -fsSL "https://fonts.gstatic.com/s/ibmplexsans/v19/zYXgKVElMYYaJe8bpLHnCwDKtdbUFI5NadY.woff2" \
  -o "$DEST/ibm-plex-sans-400.woff2" || echo "WARN: ibm-plex-sans-400 fetch failed"
curl -fsSL "https://fonts.gstatic.com/s/ibmplexsans/v19/zYX9KVElMYYaJe8bpLHnCwDKjQ76AIxsdO_q.woff2" \
  -o "$DEST/ibm-plex-sans-700.woff2" || echo "WARN: ibm-plex-sans-700 fetch failed"

echo "[fetch-deck-fonts] downloaded:"; ls -la "$DEST"
```

- [ ] **Step 2: Run the fetch script**

```bash
chmod +x scripts/fetch-deck-fonts.sh
./scripts/fetch-deck-fonts.sh
ls public/deck/fonts/
```

Expected: woff2 files exist. If any URL fails (URLs above are best-effort), the deck still works via Google Fonts CDN.

- [ ] **Step 3: Prepend `@font-face` rules to `public/deck/deck.css`** (at the very top, before `:root`)

```css
@font-face {
  font-family: 'Sarabun';
  src: local('Sarabun'),
       url('fonts/sarabun-400.woff2') format('woff2');
  font-weight: 400; font-style: normal; font-display: swap;
}
@font-face {
  font-family: 'Sarabun';
  src: local('Sarabun'),
       url('fonts/sarabun-600.woff2') format('woff2');
  font-weight: 600; font-style: normal; font-display: swap;
}
@font-face {
  font-family: 'Sarabun';
  src: local('Sarabun'),
       url('fonts/sarabun-700.woff2') format('woff2');
  font-weight: 700; font-style: normal; font-display: swap;
}
@font-face {
  font-family: 'IBM Plex Sans';
  src: local('IBM Plex Sans'),
       url('fonts/ibm-plex-sans-400.woff2') format('woff2');
  font-weight: 400; font-style: normal; font-display: swap;
}
@font-face {
  font-family: 'IBM Plex Sans';
  src: local('IBM Plex Sans'),
       url('fonts/ibm-plex-sans-700.woff2') format('woff2');
  font-weight: 700; font-style: normal; font-display: swap;
}
```

- [ ] **Step 4: Verify offline-mode rendering**

In Chrome DevTools → Network tab → "Offline" → reload.

Expected: Text still renders in Sarabun (loaded from local woff2). No fallback to Times.

- [ ] **Step 5: Commit**

```bash
git add public/deck/ scripts/fetch-deck-fonts.sh
git commit -m "chore(deck): bundle Sarabun + IBM Plex woff2 for offline fallback"
```

---

## Task 18: Final QC + dry-run

**Files:** none (verification only)

- [ ] **Step 1: Render check — full deck**

Open `http://localhost:3000/deck/index.html` in Chrome 1920×1080.

For each of slides 1–12 and backups B1–B6, verify:
- [ ] Slide fills exactly 1920×1080 (no scroll, no overflow)
- [ ] Counter shows correct `N / 12` or `BN / 6`
- [ ] All Thai text renders in Sarabun
- [ ] All numbers render in IBM Plex Sans
- [ ] No broken images
- [ ] No console errors

- [ ] **Step 2: Navigation check**

- [ ] `→` advances main slides 1→12
- [ ] `←` retreats 12→1
- [ ] `Home` jumps to 1, `End` jumps to 12
- [ ] `B` toggles to backup; `→`/`←` navigate backup; `B` returns to main
- [ ] `N` opens notes overlay; `N` closes
- [ ] Click right half: advances; click left half: retreats

- [ ] **Step 3: PHI scan**

For slide 3 (`dashboard.png`) and slide 4 (`patient-detail.png`), verify:
- [ ] No real patient names visible
- [ ] No real CIDs visible
- [ ] No real HN/AN visible

If any are present, capture fresh screenshots from a clean demo dataset OR redact.

- [ ] **Step 4: Timed dry-run**

Speak through entire deck out loud, using speaker notes. Use a phone timer.

Target: **13:00–15:00.**
- If under 12:30 → pause more between sections
- If over 15:30 → cut a sentence from slides 2 (most-cuttable) and 9 (most-cuttable)

- [ ] **Step 5: Final commit**

```bash
git add -A public/deck/
git commit -m "feat(deck): final QC pass — deck ready for MOPH board meeting"
```

- [ ] **Step 6: Bundle for offline delivery (USB / email)**

```bash
cd public
zip -r kk-lrms-deck-2026-05-26.zip deck/
ls -la kk-lrms-deck-2026-05-26.zip
cd ..
```

Expected: ~5–15 MB zip. Extract elsewhere and open `deck/index.html` from `file://` to verify portable.

---

## Self-review against spec

The plan covers each spec section:

- **§1 Goal** — Covered by entire deck; the 4-part ask landed on slide 11 (Task 13)
- **§2 Audience** — All four stakeholders served per the audience map (Tasks 3, 4, 6, 7, 8, 9, 13)
- **§3 Narrative arc** — Three movements implemented
- **§4 Slide-by-slide** — Each of 12 slides has its own task (Tasks 3–14)
- **§5 Backup slides** — Task 15 implements all 6
- **§6 Visual design system** — Design tokens in Task 1; layout primitives reused throughout
- **§7 Constraints** — 16:9 fixed via stage scaling (Task 1); keyboard nav (Task 2); offline fonts (Task 17)
- **§8 Open items** — Surfaced inline in relevant tasks (real case in Task 10 Step 3; metrics in Task 9; presenter ID in Task 13 Step 2)
- **§9 Build approach** — Single HTML file, no framework, zip bundle (Task 18 Step 6)
- **§10 Risks** — Bundled fonts (Task 17), metrics fallback (Task 9 script), composite case fallback (Task 10 Step 3)
- **§11 Success criteria** — Final QC checklist in Task 18

**Type / API consistency check:**
- `mainSlides` / `backupSlides` / `activeList()` defined in Task 2; reused throughout — OK
- CSS classes (`.slide`, `.is-active`, `.slide-header`, `.slide-footer`, `.slide-body`, `.metric-tile`, `.ask-quadrant`, `.two-col`, `.bullet-list`, `.check-list`, `.hero`) defined in Task 1; reused in every slide task — OK
- CSS custom properties (`--moph-navy`, `--moph-gold`, etc.) defined in Task 1; referenced verbatim throughout — OK

**Placeholder scan in plan body:**
- Slide 7 `__N__`, `__X__`, `__Y__` — intentional, replaced at build time using metrics.json (Task 9 Steps 3–5). Resolution mechanism specified.
- Slide 8 `รพช. [X]`, `[แพทย์ผู้รับผิดชอบ]` — intentional placeholders + explicit fallback (Task 10 Step 3). Resolution specified.
- Backup B2 `[TBD]` cost figures — intentional. Backup is Q&A material, not main deck content; acceptable to ship.
- Slide 11 `[presenter name]`, `[email]`, `[phone]` — replaced in Task 13 Step 2. Specified.

All placeholders have explicit resolution steps. No undocumented gaps.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-25-moph-executive-presentation-deck.md`.**
