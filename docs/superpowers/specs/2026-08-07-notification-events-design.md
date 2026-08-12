# Notification events — design

**Date:** 2026-08-07
**Supersedes:** `2026-08-05-notification-optin-design.md` (single MOPH LINE toggle)
**Status:** approved, not yet implemented

## Problem

The profile page offers one switch — `moph_line_enabled` — gating the only two
alerts that exist (`anc_hr3`, `maternal_triage`). Two consequences:

1. **It is coarse.** A user who wants referral alerts but not ANC alerts has one
   choice: all or nothing.
2. **It is single-hospital.** The row is created from the session
   (`hospitalCode` at `route.ts:33`), so a user can only ever subscribe to the
   hospital they are logged in against — there is no way to watch a second one.

   *(Corrected 2026-08-07: an earlier draft of this spec claimed self-subscribers
   receive nothing. That is wrong — `resolveRecipients` at
   `src/services/risk-alert.ts:131-138` already adds any enabled preference CID
   with scope `self_subscribed`, independent of the consult-doctor list. The
   recipient model therefore needs no widening; only the event filter and the
   detail level are new. This shrinks Phase 1.)*

The system already *detects* far more than it notifies about — partograph CDSS
severity, CPD banding, referral SLA breaches, ANC follow-up gaps, abnormal
newborn outcomes — all computed and rendered on the dashboard, none of it
reaching anyone who is not looking at a screen.

## Decisions (from brainstorming, 2026-08-07)

| Question | Decision |
|---|---|
| Which events | All four groups: labor-floor deterioration, referrals, ANC follow-up, outcomes + system health |
| Delivery | **Tiered** — urgent to LINE immediately; planning events collected into one daily digest |
| Who may subscribe | **Any logged-in staff user** with a valid 13-digit CID, self-service |
| Cross-hospital | Own hospital → patient-level. Other watched hospitals → **aggregate counts only**. Exception: referrals where the user's own hospital is a party stay patient-level |

> **⚠️ Phase 1 shipped WITHOUT cross-hospital subscription (2026-08-07, `fcb6074`).**
> The aggregate rule above is a *design decision that is not yet enforceable*.
> `buildAlertFlex` renders `กรณี: ${caseRef}` to every recipient scope
> (`moph-alert-templates.ts:107`) and the ANC HR3 caseRef is `ANC-<cid>-G<n>`
> (`browser-push/route.ts:394`) — the patient's national ID. `detail_level` is
> derived on the preference row but is **not persisted on `moph_alert_log`**, so
> the drain cannot honour it. Shipping the recipient-widening half alone leaked
> patient CIDs across hospitals; `PUT` now refuses any hospital but the
> session's, and the UI's add-hospital control is withdrawn.
>
> **Phase 2 must land these together, in this order:** (1) add `detail_level` to
> `moph_alert_log` and write it from the resolved recipient; (2) make
> `buildAlertFlex` suppress `caseRef` — and audit `title` and `confirm_url` for
> identifiers too — when detail is not `full`; (3) only then re-open the API and
> restore the UI control.

## Event catalog

`alert_source` **is** the event key. The existing dedup unique index
(`case_id, hospital_id, recipient_cid, alert_source, severity, rule_id,
local_date` — `src/db/tables/moph-alert-log.ts:62`) already includes it, so new
events need **no index migration**: schema-sync only ADDs columns, and adding an
event adds rows, not DDL.

| event_key (`alert_source`) | tier | detail | producer site | dedup |
|---|---|---|---|---|
| `anc_hr3` *(exists)* | urgent | patient | `browser-push/route.ts:389` | per case/day |
| `maternal_triage` *(exists)* | urgent | patient | `webhook.ts:1328` | per case/day |
| `partograph_critical` | urgent | patient | partograph observation ingest | per case/day/severity |
| `cpd_high` | urgent | patient | `services/sync/cpd-persist.ts` | per case/day |
| `referral_incoming` | urgent | patient¹ | referral persist (browser-push / webhook) | per referral/day |
| `referral_overdue` | urgent | patient¹ | sync tick evaluation | per referral/day |
| `anc_overdue` | digest | patient | sync tick evaluation | per case/day |
| `edc_due_soon` | digest | patient | sync tick evaluation | per case/day |
| `outcome_abnormal` | digest | patient | newborn persist | per newborn/day |
| `sync_offline` | digest | **non-PHI** | sync tick (see caveat) | per hospital/day |

¹ Patient-level only when the subscriber's own hospital is a party to the
referral (origin or destination). Otherwise aggregate.

Every dedup rule is the existing unique index doing the work — nothing new is
needed to make a recurring check idempotent. "Sync tick evaluation" means
`POST /api/sync/browser-push` specifically (the only sync path that runs in
production; `polling.ts` is dead code), evaluated once per hospital per push and
collapsed to one alert per case per day by `local_date`.

**Thresholds come from existing config, never restated:**
`REFERRAL_SLA.overdueAfterHours` (24) / `.criticalAfterHours` (48);
`ANC_OPS.followupWarnDays` (35); `ANC_OPS.dueSoonDays` (14);
`RISK_LEVELS[HIGH].minScore` (10); newborn abnormal = `apgar_5min < 7` or
`birth_weight_g < 2500` (the same expression `getStageKPIs` uses).

**`sync_offline` caveat:** it cannot be produced by the sync path of the
hospital that is down — nothing runs there. It must be evaluated by *any*
hospital's sync tick (or the admin drain), scanning `hospitals.connection_status`
/ `last_sync_at` across the province. This is the one event whose producer is
not co-located with its subject.

## Schema

### `notification_preferences` (extend)

One row per **(user, watched hospital)** — the existing unique index
`(user_cid, hospital_code)` already permits several rows per user, so
multi-hospital subscription needs no key change.

| new column | type | notes |
|---|---|---|
| `detail_level` | string(10), default `'aggregate'` | `'full'` \| `'aggregate'` |
| `digest_hour` | integer, default 8 | 0–23, Asia/Bangkok, when the daily digest is sent |

`moph_line_enabled` is retained as the master switch for the row: off means the
whole hospital subscription is muted without losing per-event choices.

**`detail_level` rule.** The API writes `'full'` only when
`hospital_code === session.user.hospitalCode` at write time, otherwise
`'aggregate'`. The send path may **downgrade** but must never upgrade. If a user
changes hospital, the level is reconciled the next time they save preferences.
Stale `'full'` on a hospital they left is the one residual risk, so `GET
/api/profile/notification-preference` re-validates every row against the current
session hospital and downgrades any mismatch before returning — meaning a single
profile load is enough to correct it, and the correction is persisted.

### `notification_event_subscriptions` (new)

| column | type |
|---|---|
| `id` | uuid, pk |
| `preference_id` | uuid → `notification_preferences.id` |
| `event_key` | string(40) |
| `enabled` | boolean, default true |
| `created_at` / `updated_at` | datetime |

Unique on `(preference_id, event_key)`.

A child table rather than one boolean column per event, for two reasons:
adding an event needs no DDL, and `resolveRecipients` becomes a join instead of
a dynamically-built `WHERE <column>` — which would be both an injection surface
and precisely the "no hardcoded conditions" the constitution forbids.

### `moph_alert_log` (extend)

| new column | type | notes |
|---|---|---|
| `tier` | string(10), default `'urgent'` | `'urgent'` \| `'digest'` |

`alert_source` carries the event key (see above). No index change.

## Recipient resolution

`resolveRecipients(db, hospitalId, province, hospitalCodeOverride)` gains an
`eventKey` argument and returns `{ cid, name, scope, detailLevel }`:

```
recipients(event, hospital) =
    consult_doctors(hospital)          -- existing, detail: full
  ∪ center_monitors(province)          -- existing, bypass opt-in (P1-C)
  ∪ self_subscribers(hospital, event)  -- EXISTS (risk-alert.ts:131-138);
                                       --   what is new is the event join:
                                       --   ⋈ notification_event_subscriptions
                                       --   WHERE moph_line_enabled AND enabled
```

The self-subscriber union is already implemented. This change adds two things to
it: the `notification_event_subscriptions` join (so a subscriber receives only
the events they asked for) and `detailLevel` on the returned recipient.

**Back-compatibility:** a preference row with no `notification_event_subscriptions`
children means "all events", so every existing subscriber keeps receiving
`anc_hr3` and `maternal_triage` exactly as today until they touch the new UI.
Without this rule the migration would silently unsubscribe everyone.

De-duplicated by CID, keeping the **highest** detail level. A recipient present
in more than one source is sent once.

## Delivery

**Urgent** — unchanged path: producer enqueues → `drainMophAlerts` sends
(`browser-push/route.ts:633`, `webhooks/patient-data/route.ts:231`,
`admin/moph-alerts/route.ts:97`).

**Digest** — rows are enqueued with `tier='digest'` and skipped by the urgent
drain. On the first sync tick at or after a recipient's `digest_hour` (Bangkok)
with no digest already sent for `local_date`, one summary message is built per
recipient across all their watched hospitals, sent, and those rows marked sent.

No worker is required, and `local_date` guarantees exactly one digest per
recipient per day no matter how many sync ticks land in the window. A recipient
whose `digest_hour` has passed when they first subscribe gets their first digest
the following day.

## PDPA

- Aggregate payloads carry **counts and hospital name only** — never
  `patient_name_enc`, HN, AN or CID. Enforced in the template layer and asserted
  in tests, not left to the caller.
- Patient names stay encrypted at rest exactly as today (`patient_name_enc`),
  decrypted only when the message is rendered for a `full`-detail recipient.
- Every send already writes to `moph_alert_log`; the audit trail is unchanged.
- Broadening recipients to self-subscribers means more people receive
  patient-identifying alerts. This is bounded by: `detail_level` is `full` only
  for the user's own hospital, and delivery still requires the CID to be linked
  to MOPH Prompt — an unlinked CID simply fails to deliver.

## Undeliverable recipients

A self-subscriber whose CID has no MOPH Prompt link produces a send failure
(`status`, `last_error`, `attempts` on `moph_alert_log`). After a threshold of
consecutive failures the profile page must show it plainly — "ยังส่งไม่สำเร็จ:
เลขบัตรนี้ยังไม่ได้ผูกกับ MOPH Prompt" — rather than silently retrying forever.
This is what makes the self-service model honest.

## UI (`NotificationPreferenceCard`)

Replaces the single switch:

- A list of **watched hospitals**, each with an add/remove control. The user's
  own hospital is present by default and labelled as such.
- Per hospital, a checkbox per event, grouped by tier (ทันที / สรุปรายวัน).
- Non-own hospitals show an explicit note that alerts are aggregate-only.
- A `digest_hour` picker.
- Deliverability state per the section above.

Optimistic update with revert on error and an actionable Thai message, matching
the current card's behaviour.

## Testing

- **Recipient matrix** — own vs watched hospital × event subscribed/not ×
  consult-doctor/center-monitor/self-subscriber, asserting both membership and
  `detailLevel`.
- **PDPA** — aggregate payloads asserted to contain no name/HN/AN/CID, in the
  style of `clinical-chat-stats-context.test.ts`.
- **Dedup** — repeated producer runs within a day enqueue once (the existing
  unique index), including across sync ticks.
- **Digest windowing** — before `digest_hour` nothing sends; at/after it exactly
  one message sends; a second tick the same day sends nothing.
- **Producers** — one test per event, on the PGlite harness, asserting the event
  fires on the triggering condition and not otherwise.
- **Threshold provenance** — assert producer boundaries against `REFERRAL_SLA` /
  `ANC_OPS` / `RISK_LEVELS` constants so a config change cannot silently
  desynchronise the alerts from the dashboard.

## Phasing

Each phase is independently shippable and independently useful.

1. **Subscription model** — schema, event catalog, API, UI, the event join and
   `detailLevel` on recipient resolution. No new events fire; the existing two
   become per-event and multi-hospital. Ships alone and is what makes every
   later phase a config entry plus a producer instead of a UI change.
2. **Urgent producers** — `partograph_critical`, `cpd_high`,
   `referral_incoming`, `referral_overdue`.
3. **Digest** — the digest builder plus `anc_overdue`, `edc_due_soon`,
   `outcome_abnormal`.
4. **`sync_offline`** and undeliverable-recipient handling.

## Out of scope

- In-app notification inbox (considered, rejected as a new surface — YAGNI).
- Admin approval workflow for cross-hospital patient-level access (the
  aggregate rule removes the need).
- Any change to how MOPH Prompt messages are transported.
