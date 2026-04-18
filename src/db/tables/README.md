# Database Schema — Two-Table Patient Model

KK-LRMS stores patient data across two complementary tables. **They are not duplicates** — each represents a distinct lifecycle stage and answers different operational questions.

## Why Two Tables?

| Question | Table |
|----------|-------|
| "Who is currently admitted in labor at hospital X?" | `cached_patients` |
| "Who is this woman across her entire pregnancy continuum?" | `maternal_journeys` |

A pregnancy lasts ~40 weeks; an admission lasts hours to days. Splitting the model lets us:

- **Refresh fast-changing labor data** (vitals, CPD score, AN-specific) without rewriting the journey row
- **Track cross-hospital transfers** at the journey level via `cid_hash` without disturbing per-admission state
- **Preserve historical journeys** after labor ends without polluting active-labor dashboards

## Table Roles

### `maternal_journeys` — Lifetime pregnancy record (one per pregnancy)

- **Primary key by**: `cid_hash` (cross-hospital matching) within a `gravida`
- **Source of truth for**: care_stage, ancRiskLevel, ANC visit count, current_hospital_id, location
- **Created when**: ANC registration (HOSxP `person_anc` or webhook `type: anc_data`)
- **Stage progression**: PREGNANCY → LABOR → DELIVERED → POSTPARTUM
- **Children**: `cached_anc_visits`, `cached_anc_risks`, `cached_referrals`, `cached_newborns`

### `cached_patients` — Current/recent labor admission (one per AN)

- **Primary key by**: `(hospital_id, an)` — admission number unique within hospital
- **Source of truth for**: labor_status, admit_date, current vitals (height/weight/fundal_height/etc.), CPD risk factors
- **Created when**: Active labor patient appears in HOSxP `ipt` table or webhook labor payload
- **Linked to journey**: `cached_patients.journey_id → maternal_journeys.id` (nullable — labor patients without prior ANC have no journey)
- **Children**: `cached_vital_signs`, `cpd_scores`

## Linkage Rules

1. **Same CID across both tables**: When a labor patient (`cached_patients.cid_hash`) matches an existing `maternal_journeys.cid_hash`, set `cached_patients.journey_id` to the journey id. The sync/webhook services do this automatically.

2. **Journey care_stage transitions**: When a labor admission appears, the journey should transition `PREGNANCY → LABOR`. When labor_status moves to DELIVERED, the journey transitions `LABOR → DELIVERED`. See `src/services/journey.ts` for transition helpers.

3. **No journey for labor-only**: A patient may appear in `cached_patients` without a journey (no prior ANC record). This is valid — `journey_id` is nullable.

4. **Journey without cached_patient**: ANC patients not yet in labor have a journey but no cached_patient row. This is also valid — they show on ANC dashboards, not labor dashboards.

## When to Query Which Table

- **Labor dashboard / partogram**: `cached_patients` JOIN `cpd_scores`, optionally LEFT JOIN `maternal_journeys` for ANC context
- **ANC dashboard / risk monitoring**: `maternal_journeys` JOIN `cached_anc_visits`, `cached_anc_risks`
- **Patient detail page (cross-stage)**: `cached_patients` LEFT JOIN `maternal_journeys` ON `journey_id` (preferred) OR fallback to `getJourneyByHn()` from `src/services/journey.ts`
- **Cross-hospital patient lookup (referral check)**: Query `maternal_journeys` by `cid_hash`, then check `cached_patients` for active labor

## Anti-Patterns to Avoid

- ❌ **Don't denormalize journey data into cached_patients** (e.g. copying `care_stage`). The journey is the source of truth.
- ❌ **Don't query patient by HN when CID is available** — HN is hospital-local; CID is canonical across hospitals.
- ❌ **Don't write to both tables in separate transactions** — wrap in `db.transaction()` to prevent partial state.
- ❌ **Don't add new patient fields to cached_patients if they apply to the whole pregnancy** — they belong on `maternal_journeys`.

## Related Service Helpers

- `src/services/journey.ts` — `getActiveJourneyByCid()`, `getJourneyByHn()`, `createJourney()`, stage transitions
- `src/services/sync/patient.ts` — `upsertCachedPatients()`, `detectTransfers()`, `markPatientsDelivered()`
- `src/services/webhook.ts` — `processWebhookPayload()` (labor) and `processAncWebhook()` (journey)
