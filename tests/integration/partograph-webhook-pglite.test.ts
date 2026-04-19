// T26: End-to-end partograph webhook ingestion against the real Postgres
// dialect (in-memory pglite). Mirrors the SQLite version at
// tests/unit/services/webhook-process-partograph.test.ts but specifically
// proves the webhook -> upsert -> severity-roll-up -> SSE pipeline survives
// the dialect that production runs against (NUMERIC string coercion, $N
// placeholder rewrite, no ON CONFLICT support).
//
// SSE mock: same duck-typed pattern as T20 (SseManager has a private
// constructor; we only need broadcast() to record calls). This lets us
// assert the EXACT channel + payload, not just a call count.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createPgliteDb } from '../helpers/createPgliteDb';
import {
  processPartographWebhook,
  type WebhookPartographPayload,
} from '@/services/webhook';
import type { DatabaseAdapter } from '@/db/adapter';
import type { SseManager } from '@/lib/sse';

const HID = 'h-1';
const PID = 'p-1';
const HCODE = '10670';
const AN = 'AN1';

class MockSseManager {
  public events: Array<{ event: string; data: unknown }> = [];
  broadcast(event: string, data: unknown): void {
    this.events.push({ event, data });
  }
  byType(type: string): Array<{ event: string; data: unknown }> {
    return this.events.filter(
      (e) => (e.data as Record<string, unknown>)?.type === type,
    );
  }
}

function asSse(mock: MockSseManager): SseManager {
  return mock as unknown as SseManager;
}

let db: DatabaseAdapter;
let sse: MockSseManager;

beforeEach(async () => {
  db = await createPgliteDb();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO hospitals (id, hcode, name, level, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    [HID, HCODE, 'Test', 'M2', now, now],
  );
  await db.execute(
    `INSERT INTO cached_patients
       (id, hospital_id, hn, an, name, age, admit_date,
        labor_status, synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
    [PID, HID, 'HN1', AN, 'enc', 25,
     '2026-04-18T08:00:00Z', now, now, now],
  );
  sse = new MockSseManager();
});

afterEach(async () => {
  await db.close();
});

describe('processPartographWebhook against real Postgres dialect (pglite)', () => {
  it('happy path: persists observation row with source_system="webhook"', async () => {
    const payload: WebhookPartographPayload = {
      type: 'partograph',
      hospitalCode: HCODE,
      observations: [{
        an: AN,
        externalObservationId: 'obs-1',
        observeDatetime: '2026-04-19T08:00:00+07:00',
        hourNo: 1,
        fetalHeartRate: 140,
        cervicalDilationCm: 4,
      }],
    };

    const result = await processPartographWebhook(db, HID, payload, asSse(sse));

    expect(result.observationsAccepted).toBe(1);
    expect(result.observationsSkipped).toEqual([]);

    const stored = await db.query<{
      patient_id: string;
      source_system: string;
      source_pk: string;
      fetal_heart_rate: number | null;
    }>(
      `SELECT patient_id, source_system, source_pk, fetal_heart_rate
         FROM cached_partograph_observations WHERE hospital_id = ?`,
      [HID],
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].patient_id).toBe(PID);
    expect(stored[0].source_system).toBe('webhook');
    expect(stored[0].source_pk).toBe('obs-1');
    expect(stored[0].fetal_heart_rate).toBe(140);
  });

  it('skips observations whose AN does not exist for the hospital', async () => {
    const payload: WebhookPartographPayload = {
      type: 'partograph',
      hospitalCode: HCODE,
      observations: [{
        an: 'AN-MISSING',
        externalObservationId: 'obs-miss',
        observeDatetime: '2026-04-19T08:00:00+07:00',
        fetalHeartRate: 140,
      }],
    };

    const result = await processPartographWebhook(db, HID, payload, asSse(sse));

    expect(result.observationsAccepted).toBe(0);
    expect(result.observationsSkipped).toEqual([{
      an: 'AN-MISSING',
      externalObservationId: 'obs-miss',
      reason: 'patient_not_found',
    }]);

    const rows = await db.query(
      'SELECT id FROM cached_partograph_observations WHERE hospital_id = ?',
      [HID],
    );
    expect(rows).toHaveLength(0);
  });

  it('broadcasts partograph_severity_changed exactly once on the NULL -> CRITICAL transition', async () => {
    const payload: WebhookPartographPayload = {
      type: 'partograph',
      hospitalCode: HCODE,
      observations: [{
        an: AN,
        externalObservationId: 'obs-crit',
        observeDatetime: '2026-04-19T08:00:00+07:00',
        moulding: '+++', // rule 9: CRITICAL
      }],
    };

    await processPartographWebhook(db, HID, payload, asSse(sse));

    const events = sse.byType('partograph_severity_changed');
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('patient-update');
    const data = events[0].data as Record<string, unknown>;
    expect(data.type).toBe('partograph_severity_changed');
    expect(data.hcode).toBe(HCODE);
    expect(data.an).toBe(AN);
    expect(data.severity).toBe('CRITICAL');
    expect(typeof data.alertCount).toBe('number');
    expect(data.alertCount).toBeGreaterThan(0);
  });

  it('does NOT broadcast severity event when severity stays the same across two observations', async () => {
    // First observation: NULL -> ALERT (one broadcast).
    await processPartographWebhook(db, HID, {
      type: 'partograph',
      hospitalCode: HCODE,
      observations: [{
        an: AN,
        externalObservationId: 'obs-1',
        observeDatetime: '2026-04-19T08:00:00+07:00',
        moulding: '++', // rule 8: ALERT
      }],
    }, asSse(sse));

    // Second observation (different sourcePk): also ALERT — severity unchanged.
    await processPartographWebhook(db, HID, {
      type: 'partograph',
      hospitalCode: HCODE,
      observations: [{
        an: AN,
        externalObservationId: 'obs-2',
        observeDatetime: '2026-04-19T09:00:00+07:00',
        moulding: '++',
      }],
    }, asSse(sse));

    const events = sse.byType('partograph_severity_changed');
    expect(events).toHaveLength(1);
    expect((events[0].data as Record<string, unknown>).severity).toBe('ALERT');
  });
});
