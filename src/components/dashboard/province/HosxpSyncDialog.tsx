// HOSxP browser-sync diagnostics (moved from page.tsx, UI sub-project 2).
// Field keys stay English on purpose: they mirror the copyable report that
// IT staff paste into tickets. Title, buttons and prose are Thai.
'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Copy } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { OnboardHosxpSyncState } from '@/hooks/useOnboardHosxpSync';
import { buildHosxpSyncReport, formatCounts, formatSyncTime, type HosxpSyncStatus } from '@/lib/hosxp-sync-status';
import { cn } from '@/lib/utils';

type StepStatus = NonNullable<OnboardHosxpSyncState['lastSteps']>[number]['status'];
const STEP_TONE: Record<StepStatus, string> = {
  error: 'text-danger-text',
  warning: 'text-warn-text',
  success: 'text-ok-text',
  running: 'text-ink-muted',
  info: 'text-ink-muted',
};

type CopyState = 'idle' | 'copied' | 'failed';
const COPY_LABEL: Record<CopyState, string> = {
  idle: 'คัดลอกรายงาน',
  copied: 'คัดลอกแล้ว',
  failed: 'คัดลอกไม่สำเร็จ — เลือกข้อความแล้วกด Ctrl+C',
};

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-muted">{k}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </>
  );
}

export interface HosxpSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: OnboardHosxpSyncState | null;
  status: HosxpSyncStatus;
  help: string;
}

export function HosxpSyncDialog({ open, onOpenChange, state, status, help }: HosxpSyncDialogProps) {
  const [copy, setCopy] = useState<CopyState>('idle');
  const resetTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(resetTimer.current), []);
  const report = buildHosxpSyncReport(state, status, help);
  const reportBox = useRef<HTMLTextAreaElement>(null);
  // Reset on close (adjust-state-during-render; an effect would cascade a render).
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open && copy !== 'idle') setCopy('idle');
  }
  useEffect(() => {
    if (copy === 'failed') reportBox.current?.select();
  }, [copy]);
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopy('copied');
      window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setCopy('idle'), 1800);
    } catch {
      setCopy('failed');
    }
  };
  const anc = state?.lastStats?.anc;
  const steps = state?.lastSteps ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(1120px,calc(100vw-32px))] max-w-none gap-0 sm:max-w-none overflow-hidden p-0">
        <DialogHeader className="border-b border-border bg-surface-card px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
            <DialogTitle className="text-title text-brand">สถานะการดึงข้อมูลจาก HOSxP</DialogTitle>
            <button
              type="button"
              onClick={copyReport}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1 text-label text-ink-muted hover:bg-surface-muted"
            >
              <Copy aria-hidden="true" className="h-4 w-4" />
              {COPY_LABEL[copy]}
            </button>
          </div>
          <DialogDescription className="text-body text-ink-muted">{help}</DialogDescription>
          {copy === 'failed' && (
            <textarea
              ref={reportBox}
              readOnly
              rows={6}
              value={report}
              aria-label="รายงานสถานะการดึงข้อมูล (เลือกแล้ว กด Ctrl+C เพื่อคัดลอก)"
              onFocus={(e) => e.currentTarget.select()}
              className="mt-2 w-full rounded-lg border border-border bg-surface-muted p-2 font-mono text-label text-ink"
            />
          )}
        </DialogHeader>
        <div className="max-h-[calc(92vh-96px)] space-y-3 overflow-y-auto bg-surface-card p-5 text-body text-ink-muted">
          <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-2 font-mono text-label">
            <Row k="STATUS">
              <span className="font-semibold">{status}</span>
            </Row>
            <Row k="PHASE">{state?.phase ?? 'unknown'}</Row>
            <Row k="HCODE">{state?.hcode ?? 'unknown'}</Row>
            <Row k="CONNECTION">{state?.connectionStatus ?? 'unknown'}</Row>
            <Row k="DB TYPE">{state?.databaseType ?? 'not detected'}</Row>
            <Row k="INTERVAL">
              {state?.intervalMs ? `${Math.round(state.intervalMs / 1000)} seconds` : 'not started'}
            </Row>
            <Row k="LAST CYCLE">{formatSyncTime(state?.lastRunAt)}</Row>
            <Row k="LAST SUCCESS">{formatSyncTime(state?.lastSuccessAt)}</Row>
            <Row k="NEXT CYCLE">{formatSyncTime(state?.nextRunAt)}</Row>
            <Row k="HOSPITAL SYNC">{formatSyncTime(state?.hospitalLastSyncAt)}</Row>
            <Row k="PATIENTS">
              IPT {state?.activePatients ?? 0} active · {state?.cachedPatients ?? 0} cached
            </Row>
            <Row k="ACTIVE ANC">
              {state?.activeAncJourneys ?? 0} pregnancies · latest {formatSyncTime(state?.latestAncSyncedAt)}
            </Row>
            <Row k="ANC SOURCE">
              HOSxP {anc?.sourcePatientsRead ?? 0} read · {anc?.sourcePatientsMapped ?? 0} mapped ·{' '}
              {anc?.patientsSynced ?? 0} synced
            </Row>
            <Row k="ANC VISITS">
              {anc?.servicesRead ?? 0} read · {anc?.servicesMapped ?? 0} mapped
            </Row>
            <Row k="ANC RISK DATA">
              risk {anc?.risksMapped ?? 0} · classifying {anc?.classifyingMapped ?? 0}
            </Row>
            <Row k="HOSxP SOURCE READ">
              IPT {state?.lastStats?.activePatientsRead ?? 0} · partograph {state?.lastStats?.partographRowsRead ?? 0}
            </Row>
            <Row k="REFERRALS">
              {state?.activeReferrals ?? 0} active · out {state?.outgoingReferrals ?? 0} · in{' '}
              {state?.incomingReferrals ?? 0}
            </Row>
            <Row k="CYCLES">
              {state?.successCount ?? 0} successful / {state?.cycleCount ?? 0} attempted
            </Row>
            {state?.statusCode && <Row k="HTTP">{state.statusCode}</Row>}
            {state?.stage && <Row k="FAILED AT">{state.stage}</Row>}
          </dl>

          {(state?.error || state?.lastError) && (
            <div className="rounded-lg border border-danger/40 bg-danger-tint px-3 py-2 font-mono text-label leading-relaxed text-ink">
              <div className="font-semibold text-danger-text">{state.error ?? 'รอบซิงค์ HOSxP ล้มเหลว — ตรวจสอบข้อความด้านล่าง แล้วโหลดหน้านี้ใหม่'}</div>
              {state.detail && <div className="mt-1">{state.detail}</div>}
              {state.lastError && <div className="mt-1">{state.lastError}</div>}
            </div>
          )}

          {!state?.error && !state?.lastError && (
            <div className="rounded-lg border border-border bg-surface-muted px-3 py-2 font-mono text-label leading-relaxed text-ink">
              {anc?.error
                ? `ซิงค์ ANC ไม่สำเร็จ: ${anc.error} — ตรวจสอบการเชื่อมต่อ HOSxP แล้วโหลดหน้านี้ใหม่`
                : anc?.skippedReason
                  ? `ยังไม่ได้ซิงค์ ANC: ${anc.skippedReason}`
                  : state?.phase === 'querying_hosxp'
                    ? 'กำลัง query HOSxP: active labour patients, active ANC, ANC visits และ partograph observations'
                    : state?.successCount
                      ? `รอบล่าสุดสำเร็จ: IPT ${state.lastStats?.activePatientsSynced ?? 0}, ANC ${anc?.patientsSynced ?? 0}, visits ${anc?.servicesMapped ?? 0}, partograph ${state.lastStats?.partographRowsUpserted ?? 0}`
                      : 'เริ่ม loop แล้ว กำลังรอผล sync รอบแรกจาก HOSxP'}
            </div>
          )}

          <div className="rounded-lg border border-border font-mono text-label">
            <div className="flex items-center justify-between border-b border-border bg-surface-muted px-3 py-2">
              <span className="font-semibold text-ink">บันทึกขั้นตอน</span>
              <span className="text-ink-muted">รอบล่าสุด · {steps.length} รายการ</span>
            </div>
            <div className="max-h-[260px] divide-y divide-border overflow-auto">
              {steps.length === 0 ? (
                <div className="px-3 py-3 text-ink-muted">ยังไม่มีบันทึกขั้นตอน — รอรอบซิงค์ถัดไป หรือโหลดหน้านี้ใหม่</div>
              ) : (
                steps.map((step, index) => (
                  <div key={`${step.cycle}-${step.name}-${index}`} className="grid grid-cols-[92px_1fr] gap-3 px-3 py-2">
                    <div className="text-ink-muted">
                      <div>{formatSyncTime(step.at)}</div>
                      <div className={cn('mt-0.5 uppercase', STEP_TONE[step.status])}>{step.status}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-ink">{step.name}</div>
                      <div className="mt-0.5 text-ink-muted">{step.message}</div>
                      {step.counts && <div className="mt-1 text-ink-muted">{formatCounts(step.counts)}</div>}
                      {step.detail && <div className="mt-1 whitespace-pre-wrap text-danger-text">{step.detail}</div>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <div className="text-label font-semibold text-ink">ตรวจสอบ</div>
            <p className="mt-1 leading-relaxed">
              การซิงค์จะเริ่มเมื่อเปิดหน้านี้จาก HOSxP/BMS session ที่ถูกต้อง และรหัสโรงพยาบาลเปิดใช้งานใน NN-LRMS แล้ว
              หากสถานะเป็น ERROR ให้แก้ไขตามรายการด้านบน แล้วโหลดหน้านี้ใหม่
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
