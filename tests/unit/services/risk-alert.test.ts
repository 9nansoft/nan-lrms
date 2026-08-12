// TDD (Red→Green) for the risk-alert enqueue orchestrator.
// Pins codex decisions: one orchestrator, two producers (HIGH + EMERGENCY);
// recipient resolution (consult_doctors + center_monitors); dedup via unique
// index conflict-skip; NO LINE I/O in enqueue (sender must not be called).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PgliteAdapter, createPglite } from '@/db/pglite-adapter';
import { SchemaSync } from '@/db/schema-sync';
import { ALL_TABLES } from '@/db/tables/index';
import { randomUUID } from 'node:crypto';
import { generateKey, decryptSafe } from '@/lib/encryption';
import {
  enqueueHighRiskAlert,
  enqueueEmergencyAlert,
  type AlertEventContext,
  type EmergencyEventContext,
} from '@/services/risk-alert';
import {
  upsertNotificationPreference,
  saveNotificationPreference,
} from '@/services/notification-preference';

// The orchestrator now encrypts patient_name at rest (mirrors cached_patients).
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? generateKey();

// Stub the sender so we can assert enqueue NEVER touches LINE I/O. Keep
// isValidCid real (risk-alert now imports it to filter malformed recipient CIDs).
vi.mock('@/services/moph-prompt', async () => {
  const actual =
    await vi.importActual<typeof import('@/services/moph-prompt')>('@/services/moph-prompt');
  return {
    ...actual,
    sendMophPrompt: vi.fn(async () => {
      throw new Error('sendMophPrompt must NOT be called during enqueue');
    }),
  };
});

describe('risk-alert enqueue orchestrator', () => {
  let db: PgliteAdapter;
  let hospitalId: string;
  // hcode seeded in beforeEach — the hospital_code the opt-in gate matches on.
  const HOSPITAL_HCODE = '10682';

  beforeEach(async () => {
    db = new PgliteAdapter(createPglite());
    await SchemaSync.sync(db, ALL_TABLES, 'postgresql');
    hospitalId = randomUUID();
    await db.query(
      `INSERT INTO hospitals (id, hcode, name, level, province_code, is_active, created_at, updated_at)
       VALUES ($1,'10682','รพ.ขอนแก่น','P_PLUS','30',true,NOW(),NOW())`,
      [hospitalId],
    );
    // one active + one inactive consult doctor + one active with a MALFORMED cid
    // (codex gap-sweep: enqueue must skip recipients whose cid isn't 13 digits).
    await db.query(
      `INSERT INTO hospital_consult_doctors (id, hospital_id, cid, name, position, is_active, created_at, updated_at)
       VALUES ($1,$2,'3320500282121','นพ. ก','สูตินรี',true,NOW(),NOW()),
              ($3,$4,'3320500282122','นพ. ข','สูตินรี',false,NOW(),NOW()),
              ($5,$6,'123','นพ. หมดเลข','สูตินรี',true,NOW(),NOW())`,
      [randomUUID(), hospitalId, randomUUID(), hospitalId, randomUUID(), hospitalId],
    );
    // one active province center monitor
    await db.query(
      `INSERT INTO moph_center_monitors (id, province, cid, name, is_active, created_at, updated_at)
       VALUES ($1,'30','3320500282130','ศูนย์กลาง ขก.',true,NOW(),NOW())`,
      [randomUUID()],
    );
    // Default OFF gate: a seeded admin-listed CID delivers ONLY when it has an
    // enabled notification_preferences row. Opt the two valid active CIDs in so
    // the Default-ON assertions below keep their meaning (delivery now requires
    // opt-in, never assumed). The opt-in describe resets prefs to prove OFF.
    for (const cid of ['3320500282121', '3320500282130']) {
      await upsertNotificationPreference(db, cid, HOSPITAL_HCODE, true);
    }
  });
  afterEach(async () => {
    await db.close();
    vi.restoreAllMocks();
  });

  const baseCtx = <T extends AlertEventContext>(overrides: Partial<T> = {}): T =>
    ({
      hospitalId,
      originHcode: '10682',
      hospitalName: 'รพ.ขอนแก่น',
      caseRef: 'ANC-2026-0001',
      province: '30',
      confirmUrl: 'https://app/case/ANC-2026-0001',
      patientName: 'น.ส. A',
      localDate: '2026-07-26',
      ...overrides,
    }) as T;
  const ctxFixture = () => baseCtx<AlertEventContext>({});

  it('HIGH producer enqueues one row per active consult doctor + per active center monitor', async () => {
    const n = await enqueueHighRiskAlert(db, baseCtx<AlertEventContext>({}));
    // 1 active consult doctor + 1 center monitor = 2
    expect(n).toBe(2);
    const rows = await db.query<{ recipient_scope: string; recipient_cid: string }>(
      `SELECT recipient_scope, recipient_cid FROM moph_alert_log ORDER BY recipient_scope, recipient_cid`,
    );
    expect(rows.map((r) => r.recipient_scope).sort()).toEqual([
      'hospital_staff',
      'province_center',
    ]);
    // inactive consult doctor (cid ...22) must NOT be a recipient
    expect(rows.find((r) => r.recipient_cid === '3320500282122')).toBeUndefined();
  });

  it('EMERGENCY producer enqueues with source=maternal_triage, severity=emergency, rule_id from acuity', async () => {
    await enqueueEmergencyAlert(
      db,
      baseCtx<EmergencyEventContext>({ acuityLabel: 'ฉุกเฉิน', ruleId: 'emerg_hemorrhage' }),
    );
    const rows = await db.query<{ alert_source: string; severity: string; rule_id: string }>(
      `SELECT alert_source, severity, rule_id FROM moph_alert_log LIMIT 1`,
    );
    expect(rows[0].alert_source).toBe('maternal_triage');
    expect(rows[0].severity).toBe('emergency');
    expect(rows[0].rule_id).toBe('emerg_hemorrhage');
  });

  it('HIGH producer sets source=anc_hr3, severity=high, rule_id=hr3', async () => {
    await enqueueHighRiskAlert(db, baseCtx<AlertEventContext>({}));
    const rows = await db.query<{ alert_source: string; severity: string; rule_id: string }>(
      `SELECT alert_source, severity, rule_id FROM moph_alert_log LIMIT 1`,
    );
    expect(rows[0].alert_source).toBe('anc_hr3');
    expect(rows[0].severity).toBe('high');
    expect(rows[0].rule_id).toBe('hr3');
  });

  it('persists hospital_name + encrypted patient name for staff; center row has NULL name (PDPA)', async () => {
    await enqueueHighRiskAlert(db, baseCtx<AlertEventContext>({ patientName: 'น.ส. เอ' }));
    const rows = await db.query<{
      recipient_scope: string;
      hospital_name: string | null;
      patient_name_enc: string | null;
    }>(`SELECT recipient_scope, hospital_name, patient_name_enc FROM moph_alert_log`);
    const staff = rows.find((r) => r.recipient_scope === 'hospital_staff')!;
    const center = rows.find((r) => r.recipient_scope === 'province_center')!;
    // hospital_name stored on both (it's the sender context, not patient PII)
    expect(staff.hospital_name).toBe('รพ.ขอนแก่น');
    expect(center.hospital_name).toBe('รพ.ขอนแก่น');
    // staff row carries the ENCRYPTED patient name (decrypts back); center is NULL
    expect(staff.patient_name_enc).not.toBeNull();
    expect(decryptSafe(staff.patient_name_enc)).toBe('น.ส. เอ');
    expect(center.patient_name_enc).toBeNull();
  });

  it('dedup: second enqueue same key same day → no new rows (conflict-skip)', async () => {
    const first = await enqueueHighRiskAlert(db, baseCtx<AlertEventContext>({}));
    const second = await enqueueHighRiskAlert(db, baseCtx<AlertEventContext>({}));
    expect(second).toBe(0);
    const count = await db.query<{ c: number }>(`SELECT COUNT(*)::int as c FROM moph_alert_log`);
    expect(count[0].c).toBe(first);
  });

  it('distinct rule_id on same case → both kept (emergencies co-fire)', async () => {
    await enqueueEmergencyAlert(
      db,
      baseCtx<EmergencyEventContext>({ acuityLabel: 'ฉุกเฉิน', ruleId: 'emerg_hemorrhage' }),
    );
    await enqueueEmergencyAlert(
      db,
      baseCtx<EmergencyEventContext>({ acuityLabel: 'ฉุกเฉิน', ruleId: 'emerg_preeclampsia' }),
    );
    const rules = await db.query<{ rule_id: string }>(
      `SELECT DISTINCT rule_id FROM moph_alert_log ORDER BY rule_id`,
    );
    expect(rules.map((r) => r.rule_id)).toEqual(['emerg_hemorrhage', 'emerg_preeclampsia']);
  });

  it('writes status=pending and never calls sendMophPrompt (no LINE I/O)', async () => {
    const { sendMophPrompt } = await import('@/services/moph-prompt');
    await enqueueHighRiskAlert(db, baseCtx<AlertEventContext>({}));
    const rows = await db.query<{ status: string }>(`SELECT status FROM moph_alert_log LIMIT 1`);
    expect(rows[0].status).toBe('pending');
    expect(sendMophPrompt).not.toHaveBeenCalled();
  });

  it('center rows carry recipient_scope=province_center; hospital rows hospital_staff', async () => {
    await enqueueHighRiskAlert(db, baseCtx<AlertEventContext>({}));
    const rows = await db.query<{ recipient_scope: string; recipient_cid: string }>(
      `SELECT recipient_scope, recipient_cid FROM moph_alert_log`,
    );
    const center = rows.find((r) => r.recipient_scope === 'province_center');
    const staff = rows.find((r) => r.recipient_scope === 'hospital_staff');
    expect(center?.recipient_cid).toBe('3320500282130');
    expect(staff?.recipient_cid).toBe('3320500282121');
  });

  it('enqueues nothing when MOPH_ALERTS_ENABLED=false', async () => {
    process.env.MOPH_ALERTS_ENABLED = 'false';
    try {
      const n = await enqueueHighRiskAlert(db, baseCtx<AlertEventContext>({}));
      expect(n).toBe(0);
      const count = await db.query<{ c: number }>(`SELECT COUNT(*)::int as c FROM moph_alert_log`);
      expect(count[0].c).toBe(0);
    } finally {
      delete process.env.MOPH_ALERTS_ENABLED;
    }
  });

  it('skips recipients with a malformed (non-13-digit) CID (codex gap-sweep)', async () => {
    const n = await enqueueHighRiskAlert(db, baseCtx<AlertEventContext>({}));
    // 1 valid active consult doctor + 1 center monitor = 2 (malformed-cid doctor skipped)
    expect(n).toBe(2);
    const rows = await db.query<{ recipient_cid: string }>(
      `SELECT recipient_cid FROM moph_alert_log`,
    );
    expect(rows.find((r) => r.recipient_cid === '123')).toBeUndefined();
  });

  describe('risk-alert recipient opt-in (notification_preferences gate)', () => {
    // The outer beforeEach opted the admin-listed CIDs in; these tests must
    // start from true Default-OFF (no pref rows at all), so clear them.
    beforeEach(async () => {
      await db.query(`DELETE FROM notification_preferences`);
    });

    it('Default OFF: consult doctor with no pref row is NOT delivered, but center monitor (admin-configured) IS (P1-C)', async () => {
      await enqueueHighRiskAlert(db, ctxFixture());
      const rows = await db.query<{ recipient_cid: string; recipient_scope: string }>(
        `SELECT recipient_cid, recipient_scope FROM moph_alert_log`,
      );
      // P1-C: center monitors are an admin role -> always deliver, no opt-in gate.
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        recipient_cid: '3320500282130',
        recipient_scope: 'province_center',
      });
      // The staff consult doctor (no pref row) is Default-OFF -> NOT delivered.
      expect(rows.find((r) => r.recipient_cid === '3320500282121')).toBeUndefined();
    });

    it('enabled pref row for an admin-listed CID becomes a recipient', async () => {
      await upsertNotificationPreference(db, '3320500282121', HOSPITAL_HCODE, true);
      await enqueueHighRiskAlert(db, ctxFixture());
      const rows = await db.query<{ recipient_cid: string }>(
        `SELECT recipient_cid FROM moph_alert_log`,
      );
      expect(rows.map((r) => r.recipient_cid)).toContain('3320500282121');
    });

    it('self-subscriber (enabled row, not admin-listed) is a recipient (authoritative)', async () => {
      await upsertNotificationPreference(db, '5555555555555', HOSPITAL_HCODE, true);
      await enqueueHighRiskAlert(db, ctxFixture());
      const rows = await db.query<{ recipient_cid: string }>(
        `SELECT recipient_cid FROM moph_alert_log`,
      );
      expect(rows.map((r) => r.recipient_cid)).toContain('5555555555555');
    });
  });

  describe('resolveRecipients — event filter + detail level', () => {
    // Start from true Default-OFF like the opt-in describe: the outer beforeEach
    // opted two admin-listed CIDs in with legacy (childless) rows, which would
    // mask whether the event filter is doing anything.
    beforeEach(async () => {
      await db.query(`DELETE FROM notification_preferences`);
    });

    // The center monitor (3320500282130) is admin-configured and delivers
    // ungated (P1-C), so it is the constant baseline in every count below.
    const CENTER_CID = '3320500282130';
    const SELF_CID = '5555555555555';

    it('excludes a self-subscriber who did not subscribe to this event', async () => {
      await saveNotificationPreference(db, {
        userCid: SELF_CID,
        hospitalCode: HOSPITAL_HCODE,
        mophLineEnabled: true,
        detailLevel: 'full',
        digestHour: 8,
        events: ['maternal_triage'],
      });
      const n = await enqueueHighRiskAlert(db, ctxFixture());
      // Center monitor only — the self-subscriber watches maternal_triage, and
      // this is an anc_hr3 event.
      expect(n).toBe(1);
      const rows = await db.query<{ recipient_cid: string }>(
        `SELECT recipient_cid FROM moph_alert_log`,
      );
      expect(rows.map((r) => r.recipient_cid)).toEqual([CENTER_CID]);
    });

    it('includes a self-subscriber who did subscribe, at their detail level', async () => {
      await saveNotificationPreference(db, {
        userCid: SELF_CID,
        hospitalCode: HOSPITAL_HCODE,
        mophLineEnabled: true,
        detailLevel: 'aggregate',
        digestHour: 8,
        events: ['anc_hr3'],
      });
      const n = await enqueueHighRiskAlert(db, ctxFixture());
      // center monitor + the subscribed self-subscriber
      expect(n).toBe(2);
      const rows = await db.query<{ recipient_scope: string }>(
        `SELECT recipient_scope FROM moph_alert_log WHERE recipient_cid = '${SELF_CID}'`,
      );
      expect(rows.map((r) => r.recipient_scope)).toEqual(['self_subscribed']);
    });

    it('subscribing to this event does not resurrect a disabled row', async () => {
      // moph_line_enabled=false is the master switch; per-event opt-in must not
      // override it, or "turn notifications off" would stop meaning anything.
      await saveNotificationPreference(db, {
        userCid: SELF_CID,
        hospitalCode: HOSPITAL_HCODE,
        mophLineEnabled: false,
        detailLevel: 'full',
        digestHour: 8,
        events: ['anc_hr3'],
      });
      const n = await enqueueHighRiskAlert(db, ctxFixture());
      expect(n).toBe(1);
      const rows = await db.query<{ recipient_cid: string }>(
        `SELECT recipient_cid FROM moph_alert_log`,
      );
      expect(rows.map((r) => r.recipient_cid)).toEqual([CENTER_CID]);
    });

    it('filters a consult doctor by event too, not just self-subscribers', async () => {
      // The staff branch reads the same subscriber set, so an admin-listed CID
      // that opted out of this event must go quiet as well.
      await saveNotificationPreference(db, {
        userCid: '3320500282121',
        hospitalCode: HOSPITAL_HCODE,
        mophLineEnabled: true,
        detailLevel: 'full',
        digestHour: 8,
        events: ['maternal_triage'],
      });
      const n = await enqueueHighRiskAlert(db, ctxFixture());
      expect(n).toBe(1);
      const rows = await db.query<{ recipient_cid: string }>(
        `SELECT recipient_cid FROM moph_alert_log`,
      );
      expect(rows.map((r) => r.recipient_cid)).toEqual([CENTER_CID]);
    });

    // The end-to-end guarantee that lets cross-hospital subscription re-open:
    // a subscriber watching a hospital that is not their own is stored as
    // 'aggregate', and the drain renders that without the case reference —
    // which for ANC is `ANC-<cid>-G<n>`, the patient's national ID.
    it('stores detail_level=aggregate for a cross-hospital subscriber', async () => {
      await saveNotificationPreference(db, {
        // SELF_CID is deliberately not in the consult-doctor or center list —
        // an admin-listed CID resolves as hospital_staff and carries 'full',
        // which would make this test pass for the wrong reason.
        userCid: SELF_CID,
        hospitalCode: HOSPITAL_HCODE,
        mophLineEnabled: true,
        detailLevel: 'aggregate', // as the API derives it for a foreign hospital
        digestHour: 8,
        events: ['anc_hr3'],
      });
      await enqueueHighRiskAlert(db, ctxFixture());
      const rows = await db.query<{ detail_level: string; recipient_scope: string }>(
        `SELECT detail_level, recipient_scope FROM moph_alert_log
          WHERE recipient_cid = '${SELF_CID}'`,
      );
      expect(rows[0].recipient_scope).toBe('self_subscribed');
      expect(rows[0].detail_level).toBe('aggregate');
    });

    it('stores detail_level=full for admin-configured clinical roles', async () => {
      await enqueueHighRiskAlert(db, ctxFixture());
      const rows = await db.query<{ detail_level: string }>(
        `SELECT DISTINCT detail_level FROM moph_alert_log WHERE recipient_scope = 'province_center'`,
      );
      expect(rows[0].detail_level).toBe('full');
    });

    it('keeps delivering to a legacy row that has no event children', async () => {
      // Every pre-migration production row looks like this. If the event filter
      // drops it, every current recipient goes silent on deploy.
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO notification_preferences
           (id, user_cid, hospital_code, moph_line_enabled, created_at, updated_at)
         VALUES (?, ?, ?, true, ?, ?)`,
        [randomUUID(), '3320500282199', HOSPITAL_HCODE, now, now],
      );
      const kids = await db.query<{ c: number }>(
        `SELECT COUNT(*)::int AS c FROM notification_event_subscriptions`,
      );
      expect(kids[0].c).toBe(0); // the row really is childless
      const n = await enqueueHighRiskAlert(db, ctxFixture());
      // center monitor + the legacy self-subscriber
      expect(n).toBe(2);
      const rows = await db.query<{ recipient_cid: string }>(
        `SELECT recipient_cid FROM moph_alert_log`,
      );
      expect(rows.map((r) => r.recipient_cid).sort()).toEqual([CENTER_CID, '3320500282199']);
    });
  });
});
