// T077: BpBarChart — grouped SBP/DBP bars with hypertension reference lines
'use client';

import { COLOR, MIN_TEXT_PX } from '@/config/design-tokens';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import type { VitalSignEntry } from '@/types/api';

interface BpBarChartProps {
  vitals: VitalSignEntry[];
}

export function BpBarChart({ vitals }: BpBarChartProps) {
  const bpData = vitals
    .filter((v) => v.sbp != null || v.dbp != null)
    .map((v) => ({
      time: new Date(v.measuredAt).toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      sbp: v.sbp,
      dbp: v.dbp,
    }));

  if (bpData.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-md border border-dashed text-muted-foreground">
        ยังไม่มีข้อมูลความดันโลหิต
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">ความดันโลหิต (BP)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={bpData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" fontSize={MIN_TEXT_PX} />
          <YAxis domain={[0, 200]} />
          <Tooltip
            formatter={(value, name) => {
              const labels: Record<string, string> = { sbp: 'SBP', dbp: 'DBP' };
              return [`${value} mmHg`, labels[String(name)] ?? name];
            }}
          />
          <Legend
            formatter={(value: string) => {
              const labels: Record<string, string> = { sbp: 'ซิสโตลิก (SBP)', dbp: 'ไดแอสโตลิก (DBP)' };
              return labels[value] ?? value;
            }}
          />

          {/* Hypertension reference line */}
          <ReferenceLine y={140} stroke={COLOR.riskHigh} strokeDasharray="3 3" label="140" />
          {/* Hypotension reference line */}
          <ReferenceLine y={90} stroke={COLOR.riskMedium} strokeDasharray="3 3" label="90" />

          <Bar dataKey="sbp" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          <Bar dataKey="dbp" fill="#93c5fd" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
