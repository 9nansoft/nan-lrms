// Demo data seeder for SQLite dev mode — realistic Thai patient data
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import type { DatabaseAdapter } from '../adapter';
import { encrypt } from '@/lib/encryption';
import { calculateCpdScore } from '@/services/cpd-score';
import { logger } from '@/lib/logger';

const DEMO_ENCRYPTION_KEY = 'a'.repeat(64); // dev-only key

interface DemoPatient {
  name: string;
  cid: string;
  hn: string;
  an: string;
  age: number;
  gravida: number;
  gaWeeks: number;
  ancCount: number;
  heightCm: number;
  weightDiffKg: number;
  fundalHeightCm: number;
  usWeightG: number;
  hematocritPct: number;
  hospitalHcode: string;
  admitHoursAgo: number;
  cervixReadings: number[]; // dilation readings over time
}

// Realistic demo patients across multiple hospitals, various risk levels
const DEMO_PATIENTS: DemoPatient[] = [
  // รพ.ชุมแพ (10670) — 2 patients, 1 high-risk
  {
    name: 'นางสาว สมหญิง ใจดี',
    cid: '0000000000001',
    hn: 'HN-001', an: 'AN-2026-001',
    age: 19, gravida: 1, gaWeeks: 40, ancCount: 2,
    heightCm: 148, weightDiffKg: 18, fundalHeightCm: 38, usWeightG: 3800, hematocritPct: 30,
    hospitalHcode: '10670', admitHoursAgo: 8,
    cervixReadings: [3, 4, 5, 6, 7],
  },
  {
    name: 'นาง ประภา วงษ์สุวรรณ',
    cid: '0000000000002',
    hn: 'HN-002', an: 'AN-2026-002',
    age: 28, gravida: 2, gaWeeks: 38, ancCount: 8,
    heightCm: 158, weightDiffKg: 12, fundalHeightCm: 32, usWeightG: 3000, hematocritPct: 36,
    hospitalHcode: '10670', admitHoursAgo: 4,
    cervixReadings: [2, 3, 4],
  },
  // รพ.น้ำพอง (10671) — 1 patient, medium risk
  {
    name: 'นาง รัตนา พรมมา',
    cid: '0000000000003',
    hn: 'HN-003', an: 'AN-2026-003',
    age: 32, gravida: 3, gaWeeks: 39, ancCount: 5,
    heightCm: 152, weightDiffKg: 15, fundalHeightCm: 35, usWeightG: 3500, hematocritPct: 33,
    hospitalHcode: '10671', admitHoursAgo: 6,
    cervixReadings: [4, 5, 6],
  },
  // รพ.บ้านไผ่ (10672) — 2 patients, 1 high-risk
  {
    name: 'นางสาว วิภา ศรีสวัสดิ์',
    cid: '0000000000004',
    hn: 'HN-004', an: 'AN-2026-004',
    age: 17, gravida: 1, gaWeeks: 41, ancCount: 1,
    heightCm: 145, weightDiffKg: 20, fundalHeightCm: 40, usWeightG: 4200, hematocritPct: 28,
    hospitalHcode: '10672', admitHoursAgo: 12,
    cervixReadings: [2, 3, 3, 4, 4, 5],
  },
  {
    name: 'นาง สุดา แก้วมณี',
    cid: '0000000000005',
    hn: 'HN-005', an: 'AN-2026-005',
    age: 25, gravida: 2, gaWeeks: 37, ancCount: 9,
    heightCm: 160, weightDiffKg: 10, fundalHeightCm: 30, usWeightG: 2800, hematocritPct: 38,
    hospitalHcode: '10672', admitHoursAgo: 2,
    cervixReadings: [3],
  },
  // รพ.พล (10673) — 1 patient, low risk
  {
    name: 'นาง จันทร์ทิพย์ สุขสันต์',
    cid: '0000000000006',
    hn: 'HN-006', an: 'AN-2026-006',
    age: 30, gravida: 2, gaWeeks: 38, ancCount: 10,
    heightCm: 162, weightDiffKg: 11, fundalHeightCm: 31, usWeightG: 2900, hematocritPct: 37,
    hospitalHcode: '10673', admitHoursAgo: 3,
    cervixReadings: [5, 6, 7, 8],
  },
  // รพ.ภูเวียง (10674) — 2 patients
  {
    name: 'นางสาว อรุณี ชัยชนะ',
    cid: '0000000000007',
    hn: 'HN-007', an: 'AN-2026-007',
    age: 22, gravida: 1, gaWeeks: 39, ancCount: 6,
    heightCm: 155, weightDiffKg: 14, fundalHeightCm: 34, usWeightG: 3300, hematocritPct: 34,
    hospitalHcode: '10674', admitHoursAgo: 5,
    cervixReadings: [3, 4, 5, 6],
  },
  {
    name: 'นาง พิมพ์ใจ ทองคำ',
    cid: '0000000000008',
    hn: 'HN-008', an: 'AN-2026-008',
    age: 35, gravida: 4, gaWeeks: 40, ancCount: 3,
    heightCm: 150, weightDiffKg: 16, fundalHeightCm: 36, usWeightG: 3600, hematocritPct: 31,
    hospitalHcode: '10674', admitHoursAgo: 10,
    cervixReadings: [2, 3, 4, 5, 5, 6],
  },
  // รพ.หนองเรือ (10675) — 1 patient, high risk
  {
    name: 'นางสาว น้ำฝน มีสุข',
    cid: '0000000000009',
    hn: 'HN-009', an: 'AN-2026-009',
    age: 16, gravida: 1, gaWeeks: 42, ancCount: 0,
    heightCm: 143, weightDiffKg: 22, fundalHeightCm: 42, usWeightG: 4500, hematocritPct: 26,
    hospitalHcode: '10675', admitHoursAgo: 14,
    cervixReadings: [1, 2, 2, 3, 3, 3, 4],
  },
];

export async function seedDemoData(db: DatabaseAdapter): Promise<void> {
  // Check if demo data already exists
  const existing = await db.query<{ count: number }>(
    'SELECT COUNT(*) as count FROM cached_patients',
  );
  if (existing[0].count > 0) {
    logger.info('demo_seed_skipped', { reason: 'already_seeded' });
    return;
  }

  const now = new Date();
  const encKey = process.env.ENCRYPTION_KEY || DEMO_ENCRYPTION_KEY;

  logger.info('demo_seed_started', {});

  let patientCount = 0;
  let vitalCount = 0;
  let cpdCount = 0;

  for (const p of DEMO_PATIENTS) {
    // Find hospital UUID
    const hospitalRows = await db.query<{ id: string }>(
      'SELECT id FROM hospitals WHERE hcode = ?',
      [p.hospitalHcode],
    );
    if (hospitalRows.length === 0) {
      logger.warn('demo_seed_hospital_missing', { hospitalHcode: p.hospitalHcode });
      continue;
    }
    const hospitalId = hospitalRows[0].id;

    // Encrypt patient data
    const encName = encrypt(p.name, encKey);
    const encCid = encrypt(p.cid, encKey);
    const cidHash = createHash('sha256').update(p.cid).digest('hex');

    const admitDate = new Date(now.getTime() - p.admitHoursAgo * 3600_000);
    const patientId = uuidv4();

    // Insert patient
    await db.execute(
      `INSERT INTO cached_patients (
        id, hospital_id, hn, an, name, cid, cid_hash, age, gravida, ga_weeks,
        anc_count, admit_date, height_cm, weight_diff_kg,
        fundal_height_cm, us_weight_g, hematocrit_pct, labor_status,
        synced_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patientId, hospitalId, p.hn, p.an, encName, encCid, cidHash,
        p.age, p.gravida, p.gaWeeks, p.ancCount, admitDate.toISOString(),
        p.heightCm, p.weightDiffKg, p.fundalHeightCm, p.usWeightG, p.hematocritPct,
        'ACTIVE', now.toISOString(), now.toISOString(), now.toISOString(),
      ],
    );
    patientCount++;

    // Generate vital signs & cervix readings
    for (let i = 0; i < p.cervixReadings.length; i++) {
      const measuredAt = new Date(admitDate.getTime() + i * 3600_000); // 1 reading per hour
      const maternalHr = 70 + Math.floor(Math.random() * 30);
      const fetalHr = `${120 + Math.floor(Math.random() * 40)}`;
      const sbp = 110 + Math.floor(Math.random() * 30);
      const dbp = 60 + Math.floor(Math.random() * 20);

      await db.execute(
        `INSERT INTO cached_vital_signs (
          id, patient_id, measured_at, maternal_hr, fetal_hr, sbp, dbp,
          cervix_cm, synced_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(), patientId, measuredAt.toISOString(),
          maternalHr, fetalHr, sbp, dbp,
          p.cervixReadings[i], now.toISOString(), now.toISOString(),
        ],
      );
      vitalCount++;
    }

    // Calculate and store CPD score
    const cpdResult = calculateCpdScore({
      gravida: p.gravida,
      ancCount: p.ancCount,
      gaWeeks: p.gaWeeks,
      heightCm: p.heightCm,
      weightDiffKg: p.weightDiffKg,
      fundalHeightCm: p.fundalHeightCm,
      usWeightG: p.usWeightG,
      hematocritPct: p.hematocritPct,
    });

    await db.execute(
      `INSERT INTO cpd_scores (
        id, patient_id, score, risk_level, recommendation,
        factor_gravida, factor_anc_count, factor_ga_weeks, factor_height_cm,
        factor_weight_diff, factor_fundal_ht, factor_us_weight, factor_hematocrit,
        missing_factors, calculated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(), patientId, cpdResult.score, cpdResult.riskLevel, cpdResult.recommendation,
        cpdResult.factorScores.gravida ?? null,
        cpdResult.factorScores.ancCount ?? null,
        cpdResult.factorScores.gaWeeks ?? null,
        cpdResult.factorScores.heightCm ?? null,
        cpdResult.factorScores.weightDiffKg ?? null,
        cpdResult.factorScores.fundalHeightCm ?? null,
        cpdResult.factorScores.usWeightG ?? null,
        cpdResult.factorScores.hematocritPct ?? null,
        JSON.stringify(cpdResult.missingFactors),
        now.toISOString(), now.toISOString(),
      ],
    );
    cpdCount++;

    logger.info('demo_patient_seeded', {
      an: p.an,
      cpdScore: Number(cpdResult.score.toFixed(1)),
      riskLevel: cpdResult.riskLevel,
      hospitalHcode: p.hospitalHcode,
    });
  }

  // Set some hospitals to ONLINE status
  const usedHcodes = [...new Set(DEMO_PATIENTS.map((p) => p.hospitalHcode))];
  for (const hcode of usedHcodes) {
    await db.execute(
      "UPDATE hospitals SET connection_status = 'ONLINE', last_sync_at = ? WHERE hcode = ?",
      [now.toISOString(), hcode],
    );
  }

  logger.info('demo_seed_completed', {
    patientCount,
    vitalCount,
    cpdCount,
    hospitalsOnline: usedHcodes,
  });
}
