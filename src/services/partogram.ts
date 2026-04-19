// T067: Partogram service — alert/action line calculations
// CDSS analyzers (T7–T14) ported from HOSxP PartographCDSSUnit.pas.
import type {
  PartogramEntry,
  CdssSeverity,
  CdssAlertDto,
  PartographObservationDto,
} from '@/types/api';

interface AlertLinePoint {
  measuredAt: string;
  dilationCm: number;
}

/**
 * Calculate alert line starting at given dilation (default 4cm)
 * progressing at 1cm/hour up to 10cm.
 */
export function calculateAlertLine(
  startTime: Date,
  startDilation: number = 4,
): AlertLinePoint[] {
  const points: AlertLinePoint[] = [];
  for (let cm = startDilation; cm <= 10; cm++) {
    const hoursFromStart = cm - startDilation;
    const time = new Date(startTime.getTime() + hoursFromStart * 3600000);
    points.push({
      measuredAt: time.toISOString(),
      dilationCm: cm,
    });
  }
  return points;
}

/**
 * Calculate action line — same dilation values as alert line
 * but offset 4 hours to the right.
 */
export function calculateActionLine(alertLineEntries: AlertLinePoint[]): AlertLinePoint[] {
  return alertLineEntries.map((entry) => ({
    measuredAt: new Date(new Date(entry.measuredAt).getTime() + 4 * 3600000).toISOString(),
    dilationCm: entry.dilationCm,
  }));
}

interface VitalSignInput {
  measuredAt: string;
  cervixCm: number;
}

/**
 * Generate partogram entries from vital signs data.
 * Alert/action lines start computing once dilation reaches 4cm.
 */
export function generatePartogramEntries(
  vitalSigns: VitalSignInput[],
): PartogramEntry[] {
  if (vitalSigns.length === 0) return [];

  // Find when active phase starts (first measurement at >= 4cm)
  const activePhaseIndex = vitalSigns.findIndex((vs) => vs.cervixCm >= 4);

  let alertLine: AlertLinePoint[] = [];
  let actionLine: AlertLinePoint[] = [];

  if (activePhaseIndex >= 0) {
    const activePhaseStart = new Date(vitalSigns[activePhaseIndex].measuredAt);
    const startDilation = vitalSigns[activePhaseIndex].cervixCm;
    alertLine = calculateAlertLine(activePhaseStart, startDilation);
    actionLine = calculateActionLine(alertLine);
  }

  return vitalSigns.map((vs) => {
    const vsTime = new Date(vs.measuredAt).getTime();
    let alertLineCm: number | null = null;
    let actionLineCm: number | null = null;

    if (activePhaseIndex >= 0 && vs.cervixCm >= 4) {
      // Interpolate alert line value at this time
      alertLineCm = interpolateLineValue(alertLine, vsTime);
      actionLineCm = interpolateLineValue(actionLine, vsTime);
    }

    return {
      measuredAt: vs.measuredAt,
      dilationCm: vs.cervixCm,
      alertLineCm,
      actionLineCm,
    };
  });
}

/**
 * Interpolate dilation value on a reference line at a given time.
 * Uses linear interpolation between the two nearest points.
 */
function interpolateLineValue(
  line: AlertLinePoint[],
  targetTime: number,
): number | null {
  if (line.length === 0) return null;

  const firstTime = new Date(line[0].measuredAt).getTime();
  const lastTime = new Date(line[line.length - 1].measuredAt).getTime();

  // Before the line starts
  if (targetTime <= firstTime) return line[0].dilationCm;
  // After the line ends
  if (targetTime >= lastTime) return line[line.length - 1].dilationCm;

  // Find surrounding points
  for (let i = 0; i < line.length - 1; i++) {
    const t1 = new Date(line[i].measuredAt).getTime();
    const t2 = new Date(line[i + 1].measuredAt).getTime();
    if (targetTime >= t1 && targetTime <= t2) {
      const ratio = (targetTime - t1) / (t2 - t1);
      return line[i].dilationCm + ratio * (line[i + 1].dilationCm - line[i].dilationCm);
    }
  }

  return null;
}

// ============================================================================
// CDSS (Clinical Decision Support) — ported from PartographCDSSUnit.pas
// ============================================================================

const SEVERITY_RANK: Record<CdssSeverity, number> = {
  INFO: 0, WARN: 1, ALERT: 2, CRITICAL: 3,
};

export interface PartographHeader {
  an: string;
  hn?: string;
  patientName?: string;
  gpal?: string;
  age?: string;
  admitAt?: string;
}

export function highestSeverity(alerts: CdssAlertDto[]): CdssSeverity | null {
  if (alerts.length === 0) return null;
  let best: CdssSeverity = 'INFO';
  for (const a of alerts) {
    if (SEVERITY_RANK[a.severity] > SEVERITY_RANK[best]) best = a.severity;
  }
  return best;
}

export function countBySeverity(alerts: CdssAlertDto[], s: CdssSeverity): number {
  return alerts.filter((a) => a.severity === s).length;
}

// Each analyzer is a small pure function. T8–T14 fill in the bodies in place.
function analyzeFhr(_obs: PartographObservationDto[]): CdssAlertDto[] {
  return [];
}
function analyzeLiquorMoulding(_obs: PartographObservationDto[]): CdssAlertDto[] {
  return [];
}
function analyzeCervix(_obs: PartographObservationDto[]): CdssAlertDto[] {
  return [];
}
function analyzeContractions(_obs: PartographObservationDto[]): CdssAlertDto[] {
  return [];
}
function analyzeMaternal(_obs: PartographObservationDto[]): CdssAlertDto[] {
  return [];
}
function analyzeUrine(_obs: PartographObservationDto[]): CdssAlertDto[] {
  return [];
}
function analyzeTimeGaps(_obs: PartographObservationDto[]): CdssAlertDto[] {
  return [];
}

export function analyzePartograph(
  _header: PartographHeader,
  observations: PartographObservationDto[],
): CdssAlertDto[] {
  if (observations.length === 0) return [];
  return [
    ...analyzeFhr(observations),
    ...analyzeLiquorMoulding(observations),
    ...analyzeCervix(observations),
    ...analyzeContractions(observations),
    ...analyzeMaternal(observations),
    ...analyzeUrine(observations),
    ...analyzeTimeGaps(observations),
  ];
}

// Internal exports for per-analyzer tests (T8–T14). These reference the
// hoisted function declarations above; replacing the function body in place
// (rather than reassigning the binding) keeps these references live.
export const _internals = {
  analyzeFhr,
  analyzeLiquorMoulding,
  analyzeCervix,
  analyzeContractions,
  analyzeMaternal,
  analyzeUrine,
  analyzeTimeGaps,
};
