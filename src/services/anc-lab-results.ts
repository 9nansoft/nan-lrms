/**
 * Read side of cached_anc_lab_results, for the journey lab view.
 *
 * Returns decrypted clinical data including HIV outcomes, so callers must
 * enforce journey access and audit the read before exposing it.
 */
import type { DatabaseAdapter } from '@/db/adapter';
import {
  ANC_LAB_TESTS,
  type AncLabInterpretation,
  type AncLabSource,
  type AncLabTest,
} from '@/config/anc-lab-canon';
import { toIsoDate, toIsoString } from '@/lib/dates';
import { decrypt, getEncryptionKey } from '@/lib/encryption';
import { logger } from '@/lib/logger';
import {
  interpretStoredResult,
  type AncLabClassificationNote,
} from '@/services/anc-lab-classifier';

export interface JourneyLabResult {
  id: string;
  hospitalId: string;
  hospitalName: string;
  hcode: string;
  source: AncLabSource;
  /** Calendar day, YYYY-MM-DD: for a lab order, the day the sample was taken. */
  resultDate: string | null;
  gaWeeks: number | null;
  /** null = unclassified; show it under ancLabName / labItemsName. */
  canonicalTest: AncLabTest | null;
  classificationNote: AncLabClassificationNote | null;
  ancLabName: string | null;
  labItemsName: string | null;
  labItemsCode: string | null;
  /** null when missing or concealed, or when rawResultUnreadable is true. */
  rawResult: string | null;
  /** The stored value could not be decrypted; it is not the same as no result. */
  rawResultUnreadable: boolean;
  numericValue: number | null;
  normalizedValue: string | null;
  interpretation: AncLabInterpretation | null;
  unit: string | null;
  normalReference: string | null;
  /** HOSxP's lab_order.abnormal_result, verbatim. */
  abnormalFlag: string | null;
  /** HOSxP's person_anc_lab.lab_result_normal, verbatim; meaning unconfirmed. */
  ancResultNormalRaw: string | null;
  concealed: boolean;
  /** One of the three fields above could not be decrypted and reads as null. */
  contextUnreadable: boolean;
  syncedAt: string;
}

interface LabResultRow {
  id: string;
  hospital_id: string;
  hospital_name: string;
  hcode: string;
  source: AncLabSource;
  result_date: string | Date | null;
  ga_weeks: number | null;
  canonical_test: AncLabTest | null;
  classification_note: AncLabClassificationNote | null;
  anc_lab_name: string | null;
  lab_items_name: string | null;
  lab_items_code: string | null;
  raw_result: string | null;
  numeric_value: number | string | null;
  normalized_value: string | null;
  interpretation: AncLabInterpretation | null;
  unit: string | null;
  normal_reference: string | null;
  abnormal_flag: string | null;
  anc_result_normal_raw: string | null;
  concealed: boolean;
  synced_at: string | Date;
}

function decryptRaw(
  ciphertext: string | null,
  key: string,
): { value: string | null; failed: boolean } {
  if (ciphertext === null) return { value: null, failed: false };
  try {
    return { value: decrypt(ciphertext, key), failed: false };
  } catch {
    return { value: null, failed: true };
  }
}

/** Sensitive outcomes exist only in the ciphertext, so derive them here. */
function outcomeOf(row: LabResultRow, raw: string | null, failed: boolean) {
  const stored = {
    numericValue: row.numeric_value === null ? null : Number(row.numeric_value),
    normalizedValue: row.normalized_value,
    interpretation: row.interpretation,
  };
  const test = row.canonical_test;
  if (!test || !ANC_LAB_TESTS[test].sensitive) return stored;
  const none = { numericValue: null, normalizedValue: null };
  if (row.concealed) return { ...none, interpretation: 'concealed' as const };
  if (failed) return { ...none, interpretation: 'unknown' as const };
  if (raw === null) return { ...none, interpretation: 'missing' as const };
  return interpretStoredResult(test, raw);
}

/** Every lab for a pregnancy across hospitals, newest first, undated last. */
export async function listJourneyLabResults(
  db: DatabaseAdapter,
  journeyId: string,
  options: { onlyHospitalId?: string } = {},
): Promise<JourneyLabResult[]> {
  const { onlyHospitalId } = options;
  const rows = await db.query<LabResultRow>(
    `SELECT r.*, h.name AS hospital_name, h.hcode
       FROM cached_anc_lab_results r
       INNER JOIN hospitals h ON h.id = r.hospital_id
      WHERE r.journey_id = ?
        ${onlyHospitalId ? 'AND r.hospital_id = ?' : ''}
      ORDER BY r.result_date DESC NULLS LAST, r.source_key`,
    onlyHospitalId ? [journeyId, onlyHospitalId] : [journeyId],
  );
  if (rows.length === 0) return [];

  const key = getEncryptionKey();
  let decryptFailures = 0;
  const results = rows.map((row): JourneyLabResult => {
    const { value: rawResult, failed } = decryptRaw(row.raw_result, key);
    const normalReference = decryptRaw(row.normal_reference, key);
    const abnormalFlag = decryptRaw(row.abnormal_flag, key);
    const ancResultNormalRaw = decryptRaw(row.anc_result_normal_raw, key);
    const contextUnreadable =
      normalReference.failed || abnormalFlag.failed || ancResultNormalRaw.failed;
    if (failed || contextUnreadable) decryptFailures++;
    return {
      id: row.id,
      hospitalId: row.hospital_id,
      hospitalName: row.hospital_name,
      hcode: row.hcode,
      source: row.source,
      resultDate: toIsoDate(row.result_date),
      gaWeeks: row.ga_weeks,
      canonicalTest: row.canonical_test,
      classificationNote: row.classification_note,
      ancLabName: row.anc_lab_name,
      labItemsName: row.lab_items_name,
      labItemsCode: row.lab_items_code,
      rawResult,
      rawResultUnreadable: failed,
      ...outcomeOf(row, rawResult, failed),
      unit: row.unit,
      normalReference: normalReference.value,
      abnormalFlag: abnormalFlag.value,
      ancResultNormalRaw: ancResultNormalRaw.value,
      concealed: row.concealed,
      contextUnreadable,
      syncedAt: toIsoString(row.synced_at) ?? '',
    };
  });

  if (decryptFailures > 0) {
    logger.warn('anc_lab_result_decrypt_failed', { journeyId, count: decryptFailures });
  }
  return results;
}
