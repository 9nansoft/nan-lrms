// Shared guard for /api/dev/simulate/* routes. Returns null if allowed,
// otherwise a NextResponse that callers should return directly.
import { NextResponse } from 'next/server';

export function simulationGuard(): NextResponse | null {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return null;
}
