// Outcomes — neonatal KPIs. Redesigned 2026-04-21 to match the dashboard's
// air-traffic-control aesthetic: cool-slate frame, flush white panels, navy
// accents, mono tabular numerics, risk-palette tints instead of pastel cards.
'use client';

import useSWR from 'swr';
import { useSetBreadcrumbs } from '@/components/layout/BreadcrumbContext';
import { LoadingState } from '@/components/shared/LoadingState';
import { SectionLabel } from '@/components/dashboard/shared';
import { Baby, Weight, Activity, Scale } from 'lucide-react';
import type { NewbornKPIsResponse } from '@/types/api';

export default function OutcomesPage() {
  useSetBreadcrumbs([
    { label: 'แดชบอร์ด', href: '/' },
    { label: 'ผลลัพธ์ทารก' },
  ]);

  const { data, isLoading, error } = useSWR<NewbornKPIsResponse>(
    '/api/dashboard/outcomes',
    { refreshInterval: 60000 },
  );

  if (isLoading) {
    return <LoadingState message="กำลังโหลดข้อมูลผลลัพธ์ทารก..." />;
  }

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 text-center"
        style={{ color: 'var(--ink-navy-muted)' }}
      >
        <Baby className="mb-3 h-10 w-10 opacity-40" />
        <p className="font-mono text-[11px] text-red-600">
          เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่
        </p>
      </div>
    );
  }

  const kpis = data ?? { totalBirths: 0, lbwCount: 0, lbwRate: 0, lowApgarCount: 0, avgBirthWeightG: 0 };

  const tiles: Array<{
    key: string;
    label: string;
    labelEn: string;
    value: number | string;
    sub: string;
    color: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      key: 'total',
      label: 'ทารกเกิดทั้งหมด',
      labelEn: 'TOTAL BIRTHS',
      value: kpis.totalBirths,
      sub: 'ราย (เดือนนี้)',
      color: 'var(--accent-navy)',
      icon: Baby,
    },
    {
      key: 'lbw',
      label: 'น้ำหนักน้อย (LBW)',
      labelEn: 'LOW BIRTH WEIGHT',
      value: kpis.lbwCount,
      sub: `${kpis.lbwRate.toFixed(1)}% ของทารกทั้งหมด`,
      color: 'var(--risk-medium)',
      icon: Weight,
    },
    {
      key: 'apgar',
      label: 'Apgar ต่ำ',
      labelEn: 'LOW APGAR',
      value: kpis.lowApgarCount,
      sub: 'ราย (Apgar 5 นาที < 7)',
      color: 'var(--risk-high)',
      icon: Activity,
    },
    {
      key: 'avgWeight',
      label: 'น้ำหนักเฉลี่ย',
      labelEn: 'AVG WEIGHT',
      value: kpis.avgBirthWeightG > 0 ? kpis.avgBirthWeightG.toLocaleString() : '—',
      sub: 'กรัม',
      color: 'var(--risk-low)',
      icon: Scale,
    },
  ];

  return (
    <div
      style={{
        color: 'var(--ink-navy)',
        background: 'var(--surface-cool)',
        zoom: 1.15,
      }}
    >
      {/* Header strip — flush white under the navbar */}
      <div
        className="flex flex-wrap items-baseline gap-x-4 gap-y-1 bg-white px-5 py-2.5"
        style={{ borderBottom: '1px solid var(--rule-strong)' }}
      >
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-navy-muted)]">
            PROVINCIAL REGISTRY · NEONATAL OUTCOMES
          </div>
          <h1
            className="mt-0.5 text-[22px] font-bold leading-tight tracking-tight"
            style={{ color: 'var(--ink-navy)' }}
          >
            ผลลัพธ์ทารก
          </h1>
        </div>
        <p className="font-mono text-[11px] text-[var(--ink-navy-muted)]">
          สรุปตัวชี้วัดทารกแรกเกิดประจำเดือน
        </p>
      </div>

      {/* 01 — KPI tiles strip */}
      <div
        className="grid bg-white"
        style={{
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          borderBottom: '1px solid var(--rule-strong)',
        }}
      >
        {tiles.map((t, i) => {
          const Icon = t.icon;
          return (
            <div
              key={t.key}
              className="flex flex-col gap-2 px-5 py-4"
              style={{
                borderLeft: `2px solid ${t.color}`,
                borderRight:
                  i < tiles.length - 1 ? '1px solid var(--rule-strong)' : undefined,
              }}
            >
              <div className="flex items-center gap-2" style={{ color: t.color }}>
                <Icon className="h-3.5 w-3.5" />
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-navy-muted)]">
                  {t.labelEn}
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <div
                  className="font-mono text-[36px] font-semibold leading-none tabular-nums"
                  style={{ color: t.color, letterSpacing: '-0.02em' }}
                >
                  {t.value}
                </div>
                <div className="font-mono text-[11px] text-[var(--ink-navy-dim)]">{t.sub}</div>
              </div>
              <div className="text-[12px] text-[var(--ink-navy-dim)]">{t.label}</div>
            </div>
          );
        })}
      </div>

      {/* 02 — Placeholder for future trend charts */}
      <div className="bg-white px-5 pt-4 pb-6">
        <SectionLabel idx={2} right={<span>MONTH-TO-DATE</span>}>
          Outcome trends
        </SectionLabel>
        <div
          className="mt-2 border bg-white px-5 py-10 text-center"
          style={{ borderColor: 'var(--rule-strong)' }}
        >
          <p className="font-mono text-[11px] tracking-[0.08em] text-[var(--ink-navy-muted)]">
            · กราฟแนวโน้มรายเดือนจะเพิ่มในรอบถัดไป ·
          </p>
        </div>
      </div>
    </div>
  );
}
