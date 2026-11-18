// Patient-visibility scope — the policy that decides whose patient rows a
// signed-in hospital may read.
//
// Three shapes are covered here: the narrow default (own hospital only), the
// centre hospital / admin flag (everything), and the node tree (own plus the
// hospitals below it, transitively).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import {
  resolveViewerScope,
  scopeAllowsHospitalId,
  scopeAllowsHcode,
  collectNodeDescendants,
} from '@/services/visibility-scope';

const NODE_ID = 'hosp-node';
const NODE_HCODE = '10001';
const CHILD_ID = 'hosp-child';
const CHILD_HCODE = '10002';
const GRANDCHILD_ID = 'hosp-grandchild';
const GRANDCHILD_HCODE = '10003';
const CENTRE_ID = 'hosp-centre';
const CENTRE_HCODE = '10004';
const OTHER_ID = 'hosp-other';
const OTHER_HCODE = '10005';

let db: DatabaseAdapter;

async function insertHospital(
  id: string,
  hcode: string,
  options: { level?: string; visibilityScope?: string | null } = {},
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO hospitals (id, hcode, name, level, visibility_scope, is_active, connection_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, true, 'ONLINE', ?, ?)`,
    [
      id,
      hcode,
      `รพ.${hcode}`,
      options.level ?? 'F2',
      options.visibilityScope ?? null,
      now,
      now,
    ],
  );
}

async function linkNode(nodeId: string, childId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO hospital_nodes (id, node_hospital_id, child_hospital_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [`link-${nodeId}-${childId}`, nodeId, childId, now, now],
  );
}

beforeEach(async () => {
  db = await createTestDb();
  await insertHospital(NODE_ID, NODE_HCODE);
  await insertHospital(CHILD_ID, CHILD_HCODE);
  await insertHospital(GRANDCHILD_ID, GRANDCHILD_HCODE);
  await insertHospital(CENTRE_ID, CENTRE_HCODE, { level: 'P' });
  await insertHospital(OTHER_ID, OTHER_HCODE);
});

afterEach(async () => {
  await db.close?.();
});

describe('resolveViewerScope', () => {
  it('scopes a community hospital to its own hospital', async () => {
    const scope = await resolveViewerScope(db, NODE_HCODE);
    expect(scope.mode).toBe('SCOPED');
    expect(scope.ownHospitalId).toBe(NODE_ID);
    expect(scope.allowedHospitalIds).toEqual([NODE_ID]);
  });

  it('scopes a hospital with the OWN flag to its own hospital', async () => {
    await db.execute('UPDATE hospitals SET visibility_scope = ? WHERE id = ?', ['OWN', NODE_ID]);
    const scope = await resolveViewerScope(db, NODE_HCODE);
    expect(scope.mode).toBe('SCOPED');
    expect(scope.allowedHospitalIds).toEqual([NODE_ID]);
  });

  it('lets a centre hospital see every hospital', async () => {
    const scope = await resolveViewerScope(db, CENTRE_HCODE);
    expect(scope.mode).toBe('ALL');
    expect(scope.ownHospitalId).toBe(CENTRE_ID);
  });

  it('lets a hospital with the ALL flag see every hospital', async () => {
    await db.execute('UPDATE hospitals SET visibility_scope = ? WHERE id = ?', ['ALL', NODE_ID]);
    const scope = await resolveViewerScope(db, NODE_HCODE);
    expect(scope.mode).toBe('ALL');
  });

  it('lets the provincial office see every hospital even without a hospital row', async () => {
    const scope = await resolveViewerScope(db, '00042');
    expect(scope.mode).toBe('ALL');
  });

  it('denies an unregistered hospital every row', async () => {
    const scope = await resolveViewerScope(db, '99999');
    expect(scope.mode).toBe('SCOPED');
    expect(scope.allowedHospitalIds).toEqual([]);
  });

  it('denies a missing hospital code every row', async () => {
    const scope = await resolveViewerScope(db, null);
    expect(scope.mode).toBe('SCOPED');
    expect(scope.allowedHospitalIds).toEqual([]);
  });

  it('adds the hospitals below the node hospital, transitively', async () => {
    await linkNode(NODE_ID, CHILD_ID);
    await linkNode(CHILD_ID, GRANDCHILD_ID);
    const scope = await resolveViewerScope(db, NODE_HCODE);
    expect(scope.allowedHospitalIds).toEqual([NODE_ID, CHILD_ID, GRANDCHILD_ID]);
  });

  it('survives a cycle in the node tree', async () => {
    await linkNode(NODE_ID, CHILD_ID);
    await linkNode(CHILD_ID, NODE_ID);
    const descendants = await collectNodeDescendants(db, NODE_ID);
    expect(descendants).toEqual([CHILD_ID]);
  });
});

describe('scope checks', () => {
  it('lets the owner read its own hospital and refuses another one', async () => {
    const scope = await resolveViewerScope(db, NODE_HCODE);
    expect(scopeAllowsHospitalId(scope, NODE_ID)).toBe(true);
    expect(scopeAllowsHospitalId(scope, OTHER_ID)).toBe(false);
    expect(await scopeAllowsHcode(db, scope, NODE_HCODE)).toBe(true);
    expect(await scopeAllowsHcode(db, scope, OTHER_HCODE)).toBe(false);
  });

  it('lets a node hospital read a hospital below it', async () => {
    await linkNode(NODE_ID, CHILD_ID);
    const scope = await resolveViewerScope(db, NODE_HCODE);
    expect(await scopeAllowsHcode(db, scope, CHILD_HCODE)).toBe(true);
  });

  it('refuses an unknown hospital code', async () => {
    const scope = await resolveViewerScope(db, NODE_HCODE);
    expect(await scopeAllowsHcode(db, scope, '99999')).toBe(false);
  });

  it('lets an all-scope viewer read any hospital', async () => {
    const scope = await resolveViewerScope(db, CENTRE_HCODE);
    expect(scopeAllowsHospitalId(scope, OTHER_ID)).toBe(true);
    expect(await scopeAllowsHcode(db, scope, OTHER_HCODE)).toBe(true);
  });
});
