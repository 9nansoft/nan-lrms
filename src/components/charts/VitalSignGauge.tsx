// VitalSignGauge — radial gauge for HR/FHR/BP/PPH with sparkline trend + Thai status
'use client';

import { COLOR } from '@/config/design-tokens';
import {
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from 'recharts';

interface VitalSignGaugeProps {
  label: string;
  value: number | null;
  unit: string;
  min: number;
  max: number;
  normalMin: number;
  normalMax: number;
  history?: number[];
}

function getGaugeColor(value: number, normalMin: number, normalMax: number): string {
  if (value >= normalMin && value <= normalMax) return COLOR.riskLow; // green
  if (value < normalMin * 0.8 || value > normalMax * 1.2) return COLOR.riskHigh; // red
  return COLOR.riskMedium; // yellow
}

function getStatusText(value: number, normalMin: number, normalMax: number): string {
  if (value >= normalMin && value <= normalMax) return 'ปกติ';
  if (value < normalMin * 0.8 || value > normalMax * 1.2) return 'ผิดปกติ';
  return 'เฝ้าระวัง';
}

export function VitalSignGauge({
  label,
  value,
  unit,
  min,
  max,
  normalMin,
  normalMax,
  history = [],
}: VitalSignGaugeProps) {
  if (value === null || value === undefined) {
    return (
      <div className="flex flex-col items-center gap-1 rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]">
        <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">{label}</span>
        <span className="font-mono text-2xl font-bold text-slate-300">-</span>
        <span className="text-xs text-slate-400 uppercase tracking-wider">{unit}</span>
      </div>
    );
  }

  const color = getGaugeColor(value, normalMin, normalMax);
  const percentage = Math.min(((value - min) / (max - min)) * 100, 100);
  const data = [{ value: percentage, fill: color }];

  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]">
      <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">{label}</span>

      <div className="relative h-24 w-24">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="70%"
            outerRadius="100%"
            barSize={8}
            data={data}
            startAngle={180}
            endAngle={0}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={4} background={{ fill: '#f1f5f9' }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pt-2">
          <span className="font-mono text-2xl font-bold" style={{ color }}>
            {value}
          </span>
        </div>
      </div>

      <span className="text-xs text-slate-400 uppercase tracking-wider">{unit}</span>

      {/* Thai status text */}
      <span className="text-xs font-semibold" style={{ color }}>
        {getStatusText(value, normalMin, normalMax)}
      </span>

      {/* Mini sparkline trend */}
      {history.length > 1 && (
        <div className="flex h-4 items-end gap-px">
          {history.slice(-8).map((v, i) => {
            const h = Math.max(2, ((v - min) / (max - min)) * 16);
            return (
              <div
                key={i}
                className="w-2 rounded-full"
                style={{
                  height: `${h}px`,
                  backgroundColor: getGaugeColor(v, normalMin, normalMax),
                  opacity: 0.6 + (i / history.length) * 0.4,
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
