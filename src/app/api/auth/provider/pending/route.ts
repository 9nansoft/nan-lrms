import { NextResponse, type NextRequest } from 'next/server';
import { getProviderPendingSummary } from '@/lib/provider-id-session-store';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) {
    logger.warn('provider_id_pending_lookup', { found: false, reason: 'token_missing' });
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }

  const summary = getProviderPendingSummary(token);
  if (!summary) {
    logger.warn('provider_id_pending_lookup', { found: false, reason: 'session_not_found' });
    return NextResponse.json({ error: 'session not found or expired' }, { status: 404 });
  }

  logger.info('provider_id_pending_lookup', {
    flowId: summary.flowId,
    found: true,
    providerId: summary.user.providerId,
    orgCount: summary.organizations.length,
  });

  return NextResponse.json(summary);
}
