// DELETE /api/admin/hospital-nodes/[id] — unlink a node hospital from a
// hospital it supervises. The link only widens what a hospital may read, so
// removing it takes effect on the next request.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { requireAdmin } from '@/lib/admin-guard';
import { logger } from '@/lib/logger';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const guard = await requireAdmin();
    if (guard instanceof NextResponse) return guard;

    await ensureInit();
    const { id } = await params;
    const db = await getDatabase();

    const existing = await db.query<{ id: string }>(
      'SELECT id FROM hospital_nodes WHERE id = ?',
      [id],
    );
    if (existing.length === 0) {
      return NextResponse.json({ error: 'node pair not found' }, { status: 404 });
    }

    await db.execute('DELETE FROM hospital_nodes WHERE id = ?', [id]);
    return NextResponse.json({ id, deleted: true });
  } catch (error) {
    logger.error('admin_hospital_nodes_delete_failed', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
