// Seeds the Thai MOPH lookup tables from src/data/thai-geo JSONs.
// Runs once per fresh DB (skips if `provinces` already has rows). All four
// tables are populated in one transaction so the lookup set is atomic.
import type { DatabaseAdapter } from '../adapter';
import { DataSeeder } from './seeder';
import {
  THAI_PROVINCES,
  THAI_DISTRICTS,
  THAI_TAMBONS,
  MOPH_HOSPITALS,
} from '@/data/thai-geo';

export class ThaiGeoSeeder extends DataSeeder {
  getName(): string {
    return 'ThaiGeoSeeder';
  }

  async shouldRun(db: DatabaseAdapter): Promise<boolean> {
    const rows = await db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM provinces',
    );
    return Number(rows[0].count) === 0;
  }

  async seed(db: DatabaseAdapter): Promise<number> {
    let count = 0;

    for (const p of THAI_PROVINCES) {
      await db.execute(
        'INSERT INTO provinces (province_code, province_name) VALUES (?, ?)',
        [p.province_code, p.province_name],
      );
      count++;
    }

    for (const d of THAI_DISTRICTS) {
      await db.execute(
        'INSERT INTO districts (district_code, district_name, province_code) VALUES (?, ?, ?)',
        [d.district_code, d.district_name, d.province_code],
      );
      count++;
    }

    for (const t of THAI_TAMBONS) {
      await db.execute(
        'INSERT INTO tambons (tambon_code, tambon_name, district_code) VALUES (?, ?, ?)',
        [t.tambol_code, t.tambol_name, t.district_code],
      );
      count++;
    }

    for (const h of MOPH_HOSPITALS) {
      // MOPH district/tambon codes are built by concatenating chwpart+amppart
      // (+tmbpart). Guard against rows where any segment is missing — we still
      // keep the row but leave derived codes NULL so lookups don't match a
      // nonexistent district/tambon.
      const provinceCode = h.chwpart ?? null;
      const districtCode = h.chwpart && h.amppart ? `${h.chwpart}${h.amppart}` : null;
      const tambonCode =
        h.chwpart && h.amppart && h.tmbpart
          ? `${h.chwpart}${h.amppart}${h.tmbpart}`
          : null;
      await db.execute(
        `INSERT INTO moph_hospitals (
          hcode, name, hospital_type_id, hospital_level_id, bed_count,
          province_code, district_code, tambon_code, address, phone, active_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          h.hospcode,
          h.name,
          h.hospital_type_id,
          h.hospital_level_id,
          h.bed_count,
          provinceCode,
          districtCode,
          tambonCode,
          h.addrpart,
          h.hospital_phone,
          h.active_status,
        ],
      );
      count++;
    }

    return count;
  }
}
