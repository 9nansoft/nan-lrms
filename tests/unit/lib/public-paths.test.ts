import { describe, it, expect } from 'vitest';
import { isStaticPath, isPublicPath, isAuthExempt } from '@/lib/public-paths';

describe('middleware path exemptions', () => {
  it('serves decorative illustrations without auth (login hero, EmptyState art)', () => {
    expect(isStaticPath('/illustrations/login-hero.webp')).toBe(true);
    expect(isAuthExempt('/illustrations/login-hero.webp')).toBe(true);
  });
  it('keeps API and patient routes protected', () => {
    for (const p of ['/api/patients', '/api/admin/users', '/patients/x', '/pregnancies']) {
      expect(isAuthExempt(p)).toBe(false);
    }
  });
  it('does not exempt look-alike prefixes', () => {
    expect(isStaticPath('/illustrations-private/x')).toBe(false);
  });
  it('keeps existing public and static paths', () => {
    expect(isPublicPath('/login')).toBe(true);
    expect(isStaticPath('/_next/x.js')).toBe(true);
  });
});
