// Shared /api/dashboard fixtures for the dashboard tests (UI sub-project 2).
import { ConnectionStatus, HospitalLevel } from '@/types/domain';
import type {
  DashboardContinuum,
  DashboardHospital,
  DashboardStageKPIs,
  DashboardSummary,
  DashboardTrends,
  HighRiskPatient,
} from '@/types/api';

export function makeHospital(over: Partial<DashboardHospital> = {}): DashboardHospital {
  return {
    hcode: '10670',
    name: 'รพ.น่าน',
    level: HospitalLevel.A_S,
    connectionStatus: ConnectionStatus.ONLINE,
    lastSyncAt: new Date().toISOString(),
    counts: { low: 1, medium: 1, high: 1, total: 3 },
    ancCounts: { total: 10, hr3: 1 },
    partographQuality: { laborRecent: 0, withPartograph: 0 },
    syncStatus: 'OK',
    syncBlockedReason: null,
    ...over,
  };
}

export function makeSummary(over: Partial<DashboardSummary> = {}): DashboardSummary {
  return { totalActive: 12, totalHigh: 3, totalMedium: 4, totalLow: 5, ...over };
}

export function makeTrends(over: Partial<DashboardTrends> = {}): DashboardTrends {
  const shift = (label: string, admissions: number, delivered: number, referred: number) => ({
    label,
    windowStart: '2026-10-11T01:00:00.000Z',
    windowEnd: '2026-10-11T08:00:00.000Z',
    admissions,
    delivered,
    referred,
  });
  return {
    admissions24h: Array.from({ length: 24 }, (_, i) => i % 3),
    admissionsToday: 6,
    admissions7dAvg: 4.2,
    newByRisk24h: { high: 1, medium: 2, low: 0, total: 3 },
    currentShift: shift('เวรเช้า 08:00-16:00', 5, 2, 1),
    previousShift: shift('เวรดึก 00:00-08:00', 3, 1, 0),
    ...over,
  };
}

export function makeContinuum(over: Partial<DashboardContinuum> = {}): DashboardContinuum {
  return { anc: { total: 1169, hr3: 106, dueSoon: 172 }, referrals: { today: 2, last7d: 31 }, ...over };
}

export function makeStageKPIs(): DashboardStageKPIs {
  return {
    pregnancy: { total: 1169, low: 900, hr1: 100, hr2: 63, hr3: 106 },
    labor: { total: 10, low: 5, medium: 3, high: 2, admitted: 12, awaitingDelivery: 8, deliveredAdmitted: 4 },
    delivered: { total: 40, normal: 35, lowApgar: 3, lbw: 4 },
  };
}

export function makeHighRiskPatient(over: Partial<HighRiskPatient> = {}): HighRiskPatient {
  return {
    an: 'AN001',
    hn: 'HN001',
    name: 'สมศรี ใจดี',
    age: 28,
    gaWeeks: 38,
    cpdScore: 12,
    riskLevel: 'HIGH',
    hospital: 'รพ.น่าน',
    hcode: '10670',
    admitDate: new Date().toISOString(),
    deliveredAt: null,
    lastVitalAt: new Date().toISOString(),
    partographSeverity: null,
    partographAlertCount: null,
    maternalScreenLocalTier: null,
    maternalScreenEmergencyAcuity: null,
    maternalScreenIsComplete: null,
    maternalScreenAssessedAt: null,
    ...over,
  };
}
