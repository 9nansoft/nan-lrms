// The node-hospital admin API: a hospital supervises another one, and the
// link is what lets the node read that hospital's patients.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@/db/adapter';
import { UserRole } from '@/types/domain';

let db: DatabaseAdapter;
let mockSessionUser: Record<string, unknown> | null = null;

vi.mock('@/db/connection', () => ({ getDatabase: async () => db }));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));
vi.mock('@/lib/auth', () => ({
  auth: async () => (mockSessionUser ? { user: mockSessionUser } : null),
}));

import { GET as listGET, POST as createPOST } from '@/app/api/admin/hospital-nodes/route';
import { DELETE as itemDELETE } from '@/app/api/admin/hospital-nodes/[id]/route';

const ADMIN = {
  id: 'u-admin',
  name: 'แอดมิน',
  userCid: '1100500090006',
  role: UserRole.ADMIN,
  hospitalCode: '10670',
  hospitalName: 'รพ.ขอนแก่น',
  accessMode: 'readwrite' as const,
  authProvider: 'bms' as const,
  tunnelUrl: '',
  databaseType: '',
};

const NODE_ID = 'hosp-node';
const CHILD_ID = 'hosp-child';

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/hospital-nodes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** The query stub answers the two shapes the route asks for: the hospital
 *  lookup (by hcode) and the duplicate check. */
function stubDb(options: { hospitals?: unknown[]; duplicate?: unknown[] } = {}) {
  const hospitals = options.hospitals ?? [
    { id: NODE_ID, hcode: '10670', name: 'รพ.ขอนแก่น' },
    { id: CHILD_ID, hcode: '11004', name: 'รพ.พล' },
  ];
  const duplicate = options.duplicate ?? [];
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM hospital_nodes WHERE node_hospital_id')) return duplicate;
    if (sql.includes('FROM hospitals WHERE hcode IN')) return hospitals;
    return [];
  });
  const execute = vi.fn(async () => undefined);
  return { query, execute };
}

describe('node-hospital admin API', () => {
  beforeEach(() => {
    mockSessionUser = ADMIN;
  });
  afterEach(() => vi.restoreAllMocks());

  it('lists the node pairs with both hospital names', async () => {
    const stub = stubDb();
    db = {
      query: vi.fn(async (sql: string) =>
        sql.includes('FROM hospital_nodes hn')
          ? [
              {
                id: 'pair-1',
                node_hospital_id: NODE_ID,
                child_hospital_id: CHILD_ID,
                node_hcode: '10670',
                node_name: 'รพ.ขอนแก่น',
                child_hcode: '11004',
                child_name: 'รพ.พล',
                created_at: '2026-01-01T00:00:00.000Z',
              },
            ]
          : [],
      ),
      execute: stub.execute,
    } as unknown as DatabaseAdapter;

    const res = await listGET(new NextRequest('http://test/api/admin/hospital-nodes'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nodePairs).toHaveLength(1);
    expect(body.nodePairs[0]).toMatchObject({
      nodeHcode: '10670',
      childHcode: '11004',
      childName: 'รพ.พล',
    });
  });

  it('refuses a code that is not a 5-digit hospital code', async () => {
    const stub = stubDb();
    db = { query: stub.query, execute: stub.execute } as unknown as DatabaseAdapter;
    const res = await createPOST(jsonRequest({ nodeHcode: 'abc', childHcode: '11004' }));
    expect(res.status).toBe(400);
  });

  it('refuses a hospital that supervises itself', async () => {
    const stub = stubDb();
    db = { query: stub.query, execute: stub.execute } as unknown as DatabaseAdapter;
    const res = await createPOST(jsonRequest({ nodeHcode: '11004', childHcode: '11004' }));
    expect(res.status).toBe(400);
  });

  it('refuses a link to a hospital that is not registered', async () => {
    const stub = stubDb({ hospitals: [{ id: NODE_ID, hcode: '10670', name: 'รพ.ขอนแก่น' }] });
    db = { query: stub.query, execute: stub.execute } as unknown as DatabaseAdapter;
    const res = await createPOST(jsonRequest({ nodeHcode: '10670', childHcode: '11004' }));
    expect(res.status).toBe(404);
  });

  it('refuses a duplicate link', async () => {
    const stub = stubDb({ duplicate: [{ id: 'pair-1' }] });
    db = { query: stub.query, execute: stub.execute } as unknown as DatabaseAdapter;
    const res = await createPOST(jsonRequest({ nodeHcode: '10670', childHcode: '11004' }));
    expect(res.status).toBe(409);
  });

  it('creates the link', async () => {
    const stub = stubDb();
    db = { query: stub.query, execute: stub.execute } as unknown as DatabaseAdapter;
    const res = await createPOST(jsonRequest({ nodeHcode: '10670', childHcode: '11004' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.nodePair).toMatchObject({ nodeHcode: '10670', childHcode: '11004' });
    expect(stub.execute).toHaveBeenCalled();
  });

  it('deletes the link', async () => {
    const execute = vi.fn(async () => undefined);
    db = {
      query: vi.fn(async (sql: string) =>
        sql.includes('FROM hospital_nodes WHERE id') ? [{ id: 'pair-1' }] : [],
      ),
      execute,
    } as unknown as DatabaseAdapter;

    const res = await itemDELETE(
      new NextRequest('http://test/api/admin/hospital-nodes/pair-1'),
      { params: Promise.resolve({ id: 'pair-1' }) },
    );
    expect(res.status).toBe(200);
    expect(execute).toHaveBeenCalled();
  });
});
