// src/services/hospital-roster.ts
// Pure roster logic for /hospitals (UI sub-project 4). The input is the
// /api/dashboard hospital list — complete and unpaginated — so every sum here
// is a sum of per-hospital server aggregates (count-provenance rule).
// Client-safe: config imports only.
import { HOSPITAL_LEVELS, NAN_HOSPITALS } from '@/config/hospitals';
import {
  classifyPartographCoverage,
  classifySyncHealth,
  combinedWorkload,
  type PartographCoverageClass,
  type SyncHealthClass,
} from '@/config/hospital-network';
import { HospitalLevel } from '@/types/domain';
import type { DashboardHospital } from '@/types/api';

const NAN_HCODES = new Set(NAN_HOSPITALS.map((h) => h.hcode));

export type RosterArea = 'nan' | 'other';

export function rosterArea(h: Pick<DashboardHospital, 'hcode'>): RosterArea {
  return NAN_HCODES.has(h.hcode) ? 'nan' : 'other';
}

/** Name or hcode contains the term (case-insensitive). Blank → same array. */
export function searchRoster(hospitals: DashboardHospital[], term: string): DashboardHospital[] {
  const q = term.trim().toLowerCase();
  if (!q) return hospitals;
  return hospitals.filter((h) => h.name.toLowerCase().includes(q) || h.hcode.toLowerCase().includes(q));
}

export interface RosterSummary {
  hospitals: number;
  withWorkload: number;
  sync: Record<SyncHealthClass, number>;
  /** stale + critical + never + blocked */
  syncAttention: number;
  anc: number;
  ancHr3: number;
  labor: { total: number; low: number; medium: number; high: number };
  parto: { recent: number; charted: number; cls: PartographCoverageClass; pct: number | null; below: number };
}

export function summarizeRoster(hospitals: DashboardHospital[], now: Date = new Date()): RosterSummary {
  const sync: Record<SyncHealthClass, number> = { ok: 0, stale: 0, critical: 0, never: 0, blocked: 0 };
  const labor = { total: 0, low: 0, medium: 0, high: 0 };
  let anc = 0;
  let ancHr3 = 0;
  let recent = 0;
  let charted = 0;
  let below = 0;
  let withWorkload = 0;
  for (const h of hospitals) {
    sync[classifySyncHealth(h.syncStatus, h.lastSyncAt, now)] += 1;
    labor.total += h.counts.total;
    labor.low += h.counts.low;
    labor.medium += h.counts.medium;
    labor.high += h.counts.high;
    anc += h.ancCounts.total;
    ancHr3 += h.ancCounts.hr3;
    recent += h.partographQuality.laborRecent;
    charted += h.partographQuality.withPartograph;
    const cls = classifyPartographCoverage(h.partographQuality.laborRecent, h.partographQuality.withPartograph);
    if (cls === 'warn' || cls === 'critical') below += 1;
    if (combinedWorkload(h.counts, h.ancCounts) > 0) withWorkload += 1;
  }
  return {
    hospitals: hospitals.length,
    withWorkload,
    sync,
    syncAttention: sync.stale + sync.critical + sync.never + sync.blocked,
    anc,
    ancHr3,
    labor,
    parto: {
      recent,
      charted,
      cls: classifyPartographCoverage(recent, charted),
      pct: recent > 0 ? Math.round((charted / recent) * 100) : null,
      below,
    },
  };
}

export interface RosterGroup {
  level: HospitalLevel;
  nameTh: string;
  hospitals: DashboardHospital[];
  stats: { anc: number; labor: number; high: number };
}

/** Level groups in HOSPITAL_LEVELS sort order, busiest first inside each
 *  (combined labour + weighted-ANC workload). A level missing from
 *  HOSPITAL_LEVELS falls into M2, as before. Empty groups are dropped. */
export function groupRosterByLevel(hospitals: DashboardHospital[]): RosterGroup[] {
  const order = Object.values(HOSPITAL_LEVELS).sort((a, b) => a.sortOrder - b.sortOrder);
  const buckets = new Map<HospitalLevel, DashboardHospital[]>(order.map((c) => [c.level, []]));
  for (const h of hospitals) (buckets.get(h.level) ?? buckets.get(HospitalLevel.M2))?.push(h);
  const groups: RosterGroup[] = [];
  for (const cfg of order) {
    const list = buckets.get(cfg.level) ?? [];
    if (list.length === 0) continue;
    const sorted = [...list].sort(
      (a, b) => combinedWorkload(b.counts, b.ancCounts) - combinedWorkload(a.counts, a.ancCounts),
    );
    const stats = { anc: 0, labor: 0, high: 0 };
    for (const h of sorted) {
      stats.anc += h.ancCounts.total;
      stats.labor += h.counts.total;
      stats.high += h.counts.high;
    }
    groups.push({ level: cfg.level, nameTh: cfg.nameTh, hospitals: sorted, stats });
  }
  return groups;
}
