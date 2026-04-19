// T16: Tests for the PARTOGRAPH_OBSERVATIONS SQL template (dual-dialect).
import { describe, it, expect } from 'vitest';
import { PARTOGRAPH_OBSERVATIONS, getQuery } from '@/config/hosxp-queries';

describe('PARTOGRAPH_OBSERVATIONS', () => {
  it('exists for both dialects', () => {
    expect(PARTOGRAPH_OBSERVATIONS.postgresql).toMatch(/ipt_labour_partograph/);
    expect(PARTOGRAPH_OBSERVATIONS.mysql).toMatch(/ipt_labour_partograph/);
  });

  it('joins labour_amniotic_type for the human-readable label', () => {
    expect(PARTOGRAPH_OBSERVATIONS.postgresql).toMatch(/labour_amniotic_type/);
    expect(PARTOGRAPH_OBSERVATIONS.mysql).toMatch(/labour_amniotic_type/);
  });

  it('filters to currently-admitted patients', () => {
    expect(getQuery(PARTOGRAPH_OBSERVATIONS, 'postgresql'))
      .toMatch(/dchdate IS NULL/);
    expect(getQuery(PARTOGRAPH_OBSERVATIONS, 'mysql'))
      .toMatch(/dchdate IS NULL/);
  });

  it('orders by AN then observe_datetime', () => {
    expect(PARTOGRAPH_OBSERVATIONS.postgresql)
      .toMatch(/ORDER BY lp\.an, lp\.observe_datetime/);
  });
});
