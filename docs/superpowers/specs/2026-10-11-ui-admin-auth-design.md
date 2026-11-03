# Admin, Profile, Login, About — Design Spec (Sub-project 5 of 5)

Date: 2026-10-11 · Status: draft for review · Owner: Chaiyaporn Suratemeekul · Slug: `admin-auth`

## Context

Sub-project 1 shipped the foundation:
- direction-C tokens (`src/config/design-tokens.ts`);
- the Thai type scale with a 13px floor;
- shared blocks (`PageHeader`, `SectionCard`, `KpiTile`, `KpiGrid`, `HintButton`, `DataTable`, `EmptyState`, `RiskChip`, `FreshnessBadge`, `ErrorState`, `LoadingState`);
- the sidebar `AppShell`;
- the `no-adhoc-design-values` lint guard.

Sub-project 2 rebuilt `/` on top of it. This spec covers the remaining four surfaces:

| Route | Files today | Audience |
|---|---|---|
| `/login` | `src/app/(auth)/login/page.tsx` (518 lines) | everyone, first impression |
| `/about` | `src/app/about/page.tsx` (1,100 lines, public) | public, IT staff of non-HOSxP hospitals |
| `/profile` | `src/app/(hospital)/profile/page.tsx`, `src/components/profile/NotificationPreferenceCard.tsx` | ward nurses |
| `/admin` | `src/app/(provincial)/admin/page.tsx` plus 11 files in `src/components/admin/` (5,327 lines), and `src/components/dashboard/SimulationControl.tsx` | สสจ. administrators |

Foundation spec: `docs/superpowers/specs/2026-10-11-ui-foundation-design.md`. Dashboard spec: `docs/superpowers/specs/2026-10-11-ui-dashboard-design.md`.

### What is wrong today (measured 2026-10-11)

| # | Problem | Evidence |
|---|---|---|
| B1 | **HospitalsTab table renders one cell per line** | `grid-cols-[90px,1fr,70px,…]` compiles to `grid-template-columns:90px,1fr,…` (verified in `.next/static/chunks/*.css`). Commas are invalid there in Tailwind 4, so the declaration is dropped. The same applies to `ActiveProvinceTab`'s `grid-cols-[1fr,auto]` |
| B2 | `/admin` overflows at 1024 and 768 | The page sets `zoom: 1.15` and a fixed `minmax(520px,1fr) minmax(420px,1fr)` grid (≥ 940px before zoom), while the content box is 792px at 1024 |
| B3 | Contrast failures in admin | Status text in `var(--risk-low)` (#3F8F4F) and `var(--risk-high)` on white is about 4.0:1, below AA (`BmsConfigTab`, `WebhookKeysTab`, `HospitalsTab`). `SimulationControl`'s header is white on `COLOR.riskMedium`, about 2.9:1 |
| B4 | Undefined CSS variables | `var(--rule-subtle)` (`OnlineUsersTab`) and `var(--rule)` (`MophAlertsTab`) do not exist, so their row borders disappear |
| B5 | Silent or blocking admin errors | `HospitalsTab` delete and clear-purge failures use `alert()`. Messages such as "ลบไม่สำเร็จ" say what failed but not what to do |
| — | Old visual language | Login and about use a dark slate "Dark Authority" palette. Admin uses the retired navy ATC look: mono uppercase English eyebrows ("REGISTERED HOSPITALS", "OUTCOME", "FILTER"), legacy alias variables (`--ink-navy*`, `--rule-*`, `--accent-navy*`, `--surface-cool`; 401 uses across 13 files), and square bordered panels |
| — | Duplicated logic | The sync-outcome badge palette is defined twice (`SyncOverviewTab.outcomeStyle`, `HospitalEditDialog.outcomeTone`), and so is the relative-time formatter (`formatRelative` ×2, `ageLabel`). The presence TTL `120s` is a literal in the UI and a private constant in `src/lib/presence.ts` |
| — | Hardcoded facts on public pages | "26 โรงพยาบาลในเครือข่าย" (login, about) and "8 ปัจจัยเสี่ยง" (about) are literals. `KK_HOSPITALS.length` is 26 and `CPD_FACTOR_WEIGHTS` has 8 keys |
| — | Inaccurate PDPA copy (about) | It claims "ไม่แสดงชื่อผู้คลอด — แสดงเฉพาะเลข AN และ HN", but every list shows `maskName` output ("ชัยพร ส."). It also claims login is "BMS Session ID" only, but ProviderID read-only login exists |
| — | Allowlist debt | `about/page.tsx`, `HospitalsTab.tsx`, `HospitalEditDialog.tsx` and `SimulationControl.tsx` are allowlisted in `eslint-rules/design-allowlist.json` |

## Decisions

### Binding (user)

- Direction C "Warm Public Health" tokens.
- Ward nurses first: legibility over density.
- Left sidebar shell.
- 13px floor outside kiosk.
- Illustrations enabled.
- The **approved login mockup** (`.superpowers/brainstorm/1437805-1791700719/content/assets-in-context.html`, "หน้าเข้าสู่ระบบ — LOGIN"):
  - two columns: form left, hero image right;
  - brand row, a two-line Thai title and one lead sentence;
  - primary "เข้าสู่ระบบด้วย BMS (HOSxP)" and secondary "เข้าสู่ระบบด้วย ProviderID";
  - a PDPA note.

  Keep it calm and clear.
- `about-header.webp` is decorative and must never be presented as Khon Kaen geography.

### Binding (controller, this sub-project)

1. **Security behaviour is identical.** This covers:
   - the login preflight → `signIn` → cookie flow;
   - ProviderID redirect and error mapping (IdP text is never the headline);
   - `/admin` gates (middleware + `isAdminAuthorized`, untouched);
   - CSRF (every admin `fetch` keeps its URL, method, `Content-Type: application/json` and body);
   - PDPA masking (`maskName` / `maskCid` on profile, `MophAlertsTab`'s `********1234`);
   - the typed confirmations (purge `hcode`, revoke key prefix, `confirm()` before delete and clear-purge);
   - the one-time API-key reveal.

   Characterization tests pin these before any restyle.
2. Pages adopt `PageHeader` / `SectionCard` / `DataTable` / `EmptyState` / `ErrorState`. Messages are actionable Thai: what happened · since when (when known) · what to do.
3. No behaviour or data changes except the documented bugs B1–B5 and the copy fixes listed under deviations.
4. TDD per task. Gates: full suite, `tsc --noEmit`, `npm run lint` (0 problems), `npm run build`, and a synthetic visual run at the end.

### Deviations (decided while designing, with reasons)

| # | Deviation | Reason |
|---|---|---|
| D1 | The login keeps the Session-ID field above the BMS button | The mockup shows two buttons only, but BMS login *is* the session ID (HOSxP launches with `?bms-session-id=` and auto-logs-in; manual entry is the fallback). The field stays (`input#sessionId`, used by E2E) with helper text, and the submit button carries the mockup's label "เข้าสู่ระบบด้วย BMS (HOSxP)" |
| D2 | The login's four marketing bullets and "v1.0.0" are dropped | The approved mockup has none, and "26 โรงพยาบาล" was a literal |
| D3 | About PDPA bullets are corrected (two sentences) | The page states the opposite of what the app does. The copy now describes `maskName` / `maskCid` and the ProviderID read-only login. **Owner to confirm the wording** (Review Focus) |
| D4 | About stat tiles become one neutral tone (`brand-soft`) | The amber/rose/blue tiles were categorical colour with no meaning (ruling R19). This removes the `about/page.tsx` allowlist entry. Counts come from `KK_HOSPITALS.length` and `Object.keys(CPD_FACTOR_WEIGHTS).length`. These are static facts, not KPI aggregates, so they render in a local `FactTile`, not `KpiTile` |
| D5 | `HospitalEditDialog` (2,210 lines) gets a token + Thai-label pass, not a split | Splitting is a refactor with no user-visible gain, and it would multiply review risk on the most security-dense admin file (purge, keys, CIDs). Its inner lists (consult doctors, keys, step log) stay as they are, restyled, and do not become `DataTable` |
| D6 | Connection-status codes (`ONLINE`, `CONNECTED`, `ERROR`…) and server error strings stay verbatim in admin | IT staff match them against logs and API responses, as in dashboard D8/D9. Surrounding labels become Thai |
| D7 | `SimulationControl`'s copy stays English | It is a dev-only tool behind `DEV_SIMULATION_ENABLED`. Only tokens, contrast (B3) and the hex change |
| D8 | `MophAlertsTab`'s local `maskCid` (`********1234`) is kept, not swapped for `@/lib/pii-mask` (`3XXXXXXXX2121`) | Its output would change: `pii-mask` reveals the first digit too. PDPA masking must stay identical, so swapping it is a follow-up for the owner |
| D9 | Admin KPI tiles count complete, unpaginated admin lists (`/api/admin/webhooks`, `/api/admin/hospitals`) | These routes have no `LIMIT`, so the count is exact, not row-limited (count-provenance rule). Online users use the server `total` |
| D10 | `SectionCard` gains an optional `id` | `/about` needs anchor targets for its table of contents. The change is additive and backward-compatible |
| D11 | `DataTable` row clicks ignore clicks from nested interactive elements | Required by the brief before adopting clickable rows (`SyncOverviewTab`). A click on a button, link, input, select, textarea or label inside a row no longer also fires `onRowClick` |
| D12 | Admin tabs become a Base UI `Tabs` (`src/components/ui/tabs.tsx`) | Today they are buttons with no tablist semantics. Base UI already unmounts inactive panels, so each tab still fetches only when opened |
| D13 | `/admin` drops `zoom: 1.15` | The type scale is now legible at 1.0, and zoom distorted Leaflet hit-testing and caused B2. The two-column layout keys on content width (`@container`, ≥ 1160px), like `/` (dashboard D6) |

## Component map

| File | Responsibility |
|---|---|
| `src/components/shared/SectionCard.tsx` | + optional `id` (D10) |
| `src/components/shared/DataTable.tsx` | Row click ignores nested interactive targets (D11) |
| `src/components/shared/InlineNotice.tsx` | **New.** Success/info line (`role="status"`, tone `ok` / `info`); failures use `ErrorState variant="banner"` |
| `src/lib/action-failure.ts` | **New.** `actionFailure(actionTh, detail?, remedy?)` → `{ message, remedy }`; one Thai remedy wording for admin + profile |
| `src/config/illustrations.ts` | + `HERO_ILLUSTRATION_SRC` (`loginHero`, `aboutHeader`) under the same kill switch |
| `src/lib/provider-login-error.ts` | **New.** `mapProviderError` moved verbatim out of the login page |
| `src/components/auth/{LoginHero,AccessDeniedNotice,HosxpVersionDialog}.tsx` | **New.** Login building blocks |
| `src/components/about/{AboutHeader,about-blocks,WebhookApiSection}.tsx` | **New.** Decorative header; `FactTile`/`StepItem`/`FeatureCard`/`HospitalLevelRow`/`CodeBlock`/`EndpointBadge`; webhook docs moved out of the page |
| `src/components/admin/admin-ui.tsx` | **New.** `StatusPill`, `Field`, `toneClasses` shared by every admin tab |
| `src/config/sync-run-status.ts` | **New.** Outcome/trigger/step → Thai label + tone (one source for `SyncOverviewTab` + `HospitalEditDialog`) |
| `src/config/presence.ts` | **New.** `PRESENCE_TTL_SECONDS`, `ONLINE_USERS_POLL_MS` (client-safe; `src/lib/presence.ts` imports it) |
| Pages and tabs | Restyled in place as described below |

## Per-surface design

### `/login` — direction-C hero (approved)

```
┌──────────── form column (1fr) ────────────┬──────── hero column (1.15fr, ≥ md) ────────┐
│ (K) KK-LRMS                                │                                             │
│ ระบบติดตามการคลอด                            │   login-hero.webp, object-cover,            │
│ จังหวัดขอนแก่น                     (h1)      │   on surface-muted; alt="" (decorative)     │
│ เห็นผู้คลอดทุกโรงพยาบาลในจังหวัดแบบเรียลไทม์   │                                             │
│ ประเมินความเสี่ยง CPD และประสานส่งต่อได้ทันที    │                                             │
│ [status: กำลังเข้าสู่ระบบจาก HOSxP…]          │                                             │
│ BMS Session ID  [______________]           │                                             │
│ เปิด KK-LRMS จากเมนูใน HOSxP ระบบจะกรอกให้อัตโนมัติ │                                          │
│ [errors / access-denied notice]            │                                             │
│ [■ เข้าสู่ระบบด้วย BMS (HOSxP)        ]      │                                             │
│ ───────────── หรือ ─────────────            │                                             │
│ [□ เข้าสู่ระบบด้วย ProviderID         ]      │                                             │
│ สิทธิ์อ่านอย่างเดียว — ดูข้อมูลได้ แก้ไขไม่ได้      │                                             │
│ 🛡 ข้อมูลผู้ป่วยได้รับการเข้ารหัสตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA) │                                │
│ เกี่ยวกับระบบ KK-LRMS · สำนักงานสาธารณสุขจังหวัดขอนแก่น │                                         │
└────────────────────────────────────────────┴─────────────────────────────────────────────┘
< md (864px): one column, no hero; the brand row and title head the form.
```

- **Page:** `bg-surface-page`. The form column has max width 28rem and is centred vertically.
  - The logo is a 40px `bg-brand` circle with "K".
  - The title is `text-page text-brand`.
  - The lead is `text-body text-ink-muted`.
- **Buttons:**
  - Primary: `bg-brand hover:bg-brand-strong text-white h-12 rounded-xl`.
  - Secondary: `bg-surface-card border border-brand/30 text-brand`.
  - Loading: the `Loader2` spin icon and "กำลังตรวจสอบ…".
- **Errors** keep their copy, restyled on danger tokens:
  - access denied (`AccessDeniedNotice`, not-registered vs deactivated);
  - preflight / network / empty-field errors;
  - mapped ProviderID errors, with the raw code only as small detail.
- **`HosxpVersionDialog`:** the same content, on tokens (no slate).
- **Kill switch:** `NEXT_PUBLIC_ILLUSTRATIONS_ENABLED=false` renders the hero column as a `bg-brand-soft` panel with a decorative `HeartPulse` icon.
- **Unchanged:** the auto-login effect, `doLogin`, the preflight reasons, `signIn('credentials', { sessionId, redirect: false })`, `setSessionCookie`, `setMarketplaceToken`, `localStorage 'kk-lrms:auth-provider'`, `router.push(callbackUrl)`, and the ProviderID `window.location.href` target.

### `/about` — decorative header + section cards

- **`AboutHeader`:** a `bg-surface-page` band.
  - At ≥ md the left half carries `about-header.webp` (`object-cover object-left`, `alt=""`, `aria-hidden`, no caption, no map wording).
  - The right half holds the back link "กลับหน้าเข้าสู่ระบบ", the brand row, an `h1` "ระบบติดตามการคลอดแบบรวมศูนย์ จังหวัดขอนแก่น", and the existing lead paragraph.
  - Below md the image is a 144px band above the text. With the kill switch off, there is no image.
- **Table of contents:** a `nav aria-label="สารบัญ"` of anchor chips to each section.
- **Sections** (`SectionCard` with `id`), in today's order and with today's prose:

  | id | Title |
  |---|---|
  | `overview` | ภาพรวมระบบ |
  | `objectives` | วัตถุประสงค์ |
  | `features` | ฟีเจอร์หลักของระบบ |
  | `cpd` | ระบบประเมินความเสี่ยง CPD |
  | `network` | โครงสร้างเครือข่ายโรงพยาบาล |
  | `workflow` | ขั้นตอนการทำงานของระบบ |
  | `webhook` | Webhook & API สำหรับโรงพยาบาลภายนอก |
  | `users` | กลุ่มผู้ใช้งาน |
  | `security` | ความปลอดภัยและความเป็นส่วนตัว |

- **Inside the sections:**
  - The CPD factor table and the user-groups table become `DataTable` (static rows).
  - The risk-level cards use `RISK_LEVELS` labels and ranges with token classes per level, plus a `RiskChip`.
  - Stat tiles become `FactTile` (D4).
  - `CodeBlock` uses `bg-ink text-surface-page`; `EndpointBadge` method colours are `ok` (POST), `brand` (GET) and `danger` (DELETE).
- **Footer:** unchanged copy, on tokens.

### `/profile` — legible for nurses

- **Header:** `PageHeader` "โปรไฟล์และการแจ้งเตือน", subtitle "ข้อมูลผู้ใช้จากการเข้าสู่ระบบ และการตั้งค่าการแจ้งเตือนทาง LINE". The container is `max-w-3xl`, and the page renders a `<div>`, not a second `<main>`.
- **ข้อมูลผู้ใช้** (`SectionCard`): a `dl` of โรงพยาบาล / ชื่อ (`maskName`) / เลขบัตรประชาชน (`maskCid`), with the note "แสดงแบบปิดบังบางส่วนตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล".
- **`NotificationPreferenceCard`** becomes `SectionCard` "การแจ้งเตือนทาง LINE (MOPH Prompt)":
  - Each followed hospital is a `rounded-xl border bg-surface-card p-4` block. The name is `text-body-lg`, and the detail level is a chip: own = `ok` "โรงพยาบาลของคุณ — แจ้งเตือนระดับผู้ป่วยได้"; other = muted "รับเฉพาะยอดรวม ไม่ระบุตัวผู้ป่วย".
  - Tiers are a `fieldset` with a `legend` ("แจ้งทันที" / "สรุปรายวัน").
  - Each event is a ≥ 44px row: a 20px `accent-brand` checkbox, the label in `text-body`, and the description in `text-label text-ink-muted`.
  - The digest-hour select and the hospital picker are `h-11` controls.
- **States:**
  - loading: `LoadingState` "กำลังโหลดการตั้งค่า…";
  - saving: an inline `role="status"` "กำลังบันทึก…";
  - empty: `EmptyState` "ยังไม่ได้ติดตามโรงพยาบาลใด".
- **Errors** (`ErrorState` banner, prefixes kept for the existing tests):

  | Error | Message | Remedy |
  |---|---|---|
  | load | "โหลดการตั้งค่าไม่สำเร็จ" | "ตรวจสอบการเชื่อมต่อเครือข่าย แล้วกด ลองใหม่" (with retry) |
  | save | "บันทึกไม่สำเร็จ — การตั้งค่ากลับเป็นค่าเดิมแล้ว" | "ตรวจสอบการเชื่อมต่อ แล้วเลือกอีกครั้ง" |
  | delete | "ลบไม่สำเร็จ — ยังติดตามโรงพยาบาลนี้อยู่" | "ตรวจสอบการเชื่อมต่อ แล้วกด เลิกติดตาม อีกครั้ง" |

- **Unchanged:** optimistic save/revert, `mophLineEnabled` binding, `detailLevel` never sent, and the aggregate-only copy.

### `/admin` — shell + tabs

```
PageHeader  ตั้งค่าระบบ · "จังหวัดหลัก ทะเบียนโรงพยาบาล การเชื่อมต่อ HOSxP คีย์ Webhook และการแจ้งเตือน — สำหรับผู้ดูแลระบบ สสจ."
Tabs (line variant, wraps): จังหวัดหลัก · โรงพยาบาล · การเชื่อมต่อ BMS · คีย์ Webhook · สถานะการซิงค์ · ผู้ใช้ออนไลน์ · จำลองข้อมูล · แจ้งเตือน MOPH (LINE)
┌──────── content ≥ 1160px: 2 columns ─────────────┬─ 420px ─────────────────────┐
│ active tab panel (SectionCards / DataTables)       │ แผนที่โรงพยาบาล (AdminMapPane)│
│                                                    │ sticky under the header      │
└────────────────────────────────────────────────────┴──────────────────────────────┘
< 1160px: one column, the map follows the panel.
```

Shared admin vocabulary (`admin-ui.tsx`):
- `StatusPill` tones are `ok` / `warn` / `danger` / `brand` / `neutral`, mapped to `*-tint` + `*-text` token classes (AA, fixes B3).
- `Field` is `text-label text-ink` with an optional hint.
- Codes (hcode, key prefix, CID, URL) stay `font-mono`. Labels never use mono or uppercase.

| Tab | Design |
|---|---|
| จังหวัดหลัก (`ActiveProvinceTab`) | Two `SectionCard`s: "จังหวัดหลักของระบบ" (select + save, current-province pill) and "เพิ่มหลายโรงพยาบาลพร้อมกัน". Grid fixed (B1). `BulkAddHospitalsDialog` gets tokens, Thai labels and a progress line "กำลังเพิ่ม N โรงพยาบาล…" while `busy` |
| โรงพยาบาล (`HospitalsTab`) | `SectionCard` "โรงพยาบาลในระบบ" (description "N แห่ง · ใช้งาน X · ปิดใช้งาน Y", action "เพิ่มโรงพยาบาล"). `DataTable` columns: โรงพยาบาล (name + `hcode · level` + badges) / ประเภทบริการ / จังหวัด / สถานะ / ข้อมูลในระบบ / จัดการ. Fixes B1. Delete and clear-purge failures show an `ErrorState` banner via `actionFailure` instead of `alert()` (B5). `confirm()` text is unchanged |
| การเชื่อมต่อ BMS (`BmsConfigTab`) | `KpiGrid` of 3 `KpiTile`s (โรงพยาบาลทั้งหมด / มี BMS session / มี Tunnel URL), then hospital tiles on tokens. The edit dialog is unchanged except for tokens and the AA status text |
| คีย์ Webhook (`WebhookKeysTab`) | `KpiGrid` (คีย์ทั้งหมด / ใช้งานได้ / ยกเลิกแล้ว), a `SectionCard` "สร้าง API Key ใหม่", a warn-tone one-time reveal "บันทึก API Key นี้ไว้ทันที — ระบบจะไม่แสดงให้เห็นอีก", and a `DataTable` (โรงพยาบาล / ชื่อคีย์ / รหัสขึ้นต้น / สร้างเมื่อ / ใช้ล่าสุด / สถานะ / จัดการ). The revoke dialog keeps the typed-prefix gate |
| สถานะการซิงค์ (`SyncOverviewTab`) | Filter chips (ทั้งหมด · มีปัญหา · ยังไม่ซิงค์ · ปกติ, `aria-pressed`) plus "รีเฟรชอัตโนมัติทุก 15 วินาที" and a "รีเฟรช" button. `DataTable` with clickable rows (`rowLabel` "เปิดบันทึกการซิงค์ของ {name}") and columns ผล / โรงพยาบาล / เริ่มโดย / เริ่มเมื่อ / ใช้เวลา / สรุป · ข้อผิดพลาด. Labels come from `sync-run-status.ts`, relative time from `formatRelativeTime`. The error is actionable (`ErrorState` banner + retry) |
| ผู้ใช้ออนไลน์ (`OnlineUsersTab`) | `KpiTile` "ผู้ใช้ออนไลน์ตอนนี้" (`data.total`), and a facts line "ที่เก็บสถานะ: Redis/หน่วยความจำ · หายจากรายการเมื่อไม่มีสัญญาณ {PRESENCE_TTL_SECONDS} วินาที · รีเฟรชทุก {ONLINE_USERS_POLL_MS/1000} วินาที · อัปเดต HH:MM:SS". `DataTable` (ผู้ใช้ / โรงพยาบาล / หน้า / เห็นล่าสุด / อุปกรณ์). Empty: `EmptyState` "ยังไม่มีผู้ใช้เปิดหน้าเว็บอยู่". Fixes B4 |
| แจ้งเตือน MOPH (`MophAlertsTab`) | `SectionCard` "ผู้รับการแจ้งเตือน MOPH Prompt (ศูนย์กลางจังหวัด)", the queue notice (warn when `awaitingRecipients > 0`), the form `SectionCard`, and a `DataTable` (ชื่อ / CID masked / ตำแหน่ง / สถานะ / จัดการ). Messages use `InlineNotice` / `ErrorState`. Fixes B4 |
| จำลองข้อมูล (`SimulationTab` + `SimulationControl`) | `SectionCard` + warn notice on tokens. The control's dialog surface is `bg-surface-page` and its header `bg-warn-tint text-warn-text` (B3). Copy stays English (D7) |
| แผนที่ (`AdminMapPane`) | Header "แผนที่โรงพยาบาล · {province}" + "ปักหมุดแล้ว X/Y แห่ง"; the footnote stays Thai. No map behaviour change |
| `HospitalEditDialog` | Token + Thai pass (D5). See the label table below |

`HospitalEditDialog` label table:

| Old | New |
|---|---|
| Hospital Operations Profile | ข้อมูลการทำงานของโรงพยาบาล |
| ACTIVE / INACTIVE | ใช้งาน / ปิดใช้งาน |
| `SYNC {status}` | `ซิงค์ {status}` (code kept, D6) |
| Session active / URL saved / Not configured | มี BMS session / บันทึก URL แล้ว / ยังไม่ตั้งค่า |
| LEVEL / LAST SYNC / SERVICE / COORDINATES / DATABASE | ระดับ / ซิงค์ล่าสุด / ประเภทบริการ / พิกัด / ฐานข้อมูล |
| Consult Doctors / BMS Tunnel / Sync Log / Webhook Keys / Danger Zone | แพทย์ที่ปรึกษา / การเชื่อมต่อ BMS / บันทึกการซิงค์ / คีย์ Webhook / ลบข้อมูล |
| `N contacts` / `progress + errors` / `N active key(s)` | `N คน` / `ความคืบหน้าและข้อผิดพลาด` / `ใช้งาน N คีย์` |
| Latitude / Longitude / Label / Tunnel URL / CID | ละติจูด / ลองจิจูด / ชื่อคีย์ / Tunnel URL / CID |
| SUCCESS / PARTIAL / FAILED / RUNNING · REFRESH | from `sync-run-status.ts` · รีเฟรช |
| ACTIVE / REVOKED (keys) | ใช้งาน / ยกเลิกแล้ว |
| Destructive operations · Danger Zone — … | การลบข้อมูล · ลบข้อมูลของโรงพยาบาลนี้ — … |
| Purge table labels (Partograph observations, Vital signs, CPD scores, ANC visits, ANC risks, Referrals, Journey) | การบันทึกพาร์โทกราฟ, สัญญาณชีพ, คะแนน CPD, การฝากครรภ์ (ANC), ความเสี่ยง ANC, การส่งต่อ, เส้นทางการตั้งครรภ์ — each followed by its table name in `font-mono text-caption` |

## Out of scope

- Splitting `HospitalEditDialog` (D5).
- Deduplicating the webhook-key logic between `WebhookKeysTab` and `HospitalEditDialog.WebhooksSection`.
- Unifying the two `maskCid` formats (D8).
- Thai connection-status vocabulary (D6, owned by sub-project 4).
- Deleting the legacy alias variables from `globals.css`. That happens when no file uses them; the other sub-projects still do.
- About-page CPD factor thresholds as config. `CPD_FACTOR_WEIGHTS.evaluate` is opaque, so the prose table stays.
- Admin tab state in the URL.
- New admin features.
- Comma `grid-cols-[a,b]` occurrences outside this scope (10 elsewhere in `src/`; follow-up for their owning sub-projects).

## Testing

- **Unit (Vitest):**
  - `action-failure`, `provider-login-error`, `sync-run-status`, `presence` config;
  - `illustrations` (the hero entries exist, are ≤ 150 KB and are in the manifest);
  - the `admin-auth-migration` guard: in every migrated file, no legacy alias variables, no hex, no `zoom`, no `uppercase`, no comma `grid-cols-[…]`.
- **Component (RTL):**
  - `SectionCard` `id`, `DataTable` nested-click guard, `InlineNotice`.
  - Login characterization:
    - auto-login flow;
    - `not_registered` / `deactivated` notice;
    - `hosxp_too_old` dialog;
    - unknown `providerError` (safe headline, raw code as detail only);
    - ProviderID redirect target;
    - empty submit.
  - Login layout: one `h1`, hero `alt=""`, BMS + ProviderID buttons, PDPA note.
  - About: decorative header (`alt=""`, `aria-hidden`), TOC anchors resolve to section ids, facts derived from config, corrected PDPA copy, no categorical palette.
  - Profile: existing tests plus fieldset/legend, 20px checkboxes, actionable error remedies.
  - Admin characterization, written before restyle, per task:
    - every mutation's URL, method, JSON header and body;
    - `confirm()` gating;
    - typed purge/revoke gates;
    - one-time key reveal;
    - CID masking;
    - map-pin → hospitals tab auto-edit;
    - sync row → dialog on บันทึกการซิงค์.
  - Admin layout: tablist semantics, Thai labels, no English mono eyebrows.
- **E2E (Playwright, synthetic environment):**
  - `/login` and `/about` (public), plus `/profile` and `/admin` with every tab, at 1440 / 1024 / 768.
  - Checks: `scrollWidth == clientWidth`, zero leaf text under 13px, and the `/admin` two-column layout only at 1440.
  - Screenshots: `/login` and `/about` to `docs/ui-foundation-screenshots/` (PHI-free); `/admin` and `/profile` to the gitignored `e2e-private/ui-admin-auth/`.
- **Gates:** full suite, `tsc --noEmit`, `npm run lint` (0 problems), `npm run build`. The allowlist loses four entries, and `maxEntries` drops by four.
