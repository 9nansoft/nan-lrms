// src/components/dashboard/province/KioskDashboard.tsx
// KIOSK MODE — 1920×1080 wall display, dark phosphor-glow palette.
// Moved verbatim from src/app/(provincial)/page.tsx in UI sub-project 2. The
// kiosk is NOT redesigned: KioskDashboard.test.tsx pins its labels and
// structure so normal-mode restyles cannot leak in.
'use client';

import { AlertBar } from '@/components/dashboard/AlertBar';
import { ProvinceVitalsStrip } from '@/components/dashboard/ProvinceVitalsStrip';
import { HighRiskPatientList } from '@/components/dashboard/HighRiskPatientList';
import { ProvinceMap } from '@/components/dashboard/ProvinceMap';
import { SectionLabel } from '@/components/dashboard/shared';
import { KioskHeader } from '@/components/dashboard/KioskHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { SSE_STATUS_META } from '@/config/sse-status';
import type { SseConnectionState } from '@/hooks/useSSE';
import type {
  DashboardAlerts,
  DashboardContinuum,
  DashboardHospital,
  DashboardSummary,
  DashboardTrends,
  HighRiskPatient,
} from '@/types/api';

export interface KioskDashboardProps {
  hospitals: DashboardHospital[];
  summary: DashboardSummary;
  trends: DashboardTrends;
  continuum: DashboardContinuum | null;
  alerts: DashboardAlerts;
  highRiskPatients: HighRiskPatient[];
  hrLoading: boolean;
  updatedAt: string | null;
  dataStale: boolean;
  onRetry: () => void;
  freshCount: number;
  reportingCount: number;
  sseState: SseConnectionState;
  selectedHospital: string | null;
  onSelectHospital: (hcode: string | null) => void;
  onExit: () => void;
}

export function KioskDashboard({
  hospitals,
  summary,
  trends,
  continuum,
  alerts,
  highRiskPatients,
  hrLoading,
  updatedAt,
  dataStale,
  onRetry,
  freshCount,
  reportingCount,
  sseState,
  selectedHospital,
  onSelectHospital,
  onExit,
}: KioskDashboardProps) {
  const ancFallback = continuum ? { hr3: continuum.anc.hr3, dueSoon: continuum.anc.dueSoon } : null;
  const sseMeta = SSE_STATUS_META[sseState];
  return (
    <div
      className="min-h-screen text-[var(--kiosk-ink)]"
      style={{
        background: 'var(--kiosk-bg)',
        backgroundImage:
          'radial-gradient(ellipse at 50% 0%, rgba(87,196,255,0.06), transparent 55%)',
      }}
    >
      <KioskHeader
        updatedAt={updatedAt}
        onExit={onExit}
        onlineCount={freshCount}
        totalCount={hospitals.length}
      />

      {dataStale && (
        <ErrorState
          variant="banner"
          message="การเชื่อมต่อล้มเหลว — แสดงข้อมูลเดิมจากแคช"
          lastUpdatedAt={updatedAt}
          onRetry={onRetry}
        />
      )}

      <div className="px-7 pt-4 pb-4 space-y-4">
        {/* 01 — Alerts ribbon (kiosk variant) */}
        <div
          className="border"
          style={{ borderColor: 'var(--kiosk-rule)', background: 'var(--kiosk-panel)' }}
        >
          <AlertBar alerts={alerts} />
        </div>

        {/* 02 — Province vitals (reuses normal component; will need kiosk variant later) */}
        <div
          className="border"
          style={{ borderColor: 'var(--kiosk-rule)', background: 'var(--kiosk-panel)' }}
        >
          <ProvinceVitalsStrip summary={summary} trends={trends} continuum={continuum} />
        </div>

        {/* 03+04 — HIGH-risk + Province map (side-by-side, kiosk privacy on list) */}
        <div className="grid grid-cols-12 gap-4">
          <div
            className="col-span-7 border p-4"
            style={{ borderColor: 'var(--kiosk-rule)', background: 'var(--kiosk-panel)' }}
          >
            <HighRiskPatientList
              patients={highRiskPatients}
              isLoading={hrLoading}
              variant="kiosk"
              maxRows={8}
              ancFallback={ancFallback}
              totalActive={summary?.totalActive}
              totalHigh={summary?.totalHigh}
            />
          </div>
          <div
            className="col-span-5 flex flex-col gap-3 border p-4"
            style={{ borderColor: 'var(--kiosk-rule)', background: 'var(--kiosk-panel)' }}
          >
            <SectionLabel idx={4} right={<span>{hospitals.length} NODES</span>}>
              Province map
            </SectionLabel>
            <div
              className="flex-1 border"
              style={{ borderColor: 'var(--kiosk-rule)', minHeight: 360 }}
            >
              <ProvinceMap
                hospitals={hospitals}
                selected={selectedHospital}
                onSelect={onSelectHospital}
                mode="kiosk"
                size="full"
              />
            </div>
            <div
              className="flex justify-between font-mono text-caption tracking-[0.12em]"
              style={{ color: 'var(--kiosk-dim)' }}
            >
              <span>
                <span style={{ color: 'var(--kiosk-high)' }}>●</span> HIGH
              </span>
              <span>
                <span style={{ color: 'var(--kiosk-med)' }}>●</span> MED
              </span>
              <span>
                <span style={{ color: 'var(--kiosk-low)' }}>●</span> LOW
              </span>
              <span>
                <span style={{ color: 'var(--kiosk-dim)' }}>○</span> IDLE
              </span>
              <span>
                <span style={{ color: 'var(--kiosk-high)' }}>✕</span> OFFLINE
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom status strip */}
      <div
        className="flex gap-5 border-t px-7 py-2 font-mono text-caption tracking-[0.14em]"
        style={{ borderColor: 'var(--kiosk-rule)', color: 'var(--kiosk-dim)' }}
      >
        <span>NN-LRMS</span>
        <span>PPHO WAR-ROOM</span>
        <span>MCH PROVINCIAL NETWORK</span>
        <span className="flex-1" />
        <span style={{ color: sseState === 'connected' ? undefined : 'var(--kiosk-med)' }}>
          {sseMeta.stream}
        </span>
        <span>
          {freshCount}/{reportingCount} DATA FRESH
        </span>
        <span style={{ color: 'var(--kiosk-ink)' }}>ESC TO EXIT</span>
      </div>
    </div>
  );
}
