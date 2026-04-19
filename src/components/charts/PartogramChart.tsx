// PartogramChart — 4-panel WHO partograph (FHR + cervix/descent + contractions + maternal vitals).
// All four panels share the same x-axis (hours from labour start, 0..24, ticks every 4h)
// for visual alignment.
'use client';

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Bar,
  ReferenceArea,
} from 'recharts';
import type { CdssAlertDto, PartographObservationDto } from '@/types/api';
import { highestSeverity } from '@/services/partogram';
import {
  SEVERITY_DOT,
  SEVERITY_LABEL_TH,
} from '@/components/patient/cdss-presentation';
import { cn } from '@/lib/utils';

interface PartogramChartProps {
  observations: PartographObservationDto[];
  alerts: CdssAlertDto[];
  startTime: string;
}

function hoursAt(o: PartographObservationDto, startTime: string): number {
  if (o.hourNo != null) return o.hourNo;
  const ms = new Date(o.observeDatetime).getTime() - new Date(startTime).getTime();
  return Math.round((ms / 3600000) * 10) / 10;
}

function descentNumeric(value: string | null): number | null {
  if (value == null) return null;
  const head = String(value).split('/')[0];
  const num = Number(head);
  return Number.isFinite(num) ? num : null;
}

const X_AXIS_DOMAIN: [number, number] = [0, 24];
const X_AXIS_TICKS = [0, 4, 8, 12, 16, 20, 24];

export function PartogramChart({ observations, alerts, startTime }: PartogramChartProps) {
  if (observations.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border border-dashed text-muted-foreground">
        ยังไม่มีข้อมูล Partogram
      </div>
    );
  }

  const highest = highestSeverity(alerts);
  const totalCount = alerts.length;

  // Single pass over observations — O(n).
  const data = observations.map((o, i) => ({
    hour: hoursAt(o, startTime),
    fhr: o.fetalHeartRate,
    dilation: o.cervicalDilationCm,
    descent: descentNumeric(o.descentOfHead),
    contractions: o.contractionPer10Min,
    pulse: o.pulse,
    sbp: o.bpSystolic,
    dbp: o.bpDiastolic,
    temp: o.temperature,
    obsIndex: i,
  }));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Partograph</h3>
        {highest != null && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span
              className={cn(
                'inline-block h-2.5 w-2.5 rounded-full',
                SEVERITY_DOT[highest],
              )}
              aria-hidden="true"
            />
            <span>
              {SEVERITY_LABEL_TH[highest]} {totalCount} ครั้ง
            </span>
          </div>
        )}
      </div>

      {/* Panel 1 — Fetal heart rate (110–160 bpm normal band) */}
      <div data-testid="partogram-panel-fhr" className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="hour"
              type="number"
              domain={X_AXIS_DOMAIN}
              ticks={X_AXIS_TICKS}
              hide
            />
            <YAxis domain={[80, 200]} ticks={[80, 110, 160, 200]} width={40} />
            <ReferenceArea
              y1={110}
              y2={160}
              strokeOpacity={0}
              fill="#bbf7d0"
              fillOpacity={0.3}
            />
            <Tooltip />
            <Line
              dataKey="fhr"
              stroke="#16a34a"
              strokeWidth={1.5}
              dot={{ r: 3 }}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Panel 2 — Cervix dilation (area) + head descent (line, same scale) */}
      <div data-testid="partogram-panel-cervix" className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="hour"
              type="number"
              domain={X_AXIS_DOMAIN}
              ticks={X_AXIS_TICKS}
              hide
            />
            <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} width={40} />
            <Tooltip />
            <Area
              dataKey="dilation"
              fill="rgba(6,182,212,0.2)"
              stroke="#06b6d4"
              strokeWidth={2}
              dot={{ r: 4 }}
              connectNulls={false}
            />
            <Line
              dataKey="descent"
              stroke="#7c3aed"
              strokeWidth={1.5}
              dot={{ r: 3 }}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Panel 3 — Contractions per 10 min (bars) */}
      <div data-testid="partogram-panel-contractions" className="h-20">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="hour"
              type="number"
              domain={X_AXIS_DOMAIN}
              ticks={X_AXIS_TICKS}
              hide
            />
            <YAxis domain={[0, 6]} ticks={[0, 2, 4, 6]} width={40} />
            <Tooltip />
            <Bar dataKey="contractions" fill="#0891b2" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Panel 4 — Maternal vitals: BP (sys/dia), pulse, temperature */}
      <div data-testid="partogram-panel-vitals" className="h-28">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 16, bottom: 12, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="hour"
              type="number"
              domain={X_AXIS_DOMAIN}
              ticks={X_AXIS_TICKS}
              label={{ value: 'ชั่วโมง', position: 'insideBottomRight', offset: -5 }}
            />
            <YAxis
              yAxisId="bp"
              domain={[40, 200]}
              ticks={[40, 80, 120, 160, 200]}
              width={40}
            />
            <YAxis
              yAxisId="temp"
              orientation="right"
              domain={[35, 40]}
              ticks={[35, 37, 39]}
              width={32}
            />
            <Tooltip />
            <Line
              yAxisId="bp"
              dataKey="sbp"
              stroke="#ef4444"
              strokeWidth={1.5}
              dot={{ r: 3 }}
              connectNulls={false}
            />
            <Line
              yAxisId="bp"
              dataKey="dbp"
              stroke="#3b82f6"
              strokeWidth={1.5}
              dot={{ r: 3 }}
              connectNulls={false}
            />
            <Line
              yAxisId="bp"
              dataKey="pulse"
              stroke="#f59e0b"
              strokeWidth={1.5}
              dot={{ r: 3 }}
              connectNulls={false}
            />
            <Line
              yAxisId="temp"
              dataKey="temp"
              stroke="#dc2626"
              strokeWidth={1}
              dot={{ r: 2 }}
              strokeDasharray="3 3"
              connectNulls={false}
            />
            <Legend />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
