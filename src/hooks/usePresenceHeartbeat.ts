// src/hooks/usePresenceHeartbeat.ts
'use client';
import { useEffect } from 'react';

const HEARTBEAT_MS = 30_000;

export function usePresenceHeartbeat(pathname: string, userId: string | undefined): void {
  useEffect(() => {
    if (!userId) return;
    const sendHeartbeat = () => {
      if (document.visibilityState === 'hidden') return;
      fetch('/api/presence/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathname || '/' }),
        keepalive: true,
      }).catch(() => {
        // Presence is best-effort and should not interrupt clinical workflows.
      });
    };
    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, HEARTBEAT_MS);
    window.addEventListener('focus', sendHeartbeat);
    document.addEventListener('visibilitychange', sendHeartbeat);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', sendHeartbeat);
      document.removeEventListener('visibilitychange', sendHeartbeat);
    };
  }, [pathname, userId]);
}
