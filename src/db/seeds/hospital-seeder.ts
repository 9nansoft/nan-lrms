// T032: HospitalSeeder — seeds 26 Khon Kaen province hospitals (per MOPH)
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseAdapter } from '../adapter';
import { DataSeeder } from './seeder';
import { KK_HOSPITALS } from '@/config/hospitals';
import { HospitalLevel, HospitalServiceType } from '@/types/domain';

// Default service-type for seeded hospitals based on MOPH level:
//   A_S     → provincial hub (Khon Kaen Regional)
//   M1/M2   → district with maternity (large referral hubs)
//   F1/F2/F3 → district with maternity by default; admins can flip the
//             smaller F2/F3 sites that don't actually deliver to
//             DISTRICT_NO_MATERNITY from /admin · โรงพยาบาล
function defaultServiceType(level: HospitalLevel): HospitalServiceType {
  if (level === HospitalLevel.A_S) return HospitalServiceType.PROVINCIAL_HUB;
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
    let count = 0;

    for (const hospital of KK_HOSPITALS) {
      await db.execute(
        `INSERT INTO hospitals (id, hcode, name, level, service_type, is_active,
          connection_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          hospital.hcode,
          hospital.name,
          hospital.level,
          defaultServiceType(hospital.level),
          true,
          'UNKNOWN',
          now,
          now,
        ],
      );
      count++;
    }

    return count;
  }
}
