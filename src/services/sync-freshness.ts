// Province + own-hospital data freshness for the app-wide status strip.
// Staleness uses classifySyncHealth (same policy as /api/health and
// FreshnessBadge); the high-risk number reuses countActiveLaborByRisk (same
// aggregate as the dashboard). Pseudo-hospitals (NON_REPORTING_HCODES) never
// sync and are excluded. The sync verdict comes from deriveSyncStatus (same as
// the dashboard), so BLOCKED / not-onboarded hospitals are never counted fresh;
// BLOCKED is counted under `stale` (own.health still reports 'blocked'). Returns counts only — no per-hospital list — so a
// hospital session learns nothing it can't already see on the dashboard.
import type { DatabaseAdapter } from '@/db/adapter';
import { classifySyncHealth, isNonReportingHcode } from '@/config/hospital-network';
import { countActiveLaborByRisk, deriveSyncStatus } from '@/services/dashboard';
import type { FreshnessSummary } from '@/types/sync-freshness';

interface HospitalSyncRow {
  hcode: string;
  name: string;
  last_sync_at: string | Date | null;
  has_bms_config: number | boolean | null;
  last_authenticity_status: string | null;
  data_purged_at: string | Date | null;
}

function toIso(v: string | Date | null): string | null {
  if (v === null) return null;
  return v instanceof Date ? v.toISOString() : v;
}

type FeedClass = 'fresh' | 'stale' | 'never';

/** One classification per hospital, shared by province counts and `own`,
 *  so the strip agrees with /api/health. Future-dated → stale; missing or
 *  unparseable → never; otherwise classifySyncHealth. */
function classifyFeed(
  iso: string | null,
  syncStatus: string,
  now: Date,
): { kind: FeedClass; health: ReturnType<typeof classifySyncHealth>; t: number | null } {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (syncStatus === 'BLOCKED') return { kind: 'stale', health: 'blocked', t: null };
  if (!Number.isFinite(t)) return { kind: 'never', health: 'never', t: null };
  if (t > now.getTime()) return { kind: 'stale', health: 'stale', t: null };
  const health = classifySyncHealth(syncStatus, iso, now);
  return { kind: health === 'ok' ? 'fresh' : 'stale', health, t };
}

export async function getSyncFreshness(
  db: DatabaseAdapter,
  opts: { hcode: string | null | undefined; now?: Date },
): Promise<FreshnessSummary> {
  const now = opts.now ?? new Date();
  const hospitals = await db.query<HospitalSyncRow>(
    `SELECT h.hcode, h.name, h.last_sync_at,
            CASE WHEN hbc.id IS NULL THEN false ELSE true END AS has_bms_config,
            hbc.last_authenticity_status, hbc.data_purged_at
     FROM hospitals h
     LEFT JOIN hospital_bms_config hbc ON hbc.hospital_id = h.id
     WHERE h.is_active = true`,
  );
  const reporting = hospitals.filter((h) => !isNonReportingHcode(h.hcode));

  const highByHcode = new Map<string, number>();
  for (const r of await countActiveLaborByRisk(db)) {
    if (r.risk_level === 'HIGH')
      highByHcode.set(r.hcode, (highByHcode.get(r.hcode) ?? 0) + r.count);
  }

  let fresh = 0;
  let stale = 0;
  let never = 0;
  let latest: number | null = null;
  for (const h of reporting) {
    const c = classifyFeed(toIso(h.last_sync_at), deriveSyncStatus(h).syncStatus, now);
    if (c.kind === 'never') never += 1;
    else if (c.kind === 'fresh') fresh += 1;
    else stale += 1;
    if (c.t !== null && (latest === null || c.t > latest)) latest = c.t;
  }

  let own: FreshnessSummary['own'] = null;
  if (opts.hcode && !isNonReportingHcode(opts.hcode)) {
    const h = reporting.find((x) => x.hcode === opts.hcode);
    if (h) {
      const iso = toIso(h.last_sync_at);
      own = {
        hcode: h.hcode,
        name: h.name,
        lastSyncAt: iso,
        health: classifyFeed(iso, deriveSyncStatus(h).syncStatus, now).health,
        highRisk: highByHcode.get(h.hcode) ?? 0,
      };
    }
  }

  return {
    generatedAt: now.toISOString(),
    province: {
      reporting: reporting.length,
      fresh,
      stale,
      never,
      highRisk: reporting.reduce((sum, h) => sum + (highByHcode.get(h.hcode) ?? 0), 0),
      lastSyncAt: latest === null ? null : new Date(latest).toISOString(),
    },
    own,
  };
}
