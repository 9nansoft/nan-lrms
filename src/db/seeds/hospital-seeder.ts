// T032: HospitalSeeder — seeds the Nan province hospital set for NN-LRMS
// (see NAN_HOSPITALS in src/config/hospitals.ts — derived from the MOPH
// registry, chwpart '55'). Under NODE_ENV=test it also seeds the legacy
// KK_HOSPITALS fixtures: the service/unit tests (webhook ingestion,
// journeys, referrals — 100+ files) are written against the Khon Kaen
// hcodes (10670 รพ.ขอนแก่น as the P+ hub, etc.), while the demo data and
// simulation use the NAN set — so tests get both (see
// tests/helpers/testDb.ts for the harness contract).
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseAdapter } from '../adapter';
import { DataSeeder } from './seeder';
import { KK_HOSPITALS, NAN_HOSPITALS } from '@/config/hospitals';
import { HospitalLevel, HospitalServiceType } from '@/types/domain';

// Default service-type by level. Updated for SAP framework:
//   P+ / P / A_S → provincial hub (regional centre)
//   A+ / A / M1 / M2 / S+ / S / S_C / M / F1 / F2 / F3 / F → district
//     with maternity by default; admins can flip non-maternity sites
//     to DISTRICT_NO_MATERNITY from /admin · โรงพยาบาล.
function defaultServiceType(level: HospitalLevel): HospitalServiceType {
  if (
    level === HospitalLevel.P_PLUS ||
    level === HospitalLevel.P ||
    level === HospitalLevel.A_S
  ) {
    return HospitalServiceType.PROVINCIAL_HUB;
  }
  return HospitalServiceType.DISTRICT_WITH_MATERNITY;
}

export class HospitalSeeder extends DataSeeder {
  getName(): string {
    return 'HospitalSeeder';
  }

  async shouldRun(db: DatabaseAdapter): Promise<boolean> {
    const rows = await db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM hospitals',
    );
    return rows[0].count === 0;
  }

  async seed(db: DatabaseAdapter): Promise<number> {
    const now = new Date().toISOString();
    const hospitals =
      process.env.NODE_ENV === 'test'
        ? [...NAN_HOSPITALS, ...KK_HOSPITALS]
        : NAN_HOSPITALS;
    let count = 0;

    for (const hospital of hospitals) {
      await db.execute(
        `INSERT INTO hospitals (id, hcode, name, level, service_type,
          is_active, connection_status, development_condition,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          hospital.hcode,
          hospital.name,
          hospital.level,
          defaultServiceType(hospital.level),
          true,
          'UNKNOWN',
          hospital.developmentCondition ?? null,
          now,
          now,
        ],
      );
      count++;
    }

    return count;
  }
}
