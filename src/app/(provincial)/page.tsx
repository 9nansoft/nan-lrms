// Dashboard — Province-wide situational-awareness surface.
// Redesigned 2026-04-21 per docs/plans/2026-04-21-dashboard-redesign-brief.md
// following the Claude Design handoff bundle. Air-traffic-control aesthetic,
// institutional-navy accent, shared IA across normal + kiosk modes.
'use client';

import { useState } from 'react';
import { useDashboard } from '@/hooks/useDashboard';
import { useHighRiskPatients } from '@/hooks/useHighRiskPatients';
import { useSSE } from '@/hooks/useSSE';
import { useKioskMode } from '@/hooks/useKioskMode';
import { useSyncTrigger } from '@/hooks/useSyncTrigger';
import { useSetBreadcrumbs } from '@/components/layout/BreadcrumbContext';
import { AlertBar } from '@/components/dashboard/AlertBar';
import { ProvinceVitalsStrip } from '@/components/dashboard/ProvinceVitalsStrip';
import { HighRiskPatientList } from '@/components/dashboard/HighRiskPatientList';
import { HospitalTable } from '@/components/dashboard/HospitalTable';
import { ProvinceMap } from '@/components/dashboard/ProvinceMap';
import { StageKPICards } from '@/components/dashboard/StageKPICards';
import { ShiftSummary } from '@/components/dashboard/ShiftSummary';
import { SectionLabel } from '@/components/dashboard/shared';
import { KioskHeader } from '@/components/dashboard/KioskHeader';
import { SimulationControl } from '@/components/dashboard/SimulationControl';
import { HospitalDetailDialog } from '@/components/dashboard/HospitalDetailDialog';
import { LoadingState } from '@/components/shared/LoadingState';
import { ConnectionStatus as ConnectionStatusEnum } from '@/types/domain';
import { Monitor, RefreshCw, Maximize2, Expand } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export default function DashboardPage() {
  useSetBreadcrumbs([{ label: 'แดชบอร์ด' }]);
  const { hospitals, summary, stageKPIs, alerts, trends, updatedAt, isLoading, mutate } =
    useDashboard();
  const { patients: highRiskPatients, isLoading: hrLoading, mutate: hrMutate } =
    useHighRiskPatients();
  const { isKiosk, toggleKiosk, exitKiosk } = useKioskMode();
  const [overviewMode, setOverviewMode] = useState<'map' | 'list'>('map');
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [selectedHospital, setSelectedHospital] = useState<string | null>(null);
  const [detailHcode, setDetailHcode] = useState<string | null>(null);
  const openHospitalDetail = (hcode: string | null) => {
    setSelectedHospital(hcode);
    if (hcode) setDetailHcode(hcode);
  };

  const refreshAll = () => {
    mutate();
    hrMutate();
  };
  const { syncing, triggerSync } = useSyncTrigger(refreshAll);

  useSSE({
    onPatientUpdate: refreshAll,
    onConnectionStatus: () => mutate(),
    onSyncComplete: refreshAll,
  });

  if (isLoading) {
    return <LoadingState message="กำลังโหลด Dashboard..." />;
  }

  const onlineCount = hospitals.filter(
    (h) => h.connectionStatus === ConnectionStatusEnum.ONLINE,
  ).length;

  // ═══════════════════════════════════════════════════════════════
  // KIOSK MODE — 1920×1080 wall display, dark phosphor-glow palette
  // ═══════════════════════════════════════════════════════════════
  if (isKiosk) {
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
          onExit={exitKiosk}
          onlineCount={onlineCount}
          totalCount={hospitals.length}
        />

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
            <ProvinceVitalsStrip summary={summary} trends={trends} />
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
                  onSelect={openHospitalDetail}
                  mode="kiosk"
                  size="full"
                />
              </div>
              <div
                className="flex justify-between font-mono text-[11px] tracking-[0.12em]"
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
          className="flex gap-5 border-t px-7 py-2 font-mono text-[11px] tracking-[0.14em]"
          style={{ borderColor: 'var(--kiosk-rule)', color: 'var(--kiosk-dim)' }}
        >
          <span>KK-LRMS</span>
          <span>PPHO WAR-ROOM</span>
          <span>MCH PROVINCIAL NETWORK</span>
          <span className="flex-1" />
          <span>SSE · STREAM OK</span>
          <span>
            {onlineCount}/{hospitals.length} ONLINE
          </span>
          <span style={{ color: 'var(--kiosk-ink)' }}>ESC TO EXIT</span>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // NORMAL MODE — desk/laptop, interactive, air-traffic-control aesthetic
  // ═══════════════════════════════════════════════════════════════
  return (
    <div
      style={{
        background: 'var(--surface-cool)',
        // Uniformly scale dashboard content up so every pixel-size baked into
        // components (text-[11px], stat 44px numbers, 320-px map panel, etc.)
        // grows proportionally. Dialogs live in portals so they stay at their
        // normal size. Kiosk mode has its own wall-display sizing and isn't
        // affected (it returns earlier).
        zoom: 1.15,
      }}
    >
      {/* 00 — Dashboard-specific control strip (sits under the shared
           TopNavBar rendered by the provincial layout). Brand + nav + user
           already come from TopNavBar; here we expose only the controls
           unique to the dashboard itself: live status, sync, simulate,
           kiosk toggle. */}
      <div
        className="flex flex-wrap items-center gap-3 bg-white px-5 py-2 font-mono text-[11px]"
        style={{ borderBottom: '1px solid var(--rule-strong)', color: 'var(--ink-navy-dim)' }}
      >
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{
              background: 'var(--risk-low)',
              boxShadow: '0 0 0 3px rgba(34,197,94,0.22)',
            }}
            aria-hidden="true"
          />
          <span className="font-semibold text-[var(--ink-navy)]">LIVE · SSE OK</span>
        </span>
        <span className="tabular-nums">
          <span className="font-semibold text-[var(--ink-navy)]">{onlineCount}</span>
          <span className="text-[var(--ink-navy-muted)]">/{hospitals.length}</span> ONLINE
        </span>
        {updatedAt && (
          <span className="tabular-nums">
            UPDATED{' '}
            <span className="font-semibold text-[var(--ink-navy)]">
              {new Date(updatedAt).toLocaleTimeString('th-TH', {
                timeZone: 'Asia/Bangkok',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })}
            </span>
          </span>
        )}
        <span className="text-[var(--ink-navy-muted)]">· {hospitals.length} NODES</span>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => triggerSync()}
            disabled={syncing}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border bg-white px-2.5 py-1.5 font-mono text-[11px] font-medium tracking-[0.06em] transition-colors hover:bg-[var(--accent-navy-soft)] disabled:opacity-50"
            style={{ borderColor: 'var(--rule-strong)', color: 'var(--ink-navy-dim)' }}
            title="ดึงข้อมูลทันที"
          >
            <RefreshCw className={cn('h-3 w-3', syncing && 'animate-spin')} />
            ดึงข้อมูล
          </button>
          {process.env.NODE_ENV !== 'production' && <SimulationControl />}
          <button
            onClick={toggleKiosk}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-white transition-colors"
            style={{ background: 'var(--accent-navy)' }}
            title="เปิดโหมดจอภาพ (Kiosk Mode)"
          >
            <Monitor className="h-3.5 w-3.5" />
            โหมดจอภาพ
          </button>
        </div>
      </div>

      {/* 01 — Alert ribbon (persistent, ALL CLEAR state) */}
      <AlertBar alerts={alerts} />

      {/* 02 — Province vitals strip (total + H/M/L + 24h admissions) */}
      <ProvinceVitalsStrip summary={summary} trends={trends} />

      {/* 03 + 04 — Main grid: HIGH-risk table + Province map/list */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px]">
        {/* LEFT — HIGH-risk table (+ Stage KPIs below) */}
        <div
          className="border-r border-[var(--rule-strong)] bg-white p-5"
          style={{ minWidth: 0 }}
        >
          <HighRiskPatientList patients={highRiskPatients} isLoading={hrLoading} />

          {/* 05 — Stage KPIs (demoted below fold) */}
          <div className="mt-6">
            <SectionLabel idx={5} right={<span>CARE CONTINUUM</span>}>
              Stage KPIs
            </SectionLabel>
            <div className="mt-2.5">
              <StageKPICards stageKPIs={stageKPIs} />
            </div>
          </div>
        </div>

        {/* RIGHT — Province overview + shift summary */}
        <div className="flex flex-col gap-3.5 bg-white p-5">
          <div>
            <SectionLabel
              idx={3}
              right={
                <span className="flex gap-2">
                  <button
                    onClick={() => setOverviewMode('map')}
                    className={cn(
                      'cursor-pointer border-b-[1.5px] bg-transparent px-2.5 py-1 font-mono text-[10px] tracking-[0.1em]',
                      overviewMode === 'map' ? 'font-semibold' : 'font-normal',
                    )}
                    style={{
                      color: overviewMode === 'map' ? 'var(--accent-navy)' : 'var(--ink-navy-muted)',
                      borderColor:
                        overviewMode === 'map' ? 'var(--accent-navy)' : 'transparent',
                    }}
                  >
                    MAP
                  </button>
                  <button
                    onClick={() => setOverviewMode('list')}
                    className={cn(
                      'cursor-pointer border-b-[1.5px] bg-transparent px-2.5 py-1 font-mono text-[10px] tracking-[0.1em]',
                      overviewMode === 'list' ? 'font-semibold' : 'font-normal',
                    )}
                    style={{
                      color: overviewMode === 'list' ? 'var(--accent-navy)' : 'var(--ink-navy-muted)',
                      borderColor:
                        overviewMode === 'list' ? 'var(--accent-navy)' : 'transparent',
                    }}
                  >
                    LIST
                  </button>
                  <button
                    onClick={() => setOverviewOpen(true)}
                    className="ml-1 inline-flex cursor-pointer items-center gap-1 rounded-sm bg-transparent px-2 py-1 font-mono text-[10px] tracking-[0.1em] transition-colors hover:bg-[var(--accent-navy-soft)]"
                    style={{ color: 'var(--ink-navy-muted)' }}
                    aria-label="ขยายแผนที่เต็มจอ"
                    title="ขยายเต็มจอ (Expand)"
                  >
                    <Expand className="h-3 w-3" />
                    EXPAND
                  </button>
                </span>
              }
            >
              Province overview
            </SectionLabel>
          </div>

          {overviewMode === 'map' ? (
            <div
              className="border border-[var(--rule-strong)] bg-white"
              style={{ height: 320 }}
            >
              <ProvinceMap
                hospitals={hospitals}
                selected={selectedHospital}
                onSelect={openHospitalDetail}
              />
            </div>
          ) : null}

          <div>
            <div className="flex justify-between px-0.5 py-1 font-mono text-[10px] tracking-[0.12em] text-[var(--ink-navy-muted)]">
              <span>HOSPITAL · SORTED BY SEVERITY</span>
              <span>{hospitals.length} NODES</span>
            </div>
            <HospitalTable
              hospitals={hospitals}
              selected={selectedHospital}
              onSelect={openHospitalDetail}
            />
          </div>

          {/* 06 — Shift summary */}
          <ShiftSummary trends={trends} />
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex justify-between border-t border-[var(--rule-strong)] px-5 py-2.5 font-mono text-[10px] tracking-[0.1em] text-[var(--ink-navy-muted)]"
        style={{ background: 'var(--surface-cool)' }}
      >
        <span>KK-LRMS · PPHO WAR-ROOM · MCH PROVINCIAL NETWORK</span>
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            SSE STREAM OK
          </span>
          <span>
            {onlineCount}/{hospitals.length} NODES LIVE
          </span>
          <button
            onClick={toggleKiosk}
            className="hidden items-center gap-1 rounded-sm border border-[var(--rule-strong)] bg-white px-2 py-0.5 text-[var(--ink-navy-dim)] hover:bg-[var(--accent-navy-soft)] hover:text-[var(--accent-navy)] md:inline-flex"
            title="เปิดโหมดจอภาพ"
          >
            <Maximize2 className="h-3 w-3" />
            KIOSK
          </button>
        </span>
      </div>

      {/* Hospital detail dialog — opens from map pin or table row */}
      <HospitalDetailDialog
        hcode={detailHcode}
        hospital={hospitals.find((h) => h.hcode === detailHcode)}
        allHighRiskPatients={highRiskPatients}
        open={detailHcode !== null}
        onClose={() => setDetailHcode(null)}
      />

      {/* Section 03 expand dialog — full-viewport map + list */}
      <Dialog open={overviewOpen} onOpenChange={setOverviewOpen}>
        <DialogContent
          className="!max-w-[96vw] h-[92vh] w-[96vw] gap-0 overflow-hidden p-0 sm:max-w-[96vw]"
          style={{ background: 'var(--surface-cool)' }}
        >
          <DialogHeader className="flex flex-row items-center justify-between gap-4 border-b px-5 py-3"
                        style={{ borderColor: 'var(--rule-strong)', background: 'var(--accent-navy)' }}>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-[10px] font-bold tracking-[0.18em] text-[#ffe89a]">
                03
              </span>
              <DialogTitle className="text-[18px] font-semibold uppercase tracking-[0.08em] text-white">
                Province overview
              </DialogTitle>
              <DialogDescription className="font-mono text-[11px] tracking-[0.12em] text-white/70">
                {onlineCount}/{hospitals.length} ONLINE · ESC TO CLOSE
              </DialogDescription>
            </div>
            <div className="flex gap-1 pr-10">
              <button
                onClick={() => setOverviewMode('map')}
                className={cn(
                  'cursor-pointer rounded-sm px-3 py-1.5 font-mono text-[11px] tracking-[0.1em] transition-colors',
                  overviewMode === 'map' ? 'bg-white font-semibold' : 'bg-white/10 text-white hover:bg-white/20',
                )}
                style={{ color: overviewMode === 'map' ? 'var(--accent-navy-strong)' : undefined }}
              >
                MAP
              </button>
              <button
                onClick={() => setOverviewMode('list')}
                className={cn(
                  'cursor-pointer rounded-sm px-3 py-1.5 font-mono text-[11px] tracking-[0.1em] transition-colors',
                  overviewMode === 'list' ? 'bg-white font-semibold' : 'bg-white/10 text-white hover:bg-white/20',
                )}
                style={{ color: overviewMode === 'list' ? 'var(--accent-navy-strong)' : undefined }}
              >
                LIST
              </button>
            </div>
          </DialogHeader>

          {/* Split: large map on left, hospital list on right */}
          <div
            className="grid flex-1 overflow-hidden"
            style={{
              gridTemplateColumns:
                overviewMode === 'list' ? '1fr' : 'minmax(0, 2fr) minmax(420px, 1fr)',
              minHeight: 0,
            }}
          >
            {overviewMode === 'map' && (
              <div className="min-h-0 border-r bg-white" style={{ borderColor: 'var(--rule-strong)' }}>
                <ProvinceMap
                  hospitals={hospitals}
                  selected={selectedHospital}
                  onSelect={openHospitalDetail}
                  size="full"
                />
              </div>
            )}
            <div className="flex min-h-0 flex-col overflow-hidden bg-white p-4">
              <div className="mb-2 flex justify-between px-1 font-mono text-[10px] tracking-[0.12em] text-[var(--ink-navy-muted)]">
                <span>HOSPITAL · SORTED BY SEVERITY</span>
                <span>{hospitals.length} NODES</span>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <HospitalTable
                  hospitals={hospitals}
                  selected={selectedHospital}
                  onSelect={openHospitalDetail}
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
