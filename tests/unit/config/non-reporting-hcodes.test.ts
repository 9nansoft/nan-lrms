import { describe, it, expect } from 'vitest';
import {
  NON_REPORTING_HCODES,
  NON_REPORTING_HCODE_NAMES,
  isNonReportingHcode,
} from '@/config/hospital-network';
import { EXEMPT_HCODES } from '@/lib/hospital-access-guard';

describe('NON_REPORTING_HCODES', () => {
  it('lists the system account and สสจ.น่าน (00042), which replaced the 99999 test account', () => {
    expect([...NON_REPORTING_HCODES]).toEqual(['00000', '00042']);
  });
  it.each(['00000', '00042'])('%s is non-reporting', (h) => {
    expect(isNonReportingHcode(h)).toBe(true);
  });
  it.each(['99999', '11000', '', '0', null, undefined])('%p is a reporting hcode', (h) => {
    expect(isNonReportingHcode(h)).toBe(false);
  });
  it('the access guard exempts exactly this set (no drift)', () => {
    expect([...EXEMPT_HCODES].sort()).toEqual([...NON_REPORTING_HCODES].sort());
  });
  it('every exempt code has a display name for its auto-registered row', () => {
    expect(Object.keys(NON_REPORTING_HCODE_NAMES).sort()).toEqual([...NON_REPORTING_HCODES].sort());
    expect(NON_REPORTING_HCODE_NAMES['00042']).toBe('สำนักงานสาธารณสุขจังหวัดน่าน');
  });
});

describe('exemptHospitalName', () => {
  it('names known exempt codes and falls back for others', async () => {
    const { exemptHospitalName } = await import('@/config/hospital-network');
    expect(exemptHospitalName('00042')).toBe('สำนักงานสาธารณสุขจังหวัดน่าน');
    expect(exemptHospitalName('12345')).toBe('Exempt (12345)');
  });
});
