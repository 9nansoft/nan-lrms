// TDD tests for in-app alert notifications service + API routes
// (/api/notifications and /api/notifications/read).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { enqueueHighRiskAlert, enqueueConsultMessageAlert } from '@/services/risk-alert';
import { saveNotificationPreference } from '@/services/notification-preference';
import { listInAppAlerts, markInAppAlertsRead } from '@/services/in-app-alerts';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? generateKey();

const HOSP_ID = 'hosp-notif-1';
const HCODE = '10716';
const HOSP_NAME = 'รพ.น่าน';
const DOCTOR_CID = '3320500282121';

let db: DatabaseAdapter;

beforeEach(async () => {
  db = await createTestDb();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO hospitals (id, hcode, name, level, service_type, province_code, is_active, connection_status, created_at, updated_at)
     VALUES (?, ?, ?, 'P', 'PROVINCIAL_HUB', '55', true, 'ONLINE', ?, ?)`,
    [HOSP_ID, HCODE, HOSP_NAME, now, now],
  );
  await db.execute(
    `INSERT INTO hospital_consult_doctors (id, hospital_id, cid, name, position, is_active, created_at, updated_at)
     VALUES ('doc-1', ?, ?, 'นพ.ทดสอบ', 'สูติแพทย์', true, ?, ?)`,
    [HOSP_ID, DOCTOR_CID, now, now],
  );
  await saveNotificationPreference(db, {
    userCid: DOCTOR_CID,
    hospitalCode: HCODE,
    mophLineEnabled: true,
    detailLevel: 'full',
    digestHour: 8,
    events: ['anc_hr3', 'consult_message'],
  });
});

afterEach(async () => {
  await db.close?.();
});

describe('in-app-alerts service', () => {
  it('lists enqueued MOPH alerts with unreadCount and messageText, and marks them read', async () => {
    await enqueueHighRiskAlert(db, {
      hospitalId: HOSP_ID,
      originHcode: '11002',
      hospitalName: 'รพ.ปัว',
      province: '55',
      caseRef: 'AN 6700111',
      localDate: '2026-11-25',
      patientName: 'นาง ทดสอบ แจ้งเตือน',
      confirmUrl: '/patients/11002-6700111',
    });

    await enqueueConsultMessageAlert(
      db,
      {
        hospitalId: HOSP_ID,
        originHcode: '11002',
        hospitalName: 'รพ.ปัว',
        province: '55',
        caseRef: 'AN 6700222',
        localDate: '2026-11-25',
        patientName: 'นาง ทดสอบ ปรึกษา',
        confirmUrl: '/patients/11002-6700222',
      },
      { messageId: 'msg-123', excludeCid: null },
    );

    const before = await listInAppAlerts(db, {
      userCid: DOCTOR_CID,
      hospitalId: HOSP_ID,
    });
    expect(before.unreadCount).toBe(2);
    expect(before.alerts).toHaveLength(2);
    expect(before.alerts[0].isRead).toBe(false);
    expect(before.alerts[0].messageText).toContain('รพ.ปัว');
    expect(before.alerts[0].patientName).not.toBeNull();

    // Mark one alert read
    const remaining = await markInAppAlertsRead(
      db,
      { userCid: DOCTOR_CID, hospitalId: HOSP_ID },
      { id: before.alerts[0].id },
    );
    expect(remaining).toBe(1);

    // Mark all read
    const afterAll = await markInAppAlertsRead(
      db,
      { userCid: DOCTOR_CID, hospitalId: HOSP_ID },
      { markAll: true },
    );
    expect(afterAll).toBe(0);
  });

  it('also surfaces deferred moph_alert_event_queue alerts for a hospital with no LINE recipients configured yet', async () => {
    const otherHospId = 'hosp-no-line';
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO hospitals (id, hcode, name, level, province_code, is_active, created_at, updated_at)
       VALUES (?, '11099', 'รพ.ยังไม่ผูกไลน์', 'F2', '55', true, ?, ?)`,
      [otherHospId, now, now],
    );

    await enqueueHighRiskAlert(db, {
      hospitalId: otherHospId,
      originHcode: '11099',
      hospitalName: 'รพ.ยังไม่ผูกไลน์',
      province: '55',
      caseRef: 'AN 6700555',
      localDate: '2026-11-25',
      patientName: 'นาง ทดสอบ ในระบบ',
      confirmUrl: '/patients/11099-6700555',
    });

    const list = await listInAppAlerts(db, {
      userCid: null,
      hospitalId: otherHospId,
    });
    expect(list.unreadCount).toBe(1);
    expect(list.alerts).toHaveLength(1);
    expect(list.alerts[0].lineStatus).toBe('awaiting_recipients');
    expect(list.alerts[0].confirmUrl).toBe('/patients/11099-6700555');
  });
});
