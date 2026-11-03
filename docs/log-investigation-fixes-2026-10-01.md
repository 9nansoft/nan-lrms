# Log investigation fixes — 1 October 2026

Scope: pregnancy rollover, recipient-free alerts, registry-only referral
destinations, and hospital sync freshness. The separately reported CID logging
issue is explicitly excluded at the operator's request.

## Pregnancy identity

An LMP correction with the same pregnancy number updates the current journey.
Only an explicitly higher pregnancy number starts a new journey. A lower
pregnancy number is skipped before it can overwrite the current clinical data.
Both webhook and polling ingestion follow this rule. Existing historical journeys are not
merged, deleted, or reclassified by this change: a `pregnancy_overlap` log does
not by itself establish which historical clinical records should be repaired.

## Alert recipients

Missing recipients are a configuration condition, not a successful delivery.
Events are retained in a deduplicated waiting queue. The normal drain resolves
current eligible recipients again and creates the usual delivery records. Only
events for the current Bangkok calendar date are eligible for deferred delivery;
older events expire rather than being sent as current alerts.

Suggested operational ownership (requires local designation):

- Hospital maternity duty team: designated staff who are responsible for acting
  on that hospital's alerts, with event subscriptions enabled explicitly.
- Province referral coordination: a small, explicitly designated group of
  province monitors, maintained through Admin → MOPH Alerts.
- A named owner for roster changes and duty coverage at each level.

Do not bulk-enroll accounts merely because their role is NURSE or ADMIN. Existing
opt-outs and event subscriptions remain authoritative. After configuring actual
recipients, use the existing admin drain action and verify per-recipient delivery
status. Historic events lost before this fix cannot be reconstructed reliably
from warning counts; counts include repeated attempts for the same event.

## Referral destinations

A destination already in `hospitals` keeps its existing configuration. Otherwise,
a matching `moph_hospitals` registry entry creates an inactive destination
reference. Its level remains UNKNOWN until configured by an administrator. This
does not issue credentials or activate monitoring/login access. Both webhook
and browser referral ingestion use the same resolver. An unrecognized webhook
destination returns `REFERRAL_DESTINATION_NOT_FOUND` (HTTP 400).

## Health

`hospitalConnections.online` remains the recorded transport state. The additive
`hospitalConnections.stale` count identifies online sites whose last sync is
missing, invalid, future-dated, or outside the existing network freshness policy.
Such sites make overall health degraded with `hospital_sync_stale`. Readiness
continues to check application initialization and the database independently.

## Focused verification

```sh
npx vitest run tests/unit/api/webhook-referral-destination.test.ts tests/unit/services/sync-referrals.test.ts tests/integration/webhook-anc-referral.test.ts tests/unit/services/sync-journey.test.ts tests/unit/api/health.test.ts tests/unit/api/health-route.test.ts tests/unit/services/risk-alert.test.ts tests/unit/services/moph-alert-drain.test.ts --maxWorkers=4
npx tsc --noEmit --incremental false
npm run lint
```

Use synthetic fixtures for replay. Do not resend production patient webhooks or
send notification tests to real recipients merely to verify this patch.

## Verification result

- Full Vitest suite: 260 files passed, 1 skipped; 2,636 tests passed, 4 skipped.
- ESLint, TypeScript, and `git diff --check`: passed.
- Production Docker image: `kk-lrms:logfix-20261001`.
- Isolated PostgreSQL/Redis container smoke: readiness 200, alert queue indexes
  created, repeated registry-only referrals 200 with one inactive destination
  and one referral, unrecognized destination 400, and stale-feed health degraded.
- Independent code review: approved with no remaining findings in issues 2–5.

## Deployment

Deployed on 1 October 2026 at 10:09 Bangkok time after a fresh isolated smoke
test. The production app runs image
`sha256:9fff88c957ba12e78d9887762d5caf254c2d11cbb6f58d5fea51bdbdd54f29d5`.
Only the app container was recreated; PostgreSQL and Redis remained running,
and deployment environment values matched the previous container.

Local and public readiness, health, and login checks passed. Unauthenticated
admin requests redirect to login. Docker reports healthy with zero restarts.
Health correctly reports degraded because six online hospitals have stale data;
PostgreSQL and Redis are connected. A normal incoming sync populated the new
waiting queue. The initial post-deploy log review found no errors.

Rollback image: `kk-lrms:before-logfix-20261001`. A pre-deploy schema snapshot is
retained at `/tmp/kk-lrms-schema-before-logfix-20261001.sql`; this is a schema
snapshot, not a full data backup. Application rollback uses the retained image
and can leave the additive alert queue table in place.

Recipient assignments were not changed, and no historical clinical repair was
performed. Temporary verification containers, their internal network, and the
temporary credential file were removed.

## Post-deploy observation

Observed for five minutes, 10:11–10:16 Bangkok time, with cumulative log review
from the 10:09 deployment. The app, PostgreSQL, and Redis stayed healthy with
zero restarts and zero logged errors. No failure or timeout events appeared in
the app logs. Seven normal newborn/referral sync cycles were recorded.

Protective ANC warnings repeated as upstream sent an older pregnancy number and
empty risk items; the incoming values were blocked. One missing-recipient alert
was retained once, without duplicate queue rows or repeated warning spam. Six
hospital feeds remain stale, including five older than 24 hours. Public readiness
continued to return HTTP 200. Recipient designation and stale upstream feeds
remain operational follow-up items; this window does not establish longer-term
delivery performance.
