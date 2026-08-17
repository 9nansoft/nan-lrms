// useMapShare — persisted map/list split for the Province overview column.
// The stored share is read through useSyncExternalStore, so the persisted
// value applies right after hydration without a mount effect (which
// react-hooks/set-state-in-effect forbids) and SSR never sees localStorage.
'use client';

import { useCallback, useRef, useState, useSyncExternalStore } from 'react';

export const MAP_SHARE_STORAGE_KEY = 'dashboard.overview-map-share-pct';
export const MAP_SHARE_MIN = 15;
export const MAP_SHARE_MAX = 85;
export const MAP_SHARE_DEFAULT = 40;

// The `storage` event only fires in *other* tabs; this custom event covers
// same-tab writes so every mounted hook stays in sync.
const SHARE_CHANGE_EVENT = 'nn-lrms:map-share-change';

function sanitizeShare(raw: number): number {
  return Math.min(MAP_SHARE_MAX, Math.max(MAP_SHARE_MIN, raw));
}

function readStoredShare(): number {
  const raw = window.localStorage.getItem(MAP_SHARE_STORAGE_KEY);
  const n = raw === null ? Number.NaN : Number(raw);
  if (!Number.isFinite(n)) return MAP_SHARE_DEFAULT;
  return sanitizeShare(n);
}

function writeStoredShare(share: number): void {
  try {
    window.localStorage.setItem(MAP_SHARE_STORAGE_KEY, String(Math.round(share)));
    window.dispatchEvent(new Event(SHARE_CHANGE_EVENT));
  } catch {
    // localStorage unavailable (private mode / quota) — keep this session's value only
  }
}

function subscribeShare(onStoreChange: () => void): () => void {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(SHARE_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(SHARE_CHANGE_EVENT, onStoreChange);
  };
}

export interface MapShareApi {
  /** Current split %, clamped to [MAP_SHARE_MIN, MAP_SHARE_MAX]. */
  mapShare: number;
  /** Follow the pointer during a drag without writing localStorage. */
  previewMapShare: (share: number) => void;
  /** Persist the previewed split (rounded) — call on drag release. */
  saveMapShare: () => void;
  /** Update and persist in one step — keyboard nudges. */
  commitMapShare: (share: number) => void;
}

export function useMapShare(): MapShareApi {
  // In-flight drag value; null = fall back to the persisted share.
  const [preview, setPreview] = useState<number | null>(null);
  const previewRef = useRef<number | null>(null);
  const storedShare = useSyncExternalStore(
    subscribeShare,
    readStoredShare,
    () => MAP_SHARE_DEFAULT,
  );
  const mapShare = preview ?? storedShare;

  const previewMapShare = useCallback((share: number) => {
    previewRef.current = sanitizeShare(share);
    setPreview(previewRef.current);
  }, []);

  const saveMapShare = useCallback(() => {
    if (previewRef.current !== null) writeStoredShare(previewRef.current);
  }, []);

  const commitMapShare = useCallback(
    (share: number) => {
      previewMapShare(share);
      writeStoredShare(share);
    },
    [previewMapShare],
  );

  return { mapShare, previewMapShare, saveMapShare, commitMapShare };
}
