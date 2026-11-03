import { describe, it, expect } from 'vitest';
import { mapProviderError, PROVIDER_ERROR_FALLBACK, providerLoginStartUrl } from '@/lib/provider-login';

describe('provider-login', () => {
  it('maps known codes to Thai with no detail', () => {
    expect(mapProviderError('missing_provider_token')).toEqual({
      message: 'ไม่พบข้อมูลการเข้าสู่ระบบ ProviderID กรุณาเริ่มเข้าสู่ระบบใหม่อีกครั้ง',
    });
  });
  it('never echoes IdP text as the message', () => {
    expect(mapProviderError('<b>x</b>')).toEqual({ message: PROVIDER_ERROR_FALLBACK, detail: '<b>x</b>' });
  });
  it('builds the OAuth start URL exactly as the page always did', () => {
    expect(providerLoginStartUrl('/pregnancies?x=1')).toBe('/api/auth/provider/start?callbackUrl=%2Fpregnancies%3Fx%3D1');
  });
});
