// งานที่ต้องจัดการ — the three actionable alert counts, each linking to its
// pre-filtered board (normal mode; the kiosk keeps AlertBar).
'use client';

import type { DashboardAlerts } from '@/types/api';
import { SectionCard } from '@/components/shared/SectionCard';
import { KpiGrid } from '@/components/shared/KpiGrid';
import { KpiTile, type KpiTone } from '@/components/shared/KpiTile';
import { ALERT_DEFINITIONS, alarmTotal, type AlertDefinition } from './alert-definitions';

const WORKLOAD_NOTE = 'ใกล้คลอดเป็นภาระงานล่วงหน้า ไม่นับรวม';

function toneFor(def: AlertDefinition, value: number): KpiTone {
  if (value <= 0) return 'ok';
  return def.kind === 'alarm' ? 'high' : 'warn';
}

export function AlertsSection({ alerts }: { alerts: DashboardAlerts }) {
  const total = alarmTotal(alerts);
  const description =
    total > 0
      ? `งานเร่งด่วนรวม ${total.toLocaleString('en-US')} รายการ — ส่งต่อเกิน SLA และขาดนัด ANC (${WORKLOAD_NOTE})`
      : `ไม่มีงานเร่งด่วน — ${WORKLOAD_NOTE}`;
  return (
    <SectionCard title="งานที่ต้องจัดการ" description={description}>
      <KpiGrid>
        {ALERT_DEFINITIONS.map((def) => {
          const value = alerts[def.key];
          return (
            <KpiTile
              key={def.key}
              testId={def.testId}
              label={def.label}
              count={value}
              href={def.href}
              tone={toneFor(def, value)}
              sub={value > 0 ? 'กดเพื่อเปิดรายชื่อ' : def.zeroLabelTh}
              hint={{ title: def.tooltipTitle, body: def.tooltipBodyTh }}
            />
          );
        })}
      </KpiGrid>
    </SectionCard>
  );
}
