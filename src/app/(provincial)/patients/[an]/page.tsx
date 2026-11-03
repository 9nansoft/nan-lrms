'use client';
// Patient detail (provincial, read-only) — composition on foundation blocks
// (sub-project 3 spec). Data: usePatient / usePartogram / useMaternalScreenings
// with unchanged SWR keys and a debounced SSE refresh. No zoom: legibility
// comes from the type scale (spec D6), and the partograph renders at its
// native width inside a scrolling card (D7).

import { use, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, HeartPulse, LineChart, Printer, Waves } from 'lucide-react';
import { debounceLeadingTrailing, SSE_REFRESH_DEBOUNCE_MS } from '@/lib/debounce';
import { usePatient } from '@/hooks/usePatient';
import { usePartogram } from '@/hooks/usePartogram';
import { useMaternalScreenings } from '@/hooks/useMaternalScreenings';
import { useSSE } from '@/hooks/useSSE';
import { useSetBreadcrumbs } from '@/components/layout/BreadcrumbContext';
import { PatientHeader } from '@/components/patient/PatientHeader';
import { ReferralBanner } from '@/components/patient/ReferralBanner';
import { StickyPatientHeader } from '@/components/patient/StickyPatientHeader';
import { QuickStatsBar } from '@/components/patient/QuickStatsBar';
import { CurrentVitalsPanel } from '@/components/patient/CurrentVitalsPanel';
import { LaborProgressCard } from '@/components/patient/LaborProgressCard';
import { MaternalScreeningCard } from '@/components/patient/MaternalScreeningCard';
import { CpdFactorBreakdown } from '@/components/patient/CpdFactorBreakdown';
import { ClinicalData } from '@/components/patient/ClinicalData';
import { ContractionTable } from '@/components/patient/ContractionTable';
import { PrintForm } from '@/components/patient/PrintForm';
import { AncSummaryCard } from '@/components/patient/detail/AncSummaryCard';
import { ReferralHistoryCard } from '@/components/patient/detail/ReferralHistoryCard';
import { NewbornOutcomesCard } from '@/components/patient/detail/NewbornOutcomesCard';
import { PartographWorkspace, cdssTabBadge } from '@/components/patient/detail/PartographWorkspace';
import { HighRiskAlert } from '@/components/shared/HighRiskAlert';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { SectionCard } from '@/components/shared/SectionCard';
import { FreshnessBadge } from '@/components/shared/FreshnessBadge';
import { HintButton } from '@/components/shared/HintButton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { maskName } from '@/lib/pii-mask';
import { cn } from '@/lib/utils';
import { describePatientLoadError } from '@/lib/actionable-errors';
import { RiskLevel } from '@/types/domain';
import { RISK_LEVELS, isHighRisk } from '@/config/risk-levels';
import { STATUS_TONE, type StatusTone } from '@/config/status-tone';

type WorkspaceTab = 'summary' | 'partograph' | 'contractions';

const TABS: Array<{ k: WorkspaceTab; label: string; icon: typeof HeartPulse }> = [
  { k: 'summary', label: 'สรุป', icon: HeartPulse },
  { k: 'partograph', label: 'พาร์โทกราฟ', icon: LineChart },
  { k: 'contractions', label: 'การหดรัดตัว', icon: Waves },
];

function badgeClass(tone: StatusTone): string {
  return cn(STATUS_TONE[tone].border, STATUS_TONE[tone].text);
}

export default function PatientDetailPage({ params }: { params: Promise<{ an: string }> }) {
  const { an: patientId } = use(params);
  const router = useRouter();
  const mainHeaderRef = useRef<HTMLDivElement>(null);
  // Frozen render-time anchor (react-hooks/purity forbids Date.now() in render).
  const [now] = useState<number>(() => Date.now());

  const {
    patient,
    cpdScore,
    journeyContext,
    vitals,
    contractions,
    isLoading,
    error,
    vitalsError,
    contractionsError,
    mutate,
    mutateVitals,
    mutateContractions,
  } = usePatient(patientId);
  const { partogram, error: partogramError, mutate: mutatePartogram } = usePartogram(patientId);
  // SEPARATE hook, not folded into usePatient's composite isLoading (GC-U4 /
  // plan Task U3) — this provisional, flag-gated feed must never block first
  // paint of the rest of the page.
  const screenings = useMaternalScreenings(patientId);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('summary');

  useSetBreadcrumbs([{ label: 'แดชบอร์ด', href: '/' }, { label: `AN ${patientId}` }]);

  // Debounced SSE reaction (2026-07-17 incident: refetch-per-event across
  // continuous sync cycles). Stable across renders via the SWR mutates.
  const screeningsMutate = screenings.mutate;
  const debouncedSseRefresh = useMemo(
    () =>
      debounceLeadingTrailing(() => {
        mutate();
        screeningsMutate();
      }, SSE_REFRESH_DEBOUNCE_MS),
    [mutate, screeningsMutate],
  );
  useSSE({ onPatientUpdate: debouncedSseRefresh, onSyncComplete: debouncedSseRefresh });

  if (isLoading) return <LoadingState message="กำลังโหลดข้อมูลผู้คลอด..." />;

  if (error || !patient) {
    // /api/patients/[an] returns 400 (bad id format) / 404 / 500. No error
    // and no patient also means not found.
    const e = describePatientLoadError(error ?? { status: 404 });
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-5 md:px-6">
        <ErrorState message={e.message} remedy={e.remedy} detail={e.detail} onRetry={() => void mutate()} />
        <Link href="/" className="text-label text-brand underline">
          กลับหน้าแดชบอร์ด
        </Link>
      </div>
    );
  }

  const currentDilationCm = partogram?.entries?.length
    ? [...partogram.entries].sort((a, b) => new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime())[0]
        .dilationCm
    : null;
  const latestVitalAt = vitals.length > 0 ? vitals[vitals.length - 1].measuredAt : null;

  // Secondary feeds (vitals / contractions / partograph) load independently of
  // the main patient detail. When one fails we keep the detail on screen and
  // surface a non-blocking banner naming the failed feed(s); onRetry revalidates
  // only those feeds. The partograph tab additionally distinguishes its own
  // error state from the "no data yet" empty state.
  // Maternal-screening fetch failures only join the shared banner when the
  // feature is actually visible (uiEnabled) — flag-on failures surface via
  // the banner; flag-off failures stay silent in the UI by design (GC-U3 —
  // the route logs server-side; the enabling operator verifies the section
  // during rollout per spec 17.2 step 4).
  const screeningsFailed = Boolean(screenings.error) && screenings.uiEnabled;
  const failedFeeds = [
    { failed: Boolean(vitalsError), label: 'สัญญาณชีพ', retry: mutateVitals },
    { failed: Boolean(contractionsError), label: 'การหดรัดตัว', retry: mutateContractions },
    { failed: Boolean(partogramError), label: 'พาร์โทกราฟ', retry: mutatePartogram },
    { failed: screeningsFailed, label: 'การคัดกรองความเสี่ยงมารดา', retry: screenings.mutate },
  ]
    .filter((f) => f.failed)
    .map(({ label, retry }) => ({ label, retry: () => void retry() }));

  const badge = partogram ? cdssTabBadge(partogram.alerts) : null;
  const gpal = [patient.gravida != null ? `G${patient.gravida}` : null, patient.gaWeeks != null ? `GA${patient.gaWeeks}` : null]
    .filter(Boolean)
    .join(' ');
  const partographHeader = {
    an: patient.an,
    hn: patient.hn,
    patientName: maskName(patient.name),
    gpal: gpal || undefined,
    age: patient.age != null ? String(patient.age) : undefined,
    admitAt: patient.admitDate,
  };
  const cpd = cpdScore ? { score: cpdScore.score, riskLevel: cpdScore.riskLevel as RiskLevel } : null;

  return (
    <div className="@container min-h-full bg-surface-page">
      {cpdScore && isHighRisk(cpdScore.score) && <HighRiskAlert score={cpdScore.score} an={patient.an} />}

      <StickyPatientHeader
        name={patient.name}
        hn={patient.hn}
        an={patient.an}
        laborStatus={patient.laborStatus}
        hospitalName={patient.hospital.name}
        cpdScore={cpd}
        mainHeaderRef={mainHeaderRef}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-card px-4 py-2 md:px-6 print:hidden">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-label text-ink-muted hover:bg-surface-muted hover:text-brand"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          ย้อนกลับ
        </button>
        <div data-testid="sync-stamp" className="flex items-center gap-1">
          <FreshnessBadge lastSyncAt={patient.syncedAt} label="ข้อมูลจาก HOSxP" />
          <HintButton
            label="ความสดของข้อมูล"
            title="ความสดของข้อมูล"
            body={`เวลาที่ระบบดึงข้อมูลผู้คลอดรายนี้จาก HOSxP ${patient.hospital.name} ครั้งล่าสุด (รอบซิงก์ ~30 วินาที/รพ.) — เกิน 60 นาทีจุดเป็นสีเหลือง เกิน 24 ชั่วโมงเป็นสีแดง`}
            className="text-ink-muted"
          />
        </div>
      </div>

      <div ref={mainHeaderRef}>
        <PatientHeader
          hn={patient.hn}
          an={patient.an}
          name={patient.name}
          age={patient.age}
          admitDate={patient.admitDate}
          laborStatus={patient.laborStatus}
          weightKg={patient.weightKg}
          weightDiffKg={patient.weightDiffKg}
          hospital={patient.hospital}
          cpdScore={cpd}
        />
      </div>

      {cpdScore && cpdScore.riskLevel !== RiskLevel.LOW && (
        <ReferralBanner
          score={cpdScore.score}
          riskLevel={cpdScore.riskLevel as RiskLevel}
          recommendation={cpdScore.recommendation ?? RISK_LEVELS[cpdScore.riskLevel as RiskLevel].action}
        />
      )}

      <div className="flex flex-col gap-5 px-4 py-5 md:px-6">
        <QuickStatsBar
          age={patient.age}
          gravida={patient.gravida}
          para={patient.para}
          abortion={patient.abortion}
          livingChildren={patient.livingChildren}
          gaWeeks={patient.gaWeeks}
          gaDay={patient.gaDay}
          ancCount={patient.ancCount}
          admitDate={patient.admitDate}
          laborStatus={patient.laborStatus}
          currentDilationCm={currentDilationCm}
          latestVitalAt={latestVitalAt}
        />

        {journeyContext && <AncSummaryCard journey={journeyContext} now={now} />}

        {journeyContext && journeyContext.referrals.length > 0 && (
          <div data-testid="patient-referrals">
            <ReferralHistoryCard referrals={journeyContext.referrals} />
          </div>
        )}

        {/* Section 3.7: Maternal labor-triage screening (Phase 4, shadow mode).
            Flag-gated per GC-U3: the API always computes `uiEnabled`
            server-side from MATERNAL_SCREEN_UI_ENABLED (default ON since the
            2026-07-16 operator decision; explicit 'false' opts out) — when
            disabled this block renders nothing. Its own section (not inside a
            workspace tab) so it stays visible on every tab; it is independent
            of partogram/CPD data, like the ANC and referral sections above. */}
        {screenings.uiEnabled && (
          <div data-testid="patient-maternal-screening">
            <SectionCard
              title="การคัดกรองความเสี่ยงมารดา (รอคลอด)"
              description="โหมดเงา — กฎคัดกรองยังไม่ได้รับการรับรองทางคลินิก"
            >
              <MaternalScreeningCard
                data={{
                  latest: screenings.latest,
                  history: screenings.history,
                  nextCursor: screenings.nextCursor,
                  uiEnabled: screenings.uiEnabled,
                }}
                isLoading={screenings.isLoading}
                error={screenings.error}
                onRetry={() => screenings.mutate()}
              />
            </SectionCard>
          </div>
        )}

        {failedFeeds.length > 0 && (
          <ErrorState
            variant="banner"
            message={`โหลดข้อมูลบางส่วนไม่สำเร็จ: ${failedFeeds.map((f) => f.label).join(' / ')}`}
            remedy="กด ลองใหม่ เพื่อโหลดเฉพาะส่วนนี้อีกครั้ง ส่วนอื่นของหน้ายังเป็นข้อมูลล่าสุด"
            onRetry={() => failedFeeds.forEach((f) => f.retry())}
          />
        )}

        <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
          <div role="group" aria-label="มุมมองข้อมูลผู้คลอด" className="inline-flex overflow-hidden rounded-lg border border-border bg-surface-card">
            {TABS.map((t) => {
              const active = activeTab === t.k;
              const Icon = t.icon;
              return (
                <button
                  key={t.k}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setActiveTab(t.k)}
                  className={cn(
                    'inline-flex h-10 items-center gap-1.5 border-l border-border px-4 text-label first:border-l-0',
                    active ? 'bg-brand-soft text-brand-strong' : 'text-ink-muted hover:bg-surface-muted',
                  )}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  {t.label}
                  {t.k === 'partograph' && badge && (
                    <span className={cn('rounded-full border px-2 text-caption font-semibold', badgeClass(badge.tone))}>
                      {badge.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <span className="ml-auto text-label text-ink-muted">ดูอย่างเดียว · มุมมองระดับจังหวัด</span>
          <Dialog>
            <DialogTrigger
              render={
                <Button variant="outline" className="h-10 border-border px-3 text-label text-brand hover:bg-brand-soft print:hidden" />
              }
            >
              <Printer aria-hidden="true" className="mr-1.5 h-4 w-4" />
              พิมพ์
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <PrintForm patient={patient} hospitalName={patient.hospital.name} vitals={vitals} />
              <div className="flex justify-end gap-2">
                <Button onClick={() => window.print()} className="bg-brand text-white hover:bg-brand-strong">
                  พิมพ์
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {activeTab === 'summary' && (
          <div className="@container flex flex-col gap-5">
            {journeyContext && journeyContext.newborns.length > 0 && (
              <div data-testid="patient-newborns">
                <NewbornOutcomesCard newborns={journeyContext.newborns} />
              </div>
            )}
            <div className="grid grid-cols-1 items-start gap-5 @min-[1100px]:grid-cols-2">
              <SectionCard title="สัญญาณชีพและความก้าวหน้า" description="ค่าล่าสุดจาก HOSxP พร้อมแนวโน้ม">
                <div className="flex flex-col gap-3">
                  <CurrentVitalsPanel vitals={vitals} />
                  <LaborProgressCard
                    admitDate={patient.admitDate}
                    laborStatus={patient.laborStatus}
                    partogramEntries={partogram?.entries ?? null}
                    contractions={contractions}
                  />
                </div>
              </SectionCard>
              <SectionCard title="ข้อมูลคลินิก" description="ค่าแรกรับและปัจจัยเสี่ยง CPD">
                <div className="flex flex-col gap-3">
                  {cpdScore && (
                    <CpdFactorBreakdown
                      score={cpdScore.score}
                      riskLevel={cpdScore.riskLevel}
                      factors={cpdScore.factors}
                      missingFactors={cpdScore.missingFactors}
                      calculatedAt={cpdScore.calculatedAt}
                    />
                  )}
                  <ClinicalData
                    gravida={patient.gravida}
                    para={patient.para}
                    abortion={patient.abortion}
                    livingChildren={patient.livingChildren}
                    pregNo={patient.pregNo}
                    gaWeeks={patient.gaWeeks}
                    gaDay={patient.gaDay}
                    ancCount={patient.ancCount}
                    heightCm={patient.heightCm}
                    weightKg={patient.weightKg}
                    weightDiffKg={patient.weightDiffKg}
                    prePregnancyWeightKg={patient.prePregnancyWeightKg}
                    fundalHeightCm={patient.fundalHeightCm}
                    usWeightG={patient.usWeightG}
                    hematocritPct={patient.hematocritPct}
                    bpSystolicAdmit={patient.bpSystolicAdmit}
                    bpDiastolicAdmit={patient.bpDiastolicAdmit}
                    pulseAdmit={patient.pulseAdmit}
                    rrAdmit={patient.rrAdmit}
                    temperatureAdmit={patient.temperatureAdmit}
                    cervicalOpenCmAdmit={patient.cervicalOpenCmAdmit}
                    effacementPctAdmit={patient.effacementPctAdmit}
                    stationAdmit={patient.stationAdmit}
                  />
                </div>
              </SectionCard>
            </div>
          </div>
        )}

        {activeTab === 'partograph' && (
          <PartographWorkspace
            partogram={partogram}
            error={partogramError}
            onRetry={() => void mutatePartogram()}
            vitals={vitals}
            header={partographHeader}
          />
        )}

        {activeTab === 'contractions' && <ContractionTable contractions={contractions} />}
      </div>
    </div>
  );
}

