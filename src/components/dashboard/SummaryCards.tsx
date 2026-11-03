'use client';

import { Users, AlertTriangle, AlertCircle, Shield } from 'lucide-react';
import type { DashboardSummary } from '@/types/api';
import type { LucideIcon } from 'lucide-react';

interface SummaryCardsProps {
  summary: DashboardSummary;
}

interface CardConfig {
  key: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  numberColor: string;
  ringClass: string;
  getValue: (s: DashboardSummary) => number;
}

const CARDS: CardConfig[] = [
  {
    key: 'total',
    title: 'ผู้คลอดทั้งหมด',
    subtitle: 'กำลังคลอด',
    icon: Users,
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-500',
    numberColor: 'text-slate-900',
    ringClass: '',
    getValue: (s) => s.totalActive,
  },
  {
    key: 'high',
    title: 'เสี่ยงสูง',
    subtitle: 'ต้องเฝ้าระวัง',
    icon: AlertTriangle,
    iconBg: 'bg-danger-tint',
    iconColor: 'text-danger',
    numberColor: 'text-danger-text',
    ringClass: 'ring-1 ring-danger/40',
    getValue: (s) => s.totalHigh,
  },
  {
    key: 'medium',
    title: 'เสี่ยงปานกลาง',
    subtitle: 'ติดตามต่อเนื่อง',
    icon: AlertCircle,
    iconBg: 'bg-warn-tint',
    iconColor: 'text-warn',
    numberColor: 'text-warn-text',
    ringClass: 'ring-1 ring-warn/40',
    getValue: (s) => s.totalMedium,
  },
  {
    key: 'low',
    title: 'เสี่ยงต่ำ',
    subtitle: 'ปกติ',
    icon: Shield,
    iconBg: 'bg-ok-tint',
    iconColor: 'text-ok',
    numberColor: 'text-ok-text',
    ringClass: 'ring-1 ring-ok/40',
    getValue: (s) => s.totalLow,
  },
];

export function SummaryCards({ summary }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {CARDS.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.key}
            className={`rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)] transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.05)] ${card.ringClass}`}
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-full ${card.iconBg}`}>
                <Icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>
              <span className="text-sm font-medium uppercase tracking-wider text-slate-400">
                {card.title}
              </span>
            </div>
            <div className={`mt-4 font-mono text-4xl font-bold ${card.numberColor}`}>
              {card.getValue(summary)}
            </div>
            <div className="mt-1 text-sm text-slate-400">{card.subtitle}</div>
          </div>
        );
      })}
    </div>
  );
}
