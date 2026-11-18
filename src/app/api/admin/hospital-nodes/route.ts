// GET/POST /api/admin/hospital-nodes
//
// The node-hospital tree: "node_hospital_id supervises child_hospital_id".
// A node hospital may read the patients of every hospital below it in the
// tree, without needing a referral. Admin-gated via requireAdmin.
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { requireAdmin } from '@/lib/admin-guard';
import { logger } from '@/lib/logger';

interface NodePairRow {
  id: string;
  node_hospital_id: string;
  child_hospital_id: string;
  node_hcode: string;
  node_name: string;
  child_hcode: string;
  child_name: string;
  created_at: string;
}

interface NodePayload {
  nodeHcode?: string;
  childHcode?: string;
}

function normalizePayload(body: NodePayload) {
  const nodeHcode = body.nodeHcode?.trim() ?? '';
  const childHcode = body.childHcode?.trim() ?? '';
  if (!/^\d{5}$/.test(nodeHcode)) {
    return { error: 'nodeHcode must be a 5-digit MOPH code' };
  }
  if (!/^\d{5}$/.test(childHcode)) {
    return { error: 'childHcode must be a 5-digit MOPH code' };
  }
  if (nodeHcode === childHcode) {
    return { error: 'a hospital cannot supervise itself' };
  }
  return { value: { nodeHcode, childHcode } };
}

export async function GET(_request: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (guard instanceof NextResponse) return guard;

    await ensureInit();
    const db = await getDatabase();
    const rows = await db.query<NodePairRow>(
      `SELECT hn.id, hn.node_hospital_id, hn.child_hospital_id,
              nh.hcode AS node_hcode, nh.name AS node_name,
              ch.hcode AS child_hcode, ch.name AS child_name,
              hn.created_at
         FROM hospital_nodes hn
         JOIN hospitals nh ON nh.id = hn.node_hospital_id
         JOIN hospitals ch ON ch.id = hn.child_hospital_id
        ORDER BY nh.name, ch.name`,
      [],
    );

    return NextResponse.json({
      nodePairs: rows.map((row) => ({
        id: row.id,
        nodeHcode: row.node_hcode,
        nodeName: row.node_name,
        childHcode: row.child_hcode,
        childName: row.child_name,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    logger.error('admin_hospital_nodes_list_failed', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (guard instanceof NextResponse) return guard;

    await ensureInit();
    const normalized = normalizePayload((await request.json()) as NodePayload);
    if ('error' in normalized) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const db = await getDatabase();
    const hospitals = await db.query<{ id: string; hcode: string; name: string }>(
      'SELECT id, hcode, name FROM hospitals WHERE hcode IN (?, ?)',
      [normalized.value.nodeHcode, normalized.value.childHcode],
    );
    const node = hospitals.find((h) => h.hcode === normalized.value.nodeHcode);
    const child = hospitals.find((h) => h.hcode === normalized.value.childHcode);
    if (!node || !child) {
      return NextResponse.json(
        { error: 'both hospitals must be registered before linking them' },
        { status: 404 },
      );
    }

    const duplicate = await db.query<{ id: string }>(
      'SELECT id FROM hospital_nodes WHERE node_hospital_id = ? AND child_hospital_id = ?',
      [node.id, child.id],
    );
    if (duplicate.length > 0) {
      return NextResponse.json(
        { error: 'this hospital already supervises that hospital' },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const id = uuidv4();
    await db.execute(
      `INSERT INTO hospital_nodes (id, node_hospital_id, child_hospital_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, node.id, child.id, now, now],
    );

    return NextResponse.json(
      {
        nodePair: {
          id,
          nodeHcode: node.hcode,
          nodeName: node.name,
          childHcode: child.hcode,
          childName: child.name,
          createdAt: now,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error('admin_hospital_nodes_create_failed', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
