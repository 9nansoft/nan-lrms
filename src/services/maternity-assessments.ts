// Maternity assessment (LR) reads — cache → DTO.
//
// The cache stores one row per HOSxP assessment form instance with its
// fields already labelled (see src/services/sync/maternity-assessment.ts).
// This service hands them to the UI: it decrypts the name-bearing entries,
// drops empty ones and orders the forms newest first.
import type { DatabaseAdapter } from '@/db/adapter';
import { decrypt, getEncryptionKey } from '@/lib/encryption';
import {
  MATERNITY_ASSESSMENT_FORMS,
  type MaternityAssessmentKey,
} from '@/config/maternity-assessments';
import type {
  MaternityAssessmentDto,
  MaternityAssessmentField,
} from '@/types/maternity-assessments';

interface CachedAssessmentRow {
  id: string;
  form_key: string;
  form_table: string;
  form_name: string | null;
  recorded_at: string | Date;
  recorded_date: string | null;
  entry_staff: string | null;
  fields_json: string | MaternityAssessmentField[] | null;
}

function toIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function parseFields(raw: string | MaternityAssessmentField[] | null): MaternityAssessmentField[] {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (f): f is MaternityAssessmentField =>
      !!f && typeof f === 'object' && typeof (f as MaternityAssessmentField).value === 'string',
  );
}

/** Decrypt the entries that were encrypted at write time. */
export function decryptAssessmentFields(
  fields: MaternityAssessmentField[],
): MaternityAssessmentField[] {
  return fields.map((field) => {
    if (!field.encrypted) return field;
    // Fail closed: a key rotation that leaves the old ciphertext behind must
    // not render as a "name" in the UI.
    let value = '';
    try {
      value = decrypt(field.value, getEncryptionKey());
    } catch {
      value = '';
    }
    return { ...field, value, encrypted: false };
  });
}

/**
 * Every cached assessment form of one admission, newest first. Rows whose
 * form key is unknown (a form the app does not know about) are skipped.
 *
 * The hospital scope is required: ANs are hospital-local, so an unscoped
 * query could return another hospital's rows for a colliding AN.
 */
export async function getPatientMaternityAssessments(
  db: DatabaseAdapter,
  an: string,
  hospitalId: string,
): Promise<MaternityAssessmentDto[]> {
  const rows = await db.query<CachedAssessmentRow>(
    `SELECT id, form_key, form_table, form_name, recorded_at, recorded_date,
            entry_staff, fields_json
       FROM cached_maternity_assessments
      WHERE an = ? AND hospital_id = ?
      ORDER BY recorded_at DESC`,
    [an, hospitalId],
  );

  const known = new Set(MATERNITY_ASSESSMENT_FORMS.map((f) => f.key));
  const dtos: MaternityAssessmentDto[] = [];
  for (const row of rows) {
    const formKey = row.form_key as MaternityAssessmentKey;
    if (!known.has(formKey)) continue;
    const fields = decryptAssessmentFields(parseFields(row.fields_json)).filter(
      (f) => f.value !== '',
    );
    dtos.push({
      id: row.id,
      formKey,
      formTable: row.form_table,
      formName: row.form_name || formKey,
      recordedAt: toIso(row.recorded_at),
      recordedDate: row.recorded_date,
      entryStaff: row.entry_staff,
      fields,
    });
  }
  return dtos;
}

/** How many cached assessment forms a hospital holds per form (admin KPI). */
export async function countAssessmentsByForm(
  db: DatabaseAdapter,
  hospitalId: string,
): Promise<Record<string, number>> {
  const rows = await db.query<{ form_key: string; n: number | string }>(
    `SELECT form_key, COUNT(*) AS n
       FROM cached_maternity_assessments
      WHERE hospital_id = ?
      GROUP BY form_key`,
    [hospitalId],
  );
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.form_key] = Number(row.n);
  return counts;
}
