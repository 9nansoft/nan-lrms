// "ANC Registry" appeared on three screens with nothing saying which women it
// counted, so two different numbers under one label looked like a data fault
// rather than two different questions. The label and its criteria line live in
// config and are built FROM the thresholds, so the text can never describe a
// rule the SQL no longer applies.
import { describe, it, expect } from 'vitest';
import {
  ANC_REGISTRY_LABEL_TH,
  ANC_REGISTRY_CRITERIA_TH,
  ANC_MAX_GA_WEEKS,
  ANC_EDC_MAX_PAST_DAYS,
  ANC_LAST_VISIT_MAX_AGE_DAYS,
} from '@/config/anc-freshness';

describe('ANC registry label', () => {
  it('names the cohort as "still being followed", not "all pregnant women"', () => {
    expect(ANC_REGISTRY_LABEL_TH).toContain('ยังติดตามอยู่');
  });

  it('states all three freshness thresholds, interpolated from the config values', () => {
    expect(ANC_REGISTRY_CRITERIA_TH).toContain(String(ANC_MAX_GA_WEEKS));
    expect(ANC_REGISTRY_CRITERIA_TH).toContain(String(ANC_EDC_MAX_PAST_DAYS));
    expect(ANC_REGISTRY_CRITERIA_TH).toContain(String(ANC_LAST_VISIT_MAX_AGE_DAYS));
  });

  it('says plainly that women outside the gates are excluded', () => {
    expect(ANC_REGISTRY_CRITERIA_TH).toContain('ไม่นับ');
  });
});
