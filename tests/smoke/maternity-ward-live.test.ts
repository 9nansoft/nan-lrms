// Task 54: Live BMS smoke test (gated by LIVE_BMS_SESSION_ID env var).
// SKIPPED in normal CI / `npm test`. Run manually with a real session id:
//   LIVE_BMS_SESSION_ID=<session-id> npm test -- tests/smoke
// Pure read-only — calls listMaternityWards / listWardBedsInventory /
// listWardBedsOccupancy / getPatientPartograph against the live BMS Session
// API to verify the wiring end-to-end. Never mutates data.
import { describe, it, expect, beforeAll } from 'vitest';
import {
  retrieveBmsSession,
  extractConnectionConfig,
} from '@/lib/bms-browser-client';
import {
  listMaternityWards,
  listWardBedsInventory,
  listWardBedsOccupancy,
  getPatientPartograph,
} from '@/services/maternity-ward';
import type { ConnectionConfig } from '@/types/bms-browser';

const sessionId = process.env.LIVE_BMS_SESSION_ID;

describe.skipIf(!sessionId)(
  'maternity-ward live smoke (set LIVE_BMS_SESSION_ID to enable)',
  () => {
    let config: ConnectionConfig;

    beforeAll(async () => {
      const r = await retrieveBmsSession(sessionId!);
      config = extractConnectionConfig(r);
    });

    it('lists at least one maternity ward', async () => {
      const wards = await listMaternityWards(config);
      expect(wards.length).toBeGreaterThan(0);
      expect(wards[0]).toMatchObject({
        ward: expect.any(String),
        name: expect.any(String),
      });
    });

    it('lists bed inventory for the first ward', async () => {
      const wards = await listMaternityWards(config);
      const beds = await listWardBedsInventory(config, wards[0].ward);
      expect(beds.length).toBeGreaterThan(0);
      for (const b of beds) {
        expect(b).toMatchObject({
          bedno: expect.any(String),
          roomno: expect.any(String),
        });
      }
    });

    it('lists ward occupancy without throwing', async () => {
      const wards = await listMaternityWards(config);
      const occ = await listWardBedsOccupancy(config, wards[0].ward);
      for (const o of occ) {
        expect(o).toMatchObject({
          an: expect.any(String),
          bedno: expect.any(String),
        });
      }
    });

    it('reads partograph for first occupied AN if any', async () => {
      const wards = await listMaternityWards(config);
      const occ = await listWardBedsOccupancy(config, wards[0].ward);
      if (occ.length === 0) return;
      const rows = await getPatientPartograph(config, occ[0].an);
      expect(Array.isArray(rows)).toBe(true);
    });
  },
);
