'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  extractConnectionConfig,
  extractUserInfo,
  retrieveBmsSession,
} from '@/lib/bms-browser-client';
import {
  getSessionFromUrl,
  handleUrlMarketplaceToken,
  handleUrlSession,
  removeMarketplaceToken,
  removeSessionCookie,
} from '@/utils/bms-session-storage';
import type { ConnectionConfig, UserInfo } from '@/types/bms-browser';

export interface BmsSessionContextValue {
  config: ConnectionConfig | null;
  userInfo: UserInfo | null;
  /** True when both config and userInfo are loaded */
  isReady: boolean;
  error: string | null;
  refresh: (sessionId: string) => Promise<void>;
  /** Wipes cookie + state; caller is responsible for redirecting */
  clear: () => void;
}

const BmsSessionContext = createContext<BmsSessionContextValue | null>(null);

export function useBmsSession(): BmsSessionContextValue {
  const ctx = useContext(BmsSessionContext);
  if (!ctx) {
    throw new Error('useBmsSession must be called inside <BmsSessionProvider>');
  }
  return ctx;
}

export function BmsSessionProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ConnectionConfig | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastSessionRef = useRef<string | null>(null);

  const refresh = useCallback(async (sessionId: string) => {
    setError(null);
    try {
      const response = await retrieveBmsSession(sessionId);
      const cfg = extractConnectionConfig(response);
      const ui = extractUserInfo(response);
      setConfig(cfg);
      setUserInfo(ui);
      lastSessionRef.current = sessionId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setConfig(null);
      setUserInfo(null);
    }
  }, []);

  const clear = useCallback(() => {
    setConfig(null);
    setUserInfo(null);
    setError(null);
    removeSessionCookie();
    removeMarketplaceToken();
    lastSessionRef.current = null;
  }, []);

  // Bootstrap on mount: read URL session ID, persist to cookie, hydrate context.
  useEffect(() => {
    // Marketplace token pairing: if a NEW session arrives via URL without a
    // paired marketplace_token, drop the stale token. This matches the
    // hosxp-telemed pattern — a fresh session ID without an accompanying
    // marketplace_token means any previously-stored token is stale.
    const urlSessionId = getSessionFromUrl();
    const urlHasMarketplaceToken =
      typeof window !== 'undefined' &&
      (window.location.search.includes('marketplace_token=') ||
        window.location.search.includes('marketplace-token='));

    if (urlSessionId && urlSessionId !== lastSessionRef.current) {
      if (urlHasMarketplaceToken) {
        handleUrlMarketplaceToken(); // persists + strips
      } else {
        removeMarketplaceToken(); // drop stale, new session stands alone
      }
    }

    const sid = handleUrlSession(); // reads URL, persists cookie, strips URL
    if (sid) {
      // Defer the kick-off so the inner setState calls inside refresh() do
      // not run synchronously inside the effect body
      // (react-hooks/set-state-in-effect). The async fetch makes this a
      // genuine "synchronize with external system" effect.
      queueMicrotask(() => {
        void refresh(sid);
      });
    }
  }, [refresh]);

  const isReady = config !== null && userInfo !== null;

  return (
    <BmsSessionContext.Provider
      value={{ config, userInfo, isReady, error, refresh, clear }}
    >
      {children}
    </BmsSessionContext.Provider>
  );
}
