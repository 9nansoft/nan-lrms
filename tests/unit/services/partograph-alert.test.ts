// TDD (Red→Green) for the `partograph_critical` MOPH alert producer.
//
// Wired at the single shared service site (processPartographWebhook's
// severity-change loop) so both sync paths — the webhook API and
// /api/sync/browser-push — are covered by one call.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import type { SseManager } from '@/lib/sse';
import { encrypt, generateKey, getEncryptionKey, decryptSafe } from '@/lib/encryption';
import { processPartographWebhook, type WebhookPartographPayload } from '@/services/webhook';
import { saveNotificationPreference } from '@/services/notification-preference';

// The producer decrypts cached_patients.name before enqueuing, and the
// orchestrator re-encrypts for staff-scope rows.
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

// Duck-typed mock — SseManager has a private constructor; only broadcast() is used.
class MockSseManager {
  public events: Array<{ event: string; data: unknown }> = [];
  broadcast(event: string, data: unknown): void {
    this.events.push({ event, data });
  }
}
function asSse(mock: MockSseManager): SseManager {
  return mock as unknown as SseManager;
}

const HCODE = '99901';
// Seeded by this test only — nothing else populates hospital_consult_doctors
// or moph_center_monitors here, so this CID resolves as hospital_staff and
// nothing else.
const DOCTOR_CID = '3320500282121';
const PATIENT_NAME = 'น.ส. ทดสอบ พาร์โต';
// PHI regression guard: a bare 13-digit run is a Thai national ID.
const CID_PATTERN = /(?<!\d)\d{13}(?!\d)/;

describe('partograph_critical alert producer', () => {
  let db: DatabaseAdapter;
  let sse: MockSseManager;
  let hospitalId: string;

  async function seedPatient(an: string): Promise<string> {
    const id = uuidv4();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO cached_patients
         (id, hospital_id, hn, an, name, age, admit_date, labor_status,
          synced_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        hospitalId,
        `HN-${an}`,
        an,
        // Encrypted at rest, exactly as the sync pipeline writes it.
        encrypt(PATIENT_NAME, getEncryptionKey()),
        28,
        now,
        'ACTIVE',
        now,
        now,
        now,
      ],
    );
    return id;
  }

  function payload(
    an: string,
    obs: Partial<WebhookPartographPayload['observations'][number]> & {
      externalObservationId: string;
    },
  ): WebhookPartographPayload {
    return {
      type: 'partograph',
      hospitalCode: HCODE,
      observations: [{ an, observeDatetime: '2026-04-19T08:00:00+07:00', ...obs }],
    };
  }

  beforeEach(async () => {
    db = await createTestDb();
    sse = new MockSseManager();
    hospitalId = uuidv4();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO hospitals (id, hcode, name, level, province_code, is_active, connection_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [hospitalId, HCODE, 'รพ.ทดสอบ Partograph', 'M2', '30', true, 'UNKNOWN', now, now],
    );
    await db.execute(
      `INSERT INTO hospital_consult_doctors (id, hospital_id, cid, name, position, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), hospitalId, DOCTOR_CID, 'นพ. ก', 'สูตินรี', true, now, now],
    );
    // Default OFF: staff deliver only with an enabled row subscribed to THIS event.
    await saveNotificationPreference(db, {
      userCid: DOCTOR_CID,
      hospitalCode: HCODE,
      mophLineEnabled: true,
      detailLevel: 'full',
      digestHour: 8,
      events: ['partograph_critical'],
    });
  });

  it('enqueues a partograph_critical alert when severity transitions to CRITICAL', async () => {
    await seedPatient('AN-1');
    // FHR 80 is CDSS rule 1 (<100) → CRITICAL, from a null starting severity.
    await processPartographWebhook(
      db,
      hospitalId,
      payload('AN-1', { externalObservationId: 'EXT-CRIT', fetalHeartRate: 80 }),
      asSse(sse),
    );

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
    expect(rows[0].alert_source).toBe('partograph_critical');
    expect(rows[0].severity).toBe('emergency');
    expect(rows[0].rule_id).toBe('partograph_critical');
    expect(rows[0].recipient_cid).toBe(DOCTOR_CID);
    expect(rows[0].recipient_scope).toBe('hospital_staff');
    expect(rows[0].status).toBe('pending');
  });

  it('builds caseRef from the AN and never embeds a national ID (PDPA)', async () => {
    await seedPatient('AN-1');
    await processPartographWebhook(
      db,
      hospitalId,
      payload('AN-1', { externalObservationId: 'EXT-CRIT', fetalHeartRate: 80 }),
      asSse(sse),
    );
    const rows = await db.query<{ case_id: string }>(`SELECT case_id FROM moph_alert_log`);
    expect(rows[0].case_id).toBe('PARTO-AN-AN-1');
    expect(rows[0].case_id).not.toMatch(CID_PATTERN);
  });

  it('carries the patient name, decrypted from cached_patients and re-encrypted at rest', async () => {
    await seedPatient('AN-1');
    await processPartographWebhook(
      db,
      hospitalId,
      payload('AN-1', { externalObservationId: 'EXT-CRIT', fetalHeartRate: 80 }),
      asSse(sse),
    );
    const rows = await db.query<{ patient_name_enc: string | null }>(
      `SELECT patient_name_enc FROM moph_alert_log`,
    );
    // Not the raw column value: the producer must decrypt before handing it to
    // the orchestrator, or the drain would render ciphertext at the doctor.
    expect(rows[0].patient_name_enc).not.toBeNull();
    expect(decryptSafe(rows[0].patient_name_enc)).toBe(PATIENT_NAME);
  });

  it('enqueues nothing for a non-CRITICAL severity transition', async () => {
    await seedPatient('AN-2');
    // FHR 105 is CDSS rule 2 (outside 110-160, but >= 100) → ALERT, not CRITICAL.
    await processPartographWebhook(
      db,
      hospitalId,
      payload('AN-2', { externalObservationId: 'EXT-ALERT', fetalHeartRate: 105 }),
      asSse(sse),
    );
    const severity = await db.query<{ partograph_severity: string | null }>(
      `SELECT partograph_severity FROM cached_patients WHERE an = ?`,
      ['AN-2'],
    );
    // Guard against a vacuous pass: a transition really did happen, it just
    // was not to CRITICAL.
    expect(severity[0].partograph_severity).toBe('ALERT');
    const count = await db.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM moph_alert_log`);
    expect(count[0].c).toBe(0);
  });

  it('does not re-alert when the same case re-enters CRITICAL the same day (dedup)', async () => {
    await seedPatient('AN-3');
    const crit = () =>
      processPartographWebhook(
        db,
        hospitalId,
        payload('AN-3', { externalObservationId: 'EXT-CRIT', fetalHeartRate: 80 }),
        asSse(sse),
      );
    await crit();
    // Remove the observation so severity drops back to null, then re-trigger —
    // a second real transition into CRITICAL for the same case, same day.
    await processPartographWebhook(
      db,
      hospitalId,
      {
        type: 'partograph',
        hospitalCode: HCODE,
        observations: [{ an: 'AN-3', externalObservationId: 'EXT-CRIT', action: 'delete' }],
      },
      asSse(sse),
    );
    await crit();

    const count = await db.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM moph_alert_log`);
    expect(count[0].c).toBe(1);
  });

  it('never calls sendMophPrompt during enqueue (no LINE I/O on the sync path)', async () => {
    const { sendMophPrompt } = await import('@/services/moph-prompt');
    await seedPatient('AN-4');
    await processPartographWebhook(
      db,
      hospitalId,
      payload('AN-4', { externalObservationId: 'EXT-CRIT', fetalHeartRate: 80 }),
      asSse(sse),
    );
    expect(sendMophPrompt).not.toHaveBeenCalled();
  });
});
