'use client';
import { executeSql } from '@/lib/bms-browser-client';
import {
  MATERNITY_WARDS,
  PATIENT_COMPLICATIONS_BY_LABOUR_ID,
  PATIENT_INFANTS_BY_AN,
  PATIENT_LABOR_BY_AN,
  PATIENT_LABOUR_BY_AN,
  PATIENT_LABOUR_MED_BY_AN,
  PATIENT_PARTOGRAPH_BY_AN,
  PATIENT_PREGNANCY_BY_AN,
  PATIENT_STAGE_MED_BY_AN,
  PATIENT_VITAL_SIGNS_BY_AN,
  WARD_BEDS_INVENTORY,
  WARD_BEDS_OCCUPANCY,
  getQuery,
  type DatabaseDialect,
} from '@/config/hosxp-queries';
import type { ConnectionConfig } from '@/types/bms-browser';
import type {
  BedOccupancy,
  BedSlot,
  ComplicationRow,
  InfantRow,
  LaborRecord,
  LabourMedRow,
  LabourRecord,
  MaternityWard,
  PartographRow,
  PregnancyRecord,
  StageMedRow,
  VitalSignRow,
} from '@/types/maternity-ward';

// HOSxP tunnels behind BMS Session API are typically MySQL.
// Until we expose the dialect via the session, default to mysql for the
// browser-side queries. Server-side polling already detects via
// detectDatabaseType(); this client mirror does the same when needed in v2.
const DEFAULT_DIALECT: DatabaseDialect = 'mysql';

export async function listMaternityWards(config: ConnectionConfig): Promise<MaternityWard[]> {
  const sql = getQuery(MATERNITY_WARDS, DEFAULT_DIALECT);
  const r = await executeSql<MaternityWard>(sql, config);
  return r.data;
}

export async function listWardBedsInventory(
  config: ConnectionConfig,
  ward: string,
): Promise<BedSlot[]> {
  const sql = getQuery(WARD_BEDS_INVENTORY, DEFAULT_DIALECT);
  const r = await executeSql<BedSlot>(sql, config, { ward });
  return r.data;
}

export async function listWardBedsOccupancy(
  config: ConnectionConfig,
  ward: string,
): Promise<BedOccupancy[]> {
  const sql = getQuery(WARD_BEDS_OCCUPANCY, DEFAULT_DIALECT);
  const r = await executeSql<BedOccupancy>(sql, config, { ward });
  return r.data;
}

// Task 30: read all partograph observations for a single admission, ordered
// by observe_datetime (ordering happens server-side in PATIENT_PARTOGRAPH_BY_AN).
export async function getPatientPartograph(
  config: ConnectionConfig,
  an: string,
): Promise<PartographRow[]> {
  const sql = getQuery(PATIENT_PARTOGRAPH_BY_AN, DEFAULT_DIALECT);
  const r = await executeSql<PartographRow>(sql, config, { an });
  return r.data;
}

// Task 31: read all pregnancy vital-sign rows for a single admission. Note
// the underlying ipt_pregnancy_vital_sign has no single-column PK, so callers
// must use index-as-key for read-only rendering.
export async function getPatientVitalSigns(
  config: ConnectionConfig,
  an: string,
): Promise<VitalSignRow[]> {
  const sql = getQuery(PATIENT_VITAL_SIGNS_BY_AN, DEFAULT_DIALECT);
  const r = await executeSql<VitalSignRow>(sql, config, { an });
  return r.data;
}

// Task 32: read the single ipt_labour summary row for an admission. Returns
// null when no labour record exists yet (e.g. early admit, or the row was
// deleted upstream).
export async function getPatientLabour(
  config: ConnectionConfig,
  an: string,
): Promise<LabourRecord | null> {
  const sql = getQuery(PATIENT_LABOUR_BY_AN, DEFAULT_DIALECT);
  const r = await executeSql<LabourRecord>(sql, config, { an });
  return r.data[0] ?? null;
}

// Task 32: read the single ipt_pregnancy summary row for an admission.
// Same null semantics as getPatientLabour.
export async function getPatientPregnancy(
  config: ConnectionConfig,
  an: string,
): Promise<PregnancyRecord | null> {
  const sql = getQuery(PATIENT_PREGNANCY_BY_AN, DEFAULT_DIALECT);
  const r = await executeSql<PregnancyRecord>(sql, config, { an });
  return r.data[0] ?? null;
}

// Task 33: read the single legacy `labor` (note: BMS spelling is American)
// row for an admission. Distinct from ipt_labour: the labor table holds the
// delivery-room outcome whereas ipt_labour holds the admission-time summary.
export async function getPatientLabor(
  config: ConnectionConfig,
  an: string,
): Promise<LaborRecord | null> {
  const sql = getQuery(PATIENT_LABOR_BY_AN, DEFAULT_DIALECT);
  const r = await executeSql<LaborRecord>(sql, config, { an });
  return r.data[0] ?? null;
}

// Task 34: read all free-text labour-medication rows for an admission. The
// underlying labour_medication table has a labour_medication_id PK, so the
// caller can use it directly as the React key (unlike vital-signs in Task 31).
export async function getPatientLabourMedications(
  config: ConnectionConfig,
  an: string,
): Promise<LabourMedRow[]> {
  const sql = getQuery(PATIENT_LABOUR_MED_BY_AN, DEFAULT_DIALECT);
  const r = await executeSql<LabourMedRow>(sql, config, { an });
  return r.data;
}

// Task 35: read delivery-room (stage) medication rows for an admission. Joined
// to s_drugitems / opduser server-side so the result already carries
// medication_name + staff_name; rows are PK'd by labour_stage_medication_id.
export async function getPatientStageMedications(
  config: ConnectionConfig,
  an: string,
): Promise<StageMedRow[]> {
  const sql = getQuery(PATIENT_STAGE_MED_BY_AN, DEFAULT_DIALECT);
  const r = await executeSql<StageMedRow>(sql, config, { an });
  return r.data;
}

// Task 36: read labour complications for a given ipt_labour_id (NOT an — the
// underlying ipt_labour_complication table foreign-keys on ipt_labour_id).
// Callers must first resolve the labour record via getPatientLabour.
export async function getPatientComplications(
  config: ConnectionConfig,
  iptLabourId: number,
): Promise<ComplicationRow[]> {
  const sql = getQuery(PATIENT_COMPLICATIONS_BY_LABOUR_ID, DEFAULT_DIALECT);
  const r = await executeSql<ComplicationRow>(sql, config, { ipt_labour_id: iptLabourId });
  return r.data;
}

// Task 37: read newborn + ipt_labour_infant join for an admission. The
// underlying join uses ipt_newborn LEFT JOIN ipt_labour_infant on .an, so a
// stillbirth (no infant row) still surfaces the newborn record.
export async function getPatientInfants(
  config: ConnectionConfig,
  an: string,
): Promise<InfantRow[]> {
  const sql = getQuery(PATIENT_INFANTS_BY_AN, DEFAULT_DIALECT);
  const r = await executeSql<InfantRow>(sql, config, { an });
  return r.data;
}
