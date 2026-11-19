// Live BMS smoke test for the three maternity assessment (asm_*) forms.
// SKIPPED in normal CI / `npm test`. Run manually with a real session id:
//   LIVE_BMS_SESSION_ID=<session-id> npm test -- tests/smoke
// Pure read-only — SELECTs each asm_* form table through the BMS Session API
// tunnel to verify the wiring end-to-end. Never mutates hospital data.
import { describe, it, expect, beforeAll } from 'vitest';
import {
  retrieveBmsSession,
  extractConnectionConfig,
} from '@/lib/bms-browser-client';
import { BmsSessionClient } from '@/lib/bms-session';
import { MATERNITY_ASSESSMENT_FORMS } from '@/config/maternity-assessments';
import { buildAssessmentRecordsSqlFor } from '@/config/hosxp-queries';
import type { ConnectionConfig } from '@/types/bms-browser';
import type { BmsQueryResult } from '@/types/bms-session';

const sessionId = process.env.LIVE_BMS_SESSION_ID;

/**
 * The database says the relation is not there: PostgreSQL says `relation
 * "asm_x" does not exist`, MariaDB says `Table 'nanhosxp.asm_x' doesn't
 * exist`. A site that does not use a form has no table for it.
 */
const MISSING_TABLE = /does not exist|doesn't exist/i;

/**
 * The value of a column in a row. Tolerates a gateway that reports the
 * column name in another case.
 */
function columnValue(row: Record<string, unknown>, column: string): unknown {
  if (column in row) return row[column];
  const match = Object.keys(row).find((key) => key.toLowerCase() === column.toLowerCase());
  return match === undefined ? undefined : row[match];
}

/**
 * A date value HOSxP actually filled in. HOSxP stores '0000-00-00' for a date
 * field nobody entered — that is "not present", not "not a date".
 */
function isFilledDate(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  const text = String(value).trim();
  return text !== '' && !/^0{4}-0{2}-0{2}/.test(text);
}

/** The parsed date of a HOSxP date value, or null when it does not parse. */
function parseHosxpDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const text = String(value ?? '').trim();
  const parsed = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

describe.skipIf(!sessionId)(
  'maternity assessment forms live smoke (set LIVE_BMS_SESSION_ID to enable)',
  () => {
    let config: ConnectionConfig;
    let client: BmsSessionClient;

    beforeAll(async () => {
      const r = await retrieveBmsSession(sessionId!);
      config = extractConnectionConfig(r);
      client = new BmsSessionClient(config.apiUrl);
    });

    /**
     * The rows of one form, read through the tunnel. Throws when the
     * database refuses the query (the caller decides whether that is a
     * missing table or a real failure).
     */
    async function readFormRows(
      form: (typeof MATERNITY_ASSESSMENT_FORMS)[number],
    ): Promise<Record<string, unknown>[]> {
      const sql = buildAssessmentRecordsSqlFor(form.table, form.pkColumn, '0');
      const res = (await client.executeQuery(
        sql,
        config.apiUrl,
        config.bearerToken,
        undefined,
        { appIdentifier: config.appIdentifier },
      )) as BmsQueryResult & { Message?: string };
      // Some gateway builds answer a SQL error with HTTP 200 and put the
      // failure in the body — read it as an error, not as an empty result.
      if (typeof res.MessageCode === 'number' && res.MessageCode !== 200) {
        throw new Error(res.Message || `SQL query failed (MessageCode ${res.MessageCode})`);
      }
      return res.data ?? [];
    }

    for (const form of MATERNITY_ASSESSMENT_FORMS) {
      it(`reads rows of ${form.table}`, async () => {
        let rows: Record<string, unknown>[];
        try {
          rows = await readFormRows(form);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (MISSING_TABLE.test(message)) {
            // The site does not use this form — it has no table for it.
            // Handled, not a failure.
            expect(message).toMatch(MISSING_TABLE);
            return;
          }
          // Anything else (auth, transport, a real SQL error) is a failure.
          throw error;
        }

        expect(Array.isArray(rows)).toBe(true);

        const first = rows[0];
        // The site may have no assessment of this form yet.
        if (!first) return;

        const pk = columnValue(first, form.pkColumn);
        expect(pk).toBeDefined();
        expect(pk).not.toBeNull();

        // dateColumns[0] is asm_date1 in every form: the record's own date.
        const rawDate = columnValue(first, form.dateColumns[0]);
        if (isFilledDate(rawDate)) {
          expect(parseHosxpDate(rawDate)).toBeInstanceOf(Date);
        }
      });
    }
  },
);
