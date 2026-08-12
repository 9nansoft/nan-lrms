// TDD (Red→Green) for the `cpd_high` MOPH alert producer.
//
// Wired at the shared service site (calculateAndStoreCpdScores), which both the
// webhook pipeline and /api/sync/browser-push funnel through — one call site
// covers both sync paths.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import type { SseManager } from '@/lib/sse';
import { encrypt, generateKey, getEncryptionKey, decryptSafe } from '@/lib/encryption';
import { calculateAndStoreCpdScores } from '@/services/sync/cpd-persist';
import { calculateCpdScore } from '@/services/cpd-score';
import { RiskLevel } from '@/types/domain';
import { saveNotificationPreference } from '@/services/notification-preference';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? generateKey();

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

class MockSseManager {
  public events: Array<{ event: string; data: unknown }> = [];
  broadcast(event: string, data: unknown): void {
    this.events.push({ event, data });
  }
}
function asSse(mock: MockSseManager): SseManager {
  return mock as unknown as SseManager;
}

const HCODE = '99902';
const DOCTOR_CID = '3320500282121';
const PATIENT_NAME = 'น.ส. ทดสอบ ซีพีดี';
const CID_PATTERN = /(?<!\d)\d{13}(?!\d)/;

// Factor sets taken from tests/unit/services/cpd-score.test.ts so the fixtures
// stay tied to the scorer, not to a guessed threshold. Asserted below against
// calculateCpdScore itself — if the weights in config/risk-levels.ts move, the
// fixture fails loudly instead of silently testing the wrong branch.
const HIGH_FACTORS = {
  gravida: 1,
  ancCount: 2,
  gaWeeks: 41,
  heightCm: 148,
  weightDiffKg: 22,
  fundalHeightCm: 38,
  usWeightG: 3800,
  hematocritPct: 28,
};
const MEDIUM_FACTORS = {
  gravida: 1,
  ancCount: 3,
  gaWeeks: 40,
  heightCm: 153,
  weightDiffKg: 10,
  fundalHeightCm: 30,
  usWeightG: 2500,
  hematocritPct: 35,
};

describe('cpd_high alert producer', () => {
  let db: DatabaseAdapter;
  let sse: MockSseManager;
  let hospitalId: string;

  async function seedPatient(an: string, factors: typeof HIGH_FACTORS): Promise<string> {
    const id = uuidv4();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO cached_patients
         (id, hospital_id, hn, an, name, age, admit_date, labor_status,
          gravida, anc_count, ga_weeks, height_cm, weight_diff_kg,
          fundal_height_cm, us_weight_g, hematocrit_pct,
          synced_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        hospitalId,
        `HN-${an}`,
        an,
        encrypt(PATIENT_NAME, getEncryptionKey()), // encrypted at rest (PDPA)
        28,
        now,
        'ACTIVE',
        factors.gravida,
        factors.ancCount,
        factors.gaWeeks,
        factors.heightCm,
        factors.weightDiffKg,
        factors.fundalHeightCm,
        factors.usWeightG,
        factors.hematocritPct,
        now,
        now,
        now,
      ],
    );
    return id;
  }

  /** Pre-existing score row, so the run under test sees a prevRiskLevel. */
  async function seedPreviousScore(patientId: string, level: RiskLevel, score: number) {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO cpd_scores (id, patient_id, score, risk_level, recommendation,
                               missing_factors, calculated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), patientId, score, level, 'seeded', '[]', now, now],
    );
  }

  beforeEach(async () => {
    db = await createTestDb();
    sse = new MockSseManager();
    hospitalId = uuidv4();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO hospitals (id, hcode, name, level, province_code, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [hospitalId, HCODE, 'รพ.ทดสอบ CPD', 'M2', '30', true, now, now],
    );
    await db.execute(
      `INSERT INTO hospital_consult_doctors (id, hospital_id, cid, name, position, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), hospitalId, DOCTOR_CID, 'นพ. ก', 'สูตินรี', true, now, now],
    );
    await saveNotificationPreference(db, {
      userCid: DOCTOR_CID,
      hospitalCode: HCODE,
      mophLineEnabled: true,
      detailLevel: 'full',
      digestHour: 8,
      events: ['cpd_high'],
    });
  });

  it('fixtures score to the levels this suite depends on', () => {
    // Not a tautology: it pins the fixtures to calculateCpdScore, so a weight
    // change cannot leave the tests below asserting on the wrong branch.
    expect(calculateCpdScore(HIGH_FACTORS).riskLevel).toBe(RiskLevel.HIGH);
    expect(calculateCpdScore(MEDIUM_FACTORS).riskLevel).toBe(RiskLevel.MEDIUM);
  });

  it('enqueues one cpd_high alert for a patient crossing into HIGH', async () => {
    await seedPatient('AN-H1', HIGH_FACTORS);
    await calculateAndStoreCpdScores(db, hospitalId, asSse(sse));

    const rows = await db.query<{
      alert_source: string;
      severity: string;
      rule_id: string;
      case_id: string;
      recipient_cid: string;
      recipient_scope: string;
      status: string;
    }>(
      `SELECT alert_source, severity, rule_id, case_id, recipient_cid, recipient_scope, status
         FROM moph_alert_log`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].alert_source).toBe('cpd_high');
    expect(rows[0].severity).toBe('high');
    expect(rows[0].rule_id).toBe('cpd_high');
    expect(rows[0].recipient_cid).toBe(DOCTOR_CID);
    expect(rows[0].recipient_scope).toBe('hospital_staff');
    expect(rows[0].status).toBe('pending');
  });

  it('builds caseRef from the AN and never embeds a national ID (PDPA)', async () => {
    await seedPatient('AN-H1', HIGH_FACTORS);
    await calculateAndStoreCpdScores(db, hospitalId, asSse(sse));
    const rows = await db.query<{ case_id: string }>(`SELECT case_id FROM moph_alert_log`);
    expect(rows[0].case_id).toBe('CPD-AN-AN-H1');
    expect(rows[0].case_id).not.toMatch(CID_PATTERN);
  });

  it('carries the patient name, decrypted from cached_patients and re-encrypted at rest', async () => {
    await seedPatient('AN-H1', HIGH_FACTORS);
    await calculateAndStoreCpdScores(db, hospitalId, asSse(sse));
    const rows = await db.query<{ patient_name_enc: string | null }>(
      `SELECT patient_name_enc FROM moph_alert_log`,
    );
    expect(rows[0].patient_name_enc).not.toBeNull();
    expect(decryptSafe(rows[0].patient_name_enc)).toBe(PATIENT_NAME);
  });

  it('enqueues nothing for a patient who was already HIGH on the previous score', async () => {
    const id = await seedPatient('AN-H2', HIGH_FACTORS);
    await seedPreviousScore(id, RiskLevel.HIGH, 14.5);
    await calculateAndStoreCpdScores(db, hospitalId, asSse(sse));

    // Guard against a vacuous pass: the run really did score this patient HIGH.
    const scores = await db.query<{ risk_level: string }>(
      `SELECT risk_level FROM cpd_scores WHERE patient_id = ?`,
      [id],
    );
    expect(scores).toHaveLength(2);
    expect(scores.every((s) => s.risk_level === RiskLevel.HIGH)).toBe(true);

    const count = await db.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM moph_alert_log`);
    expect(count[0].c).toBe(0);
  });

  it('enqueues nothing for a MEDIUM patient', async () => {
    const id = await seedPatient('AN-M1', MEDIUM_FACTORS);
    await calculateAndStoreCpdScores(db, hospitalId, asSse(sse));

    const scores = await db.query<{ risk_level: string }>(
      `SELECT risk_level FROM cpd_scores WHERE patient_id = ?`,
      [id],
    );
    expect(scores[0].risk_level).toBe(RiskLevel.MEDIUM);
    const count = await db.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM moph_alert_log`);
    expect(count[0].c).toBe(0);
  });

  it('alerts a patient who arrives already HIGH on their first ever score', async () => {
    // prevRiskLevel is null on a first score, so the gate fires. That is
    // correct for alerting — a patient admitted already high-risk is exactly
    // the case a doctor needs told about.
    const id = await seedPatient('AN-H3', HIGH_FACTORS);
    const before = await db.query<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM cpd_scores WHERE patient_id = ?`,
      [id],
    );
    expect(before[0].c).toBe(0); // really is the first score

    await calculateAndStoreCpdScores(db, hospitalId, asSse(sse));
    const count = await db.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM moph_alert_log`);
    expect(count[0].c).toBe(1);
  });

  it('does not re-alert on a second sync tick the same day (dedup)', async () => {
    await seedPatient('AN-H4', HIGH_FACTORS);
    await calculateAndStoreCpdScores(db, hospitalId, asSse(sse));
    // Second tick: prevRiskLevel is now HIGH, so the gate does not even fire.
    await calculateAndStoreCpdScores(db, hospitalId, asSse(sse));
    const count = await db.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM moph_alert_log`);
    expect(count[0].c).toBe(1);
  });

  it('never calls sendMophPrompt during enqueue (no LINE I/O on the sync path)', async () => {
    const { sendMophPrompt } = await import('@/services/moph-prompt');
    await seedPatient('AN-H5', HIGH_FACTORS);
    await calculateAndStoreCpdScores(db, hospitalId, asSse(sse));
    expect(sendMophPrompt).not.toHaveBeenCalled();
  });
});
