// Patient-visibility scope — the one place that decides which hospitals' rows
// a signed-in user may read.
//
// Policy lives in src/config/visibility-scope.ts; this file applies it. Every
// route that returns patient data resolves the scope first and filters by it,
// so no route can widen the scope on its own.
//
// The scope has two shapes:
//   'ALL'    — every hospital's patients (centre hospital, สสจ., system)
//   'SCOPED' — the viewer's own hospital plus the hospitals below it in the
//              node tree. A patient of another hospital joins this set only
//              through a referral (added by the refer-in grant in
//              src/services/visibility-scope.ts).
import type { DatabaseAdapter } from '@/db/adapter';
import {
  ALL_SCOPE_HCODES,
  CENTER_HOSPITAL_LEVELS,
  parseVisibilityScope,
} from '@/config/visibility-scope';

export type ViewerScopeMode = 'ALL' | 'SCOPED';

export interface ViewerScope {
  mode: ViewerScopeMode;
  /** The viewer's hospital code, as the session carries it. */
  hcode: string | null;
  /** The viewer's own hospital row id — null for an account that is not a
   *  hospital (สสจ., system). */
  ownHospitalId: string | null;
  /** Hospital ids the viewer may read wholesale: own + node descendants. */
  allowedHospitalIds: string[];
}

interface HospitalScopeRow {
  id: string;
  level: string | null;
  visibility_scope: string | null;
}

interface NodePairRow {
  node_hospital_id: string;
  child_hospital_id: string;
}

/** Scope for an account that is not bound to a hospital row. */
function emptyScope(hcode: string | null): ViewerScope {
  return { mode: 'SCOPED', hcode, ownHospitalId: null, allowedHospitalIds: [] };
}

/**
 * Every hospital below `nodeHospitalId` in the node tree, transitively.
 *
 * The whole edge list is read at once (a province has a handful of nodes) and
 * walked breadth-first. A cycle in the table — an admin can create one — is
 * survivable: a hospital already visited is never entered twice, so the walk
 * terminates instead of looping.
 */
export async function collectNodeDescendants(
  db: DatabaseAdapter,
  nodeHospitalId: string,
): Promise<string[]> {
  const rows = await db.query<NodePairRow>(
    'SELECT node_hospital_id, child_hospital_id FROM hospital_nodes',
  );
  const childrenOf = new Map<string, string[]>();
  for (const row of rows) {
    const children = childrenOf.get(row.node_hospital_id) ?? [];
    children.push(row.child_hospital_id);
    childrenOf.set(row.node_hospital_id, children);
  }

  const visited = new Set<string>([nodeHospitalId]);
  const descendants: string[] = [];
  const queue: string[] = [nodeHospitalId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const child of childrenOf.get(current) ?? []) {
      if (visited.has(child)) continue;
      visited.add(child);
      descendants.push(child);
      queue.push(child);
    }
  }
  return descendants;
}

/**
 * The scope of the signed-in identity. Read on every request from the
 * database, never cached in the token: an admin changing a hospital's scope
 * takes effect on the next request, not at the next login.
 */
export async function resolveViewerScope(
  db: DatabaseAdapter,
  hcode: string | null | undefined,
): Promise<ViewerScope> {
  const code = (hcode ?? '').trim();
  if (!code) return emptyScope(null);

  // The province office and the system account administer the province, not a
  // hospital, so they read everything. Checked before the registry lookup:
  // these accounts may have no hospitals row at all.
  if (ALL_SCOPE_HCODES.includes(code)) {
    return { mode: 'ALL', hcode: code, ownHospitalId: null, allowedHospitalIds: [] };
  }

  const rows = await db.query<HospitalScopeRow>(
    'SELECT id, level, visibility_scope FROM hospitals WHERE hcode = ?',
    [code],
  );
  const hospital = rows[0];
  if (!hospital) return emptyScope(code);

  const seesEverything =
    parseVisibilityScope(hospital.visibility_scope) === 'ALL' ||
    (hospital.level !== null && CENTER_HOSPITAL_LEVELS.includes(hospital.level));
  if (seesEverything) {
    return {
      mode: 'ALL',
      hcode: code,
      ownHospitalId: hospital.id,
      allowedHospitalIds: [],
    };
  }

  const descendants = await collectNodeDescendants(db, hospital.id);
  return {
    mode: 'SCOPED',
    hcode: code,
    ownHospitalId: hospital.id,
    allowedHospitalIds: [hospital.id, ...descendants],
  };
}

/** True when the scope lets the viewer read this hospital's rows wholesale. */
export function scopeAllowsHospitalId(scope: ViewerScope, hospitalId: string): boolean {
  if (scope.mode === 'ALL') return true;
  return scope.allowedHospitalIds.includes(hospitalId);
}

/** A SQL predicate plus its bound parameters. */
export interface ScopeFilter {
  clause: string;
  params: string[];
}

/**
 * Restricts a patient table to the hospitals the viewer may read.
 *
 * Returns null when the viewer reads everything — the caller then adds no
 * condition at all. A scoped viewer with no hospital at all (an unknown
 * account) gets `1 = 0`: no rows, not all rows.
 */
export function hospitalScopeFilter(
  scope: ViewerScope,
  column: string,
): ScopeFilter | null {
  if (scope.mode === 'ALL') return null;
  if (scope.allowedHospitalIds.length === 0) return { clause: '1 = 0', params: [] };
  const placeholders = scope.allowedHospitalIds.map(() => '?').join(', ');
  return { clause: `${column} IN (${placeholders})`, params: [...scope.allowedHospitalIds] };
}

/**
 * Restricts journey rows to the viewer: a pregnancy is visible when it was
 * registered at one of the viewer's hospitals, or when the woman is currently
 * held by one of them (she was admitted elsewhere and moved).
 */
export function journeyScopeFilter(scope: ViewerScope, alias = 'mj'): ScopeFilter | null {
  if (scope.mode === 'ALL') return null;
  if (scope.allowedHospitalIds.length === 0) return { clause: '1 = 0', params: [] };
  const placeholders = scope.allowedHospitalIds.map(() => '?').join(', ');
  return {
    clause: `(${alias}.hospital_id IN (${placeholders}) OR ${alias}.current_hospital_id IN (${placeholders}))`,
    params: [...scope.allowedHospitalIds, ...scope.allowedHospitalIds],
  };
}

/**
 * Restricts referral rows to the ones where the viewer is a party: it sent
 * the referral, or it received it. A third hospital sees neither.
 */
export function referralScopeFilter(scope: ViewerScope, alias = 'cr'): ScopeFilter | null {
  if (scope.mode === 'ALL') return null;
  if (scope.allowedHospitalIds.length === 0) return { clause: '1 = 0', params: [] };
  const placeholders = scope.allowedHospitalIds.map(() => '?').join(', ');
  return {
    clause: `(${alias}.from_hospital_id IN (${placeholders}) OR ${alias}.to_hospital_id IN (${placeholders}))`,
    params: [...scope.allowedHospitalIds, ...scope.allowedHospitalIds],
  };
}

/**
 * Cache-key suffix for a scoped payload. Two viewers with different scopes
 * must never share a cache entry, so the key carries the scope, not the route.
 */
export function scopeCacheSuffix(scope: ViewerScope): string {
  if (scope.mode === 'ALL') return 'all';
  return scope.allowedHospitalIds.slice().sort().join('-') || 'none';
}

/**
 * True when the scope lets the viewer read the rows of `hcode`. Used by the
 * routes that take a hospital code in the URL — an unknown code is never
 * visible, so a guessed code cannot be used to read another hospital.
 */
export async function scopeAllowsHcode(
  db: DatabaseAdapter,
  scope: ViewerScope,
  hcode: string,
): Promise<boolean> {
  if (scope.mode === 'ALL') return true;
  const rows = await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode = ?', [
    hcode,
  ]);
  const hospital = rows[0];
  if (!hospital) return false;
  return scope.allowedHospitalIds.includes(hospital.id);
}
