// Ensure app is initialized before handling API requests
// Idempotent — safe to call multiple times (no-op after first init)
import { initializeApp } from '@/app/api/startup';

// HMR- and bundle-safe. Same reasoning as src/db/connection.ts: without this,
// different route bundles can hold separate `initPromise`s and each will
// re-run the full init (schema sync + seeders + polling) against what ends
// up being a separate DB adapter.
interface InitSingleton {
  promise: Promise<void> | null;
}
const _global = global as unknown as { __initSingleton?: InitSingleton };
const _singleton: InitSingleton = _global.__initSingleton ?? { promise: null };
if (!_global.__initSingleton) _global.__initSingleton = _singleton;

export function ensureInit(): Promise<void> {
  if (!_singleton.promise) {
    _singleton.promise = initializeApp().catch((err) => {
      _singleton.promise = null; // Allow retry on failure
      throw err;
    });
  }
  return _singleton.promise;
}
