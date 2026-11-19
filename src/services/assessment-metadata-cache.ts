// Assessment metadata cache — the label cache of the HOSxP maternity
// assessment forms, per hospital.
//
// The MEANING of a HOSxP assessment row (`asm_text12` = "BP") lives in
// `assessment_form` / `assessment_items`. Those tables change only when the
// SITE changes its form, so reading them on every sync cycle is wasted work:
// the pull keeps them here and reuses them until they go stale.
//
// ONE ROW PER FORM VERSION. A site can keep an older version of a form, and
// the rows recorded under that version are labelled with THAT version's
// items — so the cache keeps every version, not only the newest.
//
// EVERY clock is a PARAMETER. The callers decide what "now" is and how long
// the cache may live, so the behaviour is decided by the caller and never by
// a hidden Date.now() inside the logic.
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseAdapter } from '@/db/adapter';
import { MATERNITY_ASSESSMENT_FORMS } from '@/config/maternity-assessments';
import type { HosxpAssessmentFormRow, HosxpAssessmentItemRow } from '@/types/maternity-assessments';

/** The metadata of the maternity forms, as the rest of the code uses it. */
export interface AssessmentMetadata {
  forms: HosxpAssessmentFormRow[];
  items: HosxpAssessmentItemRow[];
  /**
   * Every form table the cache knows about — INCLUDING the ones the site
   * does not use. A site that has no `assessment_form` row for a table has
   * no form version to store, but the cache still records the table so the
   * pull knows it has seen everything and can answer from the cache.
   */
  coveredTables: string[];
  /**
   * The OLDEST `synced_at` of the hospital's cached rows — the freshness
   * clock. The oldest row decides, not the newest: a form version that was
   * written long ago and never rewritten must not look fresh because a
   * sibling row was just written.
   */
  syncedAt: string | null;
}

/**
 * The form id of a table the site does not use.
 *
 * A site that does not use one of the three forms has no `assessment_form`
 * row for it, so there is nothing to cache for that table. The cache records
 * it anyway under this id: without it the cache could never be "complete" for
 * such a site and the pull would read the metadata from HOSxP every cycle.
 *
 * HOSxP's form ids are POSITIVE, so a negative id cannot collide with a
 * real one (a real form may well have the id 0).
 */
export const UNUSED_FORM_ID = -1;

/** Longest form name the cache keeps (mirrors the table's column width). */
const MAX_FORM_NAME = 250;

interface CachedMetadataRow {
  form_table: string;
  form_id: number;
  form_name: string | null;
  items_json: unknown;
  synced_at: string | Date;
}

/**
 * The cached forms and items of one hospital.
 *
 * The forms come back newest first (HOSxP's own order) and the items keep
 * the order they were stored in — the order `assessment_items` listed them,
 * which is the order the labels are shown in.
 *
 * ONE round trip: the rows carry their `synced_at`, so the freshness of the
 * cache is known without asking the database a second time (two queries
 * would race each other).
 */
export async function readAssessmentMetadataCache(
  db: DatabaseAdapter,
  hospitalId: string,
): Promise<AssessmentMetadata> {
  const rows = await db.query<CachedMetadataRow>(
    `SELECT form_table, form_id, form_name, items_json, synced_at
       FROM cached_assessment_form_metadata
      WHERE hospital_id = ?
      ORDER BY form_id DESC, form_table ASC`,
    [hospitalId],
  );

  const forms: HosxpAssessmentFormRow[] = [];
  const items: HosxpAssessmentItemRow[] = [];
  const coveredTables: string[] = [];
  let oldest: number | null = null;
  for (const row of rows) {
    if (!coveredTables.includes(row.form_table)) coveredTables.push(row.form_table);
    const at = new Date(row.synced_at).getTime();
    if (!Number.isNaN(at) && (oldest === null || at < oldest)) oldest = at;
    // The sentinel row of a table the site does not use is not a form —
    // it must never reach the labelling path.
    if (row.form_id <= UNUSED_FORM_ID) continue;
    forms.push({
      assessment_form_id: row.form_id,
      assessment_form_table: row.form_table,
      assessment_form_name: row.form_name,
    });
    for (const item of parseItems(row.items_json)) items.push(item);
  }
  return {
    forms,
    items,
    coveredTables,
    syncedAt: oldest === null ? null : new Date(oldest).toISOString(),
  };
}

/**
 * Store the metadata of a hospital's forms, one row per form version.
 *
 * ONE transaction: a half-written cache says nothing (a form version
 * without its labels would label its rows with another version's items).
 *
 * The cache mirrors HOSxP's CURRENT form set: the rows of the tables that
 * were read are replaced, so a version the site deleted cannot survive here
 * and win `newestFormIdByTable`.
 */
export async function writeAssessmentMetadataCache(
  db: DatabaseAdapter,
  hospitalId: string,
  forms: HosxpAssessmentFormRow[],
  items: HosxpAssessmentItemRow[],
  now: Date = new Date(),
): Promise<void> {
  // Nothing was learned — the cache must not be written at all. Marking it
  // fresh would keep the pull from reading the metadata for a whole TTL
  // while the cache holds no label at all.
  if (forms.length === 0) return;

  const itemsByFormId = new Map<number, HosxpAssessmentItemRow[]>();
  for (const item of items) {
    const formId = Number(item.assessment_form_id);
    if (!Number.isInteger(formId)) continue;
    const bucket = itemsByFormId.get(formId);
    if (bucket) bucket.push(item);
    else itemsByFormId.set(formId, [item]);
  }

  const stamp = now.toISOString();
  const written = new Set<string>();
  const rows: {
    formTable: string;
    formId: number;
    formName: string | null;
    formItems: HosxpAssessmentItemRow[];
  }[] = [];

  for (const form of forms) {
    const formId = Number(form.assessment_form_id);
    if (!Number.isInteger(formId) || formId <= UNUSED_FORM_ID) continue;
    const formTable = form.assessment_form_table;
    if (!formTable) continue;
    written.add(formTable);
    rows.push({
      formTable,
      formId,
      formName: form.assessment_form_name
        ? form.assessment_form_name.slice(0, MAX_FORM_NAME)
        : null,
      formItems: itemsByFormId.get(formId) ?? [],
    });
  }

  // The tables the site does not use are recorded as sentinels: the pull has
  // to know it has seen EVERY form before it may answer from the cache, and a
  // site without a form has nothing else to record.
  for (const form of MATERNITY_ASSESSMENT_FORMS) {
    if (written.has(form.table)) continue;
    rows.push({ formTable: form.table, formId: UNUSED_FORM_ID, formName: null, formItems: [] });
  }

  await db.transaction(async (tx) => {
    // The cache must reflect HOSxP's current form set: drop the rows of the
    // tables that are about to be written before writing them again.
    const tables = MATERNITY_ASSESSMENT_FORMS.map((f) => f.table);
    const placeholders = tables.map(() => '?').join(', ');
    await tx.execute(
      `DELETE FROM cached_assessment_form_metadata
        WHERE hospital_id = ? AND form_table IN (${placeholders})`,
      [hospitalId, ...tables],
    );
    for (const row of rows) {
      await upsertMetadataRow(
        tx,
        hospitalId,
        row.formTable,
        row.formId,
        row.formName,
        row.formItems,
        stamp,
      );
    }
  });
}

/** Write one form version of one hospital's cache (in place on a re-read). */
async function upsertMetadataRow(
  db: DatabaseAdapter,
  hospitalId: string,
  formTable: string,
  formId: number,
  formName: string | null,
  formItems: HosxpAssessmentItemRow[],
  stamp: string,
): Promise<void> {
  await db.execute(
    `INSERT INTO cached_assessment_form_metadata
       (id, hospital_id, form_table, form_id, form_name, items_json,
        synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (hospital_id, form_table, form_id) DO UPDATE SET
       form_name = EXCLUDED.form_name,
       items_json = EXCLUDED.items_json,
       synced_at = EXCLUDED.synced_at,
       updated_at = EXCLUDED.updated_at`,
    [
      uuidv4(),
      hospitalId,
      formTable,
      formId,
      formName,
      JSON.stringify(formItems),
      stamp,
      stamp,
      stamp,
    ],
  );
}

/**
 * True when the cached labels are younger than the TTL.
 *
 * `syncedAt` is the OLDEST stamp of the cache (see
 * `readAssessmentMetadataCache`). The caller passes `now`, so the answer
 * never depends on the wall clock — and this function asks the database
 * nothing, so it cannot race the read it was computed from.
 */
export function isAssessmentMetadataCacheFresh(
  syncedAt: string | Date | null,
  ttlMs: number,
  now: Date,
): boolean {
  if (!syncedAt) return false;
  const at = syncedAt instanceof Date ? syncedAt.getTime() : new Date(syncedAt).getTime();
  if (Number.isNaN(at)) return false;
  return now.getTime() - at < ttlMs;
}

/**
 * True when the cache describes EVERY form the app pulls.
 *
 * A cache that covers only some of the tables is not enough: the forms it
 * misses would keep their raw HOSxP column names as labels. A table the site
 * does not use counts as covered — the cache records it as a sentinel.
 */
export function assessmentMetadataCoversAllForms(coveredTables: readonly string[]): boolean {
  const tables = new Set(coveredTables);
  return MATERNITY_ASSESSMENT_FORMS.every((form) => tables.has(form.table));
}

/** The `assessment_items` rows of one form version, as stored in the cache. */
function parseItems(raw: unknown): HosxpAssessmentItemRow[] {
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const items: HosxpAssessmentItemRow[] = [];
  for (const entry of value) {
    const item = parseItem(entry);
    if (item) items.push(item);
  }
  return items;
}

/** One `assessment_items` row, or null when the stored value is not one. */
function parseItem(entry: unknown): HosxpAssessmentItemRow | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const row = entry as Record<string, unknown>;
  const formId = row.assessment_form_id;
  if (typeof formId !== 'number' && typeof formId !== 'string') return null;
  return {
    assessment_form_id: formId,
    assessment_items_column: typeof row.assessment_items_column === 'string'
      ? row.assessment_items_column
      : '',
    assessment_items_note: typeof row.assessment_items_note === 'string'
      ? row.assessment_items_note
      : null,
    assessment_component_name: typeof row.assessment_component_name === 'string'
      ? row.assessment_component_name
      : null,
    assessment_data_type: typeof row.assessment_data_type === 'string'
      ? row.assessment_data_type
      : null,
  };
}
