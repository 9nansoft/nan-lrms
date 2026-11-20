// Maternity assessment (LR) SQL templates — the house convention: the query
// text itself carries the scope, and the app never inlines anything that
// doesn't look like a plain value.
import { describe, it, expect } from 'vitest';
import {
  ASSESSMENT_FORMS,
  ASSESSMENT_ITEMS,
  buildAssessmentItemsSql,
  buildAssessmentRecordsSql,
  buildAssessmentRecordsSqlFor,
  buildAssessmentReconcileSqlFor,
  ASSESSMENT_ROW_LIMIT,
} from '@/config/hosxp-queries';

describe('maternity assessment queries', () => {
  it('pulls the three LR assessment forms', () => {
    for (const dialect of ['postgresql', 'mysql'] as const) {
      const sql = ASSESSMENT_FORMS[dialect];
      expect(sql).toMatch(/asm_first_pregnant_pt_nan/);
      expect(sql).toMatch(/asm_lr_record_birth_period_nan/);
      expect(sql).toMatch(/asm_lr_record_after_birth_nan/);
      expect(sql).toMatch(/assessment_form_name/);
    }
  });

  it('reads the column labels from assessment_items + assessment_component', () => {
    const sql = ASSESSMENT_ITEMS.postgresql;
    expect(sql).toMatch(/FROM assessment_items/);
    expect(sql).toMatch(/JOIN assessment_component/);
    expect(sql).toMatch(/assessment_items_note/);
    expect(sql).toContain('{{FORM_IDS}}');
  });

  it('substitutes only validated form ids', () => {
    const sql = buildAssessmentItemsSql([308, 309]);
    expect(sql).toContain('IN (308,309)');
    expect(sql).not.toContain('{{FORM_IDS}}');
    expect(() => buildAssessmentItemsSql([])).toThrow();
    expect(() => buildAssessmentItemsSql([Number.NaN])).toThrow();
  });

  it('joins the form rows to the assessment head and the admission', () => {
    const sql = buildAssessmentRecordsSql(
      'asm_lr_record_after_birth_nan',
      'asm_lr_record_after_birth_nan_id',
    ).postgresql;
    expect(sql).toMatch(/FROM asm_lr_record_after_birth_nan/);
    expect(sql).toMatch(/JOIN assessment_head h ON h\.assessment_head_id = t\.assessment_head_id/);
    expect(sql).toMatch(/LEFT JOIN ipt i ON i\.an = t\.an/);
    // The head columns are aliased so they never collide with the form's own
    // positional columns.
    expect(sql).toMatch(/h\.assessment_head_datetime AS head_datetime/);
    expect(sql).toMatch(/i\.hn AS patient_hn/);
    expect(sql).toContain('{{CURSOR_PK}}');
  });

  it('asks for everything above the cursor, oldest first', () => {
    const sql = buildAssessmentRecordsSql(
      'asm_first_pregnant_pt_nan',
      'asm_first_pregnant_pt_nan_id',
    ).postgresql;
    // A date window would re-read the same oldest page on a form that holds
    // hundreds of rows on one day; the primary key cannot stall.
    expect(sql).toMatch(/WHERE t\.asm_first_pregnant_pt_nan_id > \{\{CURSOR_PK\}\}/);
    expect(sql).toMatch(/ORDER BY t\.asm_first_pregnant_pt_nan_id ASC/);
    expect(sql).toContain(`LIMIT ${ASSESSMENT_ROW_LIMIT}`);
  });

  it('substitutes only a validated cursor pk', () => {
    const sql = buildAssessmentRecordsSqlFor(
      'asm_first_pregnant_pt_nan',
      'asm_first_pregnant_pt_nan_id',
      2418,
    );
    expect(sql).toContain('> 2418');
    expect(sql).not.toContain('{{CURSOR_PK}}');
    expect(() =>
      buildAssessmentRecordsSqlFor(
        'asm_first_pregnant_pt_nan',
        'asm_first_pregnant_pt_nan_id',
        'x',
      ),
    ).toThrow();
    expect(() =>
      buildAssessmentRecordsSqlFor(
        'asm_first_pregnant_pt_nan',
        'asm_first_pregnant_pt_nan_id',
        '1; DROP TABLE x',
      ),
    ).toThrow();
  });

  it('builds the reconcile query without a colon in the literal', () => {
    // The marketplace's SQL classifier reads a ':' as a parameter marker and
    // refuses a statement it cannot classify ("SENSITIVE_BLOCKED ...
    // parameter marker : not standing alone"). A clock literal has two.
    const sql = buildAssessmentReconcileSqlFor(
      'asm_first_pregnant_pt_nan',
      'asm_first_pregnant_pt_nan_id',
      '2026-11-18',
    );
    expect(sql).toContain("'2026-11-18'");
    expect(sql).not.toMatch(/\d{2}:\d{2}/);
    expect(() =>
      buildAssessmentReconcileSqlFor(
        'asm_first_pregnant_pt_nan',
        'asm_first_pregnant_pt_nan_id',
        '2026-11-18 09:00:00',
      ),
    ).toThrow();
    expect(() =>
      buildAssessmentReconcileSqlFor(
        'asm_first_pregnant_pt_nan',
        'asm_first_pregnant_pt_nan_id',
        '1; DROP TABLE x',
      ),
    ).toThrow();
  });

  it('serves the same body in both dialects', () => {
    const t = buildAssessmentRecordsSql(
      'asm_first_pregnant_pt_nan',
      'asm_first_pregnant_pt_nan_id',
    );
    expect(t.postgresql).toBe(t.mysql);
  });
});
