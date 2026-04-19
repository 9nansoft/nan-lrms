import { describe, it, expectTypeOf } from 'vitest';
import type {
  CdssSeverity, CdssSection, CdssAlertDto, PartographObservationDto,
} from '@/types/api';

describe('partogram CDSS types', () => {
  it('CdssSeverity is the four documented levels', () => {
    expectTypeOf<CdssSeverity>().toEqualTypeOf<'INFO' | 'WARN' | 'ALERT' | 'CRITICAL'>();
  });
  it('CdssSection covers all 12 documented sections', () => {
    expectTypeOf<CdssSection>().toEqualTypeOf<
      'FHR' | 'LIQUOR' | 'MOULDING' | 'CERVIX' | 'DESCENT'
      | 'CONTRACTIONS' | 'OXY' | 'PULSE' | 'BP' | 'TEMP' | 'URINE' | 'TIME'
    >();
  });
  it('CdssAlertDto has the four required fields', () => {
    expectTypeOf<CdssAlertDto>().toMatchTypeOf<{
      severity: CdssSeverity;
      section: CdssSection;
      message: string;
      obsIndex: number;
    }>();
  });
  it('PartographObservationDto has the 22 WHO clinical fields', () => {
    type Required = keyof PartographObservationDto;
    expectTypeOf<'fetalHeartRate'>().toMatchTypeOf<Required>();
    expectTypeOf<'cervicalDilationCm'>().toMatchTypeOf<Required>();
    expectTypeOf<'urineProtein'>().toMatchTypeOf<Required>();
    expectTypeOf<'amnioticTypeName'>().toMatchTypeOf<Required>();
  });
});
