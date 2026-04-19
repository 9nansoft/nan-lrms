// Shared test factory for partograph CDSS analyzer tests (T8–T14).
import type { PartographObservationDto } from '@/types/api';

let counter = 0;

/**
 * Build a PartographObservationDto with all clinical fields nullable by
 * default. Pass overrides to set the fields under test. The optional
 * `t` parameter accepts an ISO datetime string or Date; defaults stagger
 * one hour apart per call so unrelated tests don't accidentally collide
 * on time.
 */
export function obs(
  overrides: Partial<PartographObservationDto> = {},
  t?: string | Date,
): PartographObservationDto {
  counter += 1;
  const observeDatetime =
    t === undefined
      ? new Date(Date.UTC(2026, 3, 19, 10, 0, 0) + counter * 3600000).toISOString()
      : t instanceof Date
        ? t.toISOString()
        : t;
  return {
    id: `obs-${counter}`,
    observeDatetime,
    hourNo: counter,
    fetalHeartRate: null,
    amnioticFluid: null,
    amnioticTypeName: null,
    moulding: null,
    cervicalDilationCm: null,
    descentOfHead: null,
    contractionPer10Min: null,
    contractionDurationSec: null,
    contractionStrength: null,
    oxytocinUml: null,
    oxytocinDropsMin: null,
    drugsIvFluids: null,
    pulse: null,
    bpSystolic: null,
    bpDiastolic: null,
    temperature: null,
    urineVolumeMl: null,
    urineProtein: null,
    urineGlucose: null,
    urineAcetone: null,
    note: null,
    entryStaff: null,
    ...overrides,
  };
}

/** ISO timestamp at minute offset from a fixed base for deterministic tests. */
export function tAt(minutes: number): string {
  return new Date(Date.UTC(2026, 3, 19, 10, 0, 0) + minutes * 60000).toISOString();
}
