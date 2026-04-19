/* @vitest-environment jsdom */
/* @vitest-environment-options { "url": "http://localhost/" } */
/// <reference lib="dom" />

import { describe, it, expect, beforeEach } from 'vitest';
import {
  BMS_SESSION_COOKIE_NAME,
  setSessionCookie,
  getSessionCookie,
  removeSessionCookie,
  getSessionFromUrl,
  removeSessionFromUrl,
  setMarketplaceToken,
  getMarketplaceToken,
  removeMarketplaceToken,
  handleUrlMarketplaceToken,
  handleUrlSession,
} from '@/utils/bms-session-storage';

describe('bms-session-storage', () => {
  beforeEach(() => {
    // Reset cookies + localStorage + URL between tests
    document.cookie = `${BMS_SESSION_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    document.cookie = 'marketplace_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    localStorage.clear();
    window.history.replaceState({}, '', 'http://localhost/');
  });

  describe('cookies', () => {
    it('sets and reads session cookie', () => {
      setSessionCookie('SID-1');
      expect(getSessionCookie()).toBe('SID-1');
    });

    it('removeSessionCookie clears it', () => {
      setSessionCookie('SID-2');
      removeSessionCookie();
      expect(getSessionCookie()).toBeNull();
    });

    it('decodes URL-encoded session IDs', () => {
      setSessionCookie('a/b=c d');
      expect(getSessionCookie()).toBe('a/b=c d');
    });
  });

  describe('URL helpers', () => {
    it('getSessionFromUrl reads ?bms-session-id=', () => {
      window.history.replaceState({}, '', 'http://localhost/?bms-session-id=URL-SID');
      expect(getSessionFromUrl()).toBe('URL-SID');
    });

    it('removeSessionFromUrl strips the param without reload', () => {
      window.history.replaceState({}, '', 'http://localhost/?bms-session-id=X&other=keep');
      removeSessionFromUrl();
      expect(window.location.search).not.toContain('bms-session-id');
      expect(window.location.search).toContain('other=keep');
    });
  });

  describe('marketplace token (localStorage)', () => {
    it('round-trip set/get/remove', () => {
      setMarketplaceToken('MKT');
      expect(getMarketplaceToken()).toBe('MKT');
      removeMarketplaceToken();
      expect(getMarketplaceToken()).toBeNull();
    });

    it('handleUrlMarketplaceToken accepts both snake and kebab case', () => {
      window.history.replaceState({}, '', 'http://localhost/?marketplace-token=KEBAB');
      const t = handleUrlMarketplaceToken();
      expect(t).toBe('KEBAB');
      expect(getMarketplaceToken()).toBe('KEBAB');
      expect(window.location.search).not.toContain('marketplace-token');
    });

    it('handleUrlMarketplaceToken returns localStorage when URL is empty', () => {
      setMarketplaceToken('STORED');
      const t = handleUrlMarketplaceToken();
      expect(t).toBe('STORED');
    });
  });

  describe('handleUrlSession (combined)', () => {
    it('persists URL session to cookie and strips from URL', () => {
      window.history.replaceState({}, '', 'http://localhost/?bms-session-id=COMBO');
      const sid = handleUrlSession();
      expect(sid).toBe('COMBO');
      expect(getSessionCookie()).toBe('COMBO');
      expect(window.location.search).not.toContain('bms-session-id');
    });

    it('falls back to existing cookie when URL is empty', () => {
      setSessionCookie('FROM-COOKIE');
      expect(handleUrlSession()).toBe('FROM-COOKIE');
    });
  });
});
