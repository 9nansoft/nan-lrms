// Provincial dashboard `/` — province-wide situational awareness for ward
// nurses and coordinators. UI sub-project 2 (2026-10-11): a thin composition
// over useProvinceDashboard (SWR + debounced SSE + browser poll) and the
// section components in src/components/dashboard/province/. The kiosk keeps
// its own frozen dark layout (KioskDashboard).
// Spec: docs/superpowers/specs/2026-10-11-ui-dashboard-design.md
'use client';

import { useState } from 'react';
import { NETWORK_RETRY_REMEDY } from '@/lib/actionable-errors';
import { useSetBreadcrumbs } from '@/components/layout/BreadcrumbContext';
import { useKioskMode } from '@/hooks/useKioskMode';
import { useProvinceDashboard } from '@/hooks/useProvinceDashboard';
import { PageHeader } from '@/components/shared/PageHeader';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { HospitalDetailDialog } from '@/components/dashboard/HospitalDetailDialog';
import { ShiftSummary } from '@/components/dashboard/ShiftSummary';
import { KioskDashboard } from '@/components/dashboard/province/KioskDashboard';
import { DashboardHeaderActions } from '@/components/dashboard/province/DashboardHeaderActions';
import { OnboardingWebhookAlert } from '@/components/dashboard/province/OnboardingWebhookAlert';
import { AlertsSection } from '@/components/dashboard/province/AlertsSection';
import { LaborVitalsSection } from '@/components/dashboard/province/LaborVitalsSection';
import { ContinuumSection } from '@/components/dashboard/province/ContinuumSection';
import { HighRiskSection } from '@/components/dashboard/province/HighRiskSection';
import { CareStageSection } from '@/components/dashboard/province/CareStageSection';
import { ProvinceOverviewPanel } from '@/components/dashboard/province/ProvinceOverviewPanel';
import { ProvinceOverviewDialog } from '@/components/dashboard/province/ProvinceOverviewDialog';
import { HosxpSyncDialog } from '@/components/dashboard/province/HosxpSyncDialog';
import type { OverviewMode } from '@/components/dashboard/province/OverviewModeToggle';

export default function DashboardPage() {
  useSetBreadcrumbs([{ label: 'แดชบอร์ด' }]);
  const d = useProvinceDashboard();
  const { isKiosk, toggleKiosk, exitKiosk } = useKioskMode();
  const [overviewMode, setOverviewMode] = useState<OverviewMode>('map');
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [selectedHospital, setSelectedHospital] = useState<string | null>(null);
  const [detailHcode, setDetailHcode] = useState<string | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [hosxpOpen, setHosxpOpen] = useState(false);

  // Map pin or list row: highlight the marker and open the hospital detail.
  const openHospitalDetail = (hcode: string | null) => {
    setSelectedHospital(hcode);
    if (hcode) setDetailHcode(hcode);
  };

  if (d.isLoading) return <LoadingState message="กำลังโหลดภาพรวมจังหวัด..." />;

  // Fetch failed with nothing cached — an all-zero dashboard is
  // indistinguishable from an empty province, so show the failure instead.
  if (d.error && !d.updatedAt) {
    return (
      <ErrorState
        message="ไม่สามารถโหลดข้อมูลภาพรวมจังหวัดได้"
        detail={d.error instanceof Error ? d.error.message : String(d.error)}
        remedy={NETWORK_RETRY_REMEDY}
        onRetry={d.refreshAll}
      />
    );
  }

  if (isKiosk) {
    return (
      <KioskDashboard
        hospitals={d.hospitals}
        summary={d.summary}
        trends={d.trends}
        continuum={d.continuum}
        alerts={d.alerts}
        highRiskPatients={d.highRiskPatients}
        hrLoading={d.hrLoading}
        updatedAt={d.updatedAt}
        dataStale={d.dataStale}
        onRetry={d.refreshAll}
        freshCount={d.freshCount}
        reportingCount={d.reportingCount}
        sseState={d.sseState}
        selectedHospital={selectedHospital}
        onSelectHospital={openHospitalDetail}
        onExit={exitKiosk}
      />
    );
  }

  return (
    <div className="@container min-h-full bg-surface-page">
      {/* Fetch failed but SWR still holds the last good payload — keep it on
          screen with its timestamp (Constitution VI). */}
      {d.dataStale && (
        <ErrorState
          variant="banner"
          message="การเชื่อมต่อล้มเหลว — แสดงข้อมูลเดิมจากแคช"
          lastUpdatedAt={d.updatedAt}
          remedy="ระบบจะลองใหม่อัตโนมัติทุก 30 วินาที หรือกด ลองใหม่"
          onRetry={d.refreshAll}
        />
      )}
      <div className="flex flex-col gap-5 px-4 py-5 md:px-6">
        <PageHeader
          title="ภาพรวมจังหวัดน่าน"
          subtitle="ผู้คลอดและหญิงตั้งครรภ์ทุกโรงพยาบาลที่ส่งข้อมูลเข้า NN-LRMS"
          freshness={{ lastSyncAt: d.updatedAt, label: 'ข้อมูลหน้านี้ ณ' }}
          actions={
            <DashboardHeaderActions
              sseState={d.sseState}
              hosxpStatus={d.hosxpStatus}
              hosxpDetail={d.hosxpDetail}
              onOpenHosxp={() => setHosxpOpen(true)}
              syncing={d.syncing}
              onSync={() => void d.triggerSync()}
              onKiosk={toggleKiosk}
            />
          }
        />
        {d.onboardingError && !onboardingDismissed && (
          <OnboardingWebhookAlert error={d.onboardingError} onDismiss={() => setOnboardingDismissed(true)} />
        )}
        {/* Two columns only when the page itself (not the viewport) is wide
            enough: the shell sidebar takes 232px. */}
        <div className="grid grid-cols-1 items-start gap-5 @min-[1160px]:grid-cols-[minmax(0,1fr)_400px]">
          <div className="flex min-w-0 flex-col gap-5">
            <AlertsSection alerts={d.alerts} />
            <LaborVitalsSection summary={d.summary} trends={d.trends} />
            {d.continuum && <ContinuumSection continuum={d.continuum} />}
            <HighRiskSection
              patients={d.highRiskPatients}
              isLoading={d.hrLoading}
              totalActive={d.summary.totalActive}
              totalHigh={d.summary.totalHigh}
              ancFallback={d.ancFallback}
            />
            <CareStageSection stageKPIs={d.stageKPIs} />
            <ShiftSummary trends={d.trends} />
          </div>
          <ProvinceOverviewPanel
            hospitals={d.hospitals}
            onlineCount={d.onlineCount}
            selected={selectedHospital}
            onSelect={openHospitalDetail}
            // One Leaflet map at a time: while the dialog is open the panel
            // behind it shows its list view (the map unmounts).
            mode={overviewOpen ? 'list' : overviewMode}
            onModeChange={setOverviewMode}
            onExpand={() => setOverviewOpen(true)}
          />
        </div>
      </div>

      <HospitalDetailDialog
        hcode={detailHcode}
        hospital={d.hospitals.find((h) => h.hcode === detailHcode)}
        allHighRiskPatients={d.highRiskPatients}
        open={detailHcode !== null}
        onClose={() => setDetailHcode(null)}
      />
      <ProvinceOverviewDialog
        open={overviewOpen}
        onOpenChange={setOverviewOpen}
        hospitals={d.hospitals}
        onlineCount={d.onlineCount}
        selected={selectedHospital}
        onSelect={openHospitalDetail}
        mode={overviewMode}
        onModeChange={setOverviewMode}
      />
      <HosxpSyncDialog
        open={hosxpOpen}
        onOpenChange={setHosxpOpen}
        state={d.hosxpSyncState}
        status={d.hosxpStatus}
        help={d.hosxpHelp}
      />
    </div>
  );
}
