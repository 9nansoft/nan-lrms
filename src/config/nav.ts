// Shared navigation config — used by both TopNavBar (legacy chrome) and the
// redesigned dashboard header's row-2 menu. Single source of truth for
// provincial menu items + role labels.

import {
  LayoutDashboard,
  Baby,
  Building2,
  ArrowRightLeft,
  BarChart3,
  Stethoscope,
  Settings,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'แดชบอร์ด', icon: LayoutDashboard },
  { href: '/pregnancies', label: 'ฝากครรภ์', icon: Baby },
  { href: '/hospitals', label: 'โรงพยาบาล', icon: Building2 },
  { href: '/referrals', label: 'ส่งต่อ', icon: ArrowRightLeft },
  { href: '/outcomes', label: 'ผลลัพธ์ทารก', icon: BarChart3 },
  { href: '/hospital-maternity-ward', label: 'ห้องคลอด', icon: Stethoscope },
  { href: '/admin', label: 'ตั้งค่า', icon: Settings, adminOnly: true },
];

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'ผู้ดูแลระบบ',
  OBSTETRICIAN: 'สูติแพทย์',
  NURSE: 'พยาบาล',
};

export function filterNavByRole(items: NavItem[], role: string | undefined | null): NavItem[] {
  return items.filter((i) => !i.adminOnly || role === 'ADMIN');
}
