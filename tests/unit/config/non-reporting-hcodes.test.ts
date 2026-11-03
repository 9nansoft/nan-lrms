import { describe, it, expect } from 'vitest';
import { NON_REPORTING_HCODES, isNonReportingHcode } from '@/config/hospital-network';
import { EXEMPT_HCODES } from '@/lib/hospital-access-guard';

describe('NON_REPORTING_HCODES', () => {
  it('lists the two pseudo-hospitals', () => {
    expect([...NON_REPORTING_HCODES]).toEqual(['00000', '99999']);
  });
  it.each(['00000', '99999'])('%s is non-reporting', (h) => {
    expect(isNonReportingHcode(h)).toBe(true);
  });
  it.each(['11000', '', '0', null, undefined])('%p is a reporting hcode', (h) => {
    expect(isNonReportingHcode(h)).toBe(false);
  });
  it('the access guard exempts exactly this set (no drift)', () => {
    expect([...EXEMPT_HCODES].sort()).toEqual([...NON_REPORTING_HCODES].sort());
  });
});
