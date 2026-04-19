// Task 17: POST /api/hospital/audit-log — fire-and-forget audit sink
// Browser-side service layer (Tasks 41+) calls this after every BMS write.
// Contract: validate hcode matches the session, insert the row, never block.
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/db/connection';

interface AuditLogBody {
  entity?: string;
  op?: string;
  resourceId?: string;
  fieldsTouched?: string[];
  hcode?: string;
  staff?: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as AuditLogBody | null;

  if (!body || !body.entity || !body.op || !body.hcode) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  if (body.hcode !== session.user.hospitalCode) {
    return NextResponse.json({ error: 'hcode mismatch' }, { status: 403 });
  }

  // Fire-and-forget contract: never block the caller, never throw.
  try {
    const db = await getDatabase();
    await db.execute(
      'INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        uuidv4(),
        session.user.id,
        `bms.${body.entity}.${body.op}`,
        body.entity,
        body.resourceId ?? null,
        JSON.stringify({
          fieldsTouched: body.fieldsTouched,
          hcode: body.hcode,
          staff: body.staff,
        }),
        new Date().toISOString(),
      ],
    );
  } catch {
    // swallow — caller does not retry
  }
  return NextResponse.json({ ok: true });
}
