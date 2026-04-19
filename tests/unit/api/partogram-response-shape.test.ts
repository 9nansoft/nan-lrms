// T22: PartogramResponse + PatientListItem extension type tests
import { describe, it, expectTypeOf } from 'vitest';
import type { PartogramResponse, PatientListItem } from '@/types/api';

describe('PartogramResponse extension', () => {
  it('partogram has observations[]', () => {
    expectTypeOf<PartogramResponse['partogram']['observations']>()
      .toBeArray();
  });
  it('partogram has alerts[] and severity', () => {
    expectTypeOf<PartogramResponse['partogram']['alerts']>().toBeArray();
    expectTypeOf<PartogramResponse['partogram']['severity']>().not.toBeNullable();
  });
});

describe('PatientListItem partograph fields', () => {
  it('exposes partographSeverity and partographAlertCount', () => {
    expectTypeOf<PatientListItem['partographSeverity']>()
      .toEqualTypeOf<'INFO' | 'WARN' | 'ALERT' | 'CRITICAL' | null>();
    expectTypeOf<PatientListItem['partographAlertCount']>()
      .toEqualTypeOf<number | null>();
  });
});
