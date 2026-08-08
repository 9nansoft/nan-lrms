// TDD (Red→Green) for the two referral MOPH alert producers.
//
// Step 1 `referral_incoming` — enqueued from processBrowserReferouts on the
//   branch that CREATES a referral, under the DESTINATION hospital's id even
//   though the function is called with the ORIGIN hospital's id.
// Step 2 `referral_overdue` — evaluated on the sync tick by
//   enqueueOverdueReferralAlerts, which alerts BOTH parties.
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { createHash, randomUUID } from 'crypto';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey, encrypt, getEncryptionKey, decryptSafe } from '@/lib/encryption';
import { processBrowserReferouts } from '@/services/sync/referrals';
import { saveNotificationPreference } from '@/services/notification-preference';
import { REFERRAL_SLA } from '@/config/referral-sla';
import { ReferralStatus } from '@/types/domain';

// The producers decrypt the journey name before enqueuing and the orchestrator
// re-encrypts it for staff-scope rows.
beforeAll(() => {
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? generateKey();
});

// Enqueue must never touch LINE I/O — the drain is the only sender.
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

const ORIGIN_ID = 'hosp-origin';
const ORIGIN_HCODE = '10001';
const DEST_ID = 'hosp-dest';
const DEST_HCODE = '10002';
const JOURNEY_ID = 'journey-001';
const CID = '1111111111111';
const CID_HASH = createHash('sha256').update(CID).digest('hex');
const PATIENT_NAME = 'น.ส. ทดสอบ ส่งต่อ';
// Seeded only by this file — nothing else populates hospital_consult_doctors or
// moph_center_monitors here, so each CID resolves as hospital_staff of exactly
// one hospital (a seed-list CID would carry detail_level 'full' regardless of
// its preference row and make these assertions pass for the wrong reason).
const ORIGIN_DOCTOR_CID = '3320500282121';
const DEST_DOCTOR_CID = '3320500282122';
// PHI regression guard: a bare 13-digit run is a Thai national ID.
const CID_PATTERN = /(?<!\d)\d{13}(?!\d)/;

let db: DatabaseAdapter;

interface AlertRow {
  case_id: string;
  hospital_id: string;
  origin_hcode: string;
  alert_source: string;
  severity: string;
  rule_id: string;
  recipient_cid: string;
  recipient_scope: string;
  detail_level: string;
  status: string;
  patient_name_enc: string | null;
}

async function alertRows(): Promise<AlertRow[]> {
  return db.query<AlertRow>(
    `SELECT case_id, hospital_id, origin_hcode, alert_source, severity, rule_id,
            recipient_cid, recipient_scope, detail_level, status, patient_name_enc
       FROM moph_alert_log ORDER BY hospital_id, recipient_cid`,
  );
}

function referoutRow(overrides: Record<string, unknown> = {}) {
  return {
    refer_number: 'RF-001',
    refer_date: '2026-07-18',
    refer_time: '10:30:00',
    refer_hospcode: DEST_HCODE,
    pre_diagnosis: 'PIH, GA 36wk',
    pdx: 'O13',
    referout_emergency_type_id: null,
    hn: 'HN001',
    cid: CID,
    ...overrides,
  };
}

/** Insert an INITIATED referral aged `hoursAgo`, bypassing the sync path. */
async function seedReferral(opts: {
  referNumber?: string | null;
  hoursAgo: number;
  status?: ReferralStatus;
}): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const initiatedAt = new Date(Date.now() - opts.hoursAgo * 3600_000).toISOString();
  await db.execute(
    `INSERT INTO cached_referrals (id, journey_id, refer_number, from_hospital_id, to_hospital_id,
                                   status, reason, urgency_level, initiated_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'ROUTINE', ?, ?, ?)`,
    [
      id,
      JOURNEY_ID,
      // `??` would swallow an EXPLICIT null, which is the case one test needs.
      opts.referNumber === undefined ? 'RF-OVD' : opts.referNumber,
      ORIGIN_ID,
      DEST_ID,
      opts.status ?? ReferralStatus.INITIATED,
      'ส่งต่อรอตอบรับ',
      initiatedAt,
      now,
      now,
    ],
  );
  return id;
}

beforeEach(async () => {
  db = await createTestDb();
  const now = new Date().toISOString();
  for (const [id, hcode, name] of [
    [ORIGIN_ID, ORIGIN_HCODE, 'รพ.ต้นทาง'],
    [DEST_ID, DEST_HCODE, 'รพ.ปลายทาง'],
  ]) {
    await db.execute(
      `INSERT INTO hospitals (id, hcode, name, level, province_code, is_active, connection_status, created_at, updated_at)
       VALUES (?, ?, ?, 'M2', '30', true, 'ONLINE', ?, ?)`,
      [id, hcode, name, now, now],
    );
  }
  await db.execute(
    `INSERT INTO maternal_journeys (id, hospital_id, current_hospital_id, hn, name, cid, cid_hash, age, gravida, para, care_stage, registered_at, stage_changed_at, synced_at, created_at, updated_at)
     VALUES (?, ?, ?, 'HN001', ?, 'enc-cid', ?, 30, 1, 0, 'PREGNANCY', ?, ?, ?, ?, ?)`,
    [
      JOURNEY_ID,
      ORIGIN_ID,
      ORIGIN_ID,
      encrypt(PATIENT_NAME, getEncryptionKey()), // encrypted at rest (PDPA)
      CID_HASH,
      now,
      now,
      now,
      now,
      now,
    ],
  );
  // One consult doctor per hospital, each subscribed to BOTH referral events at
  // their OWN hospital. The origin-side doctor is the inversion tripwire: an
  // incoming referral must reach the destination's doctor and nobody else.
  for (const [hospitalId, hcode, cid] of [
    [ORIGIN_ID, ORIGIN_HCODE, ORIGIN_DOCTOR_CID],
    [DEST_ID, DEST_HCODE, DEST_DOCTOR_CID],
  ]) {
    await db.execute(
      `INSERT INTO hospital_consult_doctors (id, hospital_id, cid, name, position, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'สูตินรี', true, ?, ?)`,
      [randomUUID(), hospitalId, cid, `นพ. ${hcode}`, now, now],
    );
    await saveNotificationPreference(db, {
      userCid: cid,
      hospitalCode: hcode,
      mophLineEnabled: true,
      detailLevel: 'full',
      digestHour: 8,
      events: ['referral_incoming', 'referral_overdue'],
    });
  }
});

afterEach(async () => {
  await db.close?.();
  vi.restoreAllMocks();
});

describe('referral_incoming alert producer', () => {
  it('enqueues one alert for the DESTINATION hospital when a referral is created', async () => {
    const result = await processBrowserReferouts(db, ORIGIN_ID, [referoutRow()]);
    expect(result.created).toBe(1); // guard: the branch under test really ran

    const rows = await alertRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      hospital_id: DEST_ID,
      origin_hcode: DEST_HCODE,
      alert_source: 'referral_incoming',
      severity: 'high',
      rule_id: 'referral_incoming',
      recipient_cid: DEST_DOCTOR_CID,
      recipient_scope: 'hospital_staff',
      status: 'pending',
    });
  });

  it('does NOT alert the origin hospital that pushed the row (inversion guard)', async () => {
    // processBrowserReferouts receives the ORIGIN hospital's id. Enqueuing under
    // it would tell the sender about its own outgoing referral and leave the
    // receiving hospital — the people who must act — with nothing.
    await processBrowserReferouts(db, ORIGIN_ID, [referoutRow()]);
    const rows = await alertRows();
    expect(rows.map((r) => r.recipient_cid)).toEqual([DEST_DOCTOR_CID]);
    expect(rows.find((r) => r.hospital_id === ORIGIN_ID)).toBeUndefined();
    expect(rows.find((r) => r.recipient_cid === ORIGIN_DOCTOR_CID)).toBeUndefined();
  });

  it('builds caseRef from origin hcode + refer number and never embeds a CID (PDPA)', async () => {
    await processBrowserReferouts(db, ORIGIN_ID, [referoutRow()]);
    const rows = await alertRows();
    expect(rows[0].case_id).toBe(`REF-${ORIGIN_HCODE}-RF-001`);
    expect(rows[0].case_id).not.toMatch(CID_PATTERN);
  });

  it('carries the patient name, decrypted from the journey and re-encrypted at rest', async () => {
    await processBrowserReferouts(db, ORIGIN_ID, [referoutRow()]);
    const rows = await alertRows();
    expect(rows[0].patient_name_enc).not.toBeNull();
    expect(decryptSafe(rows[0].patient_name_enc)).toBe(PATIENT_NAME);
  });

  it('enqueues nothing on a re-push of the same referral (UPDATE branch is not news)', async () => {
    await processBrowserReferouts(db, ORIGIN_ID, [referoutRow()]);
    const second = await processBrowserReferouts(db, ORIGIN_ID, [
      referoutRow({ pre_diagnosis: 'PIH, GA 37wk' }),
    ]);
    expect(second).toMatchObject({ created: 0, upserted: 1 }); // really took the UPDATE branch
    const rows = await alertRows();
    expect(rows).toHaveLength(1);
  });

  it('enqueues nothing for a row skipped for having no journey', async () => {
    const result = await processBrowserReferouts(db, ORIGIN_ID, [
      referoutRow({ refer_number: 'RF-002', cid: '2222222222222' }),
    ]);
    expect(result.skippedNoJourney).toBe(1);
    expect(await alertRows()).toHaveLength(0);
  });

  it('still creates the referral when alerting is disabled (best-effort)', async () => {
    process.env.MOPH_ALERTS_ENABLED = 'false';
    try {
      const result = await processBrowserReferouts(db, ORIGIN_ID, [referoutRow()]);
      expect(result).toMatchObject({ created: 1, failed: 0 });
      expect(await alertRows()).toHaveLength(0);
    } finally {
      delete process.env.MOPH_ALERTS_ENABLED;
    }
  });

  it('never calls sendMophPrompt during enqueue (no LINE I/O on the sync path)', async () => {
    const { sendMophPrompt } = await import('@/services/moph-prompt');
    await processBrowserReferouts(db, ORIGIN_ID, [referoutRow()]);
    expect(sendMophPrompt).not.toHaveBeenCalled();
  });
});

describe('enqueueOverdueReferralAlerts', () => {
  // Derived from the SLA config, never a literal: if the threshold moves, these
  // fixtures follow it instead of silently testing the wrong side of the line.
  const OVERDUE_HOURS = REFERRAL_SLA.overdueAfterHours + 1;
  const FRESH_HOURS = REFERRAL_SLA.overdueAfterHours - 1;

  it('alerts BOTH parties, each under their own hospital id', async () => {
    const { enqueueOverdueReferralAlerts } = await import('@/services/referral-alerts');
    await seedReferral({ hoursAgo: OVERDUE_HOURS });

    // One call per hospital, exactly as the browser-push route drives it.
    expect(await enqueueOverdueReferralAlerts(db, ORIGIN_ID)).toBe(1);
    expect(await enqueueOverdueReferralAlerts(db, DEST_ID)).toBe(1);

    const rows = await alertRows();
    expect(rows).toHaveLength(2);
    // Both parties must act: the destination has not accepted, and the origin
    // has a patient in limbo. Same case, two hospital-scoped alerts.
    expect(rows.map((r) => r.hospital_id).sort()).toEqual([DEST_ID, ORIGIN_ID].sort());
    expect(new Set(rows.map((r) => r.case_id))).toEqual(new Set([`REF-${ORIGIN_HCODE}-RF-OVD`]));
    for (const row of rows) {
      expect(row.alert_source).toBe('referral_overdue');
      expect(row.severity).toBe('high');
      expect(row.rule_id).toBe('referral_overdue');
      expect(row.case_id).not.toMatch(CID_PATTERN);
    }
    // Each hospital's alert renders that hospital's own name/hcode.
    expect(rows.find((r) => r.hospital_id === ORIGIN_ID)?.origin_hcode).toBe(ORIGIN_HCODE);
    expect(rows.find((r) => r.hospital_id === DEST_ID)?.origin_hcode).toBe(DEST_HCODE);
  });

  it('carries the patient name for both parties (both are a party to the referral)', async () => {
    const { enqueueOverdueReferralAlerts } = await import('@/services/referral-alerts');
    await seedReferral({ hoursAgo: OVERDUE_HOURS });
    await enqueueOverdueReferralAlerts(db, ORIGIN_ID);
    await enqueueOverdueReferralAlerts(db, DEST_ID);
    const rows = await alertRows();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(decryptSafe(row.patient_name_enc)).toBe(PATIENT_NAME);
    }
  });

  it('enqueues nothing for a referral still inside the SLA window', async () => {
    const { enqueueOverdueReferralAlerts } = await import('@/services/referral-alerts');
    await seedReferral({ hoursAgo: FRESH_HOURS });
    expect(await enqueueOverdueReferralAlerts(db, ORIGIN_ID)).toBe(0);
    expect(await enqueueOverdueReferralAlerts(db, DEST_ID)).toBe(0);
    expect(await alertRows()).toHaveLength(0);
  });

  it('enqueues nothing for an ARRIVED referral past the cutoff (only INITIATED ages)', async () => {
    const { enqueueOverdueReferralAlerts } = await import('@/services/referral-alerts');
    await seedReferral({ hoursAgo: OVERDUE_HOURS, status: ReferralStatus.ARRIVED });
    expect(await enqueueOverdueReferralAlerts(db, ORIGIN_ID)).toBe(0);
    expect(await enqueueOverdueReferralAlerts(db, DEST_ID)).toBe(0);
    expect(await alertRows()).toHaveLength(0);
  });

  it('ignores a referral neither party belongs to', async () => {
    const { enqueueOverdueReferralAlerts } = await import('@/services/referral-alerts');
    const now = new Date().toISOString();
    const otherId = 'hosp-other';
    await db.execute(
      `INSERT INTO hospitals (id, hcode, name, level, province_code, is_active, created_at, updated_at)
       VALUES (?, '10003', 'รพ.อื่น', 'M2', '30', true, ?, ?)`,
      [otherId, now, now],
    );
    await db.execute(
      `INSERT INTO cached_referrals (id, journey_id, refer_number, from_hospital_id, to_hospital_id,
                                     status, reason, urgency_level, initiated_at, created_at, updated_at)
       VALUES (?, ?, 'RF-OTHER', ?, ?, 'INITIATED', 'x', 'ROUTINE', ?, ?, ?)`,
      [
        randomUUID(),
        JOURNEY_ID,
        otherId,
        otherId,
        new Date(Date.now() - OVERDUE_HOURS * 3600_000).toISOString(),
        now,
        now,
      ],
    );
    expect(await enqueueOverdueReferralAlerts(db, ORIGIN_ID)).toBe(0);
    expect(await alertRows()).toHaveLength(0);
  });

  it('adds no rows on a second call the same day (day-granular dedup)', async () => {
    const { enqueueOverdueReferralAlerts } = await import('@/services/referral-alerts');
    await seedReferral({ hoursAgo: OVERDUE_HOURS });
    await enqueueOverdueReferralAlerts(db, ORIGIN_ID);
    await enqueueOverdueReferralAlerts(db, DEST_ID);
    // Every push runs this; the dedup index must collapse the repeats.
    expect(await enqueueOverdueReferralAlerts(db, ORIGIN_ID)).toBe(0);
    expect(await enqueueOverdueReferralAlerts(db, DEST_ID)).toBe(0);
    expect(await alertRows()).toHaveLength(2);
  });

  it('falls back to the referral id when HOSxP never supplied a refer number', async () => {
    // Webhook-ingested rows may have refer_number NULL; caseRef must stay a
    // stable, non-PHI identifier rather than rendering "null".
    const { enqueueOverdueReferralAlerts } = await import('@/services/referral-alerts');
    const id = await seedReferral({ referNumber: null, hoursAgo: OVERDUE_HOURS });
    expect(await enqueueOverdueReferralAlerts(db, ORIGIN_ID)).toBe(1);
    const rows = await alertRows();
    expect(rows[0].case_id).toBe(`REF-${ORIGIN_HCODE}-${id}`);
    expect(rows[0].case_id).not.toMatch(CID_PATTERN);
  });

  it('shares one caseRef scheme with referral_incoming so both name the same case', async () => {
    const { enqueueOverdueReferralAlerts } = await import('@/services/referral-alerts');
    await processBrowserReferouts(db, ORIGIN_ID, [referoutRow()]);
    const incoming = (await alertRows())[0].case_id;
    // Age the row the sync path just created past the cutoff.
    await db.execute(`UPDATE cached_referrals SET initiated_at = ? WHERE refer_number = 'RF-001'`, [
      new Date(Date.now() - OVERDUE_HOURS * 3600_000).toISOString(),
    ]);
    await enqueueOverdueReferralAlerts(db, DEST_ID);
    const overdue = (await alertRows()).find((r) => r.alert_source === 'referral_overdue');
    expect(overdue?.case_id).toBe(incoming);
  });

  it('never calls sendMophPrompt (no LINE I/O on the sync path)', async () => {
    const { enqueueOverdueReferralAlerts } = await import('@/services/referral-alerts');
    const { sendMophPrompt } = await import('@/services/moph-prompt');
    await seedReferral({ hoursAgo: OVERDUE_HOURS });
    await enqueueOverdueReferralAlerts(db, ORIGIN_ID);
    expect(sendMophPrompt).not.toHaveBeenCalled();
  });
});
