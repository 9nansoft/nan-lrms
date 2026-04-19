# Hospital Maternity Ward — Design Document

**Date**: 2026-04-19
**Status**: Approved (brainstorming complete; implementation plan to follow)
**Audience**: kk-lrms hospital users (HOSxP-authenticated nurses + OBs in the labor room)
**Scope**: A new single-hospital operational page at `/hospital-maternity-ward` that mirrors the HOSxP labor-package UI for full read + CRUD on every editable labor-room entity, talking directly to the hospital's BMS Session API from the browser.

---

## 1. Goals

- Surface a real-time **bed-grid view** of the maternity ward (rooms grouped, beds drag-droppable) for one hospital at a time.
- Provide **full CRUD** on every editable entity exposed by `HOSxPLaborPackage`: partograph observations, maternal vital signs, pre-labour data, stage data, two medication tables, complications, infants, bed moves, discharge.
- Use the **BMS Session API** (`/api/sql`, `/api/function`, `/api/rest`) directly from the browser, mirroring the proven `hosxp-telemed` architecture.
- Replace the global left-sidebar layout with a **top navbar** that shows the hospital name and contextually adapts to the user's `userType`.

## 2. Non-goals

- Admit-patient / new-admission flow (read-only on bed-occupancy creation; v2).
- Provincial users editing hospital data (provincial users are blocked from this route entirely).
- Storing physical x/y bed coordinates (v2; v1 uses HOSxP's existing `roomno + bedno + bed_order`).
- Mobile-first — desktop-first; mobile responsive but not optimised.

---

## 3. Confirmed requirements (from brainstorming Q&A)

| Decision | Resolution |
|---|---|
| **Layout** | Replace global layout with top navbar. Single `TopNavBar` component, conditional menu by `session.user.userType`. |
| **Entry point** | `/hospital-maternity-ward?bms-session-id=xxx` — uses existing kk-lrms auto-login flow. NextAuth session carries `hospitalCode`. |
| **Audience** | Hospital users only (`session.user.userType === 'HOSPITAL'`). Provincial users redirected to `/`. |
| **Read path** | Live BMS calls via SWR (refreshInterval 20 s); cached snapshot from `cached_patients` as fallback only when BMS errors. |
| **CRUD scope** | Every editable entity in `HOSxPLaborPackage` (Pascal source verified). |
| **CRUD path** | Browser-direct to BMS tunnel via ported `bmsSession.ts` client (Approach C, mirroring `hosxp-telemed`). Server-side audit POST after every write. |
| **Bed layout** | Room-grouped (Option A) — beds inside `roomno` cards, ordered by `bedno.bed_order`. Drag-drop moves a patient + writes `iptbedmove` audit row. |
| **Auth model** | Dual: NextAuth (kk-lrms identity for navbar + audit) + `BmsSessionContext` (browser-side bearer JWT for BMS calls). |

---

## 4. Architecture

### 4.1 Route groups

```
src/app/
  layout.tsx                       # Root: SessionProvider + theme
  (provincial)/                    # NEW group — top navbar, provincial menu
    layout.tsx                     # was (dashboard)/layout.tsx
    page.tsx, pregnancies/, hospitals/, ...
  (hospital)/                      # NEW group — top navbar, hospital menu
    layout.tsx                     # <TopNavBar /> + <BmsSessionProvider /> + auth guard
    hospital-maternity-ward/
      page.tsx                     # Bed grid + drawer-driven editor
  (auth)/login/                    # unchanged
  about/                           # unchanged
  api/
    hospital/
      audit-log/route.ts           # POST — fire-and-forget audit sink (only server route in this slice)
```

The existing `(dashboard)` group is renamed to `(provincial)`. The existing left `Sidebar` is dropped; both groups now mount the new `TopNavBar`.

### 4.2 Top navbar (`src/components/layout/TopNavBar.tsx`)

Single component, conditional by `session.user.userType`:

- **HOSPITAL**: `[KK-LRMS logo] · ห้องคลอด    [hospital name + hcode badge] · [user] · [logout]`
- **PROVINCIAL**: `[KK-LRMS logo] · แดชบอร์ด · ฝากครรภ์ · โรงพยาบาล · ส่งต่อ · ผลลัพธ์ทารก · ตั้งค่า    [user · role badge] · [logout]`

### 4.3 Auth model (dual)

| Auth surface | Owner | Stored where | Powers |
|---|---|---|---|
| **NextAuth session** | kk-lrms server | HTTP-only cookie | identity, navbar, route guards, audit attribution |
| **BmsSessionContext** | browser | `sessionStorage['bms-session']` | bearer JWT + apiUrl + marketplaceToken for direct BMS calls |

Both are bootstrapped from the same `?bms-session-id=` URL param: NextAuth signs the user in via `signIn('credentials', { sessionId })`, then the `BmsSessionContext` calls `retrieveBmsSession(sessionId)` to populate browser-side BMS config. URL param is stripped after first read.

### 4.4 Data flow

```
  Page mount
   ├─ NextAuth session ✓ (cookie) → renders shell + identity
   ├─ BmsSessionContext.config ✓ (sessionStorage / URL) → enables BMS calls
   └─ SWR fetcher → executeSql(WARD_BEDS_OCCUPANCY, config) → BMS tunnel → render grid

  User edits a partograph row in drawer
   ├─ optimistic UI update
   ├─ restUpdate('ipt_labour_partograph', id, fields, config)
   ├─ on success: SWR.mutate() to revalidate grid + audit fire-and-forget
   ├─ on error: rollback UI + Thai toast
   └─ audit POST to /api/hospital/audit-log (NextAuth cookie carries identity)
```

---

## 5. BMS browser client (`src/lib/bms-browser-client.ts`)

Ported from `C:/AIProject/hosxp-telemed/src/services/bmsSession.ts` (slimmed to ~9 functions). Exports:

```ts
// Session bootstrap
retrieveBmsSession(sessionId): Promise<BmsSessionResponse>
extractConnectionConfig(r): ConnectionConfig    // { apiUrl, bearerToken, appIdentifier }
extractUserInfo(r): UserInfo                    // { loginname, fullname, hospcode, ... }

// Read
executeSql<T>(sql, config, params?): Promise<{ data: T[] }>

// Server functions (e.g. get_serialnumber)
callFunction<T>(name, config, payload): Promise<T>

// REST CRUD
restInsert(table, data, config, marketplaceToken?): Promise<RestApiResponse>
restUpdate(table, resourceId, data, config, marketplaceToken?): Promise<RestApiResponse>
restDelete(table, resourceId, config, marketplaceToken?): Promise<RestApiResponse>
```

**Error semantics (port from hosxp-telemed):**
- 60 s `AbortController` timeout → throws "Query timed out".
- HTTP 429 → throws Thai retry message including `Retry-After` if present.
- HTTP 501 + body `MessageCode 401` → throws "Session unauthorized" → context auto-clears + redirects to `/login`.
- HTTP 501 + body `MessageCode 409` → SQL error.
- All errors include the failing SQL prefix (60 chars) in the log line for debugging.

**Marketplace token rule** (preserved from hosxp-telemed): when a new `bms-session-id` arrives in the URL without a paired `marketplace_token`, the stale token from `sessionStorage` is dropped — the new session stands alone.

---

## 6. SQL templates (added to `src/config/hosxp-queries.ts`)

All queries follow the existing `SqlQueryTemplate { postgresql, mysql }` pattern. Verified via local MySQL `mcp__mysql-local-hosxp__mysql_query` against every column.

### 6.1 Portability rules (enforced for all new templates)

| Rule | Why |
|---|---|
| Single quotes for string literals (`'Y'`, never `"Y"`) | Postgres treats double quotes as identifier delimiters |
| Lowercase unquoted identifiers | works in both, no quoting drama |
| ANSI `JOIN ... ON ...` only (no comma joins, no `USING(...)`) | both support |
| `CONCAT(a, b)` not `a || b` | `||` is logical-OR in MySQL |
| `LIMIT n` / `LIMIT n OFFSET m` | both support; avoid `FETCH FIRST` / `TOP` |
| `CURRENT_DATE`, `CURRENT_TIMESTAMP` | both support; avoid `CURDATE()`/`NOW()` |
| `IS NULL` / `IS NOT NULL` | both |
| Param placeholders differ — `?` (MySQL), `$1..$N` (Postgres) | use `getQuery(template, dialect)` helper |
| No date arithmetic in SQL — do in app | `INTERVAL` and date functions diverge |
| Discharge filter: `i.confirm_discharge = 'N'` (Pascal convention) | semantically: "still in bed" |

### 6.2 New templates

| Template | Tables | Param keys |
|---|---|---|
| `MATERNITY_WARDS` | `ward` | — |
| `WARD_BEDS_INVENTORY` | `bedno`, `roomno` | `ward` |
| `WARD_BEDS_OCCUPANCY` | `ipt`, `iptadm`, `patient`, `ipt_labour`, `doctor`, `roomno`, `ipt_labour_partograph` (correlated subqueries) | `ward` |
| `PATIENT_PARTOGRAPH_BY_AN` | `ipt_labour_partograph` | `an` |
| `PATIENT_VITAL_SIGNS_BY_AN` | `ipt_pregnancy_vital_sign` | `an` |
| `PATIENT_LABOUR_BY_AN` | `ipt_labour` | `an` |
| `PATIENT_PREGNANCY_BY_AN` | `ipt_pregnancy` | `an` |
| `PATIENT_LABOR_BY_AN` | `labor` | `an` |
| `PATIENT_LABOUR_MED_BY_AN` | `labour_medication` | `an` |
| `PATIENT_STAGE_MED_BY_AN` | `labour_stage_medication`, `s_drugitems`, `opduser` | `an` |
| `PATIENT_COMPLICATIONS_BY_LABOUR_ID` | `ipt_labour_complication`, `labour_complication` | `ipt_labour_id` |
| `PATIENT_INFANTS_BY_AN` | `ipt_newborn`, `ipt_labour_infant` | `an` |
| `BED_MOVE_REASONS` | `iptbedmove_reason` | — |
| `DRUG_LOOKUP` | `s_drugitems` | search prefix |
| `LABOUR_COMPLICATION_LOOKUP` | `labour_complication` | — |
| `DCH_TYPE_LOOKUP` | `dchtype` | — |
| `DCH_STTS_LOOKUP` | `dchstts` | — |

**Example — `WARD_BEDS_OCCUPANCY` (postgresql variant):**

```sql
SELECT i.an, i.hn, i.regdate, i.regtime, i.ward,
       iptadm.bedno, iptadm.roomno, iptadm.bedtype,
       roomno.name AS roomname,
       p.pname, p.fname, p.lname, p.birthday,
       il.g AS gravida, il.ga,
       di.name AS incharge_doctor_name,
       (SELECT MAX(observe_datetime) FROM ipt_labour_partograph
         WHERE an = i.an) AS last_observation_at,
       (SELECT cervical_dilation_cm FROM ipt_labour_partograph
         WHERE an = i.an ORDER BY observe_datetime DESC LIMIT 1) AS last_cervix_cm
  FROM ipt i
  JOIN iptadm ON iptadm.an = i.an
  LEFT JOIN patient p ON p.hn = i.hn
  LEFT JOIN ipt_labour il ON il.an = i.an
  LEFT JOIN doctor di ON di.code = i.incharge_doctor
  LEFT JOIN roomno ON roomno.roomno = iptadm.roomno
 WHERE i.ward = $1 AND i.confirm_discharge = 'N'
 ORDER BY iptadm.bedno
```

(MySQL variant identical except `?` instead of `$1`.)

---

## 7. Entity-to-table mapping (verified against Pascal source + DB)

| UI tab | Pascal frame | Read SQL | Write target | PK | Keyed by |
|---|---|---|---|---|---|
| Vital signs | `LabourVitalSignFrame` | `select * from ipt_pregnancy_vital_sign where an=?` | `ipt_pregnancy_vital_sign` | (composite) | `an` |
| Partograph | `LabourPartographEntryFrame` | `select * from ipt_labour_partograph where ipt_labour_partograph_id=?` | `ipt_labour_partograph` | `ipt_labour_partograph_id` | `an` (via `ipt_labour_id` lookup) |
| Pre-labour | `LaborPrecareEntryFrame` | `select * from ipt_pregnancy where an=?` + `select * from ipt_labour where an=?` | `ipt_pregnancy` + `ipt_labour` | `an` / `ipt_labour_id` | `an` |
| Stage | `LaborStageEntryFrame` | `select * from ipt_labour where an=?` + `select * from labor where an=?` | `ipt_labour` + `labor` | `ipt_labour_id` / `laborid` | `an` |
| Medications used | `LabourMedicationEntryFrame` | `select * from labour_medication where an=?` | `labour_medication` | `labour_medication_id` (via `getserialnumber`) | `an` |
| Delivery Room Med | `LabourStageMedicationListFrame` | `select * from labour_stage_medication where an=?` | `labour_stage_medication` | `labour_stage_medication_id` | `an` |
| Complications | `LabourComplicationFrame` | `select * from ipt_labour_complication where ipt_labour_id=?` | `ipt_labour_complication` | `ipt_labour_complication_id` | **`ipt_labour_id`** (NOT `an` — must lookup first) |
| Infant | `IPTLabourInfantEntryForm` | `select * from ipt_newborn where an=?` + `ipt_labour_infant` | `ipt_newborn` + `ipt_labour_infant` | `ipt_newborn_id` / `ipt_labour_infant_id` | `an` |
| Bed move | (HOSxPDMU) | `iptadm` | `iptadm` + `iptbedmove` | `an` / `iptbedmove_id` (via `getserialnumber`) | `an` |
| Discharge | (HOSxPDMU) | `ipt` | `ipt` + `iptadm` (`outdate`/`outtime`) | `an` | `an` |

**Critical business rules from Pascal source:**

1. **Serial number minting** — new `labour_medication_id`, `iptbedmove_id`, `ipt_newborn_id` minted via the BMS `getserialnumber('<id_field>')` server function. Other tables let DB auto-increment.
2. **`ipt_labour_complication` keyed by `ipt_labour_id`, not `an`** — CRUD needs a lookup query first.
3. **`labor` (no 'u') vs `ipt_labour`** are distinct tables — both written by the Stage / Main Labor frames.
4. **Discharge "still in bed" filter** is `i.confirm_discharge = 'N'` (Pascal convention), not `dchdate IS NULL` (existing kk-lrms convention).
5. **Two distinct medication entities** — `labour_medication` (general drug log) and `labour_stage_medication` (stage-tracked); both are CRUD tabs.

---

## 8. Page UX

### 8.1 Wireframe

```
┌─────────────────────────────────────────────────────────────────┐
│ TopNavBar:  KK-LRMS · ห้องคลอด    รพ.ขอนแก่น (10670) · นางทดสอบ · ⏻│
├─────────────────────────────────────────────────────────────────┤
│ ห้องคลอด · 12 เตียง · ใช้งาน 4 · ว่าง 8         🔄 อัปเดตเมื่อ 14:32:18 │
├─────────────────────────────────────────────────────────────────┤
│ ห้องคลอด — ห้อง 1 (LR1) · 4 เตียง                                │
│ ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐                              │
│ │Bed01│  │Bed02│  │Bed03│  │Bed04│   ← rooms = visual containers│
│ │ 🟢  │  │ 🟡  │  │ ว่าง│  │ ว่าง│                              │
│ │นางA │  │นางB │  │     │  │     │                              │
│ └─────┘  └─────┘  └─────┘  └─────┘                              │
├─────────────────────────────────────────────────────────────────┤
│ ห้องคลอด — ห้อง 2 (LR2) · 4 เตียง                                │
│ ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐                              │
│ │Bed05│  │Bed06│  │Bed07│  │Bed08│                              │
│ │ 🔴  │  │ ว่าง│  │ ว่าง│  │ ว่าง│                              │
│ │นางC │  │     │  │     │  │     │                              │
│ └─────┘  └─────┘  └─────┘  └─────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Bed tile

Occupied state shows: severity dot (🟢🟡🔴 from CDSS roll-up), patient initial + age, gravida/GA, latest cervix dilation + hours-in-labor, in-charge doctor first-name. Single click → opens **side drawer** (60% viewport width).

Empty tiles show "ว่าง" gray. Locked beds (`bedno.bed_lock = 'Y'`) shown as grayed-out with a lock icon; reject drops with "เตียงถูกล็อก" toast.

### 8.3 Drag-drop bed move

Drag a patient card from bed → drop on another bed (same room or cross-room):

1. **Reason modal** opens (combobox of `iptbedmove_reason`).
2. On confirm:
   1. `restUpdate('iptadm', an, { bedno: newBedno, roomno: newRoomno })`
   2. `callFunction('get_serialnumber', { id_field: 'iptbedmove_id' })` → mint new ID
   3. `restInsert('iptbedmove', { iptbedmove_id, an, oward, obedno, nward, nbedno, nroomno, movereason, staff: userInfo.loginname, movedate, movetime, entry_datetime })`
   4. `audit('/api/hospital/audit-log', { entity: 'iptadm', op: 'bed_move', resourceId: an, hcode, fieldsTouched: ['bedno','roomno'] })`
   5. SWR `mutate(WARD_BEDS_OCCUPANCY)` to revalidate
3. Drop on occupied bed → "ย้ายผู้ป่วยกัน?" swap modal (v2 if needed; v1 = swap rejected).

### 8.4 Drawer editor — 10 tabs

| Tab | Pattern |
|---|---|
| Partograph | Reuses existing `PartogramChart.tsx` (4-panel WHO chart) for visualization PLUS row-by-row editable table below. "+ เพิ่มเวลาใหม่" at top. |
| Vitals | Table of historical `ipt_pregnancy_vital_sign` rows with inline edit. Append-new at top. |
| Pre-labour | Single form bound to `ipt_pregnancy + ipt_labour` JOIN. Save writes both. |
| Stage | Single form bound to `ipt_labour + labor` JOIN. Stage timestamps + delivery details. |
| Medications used | CRUD list bound to `labour_medication`. Drug picker autocompletes from `s_drugitems`. |
| Delivery Room Med | CRUD list bound to `labour_stage_medication`. |
| Complications | CRUD list bound to `ipt_labour_complication`. Combobox from `labour_complication` lookup. Resolves `ipt_labour_id` first. |
| Infant | CRUD list of infants (`ipt_newborn` + `ipt_labour_infant`). Click row → infant entry sub-form. |
| Bed | Single row from `iptadm`. Edit `bedno`/`roomno` → submit triggers same flow as drag-drop (reason modal + iptbedmove audit). |
| Discharge | Single confirmation form: `dchdate`, `dchtime`, `dchtype`, `dchstts`. `restUpdate('ipt', an, …)` AND `restUpdate('iptadm', an, { outdate, outtime })`. |

### 8.5 Refresh

SWR `refreshInterval: 20000` for the grid. Manual "🔄 รีเฟรช" button. Every drawer write success → `mutate()` the grid SWR key.

---

## 9. Domain service layer (`src/services/maternity-ward.ts`)

```ts
// Reads
listMaternityWards(config): Promise<MaternityWard[]>
listWardBedsInventory(config, ward): Promise<BedSlot[]>
listWardBedsOccupancy(config, ward): Promise<BedOccupancy[]>
getPatientPartograph(config, an): Promise<PartographRow[]>
getPatientVitalSigns(config, an): Promise<VitalSignRow[]>
getPatientLabour(config, an): Promise<LabourRecord | null>
getPatientPregnancy(config, an): Promise<PregnancyRecord | null>
getPatientLabor(config, an): Promise<LaborRecord | null>
getPatientLabourMedications(config, an): Promise<LabourMedRow[]>
getPatientStageMedications(config, an): Promise<StageMedRow[]>
getPatientComplications(config, iptLabourId): Promise<ComplicationRow[]>
getPatientInfants(config, an): Promise<InfantRow[]>
getBedMoveReasons(config): Promise<string[]>

// Writes — each calls restInsert/Update/Delete + audits via /api/hospital/audit-log
upsertPartograph(config, userInfo, an, row, hcode): Promise<void>
deletePartograph(config, userInfo, id, hcode): Promise<void>
upsertVitalSign(config, userInfo, an, row, hcode): Promise<void>
deleteVitalSign(config, userInfo, id, hcode): Promise<void>
// … same shape for: pregnancy, labour, labor, labour-med, stage-med, complication, infant
movePatientBed(config, userInfo, hcode, args): Promise<void>
//   → restUpdate(iptadm) + callFunction(get_serialnumber) + restInsert(iptbedmove)
dischargePatient(config, userInfo, hcode, args): Promise<void>
//   → restUpdate(ipt) + restUpdate(iptadm with outdate/outtime)
```

**Key invariants:**
- Every write calls `audit('/api/hospital/audit-log')` fire-and-forget after success.
- Composite writes (e.g. bed move) are best-effort sequential. Partial failures surface a Thai toast (HOSxP itself uses the same loose pattern in Pascal — no transactions).
- All writes optimistically update local SWR cache, then `mutate()` to revalidate.

---

## 10. Audit-log server route (`src/app/api/hospital/audit-log/route.ts`)

```ts
// POST body
{ entity: string, op: string, resourceId: string,
  fieldsTouched?: string[], hcode: string, staff?: string }

// Server logic
//   - Require NextAuth session; 401 if missing
//   - Require session.user.userType === 'HOSPITAL'; 403 otherwise
//   - Require session.user.hospitalCode === body.hcode; 403 otherwise
//   - Insert into existing audit_logs table:
//       { user_id, action: `bms.${entity}.${op}`, target_type: entity,
//         target_id: resourceId, metadata: { fieldsTouched, hcode, staff } }
//   - Return 200 immediately (caller is fire-and-forget)
```

---

## 11. Testing strategy

### 11.1 Unit (Vitest, no network)

- `tests/unit/lib/bms-browser-client.test.ts` — request shape, error semantics, marketplace token rule.
- `tests/unit/services/maternity-ward.test.ts` — domain functions issue correct BMS calls in correct order; audit fires; audit failure does not break write.
- `tests/unit/config/maternity-queries.test.ts` — for each new template assert: postgres uses `$N`, mysql uses `?`, identical column refs, no portability rule violations (no backticks, no `||`, no `INTERVAL`, no `CURDATE()`/`NOW()`).
- `tests/unit/api/hospital-audit-log.test.ts` — 401/403/200 paths.

### 11.2 Smoke (live, gated, manual)

`tests/smoke/maternity-ward-live.test.ts` — opt-in via `LIVE_BMS_SESSION_ID` env (set to `33768683-CE0B-44AC-832C-8049D65D5A92` for development testing). Skipped in CI. Read-only — never writes.

Scenarios: list wards → bed inventory → occupancy → partograph for first occupied AN.

### 11.3 E2E (Playwright, mocked BMS)

`tests/e2e/maternity-ward.spec.ts` runs against an in-process mock BMS server (`tests/helpers/createMockBmsServer.ts`) backed by the existing pglite DB. Mock routes `/api/sql`, `/api/function`, `/api/rest/{table}`, `/api/rest/{table}/{id}` to in-memory handlers.

Scenarios:
1. Cold-start landing — `/hospital-maternity-ward?bms-session-id=fake` → top navbar + 1 ward + N empty bed slots.
2. Render an admitted patient — seed `cached_patients` + push partograph via webhook → bed tile shows severity dot + cervix dilation.
3. Open drawer → 10 tabs visible.
4. Edit partograph row → mock receives `PUT /api/rest/ipt_labour_partograph/{id}` with the changed field; audit POST fires.
5. Bed move drag-drop cross-room → reason modal → mock receives `restUpdate(iptadm)` + `restInsert(iptbedmove)` → grid revalidates.
6. Discharge → mock receives `restUpdate(ipt)` + `restUpdate(iptadm)` → bed shows "ว่าง".
7. Provincial user navigating to `/hospital-maternity-ward` → redirected to `/`.
8. BMS session expiry — mock returns 501 + `MessageCode 401` → context clears, redirect to `/login`.

---

## 12. File inventory

### 12.1 New files

**Layout / chrome (3)**
- `src/components/layout/TopNavBar.tsx`
- `src/app/(hospital)/layout.tsx`
- `src/app/(provincial)/layout.tsx`

**BMS browser client (3)**
- `src/lib/bms-browser-client.ts`
- `src/contexts/BmsSessionContext.tsx`
- `src/utils/bms-session-storage.ts`

**Domain service + types (2)**
- `src/services/maternity-ward.ts`
- `src/types/maternity-ward.ts`

**SQL templates** — appended to `src/config/hosxp-queries.ts`.

**Page + UI components (~15)**
- `src/app/(hospital)/hospital-maternity-ward/page.tsx`
- `src/components/maternity/WardLayoutView.tsx`
- `src/components/maternity/BedTile.tsx`
- `src/components/maternity/BedMoveReasonModal.tsx`
- `src/components/maternity/PatientDrawer.tsx`
- `src/components/maternity/tabs/PartographTab.tsx`
- `src/components/maternity/tabs/VitalsTab.tsx`
- `src/components/maternity/tabs/PreLabourTab.tsx`
- `src/components/maternity/tabs/StageTab.tsx`
- `src/components/maternity/tabs/MedicationsTab.tsx`
- `src/components/maternity/tabs/StageMedTab.tsx`
- `src/components/maternity/tabs/ComplicationsTab.tsx`
- `src/components/maternity/tabs/InfantTab.tsx`
- `src/components/maternity/tabs/BedTab.tsx`
- `src/components/maternity/tabs/DischargeTab.tsx`

**Server route (1)**
- `src/app/api/hospital/audit-log/route.ts`

**Hooks (1)**
- `src/hooks/useBmsSession.ts`

**Tests** — see §11.

### 12.2 Modified files

- `src/app/layout.tsx` — drop `<DashboardLayout>` from root; route groups own their own chrome.
- Move `src/app/(dashboard)/*` → `src/app/(provincial)/*` (rename + adjust internal references).
- Delete `src/components/layout/Sidebar.tsx` (top navbar replaces it everywhere).
- `src/middleware.ts` — recognize `/hospital-maternity-ward` as `userType: HOSPITAL`-only.
- `src/config/hosxp-queries.ts` — append §6.2 templates.
- `src/types/auth.ts` — confirm `session.user.userType` in typed session.

### 12.3 Files NOT touched

Everything in `src/services/sync/`, `src/services/cpd-score.ts`, `src/services/partogram.ts`, `src/db/`, `src/services/dashboard.ts`, existing webhook routes — the new feature is **additive**.

---

## 13. Build sequence (TDD batches)

1. **Foundations** — port browser client + context + storage + types + hooks. Unit tests for client + context. Add SQL templates with portability assertions.
2. **Layout migration** — introduce `TopNavBar`, move `(dashboard)` → `(provincial)`, switch provincial layout to top nav. E2E sanity: existing dashboard still loads.
3. **Hospital route shell** — create `(hospital)/layout.tsx` with auth guard + `BmsSessionProvider`. Stub `/hospital-maternity-ward` page with "Hello" + identity. E2E: auto-login via `?bms-session-id=` works.
4. **Read path** (live BMS via mock) — list wards → bed inventory → occupancy. Render room-grouped layout with empty/occupied tiles. SWR refresh.
5. **Drawer + read-only tabs** — open drawer, render all tabs in read-only mode, fetch each entity's rows.
6. **CRUD per tab** (one tab at a time, TDD per): Partograph → Vitals → Pre-labour → Stage → Medications → StageMed → Complications → Infant → Bed → Discharge. Each batch: domain function + form UI + audit + tests.
7. **Drag-drop bed move** — `BedMoveReasonModal`, drag library wiring, optimistic update, audit.
8. **Polishing** — error toasts, loading states, empty states, Thai copy review, accessibility (keyboard fallback for drag-drop).

Each batch ends with all tests green + a commit.

---

## 14. Open questions (to resolve in the implementation plan)

- Drag-drop library choice: `@dnd-kit/core` vs HTML5 drag-and-drop primitives. (Likely `@dnd-kit/core` for keyboard accessibility.)
- Serial-number function name: confirm `getserialnumber('iptbedmove_id')` exact payload by spot-test against the live tunnel before relying on it in `movePatientBed`.
- Marketplace token: do hospital sessions need it for write access? hosxp-telemed makes it optional; must verify against KKR's `bms-session-id=33768683-…` whether writes succeed without it.
- Whether `s_drugitems` is universally available across all 26 KK hospital BMS tunnels (the drug picker depends on it).
