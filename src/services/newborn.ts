// T082: Newborn service — birth outcome tracking and neonatal KPIs
import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '@/db/adapter';
import type { CachedNewborn } from '@/types/domain';

export interface UpsertNewbornInput {
  journeyId: string;
  infantNumber: number;
  sex?: string;
  birthWeightG?: number;
  bodyLengthCm?: number;
  headCircumCm?: number;
  temperature?: number;
  heartRate?: number;
  respiratoryRate?: number;
  apgar1min?: number;
  apgar5min?: number;
  apgar10min?: number;
  resuscitation: Record<string, boolean>;
  vaccinations: Record<string, boolean>;
  infantIcd10?: string;
  infantHn?: string;
  infantAn?: string;
  dischargeStatus?: string;
  bornAt: string;
}

export async function upsertNewborn(
  db: DatabaseAdapter,
  input: UpsertNewbornInput,
): Promise<CachedNewborn> {
  const now = new Date().toISOString();
  const resuscJson = JSON.stringify(input.resuscitation);
  const vaccJson = JSON.stringify(input.vaccinations);

  // Check if record exists
  const existing = await db.query<Record<string, unknown>>(
    `SELECT id FROM cached_newborns WHERE journey_id = ? AND infant_number = ?`,
    [input.journeyId, input.infantNumber],
  );

  if (existing.length > 0) {
    // Update existing record
    await db.execute(
      `UPDATE cached_newborns SET
        sex = ?, birth_weight_g = ?, body_length_cm = ?, head_circum_cm = ?,
        temperature = ?, heart_rate = ?, respiratory_rate = ?,
        apgar_1min = ?, apgar_5min = ?, apgar_10min = ?,
        resuscitation = ?, vaccinations = ?,
        infant_icd10 = ?, infant_hn = ?, infant_an = ?,
        discharge_status = ?, born_at = ?, synced_at = ?
       WHERE journey_id = ? AND infant_number = ?`,
      [
        input.sex ?? null,
        input.birthWeightG ?? null,
        input.bodyLengthCm ?? null,
        input.headCircumCm ?? null,
        input.temperature ?? null,
        input.heartRate ?? null,
        input.respiratoryRate ?? null,
        input.apgar1min ?? null,
        input.apgar5min ?? null,
        input.apgar10min ?? null,
        resuscJson,
        vaccJson,
        input.infantIcd10 ?? null,
        input.infantHn ?? null,
        input.infantAn ?? null,
        input.dischargeStatus ?? null,
        input.bornAt,
        now,
        input.journeyId,
        input.infantNumber,
      ],
    );
  } else {
    // Insert new record
    const id = randomUUID();
    await db.execute(
      `INSERT INTO cached_newborns (
        id, journey_id, infant_number, sex,
        birth_weight_g, body_length_cm, head_circum_cm,
        temperature, heart_rate, respiratory_rate,
        apgar_1min, apgar_5min, apgar_10min,
        resuscitation, vaccinations,
        infant_icd10, infant_hn, infant_an, discharge_status,
        born_at, synced_at, created_at
       ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?
       )`,
      [
        id,
        input.journeyId,
        input.infantNumber,
        input.sex ?? null,
        input.birthWeightG ?? null,
        input.bodyLengthCm ?? null,
        input.headCircumCm ?? null,
        input.temperature ?? null,
        input.heartRate ?? null,
        input.respiratoryRate ?? null,
        input.apgar1min ?? null,
        input.apgar5min ?? null,
        input.apgar10min ?? null,
        resuscJson,
        vaccJson,
        input.infantIcd10 ?? null,
        input.infantHn ?? null,
        input.infantAn ?? null,
        input.dischargeStatus ?? null,
        input.bornAt,
        now,
        now,
      ],
    );
  }

  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM cached_newborns WHERE journey_id = ? AND infant_number = ?`,
    [input.journeyId, input.infantNumber],
  );
  return mapRowToNewborn(rows[0]);
}

export interface NewbornKPIs {
  totalBirths: number;
  lbwCount: number;
  lbwRate: number;
  lowApgarCount: number;
  avgBirthWeightG: number;
}

export async function getNewbornKPIs(
  db: DatabaseAdapter,
  hospitalId?: string,
): Promise<NewbornKPIs> {
  let sql = `SELECT
    COUNT(*) as total,
    SUM(CASE WHEN birth_weight_g < 2500 THEN 1 ELSE 0 END) as lbw,
    SUM(CASE WHEN apgar_1min < 7 THEN 1 ELSE 0 END) as low_apgar,
    AVG(birth_weight_g) as avg_weight
    FROM cached_newborns cn`;

  const params: unknown[] = [];
  if (hospitalId) {
    sql += ` JOIN maternal_journeys mj ON mj.id = cn.journey_id WHERE mj.current_hospital_id = ?`;
    params.push(hospitalId);
  }

  const rows = await db.query<Record<string, unknown>>(sql, params);
  const row = rows[0];
  const total = Number(row.total) || 0;
  const lbw = Number(row.lbw) || 0;

  return {
    totalBirths: total,
    lbwCount: lbw,
    lbwRate: total > 0 ? lbw / total : 0,
    lowApgarCount: Number(row.low_apgar) || 0,
    avgBirthWeightG: Math.round(Number(row.avg_weight) || 0),
  };
}

function mapRowToNewborn(row: Record<string, unknown>): CachedNewborn {
  const parseJson = (val: unknown): Record<string, boolean> => {
    if (typeof val === 'string') return JSON.parse(val) as Record<string, boolean>;
    if (typeof val === 'object' && val !== null) return val as Record<string, boolean>;
    return {};
  };

  return {
    id: row.id as string,
    journeyId: row.journey_id as string,
    infantNumber: row.infant_number as number,
    sex: row.sex as string | null,
    birthWeightG: row.birth_weight_g as number | null,
    bodyLengthCm: row.body_length_cm as number | null,
    headCircumCm: row.head_circum_cm as number | null,
    temperature: row.temperature as number | null,
    heartRate: row.heart_rate as number | null,
    respiratoryRate: row.respiratory_rate as number | null,
    apgar1min: row.apgar_1min as number | null,
    apgar5min: row.apgar_5min as number | null,
    apgar10min: row.apgar_10min as number | null,
    resuscitation: parseJson(row.resuscitation),
    vaccinations: parseJson(row.vaccinations),
    infantIcd10: row.infant_icd10 as string | null,
    infantHn: row.infant_hn as string | null,
    infantAn: row.infant_an as string | null,
    dischargeStatus: row.discharge_status as string | null,
    bornAt: new Date(row.born_at as string),
    syncedAt: new Date(row.synced_at as string),
    createdAt: new Date(row.created_at as string),
  };
}
