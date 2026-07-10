// POST /api/calls/[id]/decline — callee rejects a ringing call.
import { declineCall } from '@/services/video-call';
import { callTransitionRoute } from '@/lib/video-call-http';

export const POST = callTransitionRoute(declineCall, 'video_call_decline_failed');
