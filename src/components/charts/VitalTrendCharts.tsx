// VitalTrendCharts — 4 time-series area charts for HR, FHR, BP, PPH trends
'use client';

import { COLOR, MIN_TEXT_PX } from '@/config/design-tokens';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import type { VitalSignEntry } from '@/types/api';

interface VitalTrendChartsProps {
  vitals: VitalSignEntry[];
}

/** Format ISO date string to HH:mm Thai locale */
function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Chart card wrapper with consistent styling */
function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </h4>
      {children}
    </div>
  );
}

/** Shared tooltip styling */
function CustomTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string | number | undefined;
  unit: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-semibold" style={{ color: entry.color }}>
          {entry.name}: {entry.value ?? '-'} {unit}
        </p>
      ))}
    </div>
  );
}

/** Chart 1: Maternal Heart Rate */
function MaternalHrChart({ vitals }: { vitals: VitalSignEntry[] }) {
  const data = vitals
    .filter((v) => v.maternalHr != null)
    .map((v) => ({
      time: formatTime(v.measuredAt),
      mhr: v.maternalHr,
    }));

  if (data.length === 0) {
    return (
      <ChartCard title="อัตราการเต้นหัวใจมารดา (MHR)">
        <div className="flex h-48 items-center justify-center rounded-md border border-dashed text-sm text-slate-400">
          ยังไม่มีข้อมูล
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="อัตราการเต้นหัวใจมารดา (MHR)">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 5, right: 60, bottom: 5, left: -10 }}>
          <defs>
            <linearGradient id="gradMhr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#475569" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#475569" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          {/* Normal range green zone */}
          <ReferenceArea y1={60} y2={100} fill={COLOR.riskLow} fillOpacity={0.06} />
          <XAxis dataKey="time" fontSize={MIN_TEXT_PX} tick={{ fill: '#94a3b8' }} />
          <YAxis domain={[40, 180]} fontSize={MIN_TEXT_PX} tick={{ fill: '#94a3b8' }} />
          <Tooltip
            content={({ active, payload, label }) => (
              <CustomTooltip active={active} payload={payload as never} label={label as string} unit="bpm" />
            )}
          />
          <ReferenceLine y={100} stroke={COLOR.riskLow} strokeDasharray="4 4" strokeOpacity={0.6} />
          <ReferenceLine y={60} stroke={COLOR.riskLow} strokeDasharray="4 4" strokeOpacity={0.6} />
          <Area
            type="monotone"
            dataKey="mhr"
            name="MHR"
            stroke="#475569"
            strokeWidth={2}
            fill="url(#gradMhr)"
            dot={{ r: 3, fill: '#475569', strokeWidth: 0 }}
            activeDot={{ r: 5, stroke: '#475569', strokeWidth: 2, fill: '#fff' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Chart 2: Fetal Heart Rate */
function FetalHrChart({ vitals }: { vitals: VitalSignEntry[] }) {
  const data = vitals
    .filter((v) => v.fetalHr != null)
    .map((v) => ({
      time: formatTime(v.measuredAt),
      fhr: v.fetalHr ? parseInt(v.fetalHr) : null,
    }))
    .filter((d) => d.fhr != null);

  if (data.length === 0) {
    return (
      <ChartCard title="อัตราการเต้นหัวใจทารก (FHR)">
        <div className="flex h-48 items-center justify-center rounded-md border border-dashed text-sm text-slate-400">
          ยังไม่มีข้อมูล
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="อัตราการเต้นหัวใจทารก (FHR)">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 5, right: 60, bottom: 5, left: -10 }}>
          <defs>
            <linearGradient id="gradFhr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          {/* Normal range green zone */}
          <ReferenceArea y1={110} y2={160} fill={COLOR.riskLow} fillOpacity={0.06} />
          <XAxis dataKey="time" fontSize={MIN_TEXT_PX} tick={{ fill: '#94a3b8' }} />
          <YAxis domain={[80, 200]} fontSize={MIN_TEXT_PX} tick={{ fill: '#94a3b8' }} />
          <Tooltip
            content={({ active, payload, label }) => (
              <CustomTooltip active={active} payload={payload as never} label={label as string} unit="bpm" />
            )}
          />
          <ReferenceLine y={160} stroke={COLOR.riskLow} strokeDasharray="4 4" strokeOpacity={0.6} />
          <ReferenceLine y={110} stroke={COLOR.riskLow} strokeDasharray="4 4" strokeOpacity={0.6} />
          <Area
            type="monotone"
            dataKey="fhr"
            name="FHR"
            stroke="#14b8a6"
            strokeWidth={2}
            fill="url(#gradFhr)"
            dot={{ r: 3, fill: '#14b8a6', strokeWidth: 0 }}
            activeDot={{ r: 5, stroke: '#14b8a6', strokeWidth: 2, fill: '#fff' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Chart 3: Blood Pressure (SBP + DBP) */
function BpTrendChart({ vitals }: { vitals: VitalSignEntry[] }) {
  const data = vitals
    .filter((v) => v.sbp != null || v.dbp != null)
    .map((v) => ({
      time: formatTime(v.measuredAt),
      sbp: v.sbp,
      dbp: v.dbp,
    }));

  if (data.length === 0) {
    return (
      <ChartCard title="ความดันโลหิต (BP)">
        <div className="flex h-48 items-center justify-center rounded-md border border-dashed text-sm text-slate-400">
          ยังไม่มีข้อมูล
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="ความดันโลหิต (BP)">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 5, right: 60, bottom: 5, left: -10 }}>
          <defs>
            <linearGradient id="gradSbp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="gradDbp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#475569" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#475569" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="time" fontSize={MIN_TEXT_PX} tick={{ fill: '#94a3b8' }} />
          <YAxis domain={[40, 200]} fontSize={MIN_TEXT_PX} tick={{ fill: '#94a3b8' }} />
          <Tooltip
            content={({ active, payload, label }) => (
              <CustomTooltip active={active} payload={payload as never} label={label as string} unit="mmHg" />
            )}
          />
          <ReferenceLine y={140} stroke={COLOR.riskHigh} strokeDasharray="4 4" strokeOpacity={0.7} label={{ value: 'SBP 140', position: 'right', fill: COLOR.riskHigh, fontSize: MIN_TEXT_PX }} />
          <ReferenceLine y={90} stroke={COLOR.riskMedium} strokeDasharray="4 4" strokeOpacity={0.7} label={{ value: 'DBP 90', position: 'right', fill: COLOR.riskMedium, fontSize: MIN_TEXT_PX }} />
          <Area
            type="monotone"
            dataKey="sbp"
            name="SBP"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#gradSbp)"
            dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }}
            activeDot={{ r: 5, stroke: '#3b82f6', strokeWidth: 2, fill: '#fff' }}
          />
          <Area
            type="monotone"
            dataKey="dbp"
            name="DBP"
            stroke="#475569"
            strokeWidth={2}
            fill="url(#gradDbp)"
            dot={{ r: 3, fill: '#475569', strokeWidth: 0 }}
            activeDot={{ r: 5, stroke: '#475569', strokeWidth: 2, fill: '#fff' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Chart 4: Postpartum Hemorrhage */
function PphTrendChart({ vitals }: { vitals: VitalSignEntry[] }) {
  const data = vitals
    .filter((v) => v.pphAmountMl != null)
    .map((v) => ({
      time: formatTime(v.measuredAt),
      pph: v.pphAmountMl,
    }));

  if (data.length === 0) {
    return (
      <ChartCard title="ปริมาณเลือดออก (PPH)">
        <div className="flex h-48 items-center justify-center rounded-md border border-dashed text-sm text-slate-400">
          ยังไม่มีข้อมูล
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="ปริมาณเลือดออก (PPH)">
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 5, right: 60, bottom: 5, left: -10 }}>
          <defs>
            <linearGradient id="gradPph" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLOR.riskHigh} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLOR.riskHigh} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="time" fontSize={MIN_TEXT_PX} tick={{ fill: '#94a3b8' }} />
          <YAxis domain={[0, 1000]} fontSize={MIN_TEXT_PX} tick={{ fill: '#94a3b8' }} />
          <Tooltip
            content={({ active, payload, label }) => (
              <CustomTooltip active={active} payload={payload as never} label={label as string} unit="ml" />
            )}
          />
          <ReferenceLine y={500} stroke={COLOR.riskHigh} strokeDasharray="4 4" strokeOpacity={0.7} label={{ value: '500 ml', position: 'right', fill: COLOR.riskHigh, fontSize: MIN_TEXT_PX }} />
          <Area
            type="monotone"
            dataKey="pph"
            name="PPH"
            stroke={COLOR.riskHigh}
            strokeWidth={2}
            fill="url(#gradPph)"
            dot={{ r: 3, fill: COLOR.riskHigh, strokeWidth: 0 }}
            activeDot={{ r: 5, stroke: COLOR.riskHigh, strokeWidth: 2, fill: '#fff' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function VitalTrendCharts({ vitals }: VitalTrendChartsProps) {
  if (vitals.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <MaternalHrChart vitals={vitals} />
      <FetalHrChart vitals={vitals} />
      <BpTrendChart vitals={vitals} />
      <PphTrendChart vitals={vitals} />
    </div>
  );
}
