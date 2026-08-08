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
