// POST /api/calls/[id]/end — either participant hangs up an accepted call.
import { endCall } from '@/services/video-call';
import { callTransitionRoute } from '@/lib/video-call-http';

export const POST = callTransitionRoute(endCall, 'video_call_end_failed');
