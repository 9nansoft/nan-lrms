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

// The orchestrator now encrypts patient_name at rest (mirrors cached_patients).
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? generateKey();

// Stub the sender so we can assert enqueue NEVER touches LINE I/O.
vi.mock('@/services/moph-prompt', () => ({
  sendMophPrompt: vi.fn(async () => {
    throw new Error('sendMophPrompt must NOT be called during enqueue');
  }),
}));

describe('risk-alert enqueue orchestrator', () => {
  let db: PgliteAdapter;
  let hospitalId: string;

  beforeEach(async () => {
    db = new PgliteAdapter(createPglite());
    await SchemaSync.sync(db, ALL_TABLES, 'postgresql');
    hospitalId = randomUUID();
    await db.query(
      `INSERT INTO hospitals (id, hcode, name, level, province_code, is_active, created_at, updated_at)
       VALUES ($1,'10682','รพ.ขอนแก่น','P_PLUS','30',true,NOW(),NOW())`,
      [hospitalId],
    );
    // one active + one inactive consult doctor
    await db.query(
      `INSERT INTO hospital_consult_doctors (id, hospital_id, cid, name, position, is_active, created_at, updated_at)
       VALUES ($1,$2,'3320500282121','นพ. ก','สูตินรี',true,NOW(),NOW()),
              ($3,$4,'3320500282122','นพ. ข','สูตินรี',false,NOW(),NOW())`,
      [randomUUID(), hospitalId, randomUUID(), hospitalId],
    );
    // one active province center monitor
    await db.query(
      `INSERT INTO moph_center_monitors (id, province, cid, name, is_active, created_at, updated_at)
       VALUES ($1,'30','3320500282130','ศูนย์กลาง ขก.',true,NOW(),NOW())`,
      [randomUUID()],
    );
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
});
