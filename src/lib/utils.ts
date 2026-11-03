// T037: General utilities + shadcn cn()
import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { RiskLevel, type HospitalLevel } from '@/types/domain';
import { RISK_LEVELS } from '@/config/risk-levels';
import { HOSPITAL_LEVELS } from '@/config/hospitals';
import { TYPE_SCALE } from '@/config/design-tokens';

// The design-system type scale (text-caption … text-kpi) must be recognised as
// font-size utilities; otherwise tailwind-merge reads them as text colours and
// silently drops them when a real colour class (text-brand) follows.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: Object.keys(TYPE_SCALE) }],
      // --shadow-soft is a custom @theme shadow; without it shadow-none cannot
      // override it and both classes survive.
      shadow: [{ shadow: ['soft'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

export function formatThaiDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const day = d.getDate();
  const month = THAI_MONTHS[d.getMonth()];
  const year = d.getFullYear() + 543; // Buddhist Era
  return `${day} ${month} ${year}`;
}

export function formatThaiTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

export function calculateAge(birthday: Date | string): number {
  const birth = typeof birthday === 'string' ? new Date(birthday) : birthday;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export function riskLevelToColor(level: RiskLevel): string {
  return RISK_LEVELS[level].color;
}

export function riskLevelToBgColor(level: RiskLevel): string {
  return RISK_LEVELS[level].bgColor;
}

export function riskLevelToThaiLabel(level: RiskLevel): string {
  return RISK_LEVELS[level].labelTh;
}

export function formatHospitalLevel(level: HospitalLevel): string {
  return HOSPITAL_LEVELS[level]?.nameTh ?? String(level);
}

export function truncateName(name: string, maxLen: number = 30): string {
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen) + '...';
}

/** Build a patient URL identifier: {hcode}-{an} */
export function buildPatientId(hcode: string, an: string): string {
  return `${hcode}-${an}`;
}

/** Parse a patient URL identifier back to { hcode, an } */
export function parsePatientId(patientId: string): { hcode: string; an: string } | null {
  const dashIdx = patientId.indexOf('-');
  if (dashIdx === -1) return null;
  return {
    hcode: patientId.slice(0, dashIdx),
    an: patientId.slice(dashIdx + 1),
  };
}

export function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return '-';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'เมื่อสักครู่';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชม.ที่แล้ว`;
  return new Date(isoString).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}
