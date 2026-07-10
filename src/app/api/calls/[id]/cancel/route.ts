// POST /api/calls/[id]/cancel — caller withdraws a ringing call.
import { cancelCall } from '@/services/video-call';
import { callTransitionRoute } from '@/lib/video-call-http';

export const POST = callTransitionRoute(cancelCall, 'video_call_cancel_failed');
