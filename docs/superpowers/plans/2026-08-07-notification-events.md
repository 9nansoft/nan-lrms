# Notification Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the profile page's single MOPH LINE switch with per-event, multi-hospital subscriptions, so a user chooses which events they receive and for which hospitals.

**Architecture:** An event catalog in `src/config/` is the single source of truth (key, tier, detail policy, Thai label). `notification_preferences` gains one row per watched hospital plus `detail_level`/`digest_hour`; a new child table `notification_event_subscriptions` holds per-event flags. `resolveRecipients` gains an `eventKey` filter and returns a `detailLevel` per recipient. No new alert events fire in this phase — the two existing ones (`anc_hr3`, `labor_emergency`) simply become selectable.

**Tech Stack:** TypeScript strict, Next.js 15 App Router, PostgreSQL via `DatabaseAdapter` (`?` placeholders — adapters rewrite to `$N`), Vitest + PGlite (`tests/helpers/testDb.ts`), React 19 + Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-07-notification-events-design.md`

## Global Constraints

- TypeScript strict; `any` requires written justification.
- SQL placeholders are `?` — never hand-write `$N` (the adapters rewrite them).
- Schema-sync only ADDs columns. No task may change an existing unique index.
- PDPA: aggregate payloads carry counts + hospital name only — never name/HN/AN/CID.
- Thresholds are imported from config, never restated as literals.
- Tests first (Red → Green), each task ends with a commit.
- Thai user-facing copy; error messages say what went wrong AND what to do.
- **Back-compatibility rule, load-bearing:** a preference row with zero
  `notification_event_subscriptions` children means *all events enabled*. Every
  existing subscriber must keep receiving `anc_hr3` and `labor_emergency`
  unchanged until they touch the new UI.
- Run `npx tsc --noEmit && npm run lint` before every commit.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/config/notification-events.ts` | **Create.** Event catalog: key, tier, detail policy, Thai label/description. Single source of truth. |
| `src/db/tables/notification-event-subscriptions.ts` | **Create.** Child-table definition. |
| `src/db/tables/notification-preferences.ts` | **Modify.** Add `detail_level`, `digest_hour`. |
| `src/db/tables/index.ts` | **Modify.** Register the new table. |
| `src/services/notification-preference.ts` | **Modify.** Multi-hospital read/write + per-event subscription CRUD. |
| `src/services/risk-alert.ts` | **Modify.** `resolveRecipients` gains `eventKey`, returns `detailLevel`. |
| `src/app/api/profile/notification-preference/route.ts` | **Modify.** GET returns all watched hospitals + events; PUT writes one hospital's subscription set; DELETE removes one. |
| `src/components/profile/NotificationPreferenceCard.tsx` | **Modify.** Per-hospital, per-event UI. |
| `tests/unit/config/notification-events.test.ts` | **Create.** Catalog integrity. |
| `tests/unit/db/notification-schema.test.ts` | **Create.** Schema + defaults + uniqueness. |
| `tests/unit/services/notification-preference.test.ts` | **Modify.** Service + back-compat rules. |
| `tests/unit/services/risk-alert.test.ts` | **Modify.** Recipient matrix incl. event filter + detail level. |
| `tests/unit/api/profile-notification-preference.test.ts` | **Modify.** Route contract. |
| `tests/unit/components/NotificationPreferenceCard.test.tsx` | **Create.** UI behaviour. |

---

## Task 1: Event catalog

**Files:**
- Create: `src/config/notification-events.ts`
- Test: `tests/unit/config/notification-events.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `NotificationEventTier = 'urgent' | 'digest'`;
  `NotificationEventDetail = 'patient' | 'aggregate'`;
  `interface NotificationEvent { key: string; tier: NotificationEventTier; detail: NotificationEventDetail; labelTh: string; descriptionTh: string; implemented: boolean }`;
  `NOTIFICATION_EVENTS: readonly NotificationEvent[]`;
  `notificationEventKeys(): string[]`;
  `findNotificationEvent(key: string): NotificationEvent | null`;
  `implementedNotificationEvents(): NotificationEvent[]`.

`implemented` is the honesty flag: only `anc_hr3` and `labor_emergency` have
producers in this phase. The UI must not offer a checkbox that cannot fire.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/config/notification-events.test.ts
import { describe, it, expect } from 'vitest';
import {
  NOTIFICATION_EVENTS,
  findNotificationEvent,
  notificationEventKeys,
  implementedNotificationEvents,
} from '@/config/notification-events';

describe('notification event catalog', () => {
  it('has unique keys and Thai copy for every event', () => {
    expect(new Set(notificationEventKeys()).size).toBe(NOTIFICATION_EVENTS.length);
    for (const e of NOTIFICATION_EVENTS) {
      expect(e.labelTh.trim().length).toBeGreaterThan(2);
      expect(e.descriptionTh.trim().length).toBeGreaterThan(5);
      expect(['urgent', 'digest']).toContain(e.tier);
      expect(['patient', 'aggregate']).toContain(e.detail);
    }
  });

  it('marks only the two events that have producers today as implemented', () => {
    expect(implementedNotificationEvents().map((e) => e.key).sort()).toEqual([
      'anc_hr3',
      'labor_emergency',
    ]);
  });

  it('resolves a known key and returns null for an unknown one', () => {
    expect(findNotificationEvent('anc_hr3')?.tier).toBe('urgent');
    expect(findNotificationEvent('nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/config/notification-events.test.ts`
Expected: FAIL — `Cannot find module '@/config/notification-events'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/config/notification-events.ts
// Notification event catalog — the single source of truth for which events
// exist, how urgently they are delivered, and whether they may carry patient
// detail. Spec: docs/superpowers/specs/2026-08-07-notification-events-design.md
//
// `implemented` is deliberate: an event with no producer must never appear as a
// checkbox, or the UI promises a notification that can never arrive.

export type NotificationEventTier = 'urgent' | 'digest';
export type NotificationEventDetail = 'patient' | 'aggregate';

export interface NotificationEvent {
  /** Stored in moph_alert_log.alert_source — the dedup index already covers it. */
  key: string;
  tier: NotificationEventTier;
  /** 'aggregate' events NEVER carry a patient identifier, at any detail level. */
  detail: NotificationEventDetail;
  labelTh: string;
  descriptionTh: string;
  /** False until a producer exists. Hidden from the UI while false. */
  implemented: boolean;
}

export const NOTIFICATION_EVENTS: readonly NotificationEvent[] = [
  {
    key: 'anc_hr3',
    tier: 'urgent',
    detail: 'patient',
    labelTh: 'ครรภ์เสี่ยงสูง (ANC HR3)',
    descriptionTh: 'พบหญิงตั้งครรภ์ที่จัดเป็นความเสี่ยงสูงระดับ HR3',
    implemented: true,
  },
  {
    key: 'labor_emergency',
    tier: 'urgent',
    detail: 'patient',
    labelTh: 'ภาวะฉุกเฉินในห้องคลอด',
    descriptionTh: 'ผลคัดกรองแรกรับเข้าเกณฑ์ฉุกเฉิน ต้องรายงานทันที',
    implemented: true,
  },
  {
    key: 'partograph_critical',
    tier: 'urgent',
    detail: 'patient',
    labelTh: 'Partograph วิกฤต',
    descriptionTh: 'กราฟการคลอดข้าม action line หรือ CDSS แจ้งระดับ CRITICAL',
    implemented: false,
  },
  {
    key: 'cpd_high',
    tier: 'urgent',
    detail: 'patient',
    labelTh: 'คะแนน CPD เสี่ยงสูง',
    descriptionTh: 'ผู้คลอดมีคะแนน CPD ถึงเกณฑ์เสี่ยงสูง',
    implemented: false,
  },
  {
    key: 'referral_incoming',
    tier: 'urgent',
    detail: 'patient',
    labelTh: 'มีเคสส่งต่อเข้ามา',
    descriptionTh: 'มีการส่งต่อผู้ป่วยมายังโรงพยาบาลนี้',
    implemented: false,
  },
  {
    key: 'referral_overdue',
    tier: 'urgent',
    detail: 'patient',
    labelTh: 'ใบส่งต่อค้างเกินเวลา',
    descriptionTh: 'ใบส่งต่อที่ยังไม่ได้รับการตอบรับเกินเกณฑ์เวลา',
    implemented: false,
  },
  {
    key: 'anc_overdue',
    tier: 'digest',
    detail: 'patient',
    labelTh: 'ANC ขาดนัด',
    descriptionTh: 'หญิงตั้งครรภ์ที่ไม่มาตามนัดเกินเกณฑ์',
    implemented: false,
  },
  {
    key: 'edc_due_soon',
    tier: 'digest',
    detail: 'patient',
    labelTh: 'ใกล้ครบกำหนดคลอด',
    descriptionTh: 'ครรภ์ที่ใกล้ถึงกำหนดคลอดในช่วงที่กำหนด',
    implemented: false,
  },
  {
    key: 'outcome_abnormal',
    tier: 'digest',
    detail: 'patient',
    labelTh: 'ผลลัพธ์การคลอดผิดปกติ',
    descriptionTh: 'ทารกแรกเกิด APGAR ต่ำ หรือน้ำหนักน้อยกว่าเกณฑ์',
    implemented: false,
  },
  {
    key: 'sync_offline',
    tier: 'digest',
    detail: 'aggregate',
    labelTh: 'การเชื่อมต่อข้อมูลขัดข้อง',
    descriptionTh: 'โรงพยาบาลหยุดส่งข้อมูลเข้าระบบ (ไม่มีข้อมูลผู้ป่วย)',
    implemented: false,
  },
] as const;

export function notificationEventKeys(): string[] {
  return NOTIFICATION_EVENTS.map((e) => e.key);
}

export function findNotificationEvent(key: string): NotificationEvent | null {
  return NOTIFICATION_EVENTS.find((e) => e.key === key) ?? null;
}

export function implementedNotificationEvents(): NotificationEvent[] {
  return NOTIFICATION_EVENTS.filter((e) => e.implemented);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/config/notification-events.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && npm run lint
git add src/config/notification-events.ts tests/unit/config/notification-events.test.ts
git commit -m "feat(notify): event catalog with tier, detail policy and implemented flag"
```

---

## Task 2: Schema — subscriptions child table + preference columns

**Files:**
- Create: `src/db/tables/notification-event-subscriptions.ts`
- Modify: `src/db/tables/notification-preferences.ts`
- Modify: `src/db/tables/index.ts`
- Test: `tests/unit/db/notification-schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: table `notification_event_subscriptions(id, preference_id, event_key, enabled, created_at, updated_at)` unique on `(preference_id, event_key)`; `notification_preferences.detail_level` (string 10, default `'aggregate'`) and `.digest_hour` (integer, default 8).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/db/notification-schema.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';

let db: DatabaseAdapter;

describe('notification schema', () => {
  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await db.close?.();
  });

  it('stores a preference with detail level and digest hour', async () => {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO notification_preferences
         (id, user_cid, hospital_code, moph_line_enabled, detail_level, digest_hour, created_at, updated_at)
       VALUES ('p1', '3320500282121', '10670', true, 'full', 9, ?, ?)`,
      [now, now],
    );
    const rows = await db.query<{ detail_level: string; digest_hour: number }>(
      `SELECT detail_level, digest_hour FROM notification_preferences WHERE id = 'p1'`,
    );
    expect(rows[0].detail_level).toBe('full');
    expect(Number(rows[0].digest_hour)).toBe(9);
  });

  it('defaults detail_level to aggregate and digest_hour to 8', async () => {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO notification_preferences
         (id, user_cid, hospital_code, moph_line_enabled, created_at, updated_at)
       VALUES ('p2', '3320500282122', '11002', true, ?, ?)`,
      [now, now],
    );
    const rows = await db.query<{ detail_level: string; digest_hour: number }>(
      `SELECT detail_level, digest_hour FROM notification_preferences WHERE id = 'p2'`,
    );
    expect(rows[0].detail_level).toBe('aggregate');
    expect(Number(rows[0].digest_hour)).toBe(8);
  });

  it('rejects a duplicate event subscription for the same preference', async () => {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO notification_preferences
         (id, user_cid, hospital_code, moph_line_enabled, created_at, updated_at)
       VALUES ('p3', '3320500282123', '11000', true, ?, ?)`,
      [now, now],
    );
    await db.execute(
      `INSERT INTO notification_event_subscriptions
         (id, preference_id, event_key, enabled, created_at, updated_at)
       VALUES ('s1', 'p3', 'anc_hr3', true, ?, ?)`,
      [now, now],
    );
    await expect(
      db.execute(
        `INSERT INTO notification_event_subscriptions
           (id, preference_id, event_key, enabled, created_at, updated_at)
         VALUES ('s2', 'p3', 'anc_hr3', false, ?, ?)`,
        [now, now],
      ),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/db/notification-schema.test.ts`
Expected: FAIL — `column "detail_level" of relation "notification_preferences" does not exist`

- [ ] **Step 3: Write the implementation**

```typescript
// src/db/tables/notification-event-subscriptions.ts
// Per-event opt-in, one row per (preference, event).
//
// A child table rather than a boolean column per event: adding an event then
// needs no DDL, and recipient resolution is a join instead of a
// dynamically-built `WHERE <column>` (injection surface + the "no hardcoded
// conditions" rule). Absence of children means ALL events — see the
// back-compatibility rule in the spec.
import type { TableDefinition } from '../table-definition';

export const notificationEventSubscriptionsTable: TableDefinition = {
  name: 'notification_event_subscriptions',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'preference_id', type: 'uuid' },
    { name: 'event_key', type: 'string', maxLength: 40 },
    { name: 'enabled', type: 'boolean', defaultValue: true },
    { name: 'created_at', type: 'datetime' },
    { name: 'updated_at', type: 'datetime' },
  ],
  indexes: [
    {
      name: 'idx_nes_unique_pref_event',
      columns: ['preference_id', 'event_key'],
      unique: true,
    },
    { name: 'idx_nes_event_enabled', columns: ['event_key', 'enabled'] },
  ],
};
```

In `src/db/tables/notification-preferences.ts`, add to `fields` after
`moph_line_enabled`:

```typescript
    // 'full' = patient-level detail (own hospital only); 'aggregate' = counts
    // only. The send path may downgrade this, never upgrade it.
    { name: 'detail_level', type: 'string', maxLength: 10, defaultValue: 'aggregate' },
    // Hour of day (Asia/Bangkok) the daily digest is sent for this row.
    { name: 'digest_hour', type: 'integer', defaultValue: 8 },
```

In `src/db/tables/index.ts`, import `notificationEventSubscriptionsTable` and add
it to the exported table array next to `notificationPreferencesTable`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/db/notification-schema.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && npm run lint
git add src/db/tables/ tests/unit/db/notification-schema.test.ts
git commit -m "feat(notify): per-event subscription table, detail_level and digest_hour"
```

---

## Task 3: Service — multi-hospital preferences with per-event subscriptions

**Files:**
- Modify: `src/services/notification-preference.ts`
- Test: `tests/unit/services/notification-preference.test.ts`

**Interfaces:**
- Consumes: Task 1 `notificationEventKeys`; Task 2 tables.
- Produces:
  - `type NotificationDetailLevel = 'full' | 'aggregate'`
  - `interface NotificationPreferenceFull { id: string; userCid: string; hospitalCode: string; mophLineEnabled: boolean; detailLevel: NotificationDetailLevel; digestHour: number; events: string[] }` — `events` is the ENABLED key list; an empty children set yields **all** keys (back-compat rule).
  - `listNotificationPreferences(db, userCid): Promise<NotificationPreferenceFull[]>`
  - `saveNotificationPreference(db, input: SaveNotificationPreferenceInput): Promise<NotificationPreferenceFull>`
  - `removeNotificationPreference(db, userCid, hospitalCode): Promise<void>`
  - `subscribersForEvent(db, hospitalCode, eventKey): Promise<{ cid: string; detailLevel: NotificationDetailLevel }[]>`
  - Existing `getNotificationPreference` / `upsertNotificationPreference` / `enabledSubscriberCids` / `backfillActiveConsultDoctorPrefs` stay exported and behaviour-identical — `startup.ts` and `risk-alert.ts` still call them.

- [ ] **Step 1: Write the failing test**

```typescript
// append to tests/unit/services/notification-preference.test.ts
import {
  listNotificationPreferences,
  saveNotificationPreference,
  removeNotificationPreference,
  subscribersForEvent,
} from '@/services/notification-preference';
import { notificationEventKeys } from '@/config/notification-events';

describe('multi-hospital, per-event preferences', () => {
  it('saves one row per watched hospital and lists them all', async () => {
    await saveNotificationPreference(db, {
      userCid: '3320500282121',
      hospitalCode: '10670',
      mophLineEnabled: true,
      detailLevel: 'full',
      digestHour: 8,
      events: ['anc_hr3'],
    });
    await saveNotificationPreference(db, {
      userCid: '3320500282121',
      hospitalCode: '11002',
      mophLineEnabled: true,
      detailLevel: 'aggregate',
      digestHour: 8,
      events: ['anc_hr3', 'labor_emergency'],
    });
    const prefs = await listNotificationPreferences(db, '3320500282121');
    expect(prefs.map((p) => p.hospitalCode).sort()).toEqual(['10670', '11002']);
    expect(prefs.find((p) => p.hospitalCode === '10670')?.events).toEqual(['anc_hr3']);
  });

  it('treats a row with NO event children as subscribed to everything', async () => {
    // Simulates a pre-migration row.
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO notification_preferences
         (id, user_cid, hospital_code, moph_line_enabled, created_at, updated_at)
       VALUES ('legacy', '3320500282199', '10670', true, ?, ?)`,
      [now, now],
    );
    const prefs = await listNotificationPreferences(db, '3320500282199');
    expect(prefs[0].events).toEqual(notificationEventKeys());
    const subs = await subscribersForEvent(db, '10670', 'anc_hr3');
    expect(subs.map((s) => s.cid)).toContain('3320500282199');
  });

  it('returns only subscribers of the requested event, with their detail level', async () => {
    await saveNotificationPreference(db, {
      userCid: '3320500282121',
      hospitalCode: '10670',
      mophLineEnabled: true,
      detailLevel: 'full',
      digestHour: 8,
      events: ['anc_hr3'],
    });
    await saveNotificationPreference(db, {
      userCid: '3320500282122',
      hospitalCode: '10670',
      mophLineEnabled: true,
      detailLevel: 'aggregate',
      digestHour: 8,
      events: ['labor_emergency'],
    });
    const anc = await subscribersForEvent(db, '10670', 'anc_hr3');
    expect(anc).toEqual([{ cid: '3320500282121', detailLevel: 'full' }]);
  });

  it('a muted row (moph_line_enabled=false) subscribes to nothing', async () => {
    await saveNotificationPreference(db, {
      userCid: '3320500282123',
      hospitalCode: '10670',
      mophLineEnabled: false,
      detailLevel: 'full',
      digestHour: 8,
      events: ['anc_hr3'],
    });
    const subs = await subscribersForEvent(db, '10670', 'anc_hr3');
    expect(subs.map((s) => s.cid)).not.toContain('3320500282123');
  });

  it('re-saving replaces the event set rather than accumulating', async () => {
    const base = {
      userCid: '3320500282124',
      hospitalCode: '10670',
      mophLineEnabled: true,
      detailLevel: 'full' as const,
      digestHour: 8,
    };
    await saveNotificationPreference(db, { ...base, events: ['anc_hr3', 'labor_emergency'] });
    await saveNotificationPreference(db, { ...base, events: ['labor_emergency'] });
    const prefs = await listNotificationPreferences(db, '3320500282124');
    expect(prefs[0].events).toEqual(['labor_emergency']);
  });

  it('removing a watched hospital deletes its subscriptions too', async () => {
    await saveNotificationPreference(db, {
      userCid: '3320500282125',
      hospitalCode: '11002',
      mophLineEnabled: true,
      detailLevel: 'aggregate',
      digestHour: 8,
      events: ['anc_hr3'],
    });
    await removeNotificationPreference(db, '3320500282125', '11002');
    expect(await listNotificationPreferences(db, '3320500282125')).toHaveLength(0);
    const orphans = await db.query<{ c: number }>(
      `SELECT COUNT(*) AS c FROM notification_event_subscriptions`,
    );
    expect(Number(orphans[0].c)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/services/notification-preference.test.ts`
Expected: FAIL — `listNotificationPreferences is not a function`

- [ ] **Step 3: Write the implementation**

Add to `src/services/notification-preference.ts`, keeping every existing export
untouched:

```typescript
import { randomUUID } from 'crypto';
import { notificationEventKeys } from '@/config/notification-events';

export type NotificationDetailLevel = 'full' | 'aggregate';

export interface NotificationPreferenceFull {
  id: string;
  userCid: string;
  hospitalCode: string;
  mophLineEnabled: boolean;
  detailLevel: NotificationDetailLevel;
  digestHour: number;
  /** ENABLED event keys. A row with no children means every event. */
  events: string[];
}

export interface SaveNotificationPreferenceInput {
  userCid: string;
  hospitalCode: string;
  mophLineEnabled: boolean;
  detailLevel: NotificationDetailLevel;
  digestHour: number;
  events: string[];
}

export async function listNotificationPreferences(
  db: DatabaseAdapter,
  userCid: string,
): Promise<NotificationPreferenceFull[]> {
  const rows = await db.query<{
    id: string;
    user_cid: string;
    hospital_code: string;
    moph_line_enabled: boolean;
    detail_level: string;
    digest_hour: number;
  }>(
    `SELECT id, user_cid, hospital_code, moph_line_enabled, detail_level, digest_hour
     FROM notification_preferences WHERE user_cid = ? ORDER BY hospital_code`,
    [userCid],
  );
  const out: NotificationPreferenceFull[] = [];
  for (const r of rows) {
    const subs = await db.query<{ event_key: string; enabled: boolean }>(
      `SELECT event_key, enabled FROM notification_event_subscriptions WHERE preference_id = ?`,
      [r.id],
    );
    // Back-compat: no children = subscribed to everything. Without this a
    // pre-migration row would silently stop delivering.
    const events =
      subs.length === 0
        ? notificationEventKeys()
        : subs.filter((s) => s.enabled).map((s) => s.event_key);
    out.push({
      id: r.id,
      userCid: r.user_cid,
      hospitalCode: r.hospital_code,
      mophLineEnabled: r.moph_line_enabled,
      detailLevel: (r.detail_level as NotificationDetailLevel) ?? 'aggregate',
      digestHour: Number(r.digest_hour ?? 8),
      events,
    });
  }
  return out;
}

export async function saveNotificationPreference(
  db: DatabaseAdapter,
  input: SaveNotificationPreferenceInput,
): Promise<NotificationPreferenceFull> {
  const now = new Date().toISOString();
  const existing = await db.query<{ id: string }>(
    `SELECT id FROM notification_preferences WHERE user_cid = ? AND hospital_code = ?`,
    [input.userCid, input.hospitalCode],
  );
  const id = existing[0]?.id ?? randomUUID();
  if (existing[0]) {
    await db.execute(
      `UPDATE notification_preferences
       SET moph_line_enabled = ?, detail_level = ?, digest_hour = ?, updated_at = ?
       WHERE id = ?`,
      [input.mophLineEnabled, input.detailLevel, input.digestHour, now, id],
    );
  } else {
    await db.execute(
      `INSERT INTO notification_preferences
         (id, user_cid, hospital_code, moph_line_enabled, detail_level, digest_hour, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.userCid,
        input.hospitalCode,
        input.mophLineEnabled,
        input.detailLevel,
        input.digestHour,
        now,
        now,
      ],
    );
  }
  // Replace the event set wholesale — a partial update would leave stale rows
  // that read as "still subscribed".
  await db.execute(`DELETE FROM notification_event_subscriptions WHERE preference_id = ?`, [id]);
  const valid = new Set(notificationEventKeys());
  for (const key of input.events) {
    if (!valid.has(key)) continue; // unknown keys are dropped, never stored
    await db.execute(
      `INSERT INTO notification_event_subscriptions
         (id, preference_id, event_key, enabled, created_at, updated_at)
       VALUES (?, ?, ?, true, ?, ?)`,
      [randomUUID(), id, key, now, now],
    );
  }
  const saved = await listNotificationPreferences(db, input.userCid);
  return saved.find((p) => p.hospitalCode === input.hospitalCode) as NotificationPreferenceFull;
}

export async function removeNotificationPreference(
  db: DatabaseAdapter,
  userCid: string,
  hospitalCode: string,
): Promise<void> {
  const rows = await db.query<{ id: string }>(
    `SELECT id FROM notification_preferences WHERE user_cid = ? AND hospital_code = ?`,
    [userCid, hospitalCode],
  );
  if (!rows[0]) return;
  await db.execute(`DELETE FROM notification_event_subscriptions WHERE preference_id = ?`, [
    rows[0].id,
  ]);
  await db.execute(`DELETE FROM notification_preferences WHERE id = ?`, [rows[0].id]);
}

/**
 * CIDs subscribed to one event at one hospital, with the detail level to render
 * for each. A preference row with NO event children counts as subscribed (the
 * back-compat rule) — expressed as a NOT EXISTS branch so it stays one query.
 */
export async function subscribersForEvent(
  db: DatabaseAdapter,
  hospitalCode: string,
  eventKey: string,
): Promise<{ cid: string; detailLevel: NotificationDetailLevel }[]> {
  const rows = await db.query<{ user_cid: string; detail_level: string }>(
    `SELECT p.user_cid, p.detail_level
       FROM notification_preferences p
      WHERE p.hospital_code = ?
        AND p.moph_line_enabled = true
        AND (
          EXISTS (
            SELECT 1 FROM notification_event_subscriptions s
             WHERE s.preference_id = p.id AND s.event_key = ? AND s.enabled = true
          )
          OR NOT EXISTS (
            SELECT 1 FROM notification_event_subscriptions s2 WHERE s2.preference_id = p.id
          )
        )`,
    [hospitalCode, eventKey],
  );
  return rows.map((r) => ({
    cid: r.user_cid,
    detailLevel: (r.detail_level as NotificationDetailLevel) ?? 'aggregate',
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/services/notification-preference.test.ts`
Expected: PASS (existing tests + 6 new)

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && npm run lint
git add src/services/notification-preference.ts tests/unit/services/notification-preference.test.ts
git commit -m "feat(notify): multi-hospital preferences with per-event subscriptions"
```

---

## Task 4: Recipient resolution — event filter and detail level

**Files:**
- Modify: `src/services/risk-alert.ts:84-148`
- Test: `tests/unit/services/risk-alert.test.ts`

**Interfaces:**
- Consumes: Task 3 `subscribersForEvent`.
- Produces: `Recipient` gains `detailLevel: 'full' | 'aggregate'`; `resolveRecipients(db, hospitalId, province, hospitalCodeOverride, eventKey)` — `eventKey` is REQUIRED and `enqueueAlertEvent` passes its `source` as that key.

Consult doctors and center monitors keep `detailLevel: 'full'` — they are
admin-configured clinical roles, unchanged by this work.

- [ ] **Step 1: Write the failing test**

```typescript
// append to tests/unit/services/risk-alert.test.ts
// `ctx` is the existing AlertEventContext fixture in this file, targeting
// hospital hcode 10670.
describe('resolveRecipients — event filter + detail level', () => {
  it('excludes a self-subscriber who did not subscribe to this event', async () => {
    await saveNotificationPreference(db, {
      userCid: '3320500282121',
      hospitalCode: '10670',
      mophLineEnabled: true,
      detailLevel: 'full',
      digestHour: 8,
      events: ['labor_emergency'],
    });
    const n = await enqueueHighRiskAlert(db, ctx);
    expect(n).toBe(0);
  });

  it('includes a self-subscriber who did subscribe, at their detail level', async () => {
    await saveNotificationPreference(db, {
      userCid: '3320500282121',
      hospitalCode: '10670',
      mophLineEnabled: true,
      detailLevel: 'aggregate',
      digestHour: 8,
      events: ['anc_hr3'],
    });
    const n = await enqueueHighRiskAlert(db, ctx);
    expect(n).toBe(1);
    const rows = await db.query<{ recipient_scope: string }>(
      `SELECT recipient_scope FROM moph_alert_log WHERE recipient_cid = '3320500282121'`,
    );
    expect(rows[0].recipient_scope).toBe('self_subscribed');
  });

  it('keeps delivering to a legacy row that has no event children', async () => {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO notification_preferences
         (id, user_cid, hospital_code, moph_line_enabled, created_at, updated_at)
       VALUES ('legacy', '3320500282199', '10670', true, ?, ?)`,
      [now, now],
    );
    const n = await enqueueHighRiskAlert(db, ctx);
    expect(n).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/services/risk-alert.test.ts`
Expected: FAIL — the first test returns 1 (no event filtering yet)

- [ ] **Step 3: Write the implementation**

In `src/services/risk-alert.ts`:

1. Add `detailLevel` to the `Recipient` interface:

```typescript
interface Recipient {
  cid: string;
  name: string;
  scope: 'province_center' | 'hospital_staff' | 'self_subscribed';
  detailLevel: 'full' | 'aggregate';
}
```

2. Change the signature:

```typescript
async function resolveRecipients(
  db: DatabaseAdapter,
  hospitalId: string,
  province: string,
  hospitalCodeOverride: string | undefined,
  eventKey: string,
): Promise<Recipient[]> {
```

3. Replace the `enabled` set and the loops that use it (currently lines 119-138):

```typescript
  const subscribers = await subscribersForEvent(db, hospitalCode, eventKey);
  const byCid = new Map(subscribers.map((s) => [s.cid, s.detailLevel]));
  const allowed: Recipient[] = [];
  for (const c of center) {
    allowed.push({
      cid: c.cid,
      name: c.name,
      scope: 'province_center' as const,
      detailLevel: 'full',
    });
  }
  for (const s of staff) {
    if (byCid.has(s.cid)) {
      allowed.push({
        cid: s.cid,
        name: s.name,
        scope: 'hospital_staff' as const,
        detailLevel: 'full',
      });
    }
  }
  const already = new Set(allowed.map((r) => r.cid));
  for (const [cid, detailLevel] of byCid) {
    if (!already.has(cid)) {
      allowed.push({ cid, name: '', scope: 'self_subscribed' as const, detailLevel });
    }
  }
```

4. Replace `enabledSubscriberCids` in the import list with `subscribersForEvent`.

5. In `enqueueAlertEvent`, pass the source as the event key:

```typescript
  const recipients = await resolveRecipients(db, ctx.hospitalId, ctx.province, ctx.hcode, source);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/services/risk-alert.test.ts`
Expected: PASS (existing tests + 3 new)

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && npm run lint
git add src/services/risk-alert.ts tests/unit/services/risk-alert.test.ts
git commit -m "feat(notify): filter recipients by subscribed event, carry detail level"
```

---

## Task 5: API — multi-hospital GET/PUT plus DELETE

**Files:**
- Modify: `src/app/api/profile/notification-preference/route.ts`
- Test: `tests/unit/api/profile-notification-preference.test.ts`

**Interfaces:**
- Consumes: Task 1 catalog, Task 3 service.
- Produces:
  - `GET` → `{ userCid, ownHospitalCode, events: NotificationEvent[], preferences: NotificationPreferenceFull[] }` (only `implemented` events).
  - `PUT` body `{ hospitalCode, mophLineEnabled, digestHour, events: string[] }` → the saved `NotificationPreferenceFull`. `detailLevel` is **derived server-side**, never accepted from the body.
  - `DELETE ?hospitalCode=…` → `{ ok: true }`.

- [ ] **Step 1: Write the failing test**

```typescript
// append to tests/unit/api/profile-notification-preference.test.ts
// This file already imports { GET, PUT }; add DELETE to that import.
describe('multi-hospital preference API', () => {
  it('derives detailLevel=full for the session hospital and aggregate for others', async () => {
    mockSessionUser = testSessionUser({ hospitalCode: '10670', userCid: '3320500282121' });

    const own = await PUT(
      jsonRequest({
        hospitalCode: '10670',
        mophLineEnabled: true,
        digestHour: 8,
        events: ['anc_hr3'],
      }) as never,
    );
    expect(((await own.json()) as { detailLevel: string }).detailLevel).toBe('full');

    const other = await PUT(
      jsonRequest({
        hospitalCode: '11002',
        mophLineEnabled: true,
        digestHour: 8,
        events: ['anc_hr3'],
      }) as never,
    );
    expect(((await other.json()) as { detailLevel: string }).detailLevel).toBe('aggregate');
  });

  it('ignores a detailLevel supplied in the body (no privilege escalation)', async () => {
    mockSessionUser = testSessionUser({ hospitalCode: '10670', userCid: '3320500282121' });
    const res = await PUT(
      jsonRequest({
        hospitalCode: '11002',
        mophLineEnabled: true,
        digestHour: 8,
        events: ['anc_hr3'],
        detailLevel: 'full',
      }) as never,
    );
    expect(((await res.json()) as { detailLevel: string }).detailLevel).toBe('aggregate');
  });

  it('GET returns only implemented events plus every watched hospital', async () => {
    mockSessionUser = testSessionUser({ hospitalCode: '10670', userCid: '3320500282121' });
    await PUT(
      jsonRequest({
        hospitalCode: '11002',
        mophLineEnabled: true,
        digestHour: 8,
        events: ['anc_hr3'],
      }) as never,
    );
    const body = (await (await GET(new Request('http://t/api') as never)).json()) as {
      events: { key: string }[];
      preferences: { hospitalCode: string }[];
    };
    expect(body.events.map((e) => e.key).sort()).toEqual(['anc_hr3', 'labor_emergency']);
    expect(body.preferences.map((p) => p.hospitalCode)).toContain('11002');
  });

  it('rejects an unknown event key', async () => {
    mockSessionUser = testSessionUser({ hospitalCode: '10670', userCid: '3320500282121' });
    const res = await PUT(
      jsonRequest({
        hospitalCode: '10670',
        mophLineEnabled: true,
        digestHour: 8,
        events: ['not_an_event'],
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('rejects a digestHour outside 0-23', async () => {
    mockSessionUser = testSessionUser({ hospitalCode: '10670', userCid: '3320500282121' });
    const res = await PUT(
      jsonRequest({
        hospitalCode: '10670',
        mophLineEnabled: true,
        digestHour: 25,
        events: ['anc_hr3'],
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('DELETE removes a watched hospital', async () => {
    mockSessionUser = testSessionUser({ hospitalCode: '10670', userCid: '3320500282121' });
    await PUT(
      jsonRequest({
        hospitalCode: '11002',
        mophLineEnabled: true,
        digestHour: 8,
        events: ['anc_hr3'],
      }) as never,
    );
    const res = await DELETE(
      new Request('http://t/api?hospitalCode=11002', { method: 'DELETE' }) as never,
    );
    expect(res.status).toBe(200);
    const body = (await (await GET(new Request('http://t/api') as never)).json()) as {
      preferences: { hospitalCode: string }[];
    };
    expect(body.preferences.map((p) => p.hospitalCode)).not.toContain('11002');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/api/profile-notification-preference.test.ts`
Expected: FAIL — `DELETE is not a function`

- [ ] **Step 3: Write the implementation**

Rewrite the route, keeping the session-derived identity rule and the existing
`isValidCid13` guard:

```typescript
import { implementedNotificationEvents, findNotificationEvent } from '@/config/notification-events';
import {
  listNotificationPreferences,
  saveNotificationPreference,
  removeNotificationPreference,
} from '@/services/notification-preference';

export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const userCid = String(session.user.userCid ?? '');
  const ownHospitalCode = String(session.user.hospitalCode ?? '');
  await ensureInit();
  const db = await getDatabase();
  const preferences = await listNotificationPreferences(db, userCid);
  return NextResponse.json({
    userCid,
    ownHospitalCode,
    events: implementedNotificationEvents(),
    preferences,
  });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const userCid = String(session.user.userCid ?? '');
  const ownHospitalCode = String(session.user.hospitalCode ?? '');
  if (!isValidCid13(userCid)) {
    return NextResponse.json({ error: 'CID ของผู้ใช้ไม่ครบ 13 หลัก' }, { status: 400 });
  }
  let body: {
    hospitalCode?: unknown;
    mophLineEnabled?: unknown;
    digestHour?: unknown;
    events?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const hospitalCode = typeof body.hospitalCode === 'string' ? body.hospitalCode.trim() : '';
  if (!hospitalCode) {
    return NextResponse.json({ error: 'ต้องระบุรหัสโรงพยาบาล' }, { status: 400 });
  }
  if (typeof body.mophLineEnabled !== 'boolean') {
    return NextResponse.json({ error: 'mophLineEnabled boolean required' }, { status: 400 });
  }
  const digestHour = Number(body.digestHour ?? 8);
  if (!Number.isInteger(digestHour) || digestHour < 0 || digestHour > 23) {
    return NextResponse.json({ error: 'เวลาสรุปรายวันต้องอยู่ระหว่าง 0-23' }, { status: 400 });
  }
  const events = Array.isArray(body.events) ? body.events.map(String) : [];
  const unknown = events.filter((k) => !findNotificationEvent(k));
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `ไม่รู้จักเหตุการณ์: ${unknown.join(', ')}` },
      { status: 400 },
    );
  }
  // detailLevel is DERIVED, never taken from the body: patient-level detail is
  // only ever granted for the hospital on the caller's own session.
  const detailLevel = hospitalCode === ownHospitalCode ? 'full' : 'aggregate';
  await ensureInit();
  const db = await getDatabase();
  const saved = await saveNotificationPreference(db, {
    userCid,
    hospitalCode,
    mophLineEnabled: body.mophLineEnabled,
    detailLevel,
    digestHour,
    events,
  });
  return NextResponse.json(saved);
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const userCid = String(session.user.userCid ?? '');
  const hospitalCode = new URL(request.url).searchParams.get('hospitalCode') ?? '';
  if (!hospitalCode) {
    return NextResponse.json({ error: 'ต้องระบุรหัสโรงพยาบาล' }, { status: 400 });
  }
  await ensureInit();
  const db = await getDatabase();
  await removeNotificationPreference(db, userCid, hospitalCode);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/api/profile-notification-preference.test.ts`
Expected: PASS (existing tests + 6 new)

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && npm run lint
git add src/app/api/profile/notification-preference/route.ts tests/unit/api/profile-notification-preference.test.ts
git commit -m "feat(notify): per-event, multi-hospital preference API with derived detail level"
```

---

## Task 6: UI — per-hospital, per-event preference card

**Files:**
- Modify: `src/components/profile/NotificationPreferenceCard.tsx`
- Test: `tests/unit/components/NotificationPreferenceCard.test.tsx`

**Interfaces:**
- Consumes: Task 5 API.
- Produces: no exported API change — still `<NotificationPreferenceCard />`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/components/NotificationPreferenceCard.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationPreferenceCard } from '@/components/profile/NotificationPreferenceCard';

const GET_BODY = {
  userCid: '3320500282121',
  ownHospitalCode: '10670',
  events: [
    {
      key: 'anc_hr3',
      tier: 'urgent',
      detail: 'patient',
      labelTh: 'ครรภ์เสี่ยงสูง (ANC HR3)',
      descriptionTh: 'พบหญิงตั้งครรภ์ที่จัดเป็นความเสี่ยงสูงระดับ HR3',
      implemented: true,
    },
    {
      key: 'labor_emergency',
      tier: 'urgent',
      detail: 'patient',
      labelTh: 'ภาวะฉุกเฉินในห้องคลอด',
      descriptionTh: 'ผลคัดกรองแรกรับเข้าเกณฑ์ฉุกเฉิน',
      implemented: true,
    },
  ],
  preferences: [
    {
      id: 'p1',
      userCid: '3320500282121',
      hospitalCode: '10670',
      mophLineEnabled: true,
      detailLevel: 'full',
      digestHour: 8,
      events: ['anc_hr3'],
    },
  ],
};

describe('NotificationPreferenceCard', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('renders one checkbox per event with the saved state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => GET_BODY }) as Response),
    );
    render(<NotificationPreferenceCard />);
    const anc = await screen.findByRole('checkbox', { name: /ANC HR3/ });
    expect(anc).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /ฉุกเฉินในห้องคลอด/ })).not.toBeChecked();
  });

  it('PUTs the full event set when a checkbox is toggled', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined)
        return { ok: true, status: 200, json: async () => GET_BODY } as Response;
      return {
        ok: true,
        status: 200,
        json: async () => ({ ...GET_BODY.preferences[0], events: ['anc_hr3', 'labor_emergency'] }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<NotificationPreferenceCard />);

    await user.click(await screen.findByRole('checkbox', { name: /ฉุกเฉินในห้องคลอด/ }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls as unknown as [string, RequestInit | undefined][];
      const put = calls.find((c) => c[1]?.method === 'PUT');
      expect(put).toBeDefined();
      expect(JSON.parse(String(put?.[1]?.body)).events.sort()).toEqual([
        'anc_hr3',
        'labor_emergency',
      ]);
    });
  });

  it('labels the session hospital and warns that others are aggregate-only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              ...GET_BODY,
              preferences: [
                ...GET_BODY.preferences,
                {
                  id: 'p2',
                  userCid: '3320500282121',
                  hospitalCode: '11002',
                  mophLineEnabled: true,
                  detailLevel: 'aggregate',
                  digestHour: 8,
                  events: ['anc_hr3'],
                },
              ],
            }),
          }) as Response,
      ),
    );
    render(<NotificationPreferenceCard />);
    expect(await screen.findByText(/โรงพยาบาลของคุณ/)).toBeInTheDocument();
    expect(screen.getByText(/เฉพาะยอดรวม/)).toBeInTheDocument();
  });

  it('shows an actionable Thai error and reverts when saving fails', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined)
        return { ok: true, status: 200, json: async () => GET_BODY } as Response;
      return { ok: false, status: 500, json: async () => ({ error: 'boom' }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<NotificationPreferenceCard />);

    await user.click(await screen.findByRole('checkbox', { name: /ฉุกเฉินในห้องคลอด/ }));

    expect(await screen.findByText(/บันทึกไม่สำเร็จ/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /ฉุกเฉินในห้องคลอด/ })).not.toBeChecked(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/components/NotificationPreferenceCard.test.tsx`
Expected: FAIL — no checkboxes rendered (the card still renders one switch)

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/profile/NotificationPreferenceCard.tsx
'use client';

// Per-hospital, per-event notification preferences.
// Plan: docs/superpowers/plans/2026-08-07-notification-events.md
//
// Optimistic with revert on error and an actionable Thai message — the same
// contract the single-switch version had (constitution §V).
import { useEffect, useState, useCallback } from 'react';

interface NotificationEventDto {
  key: string;
  tier: 'urgent' | 'digest';
  detail: 'patient' | 'aggregate';
  labelTh: string;
  descriptionTh: string;
  implemented: boolean;
}

interface PreferenceDto {
  id: string;
  userCid: string;
  hospitalCode: string;
  mophLineEnabled: boolean;
  detailLevel: 'full' | 'aggregate';
  digestHour: number;
  events: string[];
}

const TIER_LABEL: Record<NotificationEventDto['tier'], string> = {
  urgent: 'ทันที',
  digest: 'สรุปรายวัน',
};

export function NotificationPreferenceCard() {
  const [ownHospitalCode, setOwnHospitalCode] = useState('');
  const [events, setEvents] = useState<NotificationEventDto[]>([]);
  const [preferences, setPreferences] = useState<PreferenceDto[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [addCode, setAddCode] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/profile/notification-preference');
      if (!res.ok) throw new Error('http');
      const body = (await res.json()) as {
        ownHospitalCode: string;
        events: NotificationEventDto[];
        preferences: PreferenceDto[];
      };
      setOwnHospitalCode(body.ownHospitalCode);
      setEvents(body.events);
      setPreferences(body.preferences);
    } catch {
      setError('โหลดการตั้งค่าไม่สำเร็จ ลองใหม่อีกครั้ง');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Persist one row. Optimistic: `next` is applied immediately, reverted on failure. */
  async function save(next: PreferenceDto) {
    const previous = preferences;
    setPreferences((rows) =>
      rows.some((r) => r.hospitalCode === next.hospitalCode)
        ? rows.map((r) => (r.hospitalCode === next.hospitalCode ? next : r))
        : [...rows, next],
    );
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/profile/notification-preference', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hospitalCode: next.hospitalCode,
          mophLineEnabled: next.mophLineEnabled,
          digestHour: next.digestHour,
          events: next.events,
        }),
      });
      if (!res.ok) throw new Error('http');
      const saved = (await res.json()) as PreferenceDto;
      setPreferences((rows) =>
        rows.map((r) => (r.hospitalCode === saved.hospitalCode ? saved : r)),
      );
    } catch {
      setPreferences(previous);
      setError('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  }

  async function removeHospital(hospitalCode: string) {
    const previous = preferences;
    setPreferences((rows) => rows.filter((r) => r.hospitalCode !== hospitalCode));
    try {
      const res = await fetch(
        `/api/profile/notification-preference?hospitalCode=${encodeURIComponent(hospitalCode)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('http');
    } catch {
      setPreferences(previous);
      setError('ลบไม่สำเร็จ ลองใหม่อีกครั้ง');
    }
  }

  function toggleEvent(row: PreferenceDto, key: string) {
    const nextEvents = row.events.includes(key)
      ? row.events.filter((k) => k !== key)
      : [...row.events, key];
    void save({ ...row, events: nextEvents });
  }

  const tiers: NotificationEventDto['tier'][] = ['urgent', 'digest'];

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 p-4">
      <div>
        <p className="font-medium">การแจ้งเตือนทาง LINE (MOPH Prompt)</p>
        <p className="text-xs text-slate-500">
          เลือกเหตุการณ์ที่ต้องการรับ และโรงพยาบาลที่ต้องการติดตาม
        </p>
      </div>

      {error && <p className="text-sm text-rose-700">{error}</p>}

      {preferences.map((row) => {
        const isOwn = row.hospitalCode === ownHospitalCode;
        const hasDigest = events.some(
          (e) => e.tier === 'digest' && row.events.includes(e.key),
        );
        return (
          <div key={row.hospitalCode} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">รหัส {row.hospitalCode}</p>
                <p className="text-xs text-slate-500">
                  {isOwn ? 'โรงพยาบาลของคุณ — แจ้งระดับผู้ป่วยได้' : 'รับเฉพาะยอดรวม ไม่ระบุตัวผู้ป่วย'}
                </p>
              </div>
              {!isOwn && (
                <button
                  onClick={() => void removeHospital(row.hospitalCode)}
                  className="text-xs text-slate-500 hover:text-rose-700"
                  aria-label={`เลิกติดตาม ${row.hospitalCode}`}
                >
                  เลิกติดตาม
                </button>
              )}
            </div>

            {tiers.map((tier) => {
              const tierEvents = events.filter((e) => e.tier === tier);
              if (tierEvents.length === 0) return null;
              return (
                <div key={tier} className="mt-2">
                  <p className="text-[11px] font-semibold text-slate-400">{TIER_LABEL[tier]}</p>
                  {tierEvents.map((e) => (
                    <label key={e.key} className="mt-1 flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        aria-label={e.labelTh}
                        checked={row.events.includes(e.key)}
                        disabled={busy}
                        onChange={() => toggleEvent(row, e.key)}
                        className="mt-1"
                      />
                      <span>
                        {e.labelTh}
                        <span className="block text-xs text-slate-500">{e.descriptionTh}</span>
                      </span>
                    </label>
                  ))}
                </div>
              );
            })}

            {hasDigest && (
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                เวลาส่งสรุปรายวัน
                <select
                  value={row.digestHour}
                  aria-label="เวลาส่งสรุปรายวัน"
                  onChange={(ev) => void save({ ...row, digestHour: Number(ev.target.value) })}
                  className="rounded border border-slate-300 px-2 py-1"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}:00 น.
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-2">
        <input
          value={addCode}
          onChange={(e) => setAddCode(e.target.value)}
          placeholder="รหัสโรงพยาบาล 5 หลัก"
          aria-label="เพิ่มโรงพยาบาลที่ต้องการติดตาม"
          className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <button
          disabled={!addCode.trim() || busy}
          onClick={() => {
            const code = addCode.trim();
            setAddCode('');
            void save({
              id: '',
              userCid: '',
              hospitalCode: code,
              mophLineEnabled: true,
              detailLevel: code === ownHospitalCode ? 'full' : 'aggregate',
              digestHour: 8,
              events: [],
            });
          }}
          className="rounded bg-teal-600 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          เพิ่ม
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/components/NotificationPreferenceCard.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && npm run lint
git add src/components/profile/NotificationPreferenceCard.tsx tests/unit/components/NotificationPreferenceCard.test.tsx
git commit -m "feat(notify): per-hospital, per-event notification preference UI"
```

---

## Task 7: Full verification and deploy

- [ ] **Step 1: Run the whole unit suite**

Run: `npx vitest run tests/unit`
Expected: all pass. `tests/unit/api/browser-push-moph-alerts.test.ts` errors with
a worker-termination timeout on clean `main` too — pre-existing, not caused here.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no output.

- [ ] **Step 3: Confirm nothing silently unsubscribed**

```bash
docker compose exec -T postgres psql -U kklrms -d kklrms -c \
  "SELECT COUNT(*) AS prefs, COUNT(*) FILTER (WHERE moph_line_enabled) AS enabled FROM notification_preferences;"
docker compose exec -T postgres psql -U kklrms -d kklrms -c \
  "SELECT COUNT(*) AS subs FROM notification_event_subscriptions;"
```

Expected: `prefs`/`enabled` unchanged from before deploy, `subs` = 0 until users
touch the new UI. Zero children is the back-compat "all events" case, so
delivery must be unaffected.

- [ ] **Step 4: Deploy**

Run: `npm run deploy`, then poll `docker compose ps` until the app reports
`healthy`.

- [ ] **Step 5: Push**

```bash
git push origin main
```

---

## Later phases (outline only — each needs its own plan)

**Phase 2 — urgent producers.** `partograph_critical` (partograph observation
ingest, gate on `highestSeverity(alerts) === 'CRITICAL'`), `cpd_high` (gate on
`classifyRiskLevel(score) === RiskLevel.HIGH` in `cpd-persist.ts`),
`referral_incoming` and `referral_overdue` (referral persist + a sync-tick sweep
using `classifyReferralAge`). Each flips its `implemented` flag to `true` in the
catalog, which is what makes it appear in the UI.

**Phase 3 — digest.** `tier` column on `moph_alert_log`, a digest builder that
runs on the sync tick past `digest_hour`, and the three digest events
(`anc_overdue`, `edc_due_soon`, `outcome_abnormal`).

**Phase 4 — `sync_offline` and undeliverable recipients.** Province-wide
connection sweep, plus surfacing repeated MOPH Prompt send failures on the
profile page.
