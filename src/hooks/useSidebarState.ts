'use client';
import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'nn-lrms:sidebar-collapsed';

// In-memory fallback, only populated when storage writes fail (private mode),
// so the toggle still works for the life of the page.
let memoryOverride: boolean | null = null;
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false; // blocked storage: default expanded
  }
}

function getSnapshot(): boolean {
  return memoryOverride ?? read();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function write(collapsed: boolean): void {
  try {
    window.localStorage.setItem(KEY, collapsed ? '1' : '0');
    memoryOverride = null;
  } catch {
    // Per-browser convenience only — never block the UI on storage.
    memoryOverride = collapsed;
  }
  listeners.forEach((l) => l());
}

/** Test-only: clears the module-level in-memory fallback so one test's
 *  blocked-storage toggle cannot leak into the next. */
export function __resetSidebarStateForTests(): void {
  memoryOverride = null;
}

export function useSidebarState(): { collapsed: boolean; toggle: () => void } {
  // Server snapshot is always expanded, so hydration matches; the saved state
  // applies right after hydration.
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, () => false);
  const toggle = useCallback(() => write(!getSnapshot()), []);
  return { collapsed, toggle };
}
