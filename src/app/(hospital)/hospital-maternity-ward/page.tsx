// Hospital maternity-ward board — composition only (sub-project 3 spec).
// Rules: src/services/ward-board.ts · copy/tones: src/config/ward-display.ts ·
// error copy: src/lib/actionable-errors.ts.
//
// Data: WARD_BEDS_OCCUPANCY_FULL via useMaternityWardStateFull — the complete
// HOSxP roster for one ward (no row limit), so the KPI counts are server truth
// (spec D8). Vital-sign source split (project memory):
//   * BP / T / P / RR / SpO2 / pain  → ipd_nurse_note (latest by note_date+time)
//   * Cx / Stn / FHR / contractions / oxytocin / IV / amniotic
//                                    → ipt_labour_partograph (latest by observe_datetime)
'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useBmsSession } from '@/hooks/useBmsSession';
import {
  useMaternityWardStateFull,
  WARD_LIST_REFRESH_MS,
  WARD_OCCUPANCY_REFRESH_MS,
} from '@/hooks/useMaternityWardStateFull';
import { useHosxpBrowserSync } from '@/hooks/useHosxpBrowserSync';
import { useMaternalScreenSummaries } from '@/hooks/useMaternalScreenSummaries';
import { WardLayoutViewFull, type BedMovePayload } from '@/components/maternity/WardLayoutViewFull';
import { PatientDrawer } from '@/components/maternity/PatientDrawer';
import { WardHeaderActions } from '@/components/maternity/ward/WardHeaderActions';
import { WardKpis } from '@/components/maternity/ward/WardKpis';
import { OnboardingWebhookAlert } from '@/components/dashboard/province/OnboardingWebhookAlert';
import { HosxpSyncDialog } from '@/components/dashboard/province/HosxpSyncDialog';
import { DismissibleAlert } from '@/components/shared/DismissibleAlert';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { LoadingState } from '@/components/shared/LoadingState';
import { PageHeader } from '@/components/shared/PageHeader';
import { getBedMoveReasons, movePatientBed } from '@/services/maternity-ward';
import { findOccupantByAn, summarizeBeds } from '@/services/ward-board';
import { BED_MOVE_ALERTS, newbornsInWardNotice } from '@/config/ward-display';
import { InlineNotice } from '@/components/shared/InlineNotice';
import {
  describeBmsSessionError,
  describeWardFeedError,
  describeWardFeedStale,
  type WardFeed,
} from '@/lib/actionable-errors';

const REFRESH_SECONDS = WARD_OCCUPANCY_REFRESH_MS / 1000;
const WARD_LIST_MINUTES = WARD_LIST_REFRESH_MS / 60_000;

type WriteAlert = { title: string; remedy: string; tone: 'danger' | 'warn'; detail?: string };

function PageFrame({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-5 px-4 py-5 md:px-6">{children}</div>;
}

/** Ward data still in flight: a spinner and neutral skeletons, never bed tiles. */
function BoardLoading() {
  return (
    <>
      <LoadingState message="กำลังโหลดข้อมูลเตียงจาก HOSxP…" />
      <div
        aria-hidden="true"
        className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4"
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-72 animate-pulse rounded-2xl bg-surface-muted" />
        ))}
      </div>
    </>
  );
}

export default function HospitalMaternityWardPage() {
  const { isReady, error: sessionError, config, userInfo, marketplaceToken } = useBmsSession();
  // HOSxP → NN-LRMS sync — the same hook `/` mounts. Some hospitals only
  // ever open this page, and with server-side polling disabled this tab is
  // then the ONLY thing pushing their labour / partograph / ANC rows to the
  // central cache (and so to the provincial dashboard).
  const sync = useHosxpBrowserSync();
  const [hosxpOpen, setHosxpOpen] = useState(false);
  // Cross-source maternal-screen summaries (Phase 6 Task H4, GC-H4) — a
  // SEPARATE central-DB fetch, independent of the live HOSxP feed above. A
  // failed/slow fetch here degrades `byAn` to an empty map (see the hook),
  // so every bed tile renders exactly as it does today; it can never block
  // or error the ward board.
  const { byAn: maternalScreenSummaries, mutate: mutateScreenSummaries } =
    useMaternalScreenSummaries(userInfo?.hospcode ?? null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  const {
    wards,
    ward,
    selectedWard,
    setSelectedWard,
    beds,
    occupancy,
    newborns,
    bedsLoaded,
    occupancyLoaded,
    isLoading,
    error,
    wardsError,
    bedsError,
    occupancyError,
    failingSince,
    health,
    lastUpdatedAt,
    mutateWards,
    mutateBeds,
    mutateOccupancy,
  } = useMaternityWardStateFull();
  const [selectedAn, setSelectedAn] = useState<string | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [writeAlert, setWriteAlert] = useState<WriteAlert | null>(null);

  // 60s tick — drives hours-since-admit + stage classification.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Lazy-load bed-move reasons once a session is available. An empty list
  // makes the reason modal explain itself (Task 5) instead of a dead button.
  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    getBedMoveReasons(config)
      .then((rs) => {
        if (!cancelled) setReasons(rs);
      })
      .catch(() => {
        if (!cancelled) setReasons([]);
      });
    return () => {
      cancelled = true;
    };
  }, [config]);

  const refresh = () => {
    // The ward list is the key for beds + occupancy: with no ward yet (list
    // failed) only refetching it can recover the board.
    void mutateWards();
    void mutateBeds();
    void mutateOccupancy();
    // Push this hospital to NN-LRMS now (like "ดึงข้อมูลทันที" on `/`), then
    // re-read the one central-DB feed on this page. No-op mid-cycle.
    void sync.syncNow().then(() => mutateScreenSummaries());
  };

  if (sessionError) {
    const e = describeBmsSessionError(sessionError);
    return (
      <PageFrame>
        <ErrorState message={e.message} remedy={e.remedy} detail={e.detail} />
      </PageFrame>
    );
  }
  if (!isReady) {
    return (
      <PageFrame>
        <EmptyState
          illustration="stale"
          title="เปิดหน้านี้จาก HOSxP เพื่อใช้งาน"
          description="หน้านี้อ่านข้อมูลเตียงจาก HOSxP ของโรงพยาบาลโดยตรง จึงต้องเปิดจากเมนู NN-LRMS ใน HOSxP (ไม่พบ BMS Session)"
        />
      </PageFrame>
    );
  }
  // Full-page error only when nothing is on screen yet. Once a ward resolved,
  // a failing refresh keeps the cached board under a stale banner (constitution VI).
  if (error && !ward) {
    const e = describeWardFeedError(wardsError ?? error, { feed: 'wards', since: failingSince });
    return (
      <PageFrame>
        <ErrorState message={e.message} remedy={e.remedy} detail={e.detail} onRetry={refresh} />
      </PageFrame>
    );
  }
  if (!isLoading && wards.length === 0) {
    return (
      <PageFrame>
        <EmptyState
          illustration="ward"
          title="ไม่พบห้องคลอดใน HOSxP"
          description={`HOSxP ของโรงพยาบาลนี้ยังไม่มีวอร์ดห้องคลอดที่เปิดใช้งาน (ward.is_maternity_ward = 'Y' และ ward_active = 'Y') — แจ้งผู้ดูแล HOSxP ให้ตั้งค่า ระบบจะตรวจซ้ำอัตโนมัติทุก ${WARD_LIST_MINUTES} นาที`}
        />
      </PageFrame>
    );
  }
  if (isLoading || !ward) {
    return (
      <PageFrame>
        <BoardLoading />
      </PageFrame>
    );
  }

  // C1: the board renders only once BOTH the bed layout and the patient list
  // of this ward have arrived. Until then "no data" is unknown, never "empty":
  // a failed first load is a full ErrorState, an in-flight one a LoadingState.
  const boardLoaded = bedsLoaded && occupancyLoaded;
  const firstLoadFailure: { feed: WardFeed; error: Error } | null =
    !bedsLoaded && bedsError
      ? { feed: 'beds', error: bedsError }
      : !occupancyLoaded && occupancyError
        ? { feed: 'occupancy', error: occupancyError }
        : null;

  // The whole roster, unplaced patients included (I2): one counting rule for
  // the KPI row, and every patient — on a bed or not — opens in the drawer.
  const summary = summarizeBeds(beds, occupancy, now);
  const wardName = wards.find((w) => w.ward === ward)?.name ?? `วอร์ด ${ward}`;
  const selectedOccupant = findOccupantByAn(occupancy, selectedAn);
  const stale = describeWardFeedStale(REFRESH_SECONDS);

  const handleBedMove = async (payload: BedMovePayload) => {
    if (!config || !userInfo) return;
    try {
      await movePatientBed(config, userInfo, userInfo.hospcode, {
        an: payload.an,
        oldWard: ward,
        oldBedno: payload.oldBedno,
        newWard: ward,
        newBedno: payload.newBedno,
        newRoomno: payload.newRoomno,
        reason: payload.reason,
      });
      setWriteAlert(null);
      await Promise.all([mutateBeds(), mutateOccupancy()]);
    } catch (e) {
      console.error('[bed-move] movePatientBed failed:', e);
      // movePatientBed is a non-atomic two-step write (iptadm bedno/roomno
      // update, THEN the iptbedmove audit insert) that surfaces a single opaque
      // error — timeouts/connection failures at either step carry no table
      // identity, so we cannot tell from here whether iptadm already changed.
      // Warn that the move may have applied without a complete audit record and
      // resnap the board to server truth so the tile reflects reality.
      setWriteAlert({
        ...BED_MOVE_ALERTS.writeFailed,
        detail: e instanceof Error ? e.message : String(e),
      });
      void mutateOccupancy();
    }
  };

  const handleMoveRejected = (reason: 'locked' | 'occupied' | 'no-op') => {
    // 'no-op' = dropped back on the same bed: benign, stay quiet. No server
    // write happened in any branch, so the board needs no resnap.
    if (reason === 'no-op') {
      setWriteAlert(null);
      console.warn('[bed-move] rejected: เตียงเดิม — ไม่ต้องย้าย');
      return;
    }
    const alert = BED_MOVE_ALERTS[reason];
    console.warn(`[bed-move] rejected: ${alert.title}`);
    setWriteAlert({ ...alert });
  };

  return (
    <div className="min-h-full bg-surface-page">
      {/* "แสดงข้อมูลเดิม" is only true once this ward's board has loaded. */}
      {error && boardLoaded && lastUpdatedAt && (
        <ErrorState
          variant="banner"
          message={stale.message}
          lastUpdatedAt={lastUpdatedAt}
          remedy={stale.remedy}
          onRetry={refresh}
        />
      )}
      <PageFrame>
        <PageHeader
          title="ห้องคลอด"
          subtitle={`${wardName} · อัปเดตอัตโนมัติทุก ${REFRESH_SECONDS} วินาที`}
          actions={
            <WardHeaderActions
              wards={wards}
              selectedWard={selectedWard}
              onSelectWard={setSelectedWard}
              health={health}
              lastUpdatedAt={lastUpdatedAt}
              errorMessage={error?.message}
              hosxpStatus={sync.hosxpStatus}
              hosxpDetail={sync.hosxpDetail}
              onOpenHosxp={() => setHosxpOpen(true)}
              syncing={sync.syncing}
              onRefresh={refresh}
            />
          }
        />
        {sync.onboardingError && !onboardingDismissed && (
          <OnboardingWebhookAlert
            error={sync.onboardingError}
            onDismiss={() => setOnboardingDismissed(true)}
          />
        )}
        {newborns.length > 0 && (
          <InlineNotice tone="info">
            {newbornsInWardNotice(newborns.map((n) => n.bedno ?? ''))}
          </InlineNotice>
        )}
        {writeAlert && (
          <DismissibleAlert
            tone={writeAlert.tone}
            title={writeAlert.title}
            detail={writeAlert.detail}
            remedy={writeAlert.remedy}
            onDismiss={() => setWriteAlert(null)}
          />
        )}
        {firstLoadFailure ? (
          <ErrorState
            {...describeWardFeedError(firstLoadFailure.error, {
              feed: firstLoadFailure.feed,
              since: failingSince,
            })}
            onRetry={refresh}
          />
        ) : !boardLoaded ? (
          <BoardLoading />
        ) : (
          <>
            <WardKpis summary={summary} />
            {beds.length === 0 ? (
              <EmptyState
                illustration="ward"
                title="วอร์ดนี้ยังไม่มีเตียงใน HOSxP"
                description="ยังไม่มีการตั้งค่าห้องและเตียง (roomno / bedno) ของวอร์ดนี้ใน HOSxP — แจ้งผู้ดูแล HOSxP ให้เพิ่มเตียง หรือเลือกวอร์ดอื่นจากเมนูวอร์ด"
              />
            ) : (
              summary.patients === 0 && (
                <EmptyState
                  illustration="ward"
                  title="ไม่มีผู้คลอดในห้องคลอดขณะนี้"
                  description={`เตียงว่าง ${summary.free} เตียง · ข้อมูล HOSxP อัปเดตทุก ${REFRESH_SECONDS} วินาที`}
                />
              )
            )}
            {/* Always rendered: a ward with no beds can still hold admitted patients (I2). */}
            <WardLayoutViewFull
              beds={beds}
              occupancy={occupancy}
              now={now}
              onBedClick={setSelectedAn}
              onBedMove={(p) => void handleBedMove(p)}
              onMoveRejected={handleMoveRejected}
              reasons={reasons}
              config={config}
              marketplaceToken={marketplaceToken}
              maternalScreenSummaries={maternalScreenSummaries}
            />
          </>
        )}
      </PageFrame>
      <PatientDrawer
        open={selectedAn !== null}
        occupant={selectedOccupant}
        onClose={() => setSelectedAn(null)}
      />
      <HosxpSyncDialog
        open={hosxpOpen}
        onOpenChange={setHosxpOpen}
        state={sync.hosxpSyncState}
        status={sync.hosxpStatus}
        help={sync.hosxpHelp}
      />
    </div>
  );
}
