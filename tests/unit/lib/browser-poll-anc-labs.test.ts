import { describe, it, expect } from 'vitest';
import { ancVisitsSql } from '@/lib/browser-poll';

describe('ancVisitsSql — lab columns', () => {
  it('does not read anc_lab_id 8 as hemoglobin (it is HBsAg or a repeat Hct, by site)', () => {
    const sql = ancVisitsSql();
    expect(sql).not.toMatch(/anc_lab_id\s*=\s*8/);
    expect(sql).not.toMatch(/hb_result/);
  });
});
