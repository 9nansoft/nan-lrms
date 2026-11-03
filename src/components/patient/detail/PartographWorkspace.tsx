// src/components/patient/detail/PartographWorkspace.tsx
// The patient page's partograph tab: CDSS summary, the WHO form at its native
// width (spec D7), vital trends, and the observation table. CDSS and vital
// severity logic is untouched (countBySeverity, sevFhr, sevBp).
'use client';

import { NETWORK_RETRY_REMEDY } from '@/lib/actionable-errors';
import { SectionCard } from '@/components/shared/SectionCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { AlertSummaryPanel } from '@/components/patient/AlertSummaryPanel';
import { VitalTrendCharts } from '@/components/charts/VitalTrendCharts';
import {
  PartographForm,
  PARTOGRAPH_NATIVE_WIDTH,
  type PartographFormHeader,
} from '@/components/maternity/partograph/PartographForm';
import { countBySeverity } from '@/services/partogram';
import { sevBp, sevFhr } from '@/services/anc-clinical';
import type { StatusTone } from '@/config/status-tone';
import type { CdssAlertDto, PartographObservationDto, PartogramResponse, VitalSignEntry } from '@/types/api';

/** Tab badge: the most severe CDSS level present (unchanged mapping:
 *  critical → danger, alert → warn, warn → brand). */
export function cdssTabBadge(alerts: CdssAlertDto[]): { label: string; tone: StatusTone } | null {
  const critical = countBySeverity(alerts, 'CRITICAL');
  if (critical > 0) return { label: `วิกฤต ${critical}`, tone: 'danger' };
  const alert = countBySeverity(alerts, 'ALERT');
  if (alert > 0) return { label: `เตือน ${alert}`, tone: 'warn' };
  const warn = countBySeverity(alerts, 'WARN');
  if (warn > 0) return { label: `ระวัง ${warn}`, tone: 'brand' };
  return null;
}

const ABNORMAL = 'font-semibold text-danger-text';

const COLUMNS: DataTableColumn<PartographObservationDto>[] = [
  { key: 'time', header: 'เวลา', cell: (o) => o.observeDatetime?.replace('T', ' ').slice(0, 16) ?? '-' },
  { key: 'hour', header: 'ชั่วโมงที่', numeric: true, cell: (o) => o.hourNo ?? '-' },
  {
    key: 'fhr',
    header: 'FHR',
    numeric: true,
    cell: (o) => <span className={sevFhr(o.fetalHeartRate) === 'abnormal' ? ABNORMAL : undefined}>{o.fetalHeartRate ?? '-'}</span>,
  },
  { key: 'cx', header: 'ปากมดลูก (ซม.)', numeric: true, cell: (o) => o.cervicalDilationCm ?? '-' },
  { key: 'uc', header: 'การหดรัดตัว /10 นาที', numeric: true, cell: (o) => o.contractionPer10Min ?? '-' },
  {
    key: 'bp',
    header: 'BP',
    numeric: true,
    cell: (o) => (
      <span className={sevBp(o.bpSystolic, o.bpDiastolic) === 'abnormal' ? ABNORMAL : undefined}>
        {o.bpSystolic ?? '-'}/{o.bpDiastolic ?? '-'}
      </span>
    ),
  },
  { key: 'pulse', header: 'ชีพจร', numeric: true, cell: (o) => o.pulse ?? '-' },
  { key: 'temp', header: 'อุณหภูมิ (°C)', numeric: true, cell: (o) => o.temperature ?? '-' },
];

export interface PartographWorkspaceProps {
  partogram: PartogramResponse['partogram'] | null;
  error: unknown;
  onRetry: () => void;
  vitals: VitalSignEntry[];
  header: PartographFormHeader;
}

export function PartographWorkspace({ partogram, error, onRetry, vitals, header }: PartographWorkspaceProps) {
  if (!partogram) {
    if (error) {
      return (
        <ErrorState
          message="ไม่สามารถโหลดข้อมูลพาร์โทกราฟได้"
          detail={error instanceof Error ? error.message : undefined}
          remedy={NETWORK_RETRY_REMEDY}
          onRetry={onRetry}
        />
      );
    }
    return (
      <EmptyState
        title="ยังไม่มีข้อมูลพาร์โทกราฟสำหรับผู้คลอดรายนี้"
        description="ข้อมูลจะแสดงเมื่อมีการบันทึกพาร์โทกราฟใน HOSxP และระบบซิงค์รอบถัดไป"
      />
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {partogram.alerts.length > 0 && <AlertSummaryPanel alerts={partogram.alerts} observations={partogram.observations} />}
      <SectionCard title="พาร์โทกราฟ" description="ความก้าวหน้าการคลอดตามแบบ WHO · เลื่อนซ้าย–ขวาเมื่อจอแคบ">
        <div data-testid="partograph-scroll" className="overflow-x-auto rounded-xl border border-border">
          <div style={{ minWidth: PARTOGRAPH_NATIVE_WIDTH }}>
            <PartographForm header={header} observations={partogram.observations} alerts={partogram.alerts} />
          </div>
        </div>
      </SectionCard>
      <SectionCard title="แนวโน้มสัญญาณชีพ" description="24 ชั่วโมงล่าสุด">
        {vitals.length > 0 ? <VitalTrendCharts vitals={vitals} /> : <EmptyState title="ยังไม่มีข้อมูลสัญญาณชีพ" />}
      </SectionCard>
      <SectionCard title="บันทึกการสังเกต" description={`${partogram.observations.length} รายการ`}>
        <DataTable
          caption="บันทึกการสังเกตพาร์โทกราฟ"
          columns={COLUMNS}
          rows={partogram.observations}
          rowKey={(o) => o.id}
          maxHeight={480}
          empty="ไม่พบบันทึกการสังเกต"
        />
      </SectionCard>
    </div>
  );
}

