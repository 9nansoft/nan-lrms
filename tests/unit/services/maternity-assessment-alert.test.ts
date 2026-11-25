// TDD (Red→Green) for maternity assessment alerts from spoke hospitals
// (รพ.ลูกข่าย) to parent hospitals (รพ.แม่ข่าย) across all 3 forms:
//   1. first_pregnant (แรกรับ — asm_first_pregnant_pt_nan)
//   2. birth_period   (ระยะคลอด — asm_lr_record_birth_period_nan)
//   3. after_birth    (หลังคลอด — asm_lr_record_after_birth_nan)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey, encrypt, getEncryptionKey, decryptSafe } from '@/lib/encryption';
import { syncMaternityAssessments } from '@/services/sync/maternity-assessment';
import { saveNotificationPreference } from '@/services/notification-preference';
import { MATERNITY_ASSESSMENT_FORMS } from '@/config/maternity-assessments';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? generateKey();

const SPOKE_ID = 'hosp-spoke-1';
const SPOKE_HCODE = '11002';
const SPOKE_NAME = 'รพ.ปัว';

const NODE_ID = 'hosp-node-1';
const NODE_HCODE = '11003';
const NODE_NAME = 'รพ.โหนดแม่ข่าย';

const HUB_ID = 'hosp-hub-1';
const HUB_HCODE = '10716';
const HUB_NAME = 'รพ.น่าน';

const HUB_DOCTOR_CID = '3320500282121';
const NODE_DOCTOR_CID = '3320500282122';
const SPOKE_DOCTOR_CID = '3320500282123';

const AN = '6700999';
const PATIENT_NAME = 'นาง ทดสอบ ประเมินคลอด';

let db: DatabaseAdapter;

interface AlertRow {
  case_id: string;
  hospital_id: string;
  origin_hcode: string;
  hospital_name: string | null;
  alert_source: string;
  severity: string;
  rule_id: string;
  title: string;
  recipient_cid: string;
  recipient_scope: string;
  patient_name_enc: string | null;
  confirm_url: string | null;
}

async function alertRows(): Promise<AlertRow[]> {
  return db.query<AlertRow>(
    `SELECT case_id, hospital_id, origin_hcode, hospital_name, alert_source,
            severity, rule_id, title, recipient_cid, recipient_scope,
            patient_name_enc, confirm_url
       FROM moph_alert_log
      ORDER BY hospital_id, rule_id, recipient_cid`,
  );
}

beforeEach(async () => {
  db = await createTestDb();
  const now = new Date().toISOString();

  // Seed spoke hospital, node parent hospital, and provincial hub hospital
  await db.execute(
    `INSERT INTO hospitals (id, hcode, name, level, service_type, province_code, is_active, connection_status, created_at, updated_at)
     VALUES (?, ?, ?, 'F2', 'COMMUNITY', '55', true, 'ONLINE', ?, ?),
            (?, ?, ?, 'M1', 'NODE', '55', true, 'ONLINE', ?, ?),
            (?, ?, ?, 'P', 'PROVINCIAL_HUB', '55', true, 'ONLINE', ?, ?)`,
    [
      SPOKE_ID,
      SPOKE_HCODE,
      SPOKE_NAME,
      now,
      now,
      NODE_ID,
      NODE_HCODE,
      NODE_NAME,
      now,
      now,
      HUB_ID,
      HUB_HCODE,
      HUB_NAME,
      now,
      now,
    ],
  );

  //Seed patient at spoke hospital
  await db.execute(
    `INSERT INTO cached_patients (id, hospital_id, hn, an, name, age, admit_date, labor_status, synced_at, created_at, updated_at)
     VALUES ('pat-1', ?, 'HN999', ?, ?, 26, ?, 'ACTIVE', ?, ?, ?)`,
    [SPOKE_ID, AN, encrypt(PATIENT_NAME, getEncryptionKey()), now, now, now, now],
  );

  // Seed doctors & preferences at Hub, Node, and Spoke
  for (const [hospId, hcode, cid] of [
    [HUB_ID, HUB_HCODE, HUB_DOCTOR_CID],
    [NODE_ID, NODE_HCODE, NODE_DOCTOR_CID],
    [SPOKE_ID, SPOKE_HCODE, SPOKE_DOCTOR_CID],
  ]) {
    await db.execute(
      `INSERT INTO hospital_consult_doctors (id, hospital_id, cid, name, position, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'สูติแพทย์', true, ?, ?)`,
      [`doc-${hcode}`, hospId, cid, `แพทย์ ${hcode}`, now, now],
    );
    await saveNotificationPreference(db, {
      userCid: cid,
      hospitalCode: hcode,
      mophLineEnabled: true,
      detailLevel: 'full',
      digestHour: 8,
      events: ['maternity_assessment'],
    });
  }
});

afterEach(async () => {
  await db.close?.();
});

describe('maternity_assessment alert producer (3 forms -> parent hospital)', () => {
  it('enqueues alerts to the provincial hub for all 3 assessment forms when added by a spoke hospital', async () => {
    const records: Record<string, Record<string, unknown>[]> = {
      asm_first_pregnant_pt_nan: [
        {
          asm_first_pregnant_pt_nan_id: 101,
          an: AN,
          asm_date1: '2026-11-25',
          head_datetime: '2026-11-25T10:00:00',
          asm_text1: '120/80',
        },
      ],
      asm_lr_record_birth_period_nan: [
        {
          asm_lr_record_birth_period_nan_id: 202,
          an: AN,
          asm_date1: '2026-11-25',
          head_datetime: '2026-11-25T11:00:00',
          asm_text1: 'cervix 5 cm',
        },
      ],
      asm_lr_record_after_birth_nan: [
        {
          asm_lr_record_after_birth_nan_id: 303,
          an: AN,
          asm_date1: '2026-11-25',
          head_datetime: '2026-11-25T12:00:00',
          asm_text1: 'normal postpartum',
        },
      ],
    };

    const res = await syncMaternityAssessments(db, SPOKE_ID, {
      forms: [],
      items: [],
      records,
    });
    expect(res.upserted).toBe(3);

    const rows = await alertRows();
    // 3 forms -> 3 alert rows for the provincial hub doctor (spoke doctor is NOT alerted)
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.hospital_id).toBe(HUB_ID);
      expect(row.recipient_cid).toBe(HUB_DOCTOR_CID);
      expect(row.origin_hcode).toBe(SPOKE_HCODE);
      expect(row.hospital_name).toBe(SPOKE_NAME);
      expect(row.alert_source).toBe('maternity_assessment');
      expect(row.severity).toBe('notify');
      expect(decryptSafe(row.patient_name_enc)).toBe(PATIENT_NAME);
      expect(row.confirm_url).toBe(`/patients/${SPOKE_HCODE}-${AN}`);
    }

    const titles = rows.map((r) => r.title);
    for (const form of MATERNITY_ASSESSMENT_FORMS) {
      expect(titles.some((t) => t.includes(form.titleTh) && t.includes(SPOKE_NAME))).toBe(true);
    }
  });

  it('also alerts a supervising node hospital (รพ.โหนดแม่ข่าย) linked in hospital_nodes', async () => {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO hospital_nodes (id, node_hospital_id, child_hospital_id, created_at, updated_at)
       VALUES ('hn-1', ?, ?, ?, ?)`,
      [NODE_ID, SPOKE_ID, now, now],
    );

    await syncMaternityAssessments(db, SPOKE_ID, {
      forms: [],
      items: [],
      records: {
        asm_first_pregnant_pt_nan: [
          {
            asm_first_pregnant_pt_nan_id: 501,
            an: AN,
            asm_date1: '2026-11-25',
            head_datetime: '2026-11-25T10:00:00',
            asm_text1: '120/80',
          },
        ],
      },
    });

    const rows = await alertRows();
    expect(rows.map((r) => r.hospital_id).sort()).toEqual([HUB_ID, NODE_ID].sort());
    expect(rows.map((r) => r.recipient_cid).sort()).toEqual([HUB_DOCTOR_CID, NODE_DOCTOR_CID].sort());
  });

  it('does NOT re-alert on a subsequent sync of an already-cached assessment row', async () => {
    const input = {
      forms: [],
      items: [],
      records: {
        asm_first_pregnant_pt_nan: [
          {
            asm_first_pregnant_pt_nan_id: 777,
            an: AN,
            asm_date1: '2026-11-25',
            head_datetime: '2026-11-25T10:00:00',
            asm_text1: '120/80',
          },
        ],
      },
    };

    await syncMaternityAssessments(db, SPOKE_ID, input);
    expect(await alertRows()).toHaveLength(1);

    // Clear moph_alert_log to prove the second sync doesn't even attempt to enqueue
    // for an already-cached assessment row (reconcile re-reads old rows).
    await db.execute('DELETE FROM moph_alert_log');
    await syncMaternityAssessments(db, SPOKE_ID, input);
    expect(await alertRows()).toHaveLength(0);
  });

  it('does NOT alert when the provincial hub itself syncs its own assessments', async () => {
    await syncMaternityAssessments(db, HUB_ID, {
      forms: [],
      items: [],
      records: {
        asm_first_pregnant_pt_nan: [
          {
            asm_first_pregnant_pt_nan_id: 888,
            an: AN,
            asm_date1: '2026-11-25',
            head_datetime: '2026-11-25T10:00:00',
            asm_text1: '120/80',
          },
        ],
      },
    });
    expect(await alertRows()).toHaveLength(0);
  });
});
