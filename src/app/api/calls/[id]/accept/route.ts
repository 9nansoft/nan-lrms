// POST /api/calls/[id]/accept — callee answers; returns { roomId } so the
// accepting tab can join the Jitsi room.
import { acceptCall } from '@/services/video-call';
import { callTransitionRoute } from '@/lib/video-call-http';

export const POST = callTransitionRoute(acceptCall, 'video_call_accept_failed');
