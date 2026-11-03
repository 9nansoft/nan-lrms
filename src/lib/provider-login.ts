// src/lib/provider-login.ts
// ProviderID login helpers (moved verbatim from the login page). The
// `providerError` query param carries text from the ProviderID OAuth
// callback/pending flow (src/app/api/auth/provider/callback/route.ts,
// provider/complete/page.tsx). Some of it is IdP-controlled, so it must never
// be rendered verbatim as the headline: known codes map to friendly Thai,
// unknown ones fall back to a safe headline with the raw code only as detail.
const PROVIDER_ERROR_MESSAGES: Record<string, string> = {
  missing_provider_token: 'ไม่พบข้อมูลการเข้าสู่ระบบ ProviderID กรุณาเริ่มเข้าสู่ระบบใหม่อีกครั้ง',
  'ProviderID login state is invalid or expired':
    'เซสชันการเข้าสู่ระบบ ProviderID หมดอายุหรือไม่ถูกต้อง กรุณาลองเข้าสู่ระบบใหม่อีกครั้ง',
  'ProviderID login failed': 'เข้าสู่ระบบด้วย ProviderID ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
  access_denied: 'ท่านไม่ได้อนุญาตให้ระบบเข้าถึงข้อมูล ProviderID กรุณาลองใหม่แล้วกด "อนุญาต"',
};

export const PROVIDER_ERROR_FALLBACK = 'เข้าสู่ระบบด้วย ProviderID ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';

export function mapProviderError(code: string): { message: string; detail?: string } {
  const known = PROVIDER_ERROR_MESSAGES[code];
  if (known) return { message: known };
  return { message: PROVIDER_ERROR_FALLBACK, detail: code };
}

/** The ProviderID OAuth entry point (read-only sessions). */
export function providerLoginStartUrl(callbackUrl: string): string {
  return `/api/auth/provider/start?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}
