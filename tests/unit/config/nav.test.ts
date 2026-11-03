// tests/unit/config/nav.test.ts
import { describe, it, expect } from 'vitest';
import { navItemsFor, NAV_ITEMS, HOSPITAL_NAV_ITEMS, MANUAL_LINK } from '@/config/nav';

describe('navItemsFor', () => {
  it('hospital variant: ward + profile only (previously an empty nav)', () => {
    expect(navItemsFor('hospital', 'NURSE').map((i) => i.href)).toEqual(['/hospital-maternity-ward', '/profile']);
    expect(HOSPITAL_NAV_ITEMS.map((i) => i.label)).toEqual(['ห้องคลอด', 'โปรไฟล์']);
  });
  it('provincial non-admin hides admin-only items', () => {
    expect(navItemsFor('provincial', 'NURSE').some((i) => i.adminOnly)).toBe(false);
  });
  it('the manual link points at the static manual page', () => {
    expect(MANUAL_LINK.href).toBe('/manual.html');
    expect(MANUAL_LINK.label).toBe('คู่มือการใช้งาน');
  });
  it('provincial admin sees everything', () => {
    expect(navItemsFor('provincial', 'ADMIN')).toHaveLength(NAV_ITEMS.length);
  });
});
