# Partograph Support — Design

**Status:** Approved (brainstorm complete, ready for implementation plan)
**Date:** 2026-04-19
**Author:** Chaiyaporn Suratemeekul (with Claude)
**Constitution alignment:** §I (TS strict, PDPA), §II (TDD), §III (DRY), §IV (centralized logic), §V (Thai messages, progress), §VI (real-time)

---

## Context

HOSxP now stores full WHO-style partograph time-series in a new MySQL table
`ipt_labour_partograph` (22 clinical columns + audit metadata). The Pascal
package `BMS XE2 Application/BMS HOSxP XE/hosxpxe/HOSxPLaborPackage` writes
and renders this table, with a clinical decision support engine
(`PartographCDSSUnit.pas`) running 32 WHO Labour-Care-Guide rules.

`kk-lrms` does not consume this data. The current partograph endpoint
projects only `cervix_cm` from `ipt_pregnancy_vital_sign` (a one-row-per-AN
snapshot — no time series, no FHR, no contractions, no urine, no
moulding). The webhook payload has no partograph envelope.

This design closes the gap: ingest the new HOSxP table, accept the same
data via webhook from non-HOSxP hospitals, port the Pascal CDSS rules to
TypeScript, surface alerts in the patient detail UI and as a severity dot
on dashboard patient cards.

## Decisions log (brainstorm answers)

| # | Question | Choice | Why |
|---|----------|--------|-----|
| 1 | Goal | **B** — Display + CDSS | A is too thin; C bundles risk-engine changes |
| 2 | Reach | **B** — HOSxP polling + webhook | Both ingestion paths needed |
| 3 | Schema | **A** — new dedicated table | Distinct clinical artifact, semantically separate from `cached_vital_signs` |
| 4 | Webhook shape | **B** — `type: 'partograph'` envelope | Decouples from patient demographics; matches existing `anc_data`/`referral` pattern |
| 5 | CDSS timing | **A** — compute on request | Tiny dataset per patient; rules engine = single source of truth |
| 6 | Alert UI | **C** — summary panel + inline + dashboard dot | Glanceable + investigatable + kiosk-visible |
| 7 | Sync mechanics | **B** — UPSERT by source PK | Edits in HOSxP must propagate; preserves audit |
| 7b | Severity for dashboard | **A** — cache rolled-up severity on `cached_patients` | Threads Q5 (no alerts table) with Q6 (need fast dashboard) |
| 8 | Chart style | **A** — multi-panel Recharts | Web-native dashboard; HOSxP already produces print form |
| pglite | Integration testing | Add pglite for partograph slice | Catches Postgres dialect bugs SQLite hides |

---

## Section 1 — Architecture & Data Flow

```
┌──────────────────┐
│  HOSxP MySQL/PG  │  ipt_labour_partograph (22 cols, time-series)
└────────┬─────────┘
         │  PARTOGRAPH_OBSERVATIONS dual-dialect SQL
         │  (joined to labour_amniotic_type)
         ▼
┌──────────────────────────────────────────────┐
│  src/services/sync/partograph.ts (NEW)       │
│  - upsertPartographObservations(by source PK)│
│  - rollUpSeverityForPatient()                │  → cached_patients
└────────┬───────────────────────────┬─────────┘    .partograph_severity
         │                           │
         │ called from               │ called from
         │ services/sync/polling.ts  │ services/webhook.ts
         │ (HOSxP path)              │ (POST /webhooks/patient-data
         │                           │  type:'partograph')
         ▼                           ▼
┌──────────────────────────────────────────────┐
│  cached_partograph_observations (NEW table)  │
│  - PK id, UNIQUE (hospital_id, source_pk)    │
│  - patient_id, observe_datetime, hour_no     │
│  - 22 WHO fields                             │
└────────┬─────────────────────────────────────┘
         │
         │  GET /api/patients/[an]/partogram (extended response)
         ▼
┌──────────────────────────────────────────────┐
│  src/services/partogram.ts                   │
│  - existing alert/action line calc           │
│  - NEW: analyzePartograph() — port of        │
│    PartographCDSSUnit.pas (32 rules)         │
└────────┬─────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│  PartogramChart (rebuilt, 4-panel Recharts)  │
│  + AlertSummaryPanel (NEW)                   │
│  + Dashboard severity dot on patient cards   │
│    (reads cached_patients.partograph_severity│
│     — already in /api/dashboard query)       │
└──────────────────────────────────────────────┘
```

**Invariant:** the rules engine in `services/partogram.ts` is the single
source of truth. The dashboard severity column is a *projection*
recomputed by the sync handler; it never drives the rich detail view
(which always recomputes from raw observations).

**Two write paths, one schema:** HOSxP polling and webhook both call the
same `upsertPartographObservations()` + `rollUpSeverityForPatient()` pair,
distinguished only by which `source_system` (`'hosxp' | 'webhook'`) label
they stamp on the row. Constitution §IV satisfied.

---

## Section 2 — Schema

### New table `cached_partograph_observations`

`src/db/tables/cached-partograph-observations.ts`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `patient_id` | uuid FK → `cached_patients.id` | |
| `hospital_id` | uuid FK → `hospitals.id` | |
| `source_system` | string(16) | `'hosxp'` or `'webhook'` |
| `source_pk` | string(64) | upstream PK — used for UPSERT |
| `observe_datetime` | datetime | clinical time, X-axis anchor |
| `hour_no` | integer NULL | HOSxP hour offset; null if webhook omits |
| `fetal_heart_rate` | integer NULL | bpm |
| `amniotic_fluid` | string(20) NULL | label |
| `amniotic_type_id` | integer NULL | HOSxP lookup id (no local FK) |
| `amniotic_type_name` | string(250) NULL | resolved at sync time |
| `moulding` | string(10) NULL | `+`, `++`, `+++` |
| `cervical_dilation_cm` | decimal NULL | |
| `descent_of_head` | string(10) NULL | `5/5` … `0/5` |
| `contraction_per_10min` | integer NULL | |
| `contraction_duration_sec` | integer NULL | |
| `contraction_strength` | string(10) NULL | mild / moderate / strong |
| `oxytocin_uml` | decimal NULL | |
| `oxytocin_drops_min` | integer NULL | |
| `drugs_iv_fluids` | string(250) NULL | |
| `pulse` | integer NULL | |
| `bp_systolic` | integer NULL | |
| `bp_diastolic` | integer NULL | |
| `temperature` | decimal NULL | °C |
| `urine_volume_ml` | integer NULL | |
| `urine_protein` | string(10) NULL | |
| `urine_glucose` | string(10) NULL | |
| `urine_acetone` | string(10) NULL | |
| `note` | string(3000) NULL | clinical note |
| `entry_staff` | string(25) NULL | |
| `entry_datetime` | datetime NULL | |
| `synced_at` | datetime | |
| `created_at` | datetime | |
| `updated_at` | datetime | |

**Indexes**

- UNIQUE `(hospital_id, source_system, source_pk)` — UPSERT key (Q7)
- `(patient_id, observe_datetime)` — chart load

### New columns on `cached_patients`

```ts
{ name: 'partograph_severity',     type: 'string', maxLength: 10, nullable: true }, // INFO|WARN|ALERT|CRITICAL
{ name: 'partograph_alert_count',  type: 'integer', nullable: true },
```

`schema-sync.ts` adds missing columns idempotently — no manual migration.

### Out of model

- No local FK to a `labour_amniotic_type` table (HOSxP owns the lookup;
  we copy id + denormalised name).
- No `caput`, `fetal_position`, `deceleration_pattern` (HOSxP doesn't
  store them; Pascal CDSS comments call them out as "not evaluated").
- No `cached_partograph_alerts` table (Q5 = compute on request).
- No encryption on observation fields (clinical measurements, no PII).

---

## Section 3 — Ingestion Paths

### 3a. HOSxP polling SQL — `PARTOGRAPH_OBSERVATIONS`

Added to `src/config/hosxp-queries.ts`, both `postgresql` and `mysql`
branches identical (HOSxP runs on either):

```sql
SELECT lp.ipt_labour_partograph_id,
       lp.ipt_labour_id,
       lp.an,
       lp.observe_datetime,
       lp.hour_no,
       lp.fetal_heart_rate,
       lp.amniotic_fluid,
       lp.labour_amniotic_type_id,
       lat.labour_amniotic_type_name AS amniotic_type_name,
       lp.moulding,
       lp.cervical_dilation_cm,
       lp.descent_of_head,
       lp.contraction_per_10min,
       lp.contraction_duration_sec,
       lp.contraction_strength,
       lp.oxytocin_uml,
       lp.oxytocin_drops_min,
       lp.drugs_iv_fluids,
       lp.pulse,
       lp.bp_systolic,
       lp.bp_diastolic,
       lp.temperature,
       lp.urine_volume_ml,
       lp.urine_protein,
       lp.urine_glucose,
       lp.urine_acetone,
       lp.note,
       lp.entry_staff,
       lp.entry_datetime
  FROM ipt_labour_partograph lp
  LEFT JOIN labour_amniotic_type lat
         ON lat.labour_amniotic_type_id = lp.labour_amniotic_type_id
  JOIN ipt i ON i.an = lp.an
 WHERE i.dchdate IS NULL
 ORDER BY lp.an, lp.observe_datetime
```

`pollHospital()` runs this *after* `ACTIVE_LABOR_PATIENTS`, groups rows by
`an`, calls `upsertPartographObservations()` per AN. One round trip per
hospital per cycle, not per patient.

### 3b. Webhook envelope `type: 'partograph'`

Added to `src/services/webhook.ts`:

```ts
export interface WebhookPartographObservation {
  an: string;
  externalObservationId: string;     // sender's PK (≤64 chars)
  observeDatetime: string;           // ISO 8601
  hourNo?: number | null;

  fetalHeartRate?: number | null;
  amnioticFluid?: string | null;
  amnioticTypeId?: number | null;
  moulding?: string | null;

  cervicalDilationCm?: number | null;
  descentOfHead?: string | null;

  contractionPer10Min?: number | null;
  contractionDurationSec?: number | null;
  contractionStrength?: 'mild' | 'moderate' | 'strong' | null;

  oxytocinUml?: number | null;
  oxytocinDropsMin?: number | null;
  drugsIvFluids?: string | null;

  pulse?: number | null;
  bpSystolic?: number | null;
  bpDiastolic?: number | null;
  temperature?: number | null;

  urineVolumeMl?: number | null;
  urineProtein?: string | null;
  urineGlucose?: string | null;
  urineAcetone?: string | null;

  note?: string | null;
  entryStaff?: string | null;
  entryDatetime?: string | null;

  action?: 'upsert' | 'delete';      // default 'upsert'
}

export interface WebhookPartographPayload {
  type: 'partograph';
  hospitalCode: string;
  observations: WebhookPartographObservation[];
}
```

### 3c. Validator — `validatePartographPayload`

**Hard requirements** (reject the whole payload):

- `observations` is a non-empty array, ≤200 items per request.
- Per row: `an` non-empty string, `externalObservationId` non-empty ≤64
  chars, `observeDatetime` is a valid ISO 8601 datetime.
- If `action === 'delete'`, only `an` + `externalObservationId` required.

**Soft validation** (log warning, accept the row):

- Numeric out-of-range sanity (`fetalHeartRate < 30 || > 250`,
  `temperature < 25 || > 45`, `bpSystolic > 300`). Likely upstream typos
  — flag for chase. CDSS will alert anyway.
- Unknown enum values for `moulding` / `contractionStrength` — accept
  verbatim, surface as INFO-level CDSS noise.

**Resolution failures** (skip the row, return in `observationsSkipped[]`):

- `an` does not match any active row in `cached_patients` for this
  hospital. Likely a race; sender can retry.

### 3d. Route handler

One new branch in `src/app/api/webhooks/patient-data/route.ts`:

```ts
if (payloadType === 'partograph') {
  const validation = validatePartographPayload(body);
  if (!validation.valid || !validation.payload) {
    return NextResponse.json(apiError('VALIDATION_FAILED', validation.error),
                             { status: 400 });
  }
  const result = await processPartographWebhook(
    db, keyInfo.hospitalId, validation.payload, sseManager,
  );
  return NextResponse.json({ success: true, ...result,
                             timestamp: new Date().toISOString() });
}
```

### 3e. Shared internal handler — `src/services/sync/partograph.ts`

Both ingestion paths converge here:

```ts
export async function upsertPartographObservations(
  db: DatabaseAdapter,
  hospitalId: string,
  rows: PartographRow[],            // shape-normalised; source_system stamped
): Promise<{
  upserted: number;
  deleted: number;
  severityChanges: SeverityChange[];
}>
```

It:

1. Resolves `(an → patient_id)` once per batch.
2. UPSERTs each row by `(hospital_id, source_system, source_pk)`.
3. For each affected `patient_id`, recomputes roll-up severity via
   `analyzePartograph()` and `UPDATE cached_patients SET
   partograph_severity = ?, partograph_alert_count = ?`.
4. Returns the patients whose severity *changed* — caller decides whether
   to broadcast `partograph_severity_changed` SSE.

The SSE event signals *that the badge changed*, not *that an alert
exists*. Dashboard reads the rolled-up column on next refresh; patient
detail view re-fetches its full partogram.

---

## Section 4 — CDSS Service (Pascal → TypeScript Port)

Extends `src/services/partogram.ts` (does NOT replace
`calculateAlertLine` / `generatePartogramEntries`).

### Public API

```ts
export type CdssSeverity = 'INFO' | 'WARN' | 'ALERT' | 'CRITICAL';
export type CdssSection =
  | 'FHR' | 'LIQUOR' | 'MOULDING' | 'CERVIX' | 'DESCENT'
  | 'CONTRACTIONS' | 'OXY' | 'PULSE' | 'BP' | 'TEMP' | 'URINE' | 'TIME';

export interface CdssAlert {
  severity: CdssSeverity;
  section:  CdssSection;
  message:  string;          // Thai, identical to Pascal strings
  obsIndex: number;          // -1 = cross-cutting/trend rule
}

export function analyzePartograph(
  header: PartographHeader,
  observations: PartographObservation[],
): CdssAlert[];

export function highestSeverity(alerts: CdssAlert[]): CdssSeverity | null;
export function countBySeverity(alerts: CdssAlert[], s: CdssSeverity): number;
```

### Rule inventory (32 rules, 1:1 with `PartographCDSSUnit.pas`)

| # | Rule | Threshold | Severity | Pascal source |
|---|------|-----------|----------|---------------|
| 1 | FHR out of safe range | `<100` or `>180` | CRITICAL | `AnalyzeFHR` L210 |
| 2 | FHR mildly out of range | `<110` or `>160` | ALERT | L213 |
| 3 | FHR consecutive low (×2) | 2 readings `<110` in a row | CRITICAL | L219 |
| 4 | FHR consecutive high (×2) | 2 readings `>160` in a row | CRITICAL | L222 |
| 5 | Amniotic — thick mec | string contains `thick` | CRITICAL | L237 |
| 6 | Amniotic — mec / moderate / mild | matches `mec`/`moder`/`mild` | ALERT | L240 |
| 7 | Amniotic — blood-stained | matches `blood` | ALERT | L243 |
| 8 | Moulding +++ | `+++` substring | CRITICAL | L248 |
| 9 | Moulding ++ | `++` substring | ALERT | L251 |
| 10 | Cervix past Alert line | `dilation < expected` (1 cm/h from first ≥4 cm) | ALERT | L284 |
| 11 | Cervix past Action line | `dilation < expected − 4` | CRITICAL | L281 |
| 12 | Latent phase prolonged | all obs `<4 cm` spanning `>8 h` | ALERT | L307 |
| 13 | LCG time-per-cm stall | longer than `{5:6, 6:5, 7:3, 8:2.5, 9:2}` h | ALERT | L331 |
| 14 | Active-phase arrest | latest 2 obs `≥5 cm`, `Δ<0.5 cm`, span `>2 h` | CRITICAL | L346 |
| 15 | Tachysystole | `>5 contractions / 10 min` | ALERT | L367 |
| 16 | Hypotonic uterine activity | `≤2 contractions / 10 min` | ALERT | L370 |
| 17 | Sustained tachysystole | rule 15 holding for `≥30 min` | CRITICAL | L385 |
| 18 | Contraction duration too long | `>60 s` | ALERT | L391 |
| 19 | Contraction duration too short | `<20 s` | ALERT | L394 |
| 20 | Pulse very high | `>140` | CRITICAL | L410 |
| 21 | Pulse out of band | `<60` or `≥120` | ALERT | L413 |
| 22 | SBP severe | `≥160` | CRITICAL | L421 |
| 23 | SBP raised | `≥140` | ALERT | L424 |
| 24 | SBP low | `<80` | ALERT | L427 |
| 25 | DBP severe | `≥110` | CRITICAL | L433 |
| 26 | DBP raised | `≥90` | ALERT | L436 |
| 27 | Fever | `temp ≥38.5` | CRITICAL | L443 |
| 28 | Temp abnormal | `≥37.5` or `<35` | ALERT | L446 |
| 29 | Proteinuria | `urine_protein` contains `++` | ALERT | L460 |
| 30 | Ketonuria | `urine_acetone` contains `++` | ALERT | L463 |
| 31 | Glycosuria | `urine_glucose` contains `++` | ALERT | L466 |
| 32 | Observation gap (active phase) | gap `>4 h` with `dilation ≥4 cm` | WARN | L481 |

All Thai messages copy-paste from Pascal verbatim — clinicians switching
between HOSxP and kk-lrms see identical phrasing.

### Implementation shape

Each Pascal `AnalyzeXxx` becomes a small pure function:

```ts
function analyzeFhr(obs): CdssAlert[] { … }
function analyzeLiquorMoulding(obs): CdssAlert[] { … }
function analyzeCervix(obs): CdssAlert[] { … }
function analyzeContractions(obs): CdssAlert[] { … }
function analyzeMaternal(obs): CdssAlert[] { … }
function analyzeUrine(obs): CdssAlert[] { … }
function analyzeTimeGaps(obs): CdssAlert[] { … }

export function analyzePartograph(header, obs): CdssAlert[] {
  return [
    ...analyzeFhr(obs), ...analyzeLiquorMoulding(obs), ...analyzeCervix(obs),
    ...analyzeContractions(obs), ...analyzeMaternal(obs),
    ...analyzeUrine(obs), ...analyzeTimeGaps(obs),
  ];
}
```

No I/O, no DB, no SSE — pure rule engine.

### Callers

- `upsertPartographObservations()` — recomputes severity on each batch.
- `GET /api/patients/[an]/partogram` — attaches `alerts: CdssAlert[]` per
  request.
- Tests — direct invocation with hand-crafted `PartographObservation[]`.

---

## Section 5 — API Contract

### Single endpoint, extended response

`GET /api/patients/[an]/partogram` keeps its URL. Response is a strict
superset of today's shape (`entries[]` retained for back-compat):

```ts
export interface PartogramResponse {
  partogram: {
    startTime: string;                            // unchanged
    entries: PartogramEntry[];                    // EXISTING — derived from observations
    observations: PartographObservationDto[];     // NEW — full WHO time series
    alerts: CdssAlertDto[];                       // NEW — analyzePartograph() output
    severity: {
      highest: CdssSeverity | null;
      counts: { critical: number; alert: number; warn: number; info: number };
    };
    source: 'hosxp' | 'webhook' | 'mixed' | 'none';
    lastObservedAt: string | null;
  };
}
```

`entries[]` stays so `LaborProgressCard` and other legacy consumers keep
working unchanged. Server derives it from `observations[]` (any row with
non-null `cervicalDilationCm`). Removable in a later cleanup PR.

### Handler pseudocode

```ts
const observations = await db.query(`
  SELECT * FROM cached_partograph_observations
  WHERE patient_id = ? ORDER BY observe_datetime ASC
`, [patient.id]);

const dtos = observations.map(toPartographObservationDto);
const alerts = analyzePartograph(
  { an: patient.an, admitAt: patient.admit_date },
  dtos.map(toAnalyzerInput),
);
const entries = generatePartogramEntries(            // EXISTING
  dtos.filter(o => o.cervicalDilationCm != null)
       .map(o => ({ measuredAt: o.observeDatetime, cervixCm: o.cervicalDilationCm! })),
);

const sourceSet = new Set(observations.map(o => o.source_system));
const source = sourceSet.size === 0 ? 'none'
             : sourceSet.size > 1  ? 'mixed'
             : sourceSet.values().next().value;

return NextResponse.json({
  partogram: {
    startTime: patient.admit_date, entries, observations: dtos, alerts,
    severity: {
      highest: highestSeverity(alerts),
      counts: {
        critical: countBySeverity(alerts, 'CRITICAL'),
        alert:    countBySeverity(alerts, 'ALERT'),
        warn:     countBySeverity(alerts, 'WARN'),
        info:     countBySeverity(alerts, 'INFO'),
      },
    },
    source,
    lastObservedAt: dtos.at(-1)?.observeDatetime ?? null,
  },
});
```

### Dashboard additions

Two optional fields on `PatientListItem`:

```ts
partographSeverity:   CdssSeverity | null;
partographAlertCount: number | null;
```

Populated by selecting `cp.partograph_severity, cp.partograph_alert_count`
in the existing patient list query. Zero new joins, zero new rows.
`DashboardHospital.counts` unchanged (Q1=B excludes hospital-level risk
integration).

### SSE

```ts
export interface SsePartographSeverityChangedEvent {
  type: 'partograph_severity_changed';
  hcode: string;
  an: string;
  severity:   CdssSeverity | null;     // null = back to clean
  alertCount: number;
}
```

Broadcast only when severity *changes*, not on every observation.

### Error semantics

Existing `apiError()` shape. `observationsSkipped[]` returned in the 200
response body, not as an error:

```json
{
  "success": true,
  "observationsAccepted": 47,
  "observationsSkipped": [
    { "an": "AN-9999", "externalObservationId": "obs-122",
      "reason": "patient_not_found" }
  ],
  "timestamp": "..."
}
```

---

## Section 6 — UI Components

### 6a. Rebuilt `PartogramChart` (4 panels)

`src/components/charts/PartogramChart.tsx` — same import path. New props:

```tsx
interface PartogramChartProps {
  observations: PartographObservationDto[];
  alerts:       CdssAlertDto[];
  startTime:    string;     // admit_date
}
```

Layout (single shadcn Card, 4 vertically stacked Recharts panels with
shared X-axis = hours from admit, ticks every 4):

| Panel | Height | Content |
|-------|--------|---------|
| 1 — FHR | 90 px | y 80–200 bpm, dashed safe band 110–160, dots colored by severity |
| 2 — Cervix + descent | 180 px | dilation 0–10 cm with alert/action lines, descent on inverted right axis |
| 3 — Contractions | 80 px | stacked bars, height = count/10 min, color = mild/moderate/strong |
| 4 — Maternal vitals + urine | 110 px | BP arrows, pulse line, temp line, urine markers |

Each obs dot's fill color is the highest-severity alert with that
`obsIndex`. Hover tooltip lists every alert message in Thai.

Time axis: prefer `hourNo` when present, fall back to
`(observeDatetime − startTime) / 3600000`.

### 6b. New `AlertSummaryPanel`

`src/components/patient/AlertSummaryPanel.tsx`. Renders above the chart
when `alerts.length > 0`:

```
┌─ Alert summary ──────────────────────────────────────────────┐
│ ●●● วิกฤต 1 ครั้ง                                            │
│   • หัวใจทารกเต้นช้าต่อเนื่อง 2 ครั้ง            (FHR, 14:00) │
│ ●●  เตือน 2 ครั้ง                                            │
│   • กะโหลกเกยกัน (++)                       (Moulding, 13:30)│
│   • ความดันตัวบนสูง 145                          (BP, 14:00) │
└──────────────────────────────────────────────────────────────┘
```

Pure presentational. Sorted by severity desc, then `obsIndex` desc.
Cross-cutting alerts (`obsIndex === -1`) labeled "ภาพรวม".

### 6c. Dashboard severity dot

- `HighRiskPatientList` — small dot column right of risk pill, only when
  `partographSeverity !== null`.
- `ActiveHospitalCard` — **no change** (hospital-level aggregation
  excluded by Q1=B).

### 6d. Kiosk monitor

When `partographSeverity === 'CRITICAL'`, the patient card gets the
existing red glow shadow class (already used for high-CPD patients). No
new CSS, no new severity engine.

### 6e. SSE wiring

`useSSE({ onPatientUpdate, onSyncComplete })` already triggers `mutate()`
on `usePartogram`. New `partograph_severity_changed` event handled by the
same `onPatientUpdate` branch. Zero changes to `useSSE`.

### 6f. Out of scope (this PR)

- `LaborProgressCard` — keeps reading `partogram.entries` (legacy
  projection). Adding alerts here would duplicate `AlertSummaryPanel`.
- `VitalTrendCharts` — separate stream from `cached_vital_signs`.
- `ContractionTable` — keeps reading `/api/patients/[an]/contractions`.
  Migration to partograph data is a later cleanup.
- `PrintForm` — print-quality WHO partograph form deferred (Q8=A).

---

## Section 7 — Testing & Rollout

### 7a. Test pyramid

```
              ┌─────────────────┐
              │   E2E (1)       │  Playwright — patient page renders
              └─────────────────┘  chart + alerts after webhook POST
        ┌─────────────────────────┐
        │  Integration — pglite   │  HOSxP path + webhook,
        │  (2 files, NEW)         │  real Postgres dialect
        └─────────────────────────┘
   ┌──────────────────────────────────────┐
   │  Integration — SQLite                │  +1 file: partograph round-trip,
   │  (existing harness)                  │  SSE wiring
   └──────────────────────────────────────┘
┌────────────────────────────────────────────────────────┐
│  Unit — Vitest                                         │  ~80 tests across rules,
│  (8 CDSS files + validator + dto + sync)               │  validators, dto mappers
└────────────────────────────────────────────────────────┘
```

### 7b. Unit tests (TDD: write first, fail, then implement)

| File | Coverage | ~Tests |
|------|----------|--------|
| `tests/unit/services/partogram-cdss-fhr.test.ts` | Rules 1–4, threshold sweep | 12 |
| `…/partogram-cdss-liquor-moulding.test.ts` | Rules 5–9, case-insensitive | 10 |
| `…/partogram-cdss-cervix.test.ts` | Rules 10–14, alert/action interpolation, LCG table | 14 |
| `…/partogram-cdss-contractions.test.ts` | Rules 15–19, sustained-tachy 30 min | 10 |
| `…/partogram-cdss-maternal.test.ts` | Rules 20–28, pulse/BP/temp sweep | 18 |
| `…/partogram-cdss-urine.test.ts` | Rules 29–31, `++` boundary | 6 |
| `…/partogram-cdss-time-gaps.test.ts` | Rule 32, gap math, active-phase gating | 4 |
| `…/partogram-cdss-parity.test.ts` | Real HOSxP rows (`ipt_labour_partograph_id` 2/3) | 6 asserts |
| `…/webhook-validator-partograph.test.ts` | Hard rules + soft warnings + skip semantics | 12 |
| `…/sync-partograph-upsert.test.ts` | UPSERT by source PK, severity roll-up | 8 |
| `tests/unit/api/partogram-extended.test.ts` | New response shape, `entries[]` back-compat | 6 |

**Threshold-sweep convention** — every numeric rule asserts
`(threshold − 1, threshold, threshold + 1)`. Locks in `>` vs `>=`
semantics from Pascal.

### 7c. Integration — pglite

```
tests/helpers/createPgliteDb.ts                         (NEW harness)
tests/integration/partograph-sync-pglite.test.ts        (HOSxP path)
tests/integration/partograph-webhook-pglite.test.ts     (webhook path)
```

`createPgliteDb()` boots in-memory PGLite, runs `syncSchema(adapter,
'postgresql')` against it (production DDL branch). The new
`PgliteAdapter` (in `src/db/pglite-adapter.ts`, ~50 LOC) wraps
`@electric-sql/pglite` and applies the same `?` → `$N` rewrite as
`PostgresAdapter`.

`partograph-sync-pglite.test.ts` asserts:

- All 22 columns survive a round trip with correct types.
- UPSERT updates instead of duplicating on second insert with same
  `source_pk`.
- `cached_patients.partograph_severity` flips `NULL → 'ALERT'` after a
  moulding `++` row arrives.
- Postgres-specific syntax (`ON CONFLICT DO UPDATE`) parses and runs.

`partograph-webhook-pglite.test.ts` asserts:

- 200 response matches `WebhookPartographResponse` shape.
- `observationsSkipped[]` populated for unknown ANs.
- `SseManager.broadcast` called exactly once per patient whose severity
  changed (mocked).

### 7d. Backward-compat verification

1. Type-level assertion: legacy `PartogramResponse` shape is a strict
   subset of new shape (compile-time check).
2. `LaborProgressCard` rendered against new API response — confirms
   legacy `entries[]` projection still populated.

### 7e. Schema rollout

`schema-sync.ts` is idempotent. Two-step deploy:

1. Deploy code with new table definition + new `cached_patients` columns.
2. App start runs `syncSchema()` → adds table + columns + indexes. New
   table starts empty; new columns start `NULL`.

No backfill. Old observations flow in on next 30 s polling cycle.
Webhook senders adopt the new envelope at their pace; their patients'
`partograph_severity` stays `NULL` until they push.

### 7f. Telemetry

```ts
logger.info('partograph_sync_complete',
  { hospitalId, observationsUpserted, patientsTouched, severityChanges });
logger.warn('partograph_observation_skipped',
  { hospitalId, an, reason });
logger.error('partograph_cdss_failed',
  { patientId, error });   // never blocks sync; alerts fall back to []
```

Webhook responses include `observationsSkipped[]` so senders
self-correct without reading server logs.

### 7g. Out of scope (named to bound the PR)

- Print-quality WHO partograph form (Q8=A).
- Combined CPD + partograph risk indicator (Q1=B).
- Backfill of historical `ipt_labour_partograph` rows for discharged
  patients (filtered by `WHERE i.dchdate IS NULL`).
- Migrating existing SQLite integration tests to pglite (separate
  follow-up).
- Replacing `cached_vital_signs.cervix_cm` with
  `cached_partograph_observations.cervical_dilation_cm` everywhere
  (later cleanup).

---

## File-level change inventory

**New files**

- `src/db/tables/cached-partograph-observations.ts`
- `src/db/pglite-adapter.ts`
- `src/services/sync/partograph.ts`
- `src/components/patient/AlertSummaryPanel.tsx`
- `tests/helpers/createPgliteDb.ts`
- `tests/integration/partograph-sync-pglite.test.ts`
- `tests/integration/partograph-webhook-pglite.test.ts`
- `tests/unit/services/partogram-cdss-fhr.test.ts`
- `tests/unit/services/partogram-cdss-liquor-moulding.test.ts`
- `tests/unit/services/partogram-cdss-cervix.test.ts`
- `tests/unit/services/partogram-cdss-contractions.test.ts`
- `tests/unit/services/partogram-cdss-maternal.test.ts`
- `tests/unit/services/partogram-cdss-urine.test.ts`
- `tests/unit/services/partogram-cdss-time-gaps.test.ts`
- `tests/unit/services/partogram-cdss-parity.test.ts`
- `tests/unit/services/webhook-validator-partograph.test.ts`
- `tests/unit/services/sync-partograph-upsert.test.ts`
- `tests/unit/api/partogram-extended.test.ts`

**Modified files**

- `src/db/tables/cached-patients.ts` — add `partograph_severity`,
  `partograph_alert_count`
- `src/db/tables/index.ts` — export `cachedPartographObservationsTable`,
  add to `ALL_TABLES`
- `src/config/hosxp-queries.ts` — add `PARTOGRAPH_OBSERVATIONS`
- `src/services/sync/polling.ts` — call new query + handler
- `src/services/webhook.ts` — add `WebhookPartographPayload`,
  `validatePartographPayload`, `processPartographWebhook`
- `src/app/api/webhooks/patient-data/route.ts` — add
  `type: 'partograph'` branch
- `src/app/api/patients/[an]/partogram/route.ts` — return extended
  response
- `src/services/partogram.ts` — add `analyzePartograph`,
  `highestSeverity`, `countBySeverity` and the 7 analyzer functions
- `src/types/api.ts` — add `PartographObservationDto`, `CdssAlertDto`,
  `CdssSeverity`, `CdssSection`, `SsePartographSeverityChangedEvent`,
  extended `PartogramResponse`, extended `PatientListItem`
- `src/components/charts/PartogramChart.tsx` — full rewrite (4 panels)
- `src/app/(dashboard)/patients/[an]/page.tsx` — render
  `AlertSummaryPanel`, pass new props to chart
- `src/components/dashboard/HighRiskPatientList.tsx` — add severity dot
- `package.json` — add `@electric-sql/pglite` dev dep

---

## Constitution checklist

| Principle | Compliance |
|-----------|------------|
| §I Code quality / PDPA | TS strict; no `any`; observations not encrypted (no PII); inputs validated at webhook boundary |
| §II TDD | 80+ unit tests written first; pglite catches dialect bugs; threshold-sweep convention |
| §III DRY | Single `analyzePartograph()`; single `upsertPartographObservations()`; `entries[]` derived not duplicated |
| §IV Centralized logic | All clinical thresholds in `services/partogram.ts`; SQL in `config/hosxp-queries.ts` |
| §V Informative UX | All alert messages Thai; severity colors green/amber/orange/red consistent with existing pattern; SSE updates dashboard within 5 s of new observation |
| §VI Performance | One round trip per hospital per cycle; rolled-up severity column avoids N+1; CDSS computed in <50 ms per patient detail request |
