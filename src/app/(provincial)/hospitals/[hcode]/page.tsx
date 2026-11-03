// Hospital console — Mission Console + Detail layout. Redesigned 2026-04-30.
// Two registries (LABOR WARD currently admitted + ANC REGISTRY pregnant
// women followed at this hospital) share a single split-pane: tabbed list
// on the left, rich preview on the right. Top KPI strip mixes signals from
// both populations so concerns surface even from the inactive tab.
//
// Replaces the prior teal/rounded card-grid that didn't match the rest of
// the app's air-traffic-control aesthetic and only ever showed labor data.
'use client';

import { NETWORK_RETRY_REMEDY } from '@/lib/actionable-errors';
import { COLOR } from '@/config/design-tokens';
import { RISK_LEVELS } from '@/config/risk-levels';
import type { RiskLevel } from '@/types/domain';
import { use, useRef, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { maskName } from '@/lib/pii-mask';
import { scrollPreviewIntoViewIfStacked } from '@/lib/scroll-preview';
import {
  classifyPartographCoverage,
  needsPartographNudge,
  HOSPITAL_CONSOLE,
  PARTOGRAPH_QUALITY,
  STALE_ADMISSION,
} from '@/config/hospital-network';
import { KpiTip } from '@/components/shared/KpiTip';
import { formatRelativeAge } from '@/lib/relative-time';
import { useSetBreadcrumbs } from '@/components/layout/BreadcrumbContext';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { ConnectionStatus } from '@/components/shared/ConnectionStatus';
import { ListPageLayout } from '@/components/shared/ListPageLayout';
import { KpiGrid } from '@/components/shared/KpiGrid';
import { KpiTile } from '@/components/shared/KpiTile';
import { SectionCard } from '@/components/shared/SectionCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { AncRiskChip } from '@/components/shared/AncRiskChip';
import { RiskBar } from '@/components/dashboard/shared';
import { ANC_REGISTRY_CRITERIA_TH, ANC_REGISTRY_LABEL_TH } from '@/config/anc-freshness';
import { ANC_RISK_RULES } from '@/config/anc-risk-rules';
import { buildPatientId, cn, formatThaiDate } from '@/lib/utils';
import { ConnectionStatus as ConnectionStatusEnum } from '@/types/domain';
import type {
  JourneyListResponse,
  JourneyListItem,
  JourneyDetailResponse,
  AncVisitEntry,
  AncRiskEntry,
} from '@/types/api';
import { ArrowLeft, ChevronRight, ExternalLink } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────

interface LaborPatient {
  id: string;
  hn: string;
  an: string;
  name: string;
  age: number;
  gravida: number | null;
  ga_weeks: number | null;
  anc_count: number | null;
  admit_date: string;
  labor_status: string;
  cpd_score: number | null;
  cpd_risk_level: string | null;
  latest_vitals?: {
    maternal_hr: number | null;
    fetal_hr: string | null;
    sbp: number | null;
    dbp: number | null;
  } | null;
  latest_cervix_cm?: number | null;
  /** NULL until the first partograph observation syncs (then 0+). */
  partograph_alert_count?: number | null;
}

interface PartographAuditAdmission {
  an: string;
  name: string;
  admitDate: string;
  laborStatus: string;
  observationCount: number;
  lastObservedAt: string | null;
}

interface PartographAudit {
  windowDays: number;
  laborRecent: number;
  withPartograph: number;
  admissions: PartographAuditAdmission[];
}

interface HospitalInfo {
  name: string;
  level: string;
  connectionStatus: string;
  lastSyncAt: string | null;
}

interface LaborResponse {
  hospital?: HospitalInfo;
  patients: LaborPatient[];
  /** True COUNT(*) over the ward census — the rows above are a paged subset. */
  pagination?: { total: number };
  partographAudit?: PartographAudit | null;
}

type TabKey = 'labor' | 'anc';

// Response shape for /api/hospitals/[hcode]/incoming-pregnancies
interface IncomingTermPregnancyItem {
  id: string;
  hn: string;
  name: string;
  age: number;
  gravida: number;
  para: number;
  gaWeeks: number | null;
  efwG: number | null;
  edc: string | null;
  ancRiskLevel: string;
  ancVisitCount: number;
  fromHcode: string;
  fromHospitalName: string;
  daysToEdc: number | null;
  triggers: Array<'GA' | 'FW' | 'RISK'>;
}
interface IncomingPregnanciesResponse {
  hubHcode: string;
  minGaWeeks: number;
  count: number;
  byTrigger: { ga: number; fw: number; risk: number };
  items: IncomingTermPregnancyItem[];
}

const TRIGGER_TH: Record<'GA' | 'FW' | 'RISK', string> = { GA: 'อายุครรภ์', FW: 'น้ำหนักทารก', RISK: 'ความเสี่ยง' };

const INCOMING_COLUMNS: DataTableColumn<IncomingTermPregnancyItem>[] = [
  { key: 'hn', header: 'HN', cell: (p) => <span className="tabular-nums">{p.hn}</span> },
  { key: 'name', header: 'ชื่อ', className: 'min-w-[140px]', cell: (p) => maskName(p.name) },
  { key: 'age', header: 'อายุ', numeric: true, cell: (p) => p.age },
  { key: 'gp', header: 'G/P', numeric: true, cell: (p) => `${p.gravida}/${p.para}` },
  { key: 'ga', header: 'GA', numeric: true, cell: (p) => (p.gaWeeks != null ? `${p.gaWeeks} สัปดาห์` : '—') },
  { key: 'efw', header: 'น้ำหนักทารกโดยประมาณ', numeric: true, cell: (p) => (p.efwG != null ? `${p.efwG.toLocaleString('en-US')} ก.` : '—') },
  {
    key: 'edc',
    header: 'กำหนดคลอด (EDC)',
    cell: (p) => (
      <span className={cn('tabular-nums', p.daysToEdc != null && p.daysToEdc < 0 ? 'text-danger-text' : p.daysToEdc != null && p.daysToEdc <= HOSPITAL_CONSOLE.ancDueWithinDays ? 'text-warn-text' : 'text-ink')}>
        {p.edc ? formatThaiDate(p.edc) : '—'}
        {p.daysToEdc != null && (
          <span className="ml-1.5 text-caption text-ink-muted">
            ({p.daysToEdc < 0 ? `เลย ${Math.abs(p.daysToEdc)} วัน` : `อีก ${p.daysToEdc} วัน`})
          </span>
        )}
      </span>
    ),
  },
  { key: 'risk', header: 'ความเสี่ยง', cell: (p) => <AncRiskChip level={p.ancRiskLevel} /> },
  { key: 'why', header: 'เหตุผล', cell: (p) => p.triggers.map((t) => TRIGGER_TH[t]).join(' + ') || '—' },
  { key: 'from', header: 'จาก', className: 'min-w-[140px]', cell: (p) => `${p.fromHospitalName} (${p.fromHcode})` },
];

// ─── Helpers ────────────────────────────────────────────────────────────

const RULE_BY_ID = new Map(ANC_RISK_RULES.map((r) => [r.id, r]));

function laborTier(level: string | null): 'high' | 'medium' | 'low' {
  if (level === 'HIGH') return 'high';
  if (level === 'MEDIUM') return 'medium';
  return 'low';
}

function ancTier(level: string | null): 'high' | 'medium' | 'low' {
  if (level === 'HR3') return 'high';
  if (level === 'HR2' || level === 'HR1') return 'medium';
  return 'low';
}

function tierColor(tier: 'high' | 'medium' | 'low'): string {
  return tier === 'high'
    ? 'var(--risk-high)'
    : tier === 'medium'
      ? 'var(--risk-medium)'
      : 'var(--risk-low)';
}

function gaTrimester(weeks: number | null): 'T3' | 'T2' | 'T1' | 'unknown' {
  if (weeks == null) return 'unknown';
  if (weeks >= 28) return 'T3';
  if (weeks >= 13) return 'T2';
  return 'T1';
}

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

function formatEdc(
  edcIso: string | null,
  gaWeeks: number | null,
): { daysToEdc: number | null; edcText: string } {
  if (!edcIso) {
    return { daysToEdc: null, edcText: '—' };
  }
  const d = (new Date(edcIso).getTime() - Date.now()) / 86400000;
  const days = Math.round(d);
  if (days < 0) return { daysToEdc: days, edcText: `เลย ${Math.abs(days)} วัน` };
  if (days === 0) return { daysToEdc: 0, edcText: 'วันนี้' };
  return { daysToEdc: days, edcText: `${days} วัน` };
}

function laborConcerns(p: LaborPatient): Array<{ label: string; warn?: boolean }> {
  const out: Array<{ label: string; warn?: boolean }> = [];
  const v = p.latest_vitals;
  if (v?.sbp != null && v?.dbp != null) {
    if (v.sbp >= 160 || v.dbp >= 110) out.push({ label: 'BP↑↑' });
    else if (v.sbp >= 140 || v.dbp >= 90) out.push({ label: 'BP↑', warn: true });
  }
  if (v?.fetal_hr) {
    const fhr = parseInt(v.fetal_hr, 10);
    if (Number.isFinite(fhr)) {
      if (fhr > 160 || fhr < 110) out.push({ label: 'FHR↯' });
    }
  }
  const hrs = hoursSince(p.admit_date);
  if (hrs != null && hrs >= 12) out.push({ label: `รับมา ${Math.floor(hrs)} ชม.`, warn: true });
  if ((p.cpd_score ?? 0) >= 40) out.push({ label: 'CPD↑' });
  // Long-stay prompt — the usual cause is a skipped HOSxP discharge entry
  // (dchdate never filled in), so name that action instead of just the age.
  if (
    p.labor_status === 'ACTIVE' &&
    hrs != null &&
    hrs / 24 >= STALE_ADMISSION.checkDischargeAfterDays
  ) {
    out.push({ label: 'ตรวจสอบจำหน่าย', warn: true });
  }
  // Charting nudge — ACTIVE past the grace window with no partograph at all.
  // Absence used to read as "fine"; make it an explicit ward-level prompt.
  if (
    p.labor_status === 'ACTIVE' &&
    needsPartographNudge(p.admit_date, p.partograph_alert_count ?? null)
  ) {
    out.push({ label: 'ยังไม่มีพาร์โทกราฟ', warn: true });
  }
  return out;
}

// ─── Partograph charting audit panel ────────────────────────────────────────
// The /hospitals board scores charting coverage; this panel names the actual
// uncharted admissions in the window so the provincial team can cite specific
// cases when following up with the ward.
const cpdRiskLabelTh = (level: string | null | undefined): string =>
  level && level in RISK_LEVELS ? RISK_LEVELS[level as RiskLevel].labelTh : '—';

const AUDIT_STATUS_TH: Record<string, string> = {
  ACTIVE: 'รอคลอด',
  DELIVERED: 'คลอดแล้ว',
  DISCHARGED: 'จำหน่าย',
  TRANSFERRED: 'ส่งต่อ',
};

function fmtAuditDate(iso: string): string {
  return new Date(iso).toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
    month: 'short',
    day: 'numeric',
  });
}

function PartographAuditPanel({ audit }: { audit: PartographAudit | null | undefined }) {
  if (!audit || audit.laborRecent === 0) return null;
  const cls = classifyPartographCoverage(audit.laborRecent, audit.withPartograph);
  const pct = Math.round((audit.withPartograph / audit.laborRecent) * 100);
  const color =
    cls === 'ok' ? 'var(--risk-low)' : cls === 'warn' ? 'var(--risk-medium)' : 'var(--risk-high)';
  const uncharted = audit.admissions.filter((a) => a.observationCount === 0);
  return (
    <div
      className="mt-4 border bg-white"
      data-testid="partograph-audit"
      style={{ borderColor: 'var(--rule-strong)', borderLeft: `3px solid ${color}` }}
    >
      <div
        className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2"
        style={{ borderBottom: '1px solid var(--rule-strong)' }}
      >
        <KpiTip
          title="คุณภาพการบันทึก Partograph"
          body={`ผู้คลอดที่รับใหม่ใน ${audit.windowDays} วันที่ผ่านมา และมีบันทึก partograph อย่างน้อย 1 จุด — รายชื่อด้านล่างคือรายที่ยังไม่มีบันทึกเลย ใช้ติดตามกับห้องคลอดได้เป็นรายกรณี`}
          trigger={
            <div className="cursor-help font-mono text-caption uppercase tracking-[0.14em] text-[var(--ink-navy-muted)]" />
          }
        >
          คุณภาพการบันทึกพาร์โทกราฟ · {audit.windowDays} วัน
        </KpiTip>
        <span className="font-mono text-label font-semibold tabular-nums" style={{ color }}>
          {pct}%{' '}
          <span className="font-normal text-caption text-[var(--ink-navy-muted)]">
            ({audit.withPartograph}/{audit.laborRecent} ราย)
          </span>
        </span>
      </div>
      {uncharted.length === 0 ? (
        <div className="px-3 py-2 font-mono text-caption" style={{ color: 'var(--risk-low)' }}>
          บันทึกครบทุกราย
        </div>
      ) : (
        <div className="max-h-56 overflow-y-auto">
          {uncharted.map((a) => (
            <div
              key={a.an}
              className="flex flex-wrap items-center gap-2 border-b px-3 py-1.5 text-caption"
              style={{ borderColor: 'var(--rule-hair)' }}
            >
              <span
                className="border px-1 py-px font-mono text-caption font-semibold"
                style={{ color: 'var(--risk-high)', borderColor: 'var(--risk-high)' }}
              >
                ไม่มีบันทึก
              </span>
              <span className="text-[var(--ink-navy)]">{maskName(a.name)}</span>
              <span className="font-mono text-caption text-[var(--ink-navy-muted)]">
                AN {a.an} · รับเมื่อ {fmtAuditDate(a.admitDate)} ·{' '}
                {AUDIT_STATUS_TH[a.laborStatus] ?? a.laborStatus}
              </span>
            </div>
          ))}
          <div className="px-3 py-1.5 font-mono text-caption text-[var(--ink-navy-muted)]">
            บันทึกแล้ว {audit.withPartograph} ราย · ยังไม่บันทึก {uncharted.length} ราย
          </div>
        </div>
      )}
    </div>
  );
}

function ancConcerns(j: JourneyListItem): Array<{ label: string; warn?: boolean }> {
  const out: Array<{ label: string; warn?: boolean }> = [];
  if (j.ancRiskLevel === 'HR3') out.push({ label: 'HR3' });
  const last = daysSince(j.lastAncDate);
  if (last != null && last >= HOSPITAL_CONSOLE.ancOverdueAfterDays) out.push({ label: 'ขาดนัด' });
  const edc = j.edc ? Math.round((new Date(j.edc).getTime() - Date.now()) / 86400000) : null;
  if (edc != null && edc <= HOSPITAL_CONSOLE.ancDueWithinDays && edc >= 0) out.push({ label: 'ใกล้คลอด', warn: true });
  if (edc != null && edc < 0) out.push({ label: 'หลัง EDC' });
  return out;
}

// ─── Small UI helpers ───────────────────────────────────────────────────

function ConcernChip({ label, warn }: { label: string; warn?: boolean }) {
  return (
    <span
      className="ml-1.5 inline-block rounded-sm px-1.5 py-0.5 align-middle font-mono text-caption tracking-[0.06em]"
      style={{
        background: warn ? COLOR.riskMediumTint : COLOR.riskHighTint,
        color: warn ? COLOR.riskMediumText : COLOR.riskHighText,
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  );
}

interface SigProps {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  alarm?: boolean;
  warn?: boolean;
}

function Sig({ label, value, unit, sub, alarm, warn }: SigProps) {
  const color = alarm ? COLOR.riskHighText : warn ? COLOR.riskMediumText : 'var(--ink-navy)';
  return (
    <div className="border-r border-[var(--rule-strong)] px-3 py-2.5 last:border-r-0">
      <div className="text-caption text-[var(--ink-navy-muted)]">
        {label}
      </div>
      <div
        className="mt-0.5 font-mono text-title font-semibold leading-tight tabular-nums"
        style={{ color, letterSpacing: '-0.02em' }}
      >
        {value}
        {unit && (
          <span className="ml-1 text-caption font-normal text-[var(--ink-navy-muted)]">{unit}</span>
        )}
      </div>
      {sub && (
        <div
          className="mt-0.5 font-mono text-caption"
          style={{ color: alarm ? COLOR.riskHighText : 'var(--ink-navy-muted)' }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── Roster rows ────────────────────────────────────────────────────────

interface LaborRowProps {
  p: LaborPatient;
  isSelected: boolean;
  onSelect: () => void;
  /** Keyboard focus: select AND scroll a stacked preview into view (hover selects without scrolling). */
  onReveal: () => void;
  onOpen: () => void;
}

function LaborRow({ p, isSelected, onSelect, onReveal, onOpen }: LaborRowProps) {
  const tier = laborTier(p.cpd_risk_level);
  const concerns = laborConcerns(p);
  const cervix = p.latest_cervix_cm;
  const admitH = hoursSince(p.admit_date);
  return (
    <button
      type="button"
      onMouseEnter={onSelect}
      onFocus={onReveal}
      onClick={onOpen}
      className="grid w-full items-center text-left transition-colors"
      style={{
        gridTemplateColumns: '4px 1fr 60px 90px 70px 14px',
        gap: 10,
        padding: '8px 12px 8px 0',
        border: '1px solid var(--rule-strong)',
        borderTop: 'none',
        height: 56,
        background: isSelected ? 'var(--accent-navy-soft)' : 'white',
        borderLeft: isSelected ? '3px solid var(--accent-navy)' : undefined,
        cursor: 'pointer',
      }}
    >
      <div style={{ height: '100%', alignSelf: 'stretch', background: tierColor(tier) }} />
      <div>
        <div className="text-caption font-medium text-[var(--ink-navy)] leading-tight">
          {maskName(p.name)}
          {concerns.slice(0, 2).map((c) => (
            <ConcernChip key={c.label} label={c.label} warn={c.warn} />
          ))}
        </div>
        <div className="mt-0.5 font-mono text-caption text-[var(--ink-navy-muted)]">
          {p.age}y · G{p.gravida ?? '-'} · AN {p.an}
        </div>
      </div>
      <div className="text-center font-mono text-caption text-[var(--ink-navy-dim)]">
        {p.ga_weeks != null ? `${p.ga_weeks}w` : '—'}
      </div>
      <div className="flex flex-col">
        <span className="text-caption text-[var(--ink-navy-muted)]">
          ปากมดลูก
        </span>
        <span className="font-mono text-caption font-semibold text-[var(--ink-navy)]">
          {cervix != null ? `${cervix} cm` : '—'}
        </span>
      </div>
      <div
        className="text-right font-mono text-caption font-semibold tabular-nums"
        style={{ color: tierColor(tier) }}
      >
        {p.cpd_score != null ? `${p.cpd_score}%` : '—'}
        {admitH != null && (
          <div className="font-mono text-caption font-normal text-[var(--ink-navy-muted)]">
            {Math.floor(admitH)}h
          </div>
        )}
      </div>
      <ChevronRight className="h-3.5 w-3.5" style={{ color: 'var(--ink-navy-muted)' }} />
    </button>
  );
}

interface AncRowProps {
  j: JourneyListItem;
  isSelected: boolean;
  onSelect: () => void;
  onReveal: () => void;
  onOpen: () => void;
}

function AncRow({ j, isSelected, onSelect, onReveal, onOpen }: AncRowProps) {
  const tier = ancTier(j.ancRiskLevel);
  const concerns = ancConcerns(j);
  const lastDays = daysSince(j.lastAncDate);
  const lastOverdue = lastDays != null && lastDays >= HOSPITAL_CONSOLE.ancOverdueAfterDays;
  return (
    <button
      type="button"
      onMouseEnter={onSelect}
      onFocus={onReveal}
      onClick={onOpen}
      className="grid w-full items-center text-left transition-colors"
      style={{
        gridTemplateColumns: '4px 1fr 60px 80px 80px 14px',
        gap: 10,
        padding: '8px 12px 8px 0',
        border: '1px solid var(--rule-strong)',
        borderTop: 'none',
        height: 60,
        background: isSelected ? 'var(--accent-navy-soft)' : 'white',
        borderLeft: isSelected ? '3px solid var(--accent-navy)' : undefined,
        cursor: 'pointer',
      }}
    >
      <div style={{ height: '100%', alignSelf: 'stretch', background: tierColor(tier) }} />
      <div>
        <div className="text-caption font-medium text-[var(--ink-navy)] leading-tight">
          {maskName(j.name)}
          {concerns.slice(0, 2).map((c) => (
            <ConcernChip key={c.label} label={c.label} warn={c.warn} />
          ))}
        </div>
        <div className="mt-0.5 font-mono text-caption text-[var(--ink-navy-muted)]">
          {j.age}y · G{j.gravida ?? '-'}P{j.para ?? 0} · HN {j.hn}
        </div>
      </div>
      <div className="text-center font-mono text-caption text-[var(--ink-navy-dim)]">
        <span className="text-label font-semibold text-[var(--ink-navy)]">{j.gaWeeks ?? '—'}</span>
        <span className="opacity-60">w</span>
      </div>
      <div className="flex flex-col">
        <span className="text-caption text-[var(--ink-navy-muted)]">
          ฝากครรภ์
        </span>
        <span className="font-mono text-caption font-semibold text-[var(--ink-navy)]">
          {j.ancVisitCount}/8
        </span>
      </div>
      <div className="flex flex-col">
        <span className="text-caption text-[var(--ink-navy-muted)]">
          ANC ล่าสุด
        </span>
        <span
          className="font-mono text-caption"
          style={{
            color: lastOverdue ? COLOR.riskHighText : 'var(--ink-navy-dim)',
            fontWeight: lastOverdue ? 700 : 400,
          }}
        >
          {formatRelativeAge(j.lastAncDate)}
        </span>
      </div>
      <ChevronRight className="h-3.5 w-3.5" style={{ color: 'var(--ink-navy-muted)' }} />
    </button>
  );
}

// ─── Section headers (trimester / stage groupings) ──────────────────────

function GroupHeader({
  title,
  sub,
  count,
  hr,
}: {
  title: string;
  sub?: string;
  count: number;
  hr?: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-t-xl border border-b-0 border-border bg-brand-soft px-3 py-2">
      <div>
        <span className="text-label font-semibold text-brand-strong">
          {sub ? `${title} · ${sub}` : title}
        </span>
      </div>
      <div className="text-label font-semibold tabular-nums text-brand-strong">
        {count}
        {hr != null && hr > 0 && <span className="ml-2 text-danger-text">· HR3 {hr}</span>}
      </div>
    </div>
  );
}

// ─── Empty preview state ────────────────────────────────────────────────

function EmptyPreview({ message }: { message: string }) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center p-10 text-center"
      style={{ minHeight: 480 }}
    >
      <div className="text-label text-ink-muted">เลือกผู้ป่วย</div>
      <p className="mt-2 max-w-sm text-caption text-[var(--ink-navy-dim)]">{message}</p>
    </div>
  );
}

// ─── Labor preview pane ─────────────────────────────────────────────────

function LaborPreview({ patient, hcode }: { patient: LaborPatient; hcode: string }) {
  const router = useRouter();
  const tier = laborTier(patient.cpd_risk_level);
  const concerns = laborConcerns(patient);
  const v = patient.latest_vitals;
  const fhr = v?.fetal_hr ? parseInt(v.fetal_hr, 10) : null;
  const fhrAlarm = fhr != null && (fhr > 160 || fhr < 110);
  const sbpAlarm = v?.sbp != null && v.sbp >= 160;
  const sbpWarn = !sbpAlarm && v?.sbp != null && v.sbp >= 140;
  const dbpAlarm = v?.dbp != null && v.dbp >= 110;
  const dbpWarn = !dbpAlarm && v?.dbp != null && v.dbp >= 90;
  const bpAlarm = sbpAlarm || dbpAlarm;
  const bpWarn = !bpAlarm && (sbpWarn || dbpWarn);
  const admitH = hoursSince(patient.admit_date);
  return (
    <div className="space-y-4">
      <div
        className="bg-white p-4 pb-3"
        style={{
          border: '1px solid var(--rule-strong)',
          borderLeft: `4px solid ${tierColor(tier)}`,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-title font-bold leading-tight text-[var(--ink-navy)]">
              {maskName(patient.name)}
            </div>
            <div className="mt-1 font-mono text-caption text-[var(--ink-navy-muted)]">
              {patient.age}y · G{patient.gravida ?? '-'} · HN {patient.hn} · AN {patient.an}
            </div>
            {concerns.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {concerns.map((c) => (
                  <ConcernChip key={c.label} label={c.label} warn={c.warn} />
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => router.push(`/patients/${buildPatientId(hcode, patient.an)}`)}
            className="inline-flex items-center gap-1 border bg-white px-2.5 py-1 font-mono text-caption uppercase tracking-[0.06em]"
            style={{ borderColor: 'var(--accent-navy)', color: 'var(--accent-navy)' }}
          >
            เปิดรายละเอียด <ExternalLink className="h-3 w-3" />
          </button>
        </div>
        <div
          className="mt-3 grid"
          style={{
            gridTemplateColumns: 'repeat(4, 1fr)',
            border: '1px solid var(--rule-strong)',
          }}
        >
          <Sig
            label="ความดัน (BP)"
            value={v?.sbp != null && v?.dbp != null ? `${v.sbp}/${v.dbp}` : '—'}
            alarm={bpAlarm}
            warn={bpWarn}
            sub={bpAlarm ? '↑↑ สูงรุนแรง' : bpWarn ? '↑ เฝ้าระวัง' : 'ปกติ'}
          />
          <Sig
            label="ชีพจรแม่ (MHR)"
            value={v?.maternal_hr != null ? String(v.maternal_hr) : '—'}
            unit="bpm"
          />
          <Sig
            label="หัวใจทารก (FHR)"
            value={v?.fetal_hr ?? '—'}
            unit="bpm"
            alarm={fhrAlarm}
            sub={fhrAlarm ? (fhr! > 160 ? '↑ เร็ว' : '↓ ช้า') : 'ปกติ'}
          />
          <Sig
            label="CPD"
            value={patient.cpd_score != null ? `${patient.cpd_score}%` : '—'}
            sub={cpdRiskLabelTh(patient.cpd_risk_level)}
            alarm={tier === 'high'}
            warn={tier === 'medium'}
          />
        </div>
      </div>

      <div>
        <div
          className="mb-2 flex items-baseline justify-between border-b pb-1"
          style={{ borderColor: 'var(--rule-strong)' }}
        >
          <div className="font-mono text-caption font-semibold tracking-[0.1em] text-[var(--ink-navy)]">
            <span className="text-[var(--ink-navy-muted)] mr-1.5">02</span>ระยะ / ความก้าวหน้า
          </div>
          <div className="text-caption text-[var(--ink-navy-muted)]">
            {AUDIT_STATUS_TH[patient.labor_status] ?? patient.labor_status}
          </div>
        </div>
        <div
          className="grid bg-white"
          style={{
            gridTemplateColumns: 'repeat(4, 1fr)',
            border: '1px solid var(--rule-strong)',
          }}
        >
          <Sig
            label="อายุครรภ์"
            value={patient.ga_weeks != null ? String(patient.ga_weeks) : '—'}
            unit="สัปดาห์"
          />
          <Sig
            label="ฝากครรภ์ (ANC)"
            value={patient.anc_count != null ? String(patient.anc_count) : '—'}
            unit="/8"
            warn={(patient.anc_count ?? 0) < 5}
          />
          <Sig
            label="ปากมดลูก"
            value={patient.latest_cervix_cm != null ? String(patient.latest_cervix_cm) : '—'}
            unit="cm"
          />
          <Sig
            label="รับมาแล้ว"
            value={admitH != null ? `${Math.floor(admitH)}` : '—'}
            unit="ชม."
            warn={admitH != null && admitH >= 12}
            alarm={admitH != null && admitH >= 24}
          />
        </div>
      </div>
    </div>
  );
}

// ─── ANC preview pane ───────────────────────────────────────────────────

function AncPreview({ journeyId, hcode }: { journeyId: string; hcode: string }) {
  const router = useRouter();
  const { data, error, isLoading } = useSWR<JourneyDetailResponse>(
    journeyId ? `/api/journeys/${journeyId}` : null,
    { refreshInterval: 60000 },
  );

  // Hooks must run unconditionally — sort visits before any early return.
  // SWR returns the same `data.ancVisits` reference across re-renders until a
  // new fetch lands, so depending on it directly is referentially stable.
  const visitsChrono = useMemo(() => {
    const v = data?.ancVisits ?? [];
    return [...v].sort((a, b) => new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime());
  }, [data?.ancVisits]);

  if (isLoading) {
    return <EmptyPreview message="กำลังโหลดข้อมูลฝากครรภ์…" />;
  }
  if (error || !data?.journey) {
    return (
      <EmptyPreview message={error instanceof Error ? error.message : 'ไม่พบข้อมูลฝากครรภ์'} />
    );
  }

  const journey = data.journey;
  const risk = data.latestRisk;
  const tier = ancTier(journey.ancRiskLevel);
  const { daysToEdc, edcText } = formatEdc(journey.edc, journey.gaWeeks);
  const lastAncRel = formatRelativeAge(journey.lastAncDate);
  const lastDays = daysSince(journey.lastAncDate);
  const overdue = lastDays != null && lastDays >= HOSPITAL_CONSOLE.ancOverdueAfterDays;

  // Build a rough EDC progress percentage. 40 weeks total; we cap at 99
  // so the marker doesn't disappear at exactly term.
  const edcPct =
    journey.gaWeeks != null ? Math.min(99, Math.max(0, (journey.gaWeeks / 40) * 100)) : 0;
  const sbpVals = visitsChrono.map((v) => v.bpSystolic).filter((x): x is number => x != null);
  const dbpVals = visitsChrono.map((v) => v.bpDiastolic).filter((x): x is number => x != null);

  return (
    <div className="space-y-4">
      {/* Identity card */}
      <div
        className="bg-white p-4 pb-3"
        style={{
          border: '1px solid var(--rule-strong)',
          borderLeft: `4px solid ${tierColor(tier)}`,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-title font-bold leading-tight text-[var(--ink-navy)]">
              {maskName(journey.name)}
            </div>
            <div className="mt-1 font-mono text-caption text-[var(--ink-navy-muted)]">
              {journey.age}y · G{journey.gravida ?? '-'}P{journey.para ?? 0} · HN {journey.hn}
            </div>
            {(risk?.triggeredRules?.length ?? 0) > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {(risk?.triggeredRules ?? []).slice(0, 4).map((rid) => {
                  const r = RULE_BY_ID.get(rid);
                  if (!r) return null;
                  return (
                    <ConcernChip
                      key={rid}
                      label={r.level}
                      warn={r.level === 'HR1' || r.level === 'HR2'}
                    />
                  );
                })}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => router.push(`/pregnancies/${journey.id}`)}
            className="inline-flex items-center gap-1 whitespace-nowrap border bg-white px-2.5 py-1 font-mono text-caption uppercase tracking-[0.06em]"
            style={{ borderColor: 'var(--accent-navy)', color: 'var(--accent-navy)' }}
          >
            เปิดรายละเอียด <ExternalLink className="h-3 w-3" />
          </button>
        </div>

        <div
          className="mt-3 grid"
          style={{
            gridTemplateColumns: 'repeat(4, 1fr)',
            border: '1px solid var(--rule-strong)',
          }}
        >
          <Sig
            label="ความเสี่ยง"
            value={journey.ancRiskLevel ?? 'LOW'}
            alarm={tier === 'high'}
            warn={tier === 'medium'}
            sub={`${risk?.triggeredRules?.length ?? 0} เกณฑ์`}
          />
          <Sig
            label="อายุครรภ์"
            value={journey.gaWeeks != null ? String(journey.gaWeeks) : '—'}
            unit="สัปดาห์"
          />
          <Sig label="ฝากครรภ์" value={`${journey.ancVisitCount}`} unit="/8" />
          <Sig
            label="ANC ล่าสุด"
            value={lastAncRel}
            alarm={overdue}
            sub={overdue ? 'ขาดนัด' : 'ตามนัด'}
          />
        </div>
      </div>

      {/* Pregnancy timeline bar */}
      <div>
        <div
          className="mb-2 flex items-baseline justify-between border-b pb-1"
          style={{ borderColor: 'var(--rule-strong)' }}
        >
          <div className="font-mono text-caption font-semibold tracking-[0.1em] text-[var(--ink-navy)]">
            <span className="text-[var(--ink-navy-muted)] mr-1.5">02</span>ไทม์ไลน์การตั้งครรภ์
          </div>
          <div className="font-mono text-caption tracking-[0.08em] text-[var(--ink-navy-muted)]">
            {journey.lmp ? `LMP ${journey.lmp.slice(0, 10)}` : 'LMP —'}
            {journey.edc ? ` · EDC ${journey.edc.slice(0, 10)}` : ''}
          </div>
        </div>
        <div className="bg-white p-3" style={{ border: '1px solid var(--rule-strong)' }}>
          <div className="mb-2 flex justify-between font-mono text-caption text-[var(--ink-navy-muted)]">
            <span>
              GA:{' '}
              <span className="font-semibold text-[var(--ink-navy)]">
                {journey.gaWeeks != null ? `${journey.gaWeeks}w` : '—'}
              </span>
            </span>
            <span>
              EDC ใน{' '}
              <span
                className="font-semibold"
                style={{
                  color: daysToEdc != null && daysToEdc <= HOSPITAL_CONSOLE.ancDueWithinDays ? COLOR.riskMediumText : 'var(--ink-navy)',
                }}
              >
                {edcText}
              </span>
            </span>
          </div>
          <div
            className="relative h-2 overflow-hidden rounded-sm"
            style={{ background: 'var(--rule-hair)' }}
          >
            <span
              className="block h-full"
              style={{ width: `${edcPct}%`, background: 'var(--accent-navy)' }}
            />
          </div>
          <div className="mt-1 flex justify-between font-mono text-caption uppercase tracking-[0.08em] text-[var(--ink-navy-muted)]">
            <span>LMP</span>
            <span>T1 12w</span>
            <span>T2 27w</span>
            <span>T3 36w</span>
            <span>EDC 40 สัปดาห์</span>
          </div>
        </div>
      </div>

      {/* Risk rules triggered */}
      {risk && risk.triggeredRules.length > 0 && (
        <div>
          <div
            className="mb-2 flex items-baseline justify-between border-b pb-1"
            style={{ borderColor: 'var(--rule-strong)' }}
          >
            <div className="font-mono text-caption font-semibold tracking-[0.1em] text-[var(--ink-navy)]">
              <span className="text-[var(--ink-navy-muted)] mr-1.5">03</span>
              เกณฑ์ความเสี่ยงที่พบ
            </div>
            <div className="font-mono text-caption tracking-[0.08em] text-[var(--ink-navy-muted)]">
              screened {risk.screenedAt.slice(0, 10)}
            </div>
          </div>
          <div className="bg-white" style={{ border: '1px solid var(--rule-strong)' }}>
            {risk.triggeredRules.map((rid) => {
              const r = RULE_BY_ID.get(rid);
              if (!r) {
                return (
                  <div
                    key={rid}
                    className="flex items-center gap-2 px-3 py-1.5 text-caption"
                    style={{ borderBottom: '1px solid var(--rule-hair)' }}
                  >
                    <span className="font-mono text-caption text-[var(--ink-navy-muted)]">
                      {rid}
                    </span>
                  </div>
                );
              }
              const isHr3 = r.level === 'HR3';
              const isHr2 = r.level === 'HR2';
              const bg = isHr3 ? COLOR.riskHighTint : isHr2 ? COLOR.riskMediumTint : 'rgba(234,179,8,0.18)';
              const ink = isHr3 ? COLOR.riskHighText : COLOR.riskMediumText;
              return (
                <div
                  key={rid}
                  className="grid items-center gap-2 px-3 py-1.5 text-caption"
                  style={{
                    gridTemplateColumns: '60px 1fr auto',
                    borderBottom: '1px solid var(--rule-hair)',
                  }}
                >
                  <span
                    className="text-center font-mono text-caption font-bold"
                    style={{ background: bg, color: ink, padding: '2px 0' }}
                  >
                    {r.level}
                  </span>
                  <span className="text-[var(--ink-navy)]">{r.labelTh}</span>
                  <span className="font-mono text-caption text-[var(--ink-navy-muted)]">
                    {r.source.replace(/_/g, ' ')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* BP sparkline across ANC visits */}
      {visitsChrono.length >= 2 && (sbpVals.length >= 2 || dbpVals.length >= 2) && (
        <div>
          <div
            className="mb-2 flex items-baseline justify-between border-b pb-1"
            style={{ borderColor: 'var(--rule-strong)' }}
          >
            <div className="font-mono text-caption font-semibold tracking-[0.1em] text-[var(--ink-navy)]">
              <span className="text-[var(--ink-navy-muted)] mr-1.5">04</span>
              ประวัติการฝากครรภ์ · ความดัน (BP)
            </div>
            <div className="font-mono text-caption tracking-[0.08em] text-[var(--ink-navy-muted)]">
              {visitsChrono.length} visits · {journey.ancVisitCount} expected
            </div>
          </div>
          <div
            className="relative bg-white"
            style={{ border: '1px solid var(--rule-strong)', height: 110, padding: 8 }}
          >
            <BpSparkline visits={visitsChrono} />
          </div>
        </div>
      )}

      {/* Lab snapshot */}
      <div>
        <div
          className="mb-2 flex items-baseline justify-between border-b pb-1"
          style={{ borderColor: 'var(--rule-strong)' }}
        >
          <div className="font-mono text-caption font-semibold tracking-[0.1em] text-[var(--ink-navy)]">
            <span className="text-[var(--ink-navy-muted)] mr-1.5">05</span>
            ผลตรวจล่าสุด
          </div>
          <div className="font-mono text-caption tracking-[0.08em] text-[var(--ink-navy-muted)]">
            booking + latest
          </div>
        </div>
        <div
          className="grid bg-white"
          style={{
            gridTemplateColumns: 'repeat(4, 1fr)',
            border: '1px solid var(--rule-strong)',
          }}
        >
          <LabCell
            label="หมู่เลือด"
            value={
              journey.bloodGroup
                ? `${journey.bloodGroup} ${journey.rhFactor === 'NEG' ? 'Rh-' : journey.rhFactor === 'POS' ? 'Rh+' : ''}`.trim()
                : null
            }
          />
          <LabCell label="HBSAG" value={journey.hbsagResult} />
          <LabCell label="VDRL" value={journey.vdrlResult} />
          <LabCell label="HIV" value={journey.hivResult} />
          <LabCell label="OGTT" value={journey.ogttResult} alarmIfMatches={['ABNORMAL', 'POS']} />
          <LabCell label="DCIP" value={journey.dcipResult} alarmIfMatches={['POS']} />
          <LabCell label="HbE" value={journey.hbEResult} alarmIfMatches={['POS']} />
          <LabCell label="GBS" value={journey.gbsResult} alarmIfMatches={['POS']} />
        </div>
      </div>
    </div>
  );
}

function LabCell({
  label,
  value,
  alarmIfMatches,
}: {
  label: string;
  value: string | null | undefined;
  alarmIfMatches?: string[];
}) {
  const isAlarm = !!value && (alarmIfMatches ?? []).includes(value);
  const isPending = value === 'PENDING';
  const display = value ?? '—';
  return (
    <div
      className="px-3 py-2"
      style={{
        borderRight: '1px solid var(--rule-hair)',
        borderBottom: '1px solid var(--rule-hair)',
      }}
    >
      <div className="text-caption text-[var(--ink-navy-muted)]">
        {label}
      </div>
      <div
        className="mt-0.5 font-mono text-caption font-semibold"
        style={{
          color: isAlarm ? COLOR.riskHighText : isPending ? 'var(--ink-navy-muted)' : 'var(--ink-navy)',
          fontWeight: isAlarm ? 700 : isPending ? 400 : 600,
        }}
      >
        {display}
      </div>
    </div>
  );
}

function BpSparkline({ visits }: { visits: AncVisitEntry[] }) {
  // Visit BP plot. We map 50→160 mmHg vertically. SBP solid navy, DBP dashed
  // dim. Latest dot risk-colored by SBP threshold.
  const W = 580;
  const H = 90;
  const vMin = 50;
  const vMax = 170;
  const xStep = visits.length > 1 ? W / (visits.length - 1) : W;
  const yFor = (mmhg: number) => H - ((mmhg - vMin) / (vMax - vMin)) * H;

  const sbpPts = visits
    .map((v, i) => (v.bpSystolic != null ? `${i * xStep},${yFor(v.bpSystolic)}` : null))
    .filter((s): s is string => !!s)
    .join(' ');
  const dbpPts = visits
    .map((v, i) => (v.bpDiastolic != null ? `${i * xStep},${yFor(v.bpDiastolic)}` : null))
    .filter((s): s is string => !!s)
    .join(' ');

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <line
        x1="0"
        y1={yFor(140)}
        x2={W}
        y2={yFor(140)}
        stroke="var(--rule-hair)"
        strokeDasharray="3 2"
      />
      <line
        x1="0"
        y1={yFor(90)}
        x2={W}
        y2={yFor(90)}
        stroke="var(--rule-hair)"
        strokeDasharray="3 2"
      />
      {sbpPts && (
        <polyline points={sbpPts} fill="none" stroke="var(--accent-navy)" strokeWidth="1.8" />
      )}
      {dbpPts && (
        <polyline
          points={dbpPts}
          fill="none"
          stroke="var(--ink-navy-muted)"
          strokeWidth="1.4"
          strokeDasharray="3 2"
        />
      )}
      {visits.map((v, i) => {
        if (v.bpSystolic == null) return null;
        const isLast = i === visits.length - 1;
        const alarm = v.bpSystolic >= 140;
        const fill = isLast
          ? alarm
            ? 'var(--risk-high)'
            : 'var(--accent-navy)'
          : alarm
            ? 'var(--risk-medium)'
            : 'var(--risk-low)';
        return (
          <circle key={i} cx={i * xStep} cy={yFor(v.bpSystolic)} r={isLast ? 4 : 3} fill={fill} />
        );
      })}
    </svg>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────

export default function HospitalConsolePage({ params }: { params: Promise<{ hcode: string }> }) {
  const { hcode } = use(params);
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('labor');
  const [selectedLabor, setSelectedLabor] = useState<string | null>(null);
  const [selectedAnc, setSelectedAnc] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  // Stacked layout: the preview is below the fold, so selecting a row brings it into view.
  const selectRow = (select: () => void) => {
    select();
    scrollPreviewIntoViewIfStacked(listRef.current, previewRef.current);
  };
  // Frozen render-time anchor — react-hooks/purity forbids bare Date.now()
  // in render code. SWR's 60s refresh re-derives KPIs from new data anyway,
  // so a per-mount snapshot is fine; we don't need a continuously ticking
  // now for "EDC in N days"–style copy.
  const [now] = useState<number>(() => Date.now());

  const {
    data: laborData,
    isLoading: laborLoading,
    error: laborError,
    mutate: laborMutate,
    // Without per_page the route defaults to 20 rows — below the historical
    // ward-census peak (34–39), so the floor roster silently dropped the
    // oldest admissions and every KPI undercounted. 500 covers any real
    // census; the registered-KPI itself reads pagination.total regardless.
  } = useSWR<LaborResponse>(`/api/hospitals/${hcode}/patients?per_page=500`, {
    refreshInterval: 30000,
  });
  const {
    data: ancData,
    isLoading: ancLoading,
    error: ancError,
    mutate: ancMutate,
    // per_page must exceed the largest hospital registry (435 today) or the
    // roster silently drops women — KPIs no longer depend on it (they read the
    // server's DB-wide counts), but the visible list should still be complete.
  } = useSWR<JourneyListResponse>(
    `/api/hospitals/${hcode}/journeys?stage=PREGNANCY&per_page=1000`,
    {
      refreshInterval: 60000,
    },
  );
  // Pregnancies elsewhere whose capability rules say they'll be referred
  // here for delivery. Only meaningful for hub hospitals (spokes return 0).
  const { data: incomingData } = useSWR<IncomingPregnanciesResponse>(
    `/api/hospitals/${hcode}/incoming-pregnancies?min_ga=${HOSPITAL_CONSOLE.referInMinGaWeeks}`,
    { refreshInterval: 60000 },
  );
  const incomingCount = incomingData?.count ?? 0;
  const incomingItems = useMemo(() => incomingData?.items ?? [], [incomingData?.items]);
  const minGa = incomingData?.minGaWeeks ?? HOSPITAL_CONSOLE.referInMinGaWeeks;

  const hospital = laborData?.hospital;
  const hospitalName = hospital?.name ?? `รหัส ${hcode}`;
  useSetBreadcrumbs([
    { label: 'แดชบอร์ด', href: '/' },
    { label: 'โรงพยาบาล', href: '/hospitals' },
    { label: hospitalName },
  ]);

  const labor = useMemo(() => {
    const list = laborData?.patients ?? [];
    const order: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return [...list].sort(
      (a, b) => (order[a.cpd_risk_level ?? 'LOW'] ?? 3) - (order[b.cpd_risk_level ?? 'LOW'] ?? 3),
    );
  }, [laborData]);
  // True ward census from the server COUNT — same contract as ancTotal below.
  const laborTotal = laborData?.pagination?.total ?? labor.length;

  // Stable reference for downstream memos — `ancData?.journeys ?? []` would
  // otherwise create a new array on every render.
  const journeys = useMemo(() => ancData?.journeys ?? [], [ancData]);

  // Effective selection — derived (not synchronized via effect, which React
  // 19 flags as cascading-render). If the user-clicked id still exists in
  // the latest data, keep it; otherwise fall back to a sensible default
  // (first-by-risk for labor, highest-risk for ANC).
  const effectiveLabor = useMemo(() => {
    if (selectedLabor && labor.some((p) => p.an === selectedLabor)) return selectedLabor;
    return labor[0]?.an ?? null;
  }, [selectedLabor, labor]);
  const effectiveAnc = useMemo(() => {
    if (selectedAnc && journeys.some((j) => j.id === selectedAnc)) return selectedAnc;
    if (journeys.length === 0) return null;
    const o: Record<string, number> = { HR3: 0, HR2: 1, HR1: 2, LOW: 3 };
    const sorted = [...journeys].sort(
      (a, b) => (o[a.ancRiskLevel] ?? 4) - (o[b.ancRiskLevel] ?? 4),
    );
    return sorted[0].id;
  }, [selectedAnc, journeys]);

  // Group ANC by trimester for the list view
  const ancByTrimester = useMemo(() => {
    const groups: Record<'T3' | 'T2' | 'T1' | 'unknown', JourneyListItem[]> = {
      T3: [],
      T2: [],
      T1: [],
      unknown: [],
    };
    for (const j of journeys) groups[gaTrimester(j.gaWeeks)].push(j);
    const o: Record<string, number> = { HR3: 0, HR2: 1, HR1: 2, LOW: 3 };
    for (const k of Object.keys(groups) as Array<keyof typeof groups>) {
      groups[k].sort((a, b) => (o[a.ancRiskLevel] ?? 4) - (o[b.ancRiskLevel] ?? 4));
    }
    return groups;
  }, [journeys]);

  // KPI computation. All `Date.now`-using counters are wrapped in useMemo —
  // React 19's purity rule flags impure calls in render code, and bundling
  // them into a memo is also faster (recomputes only when data changes).
  const laborAlarmCount = useMemo(
    () => labor.filter((p) => laborConcerns(p).some((c) => !c.warn)).length,
    [labor],
  );
  const laborSecondStage = useMemo(
    () => labor.filter((p) => (p.latest_cervix_cm ?? 0) >= HOSPITAL_CONSOLE.nearSecondStageCervixCm && p.labor_status === 'ACTIVE').length,
    [labor],
  );
  const laborMix = useMemo(() => {
    const m = { low: 0, medium: 0, high: 0 };
    for (const p of labor) {
      const t = laborTier(p.cpd_risk_level);
      if (t === 'high') m.high++;
      else if (t === 'medium') m.medium++;
      else m.low++;
    }
    return m;
  }, [labor]);

  // True registry size + risk mix come from the server's DB-wide aggregates
  // (pagination.total / counts) — deriving them from the fetched rows showed
  // the fetch cap as the registry size (e.g. "200" for 435 pregnancies).
  // Row-derived values remain only as a fallback for a cached response from
  // a build without `counts`.
  const ancTotal = ancData?.pagination.total ?? journeys.length;
  const ancMix = useMemo(() => {
    const c = ancData?.counts;
    if (c) return { low: c.low, medium: c.hr1 + c.hr2, high: c.hr3 };
    const m = { low: 0, medium: 0, high: 0 };
    for (const j of journeys) {
      const t = ancTier(j.ancRiskLevel);
      if (t === 'high') m.high++;
      else if (t === 'medium') m.medium++;
      else m.low++;
    }
    return m;
  }, [ancData?.counts, journeys]);
  const ancHr3 = ancMix.high;
  const ancOverdue = useMemo(
    () =>
      journeys.filter((j) => {
        const d = daysSince(j.lastAncDate);
        return d != null && d >= HOSPITAL_CONSOLE.ancOverdueAfterDays;
      }).length,
    [journeys],
  );
  const ancDueWeek = useMemo(
    () =>
      journeys.filter((j) => {
        if (!j.edc) return false;
        const d = (new Date(j.edc).getTime() - now) / 86400000;
        return d >= 0 && d <= HOSPITAL_CONSOLE.ancDueWithinDays;
      }).length,
    [journeys, now],
  );

  // Wait for BOTH primary feeds before painting — `&&` let the page render a
  // half-empty console the moment the faster feed resolved, so the labor tab
  // could flash "no patients" while its own fetch was still in flight.
  if (laborLoading || ancLoading) {
    return <LoadingState message="กำลังโหลดข้อมูลโรงพยาบาล…" />;
  }

  // Both primary feeds failed with nothing cached — there is no console to
  // show, so surface the failure with a retry that revalidates both.
  if (laborError && ancError && !laborData && !ancData) {
    return (
      <ErrorState
        message="ไม่สามารถโหลดข้อมูลโรงพยาบาลได้"
        detail={laborError instanceof Error ? laborError.message : String(laborError ?? ancError)}
        remedy={NETWORK_RETRY_REMEDY}
        onRetry={() => {
          laborMutate();
          ancMutate();
        }}
      />
    );
  }

  return (
    <ListPageLayout
      title={hospitalName}
      subtitle={`ห้องคลอดและทะเบียนฝากครรภ์ของโรงพยาบาล · รหัส ${hcode}${hospital?.level ? ` · ระดับ ${hospital.level}` : ''}`}
      updatedAt={hospital?.lastSyncAt ?? null}
      freshnessLabel="ซิงค์ล่าสุด"
      actions={
        <>
          <Link
            href="/hospitals"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-surface-card px-3 text-label text-ink hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            รายชื่อโรงพยาบาล
          </Link>
          {hospital?.connectionStatus && (
            <ConnectionStatus status={hospital.connectionStatus as ConnectionStatusEnum} className="text-label" />
          )}
        </>
      }
    >
      {/* Per-feed staleness banners — one feed can fail while the other keeps
          serving cached data, so name which registry went stale rather than
          replacing the whole console. */}
      {laborError && (
        <ErrorState
          variant="banner"
          message="โหลดข้อมูลห้องคลอดไม่สำเร็จ — แสดงข้อมูลเดิมจากแคช"
          remedy="ระบบจะลองใหม่อัตโนมัติ หรือกด ลองใหม่"
          onRetry={() => laborMutate()}
        />
      )}
      {ancError && (
        <ErrorState
          variant="banner"
          message="โหลดข้อมูลฝากครรภ์ไม่สำเร็จ — แสดงข้อมูลเดิมจากแคช"
          remedy="ระบบจะลองใหม่อัตโนมัติ หรือกด ลองใหม่"
          onRetry={() => ancMutate()}
        />
      )}

      <KpiGrid>
        <KpiTile
          testId="kpi-labor-total"
          label="ผู้คลอดในห้องคลอด"
          count={laborTotal}
          unit="ราย"
          sub={
            laborMix.low + laborMix.medium + laborMix.high > 0 ? (
              <RiskBar low={laborMix.low} medium={laborMix.medium} high={laborMix.high} height={6} />
            ) : (
              'ไม่มีผู้คลอดในขณะนี้'
            )
          }
        />
        <KpiTile
          testId="kpi-labor-alarms"
          label="สัญญาณชีพผิดปกติ"
          count={laborAlarmCount}
          unit="ราย"
          tone={laborAlarmCount > 0 ? 'high' : 'default'}
          sub={laborAlarmCount > 0 ? 'ตรวจสอบทันที' : 'ไม่มีสัญญาณเตือน'}
          hint={{
            title: 'สัญญาณชีพผิดปกติ',
            body: 'ผู้คลอดที่ค่าล่าสุดเข้าเกณฑ์เตือนอย่างน้อยหนึ่งอย่าง: ความดันโลหิตสูงมาก เสียงหัวใจทารกผิดปกติ หรือคะแนน CPD สูง — ดูรายละเอียดที่แถวผู้คลอด',
          }}
        />
        <KpiTile
          testId="kpi-labor-second-stage"
          label={`ปากมดลูก ≥ ${HOSPITAL_CONSOLE.nearSecondStageCervixCm} ซม.`}
          count={laborSecondStage}
          unit="ราย"
          sub="ใกล้ระยะเบ่งคลอด"
        />
        <KpiTile
          testId="kpi-anc-total"
          label={ANC_REGISTRY_LABEL_TH}
          count={ancTotal}
          unit="ราย"
          sub={<RiskBar low={ancMix.low} medium={ancMix.medium} high={ancMix.high} height={6} />}
          hint={{ title: 'ทะเบียนฝากครรภ์ของโรงพยาบาล', body: ANC_REGISTRY_CRITERIA_TH }}
        />
        <KpiTile
          testId="kpi-anc-hr3"
          label="ครรภ์เสี่ยงสูง HR3"
          count={ancHr3}
          unit="ราย"
          tone={ancHr3 > 0 ? 'warn' : 'default'}
          sub={ancTotal > 0 ? `${((ancHr3 / ancTotal) * 100).toFixed(1)}% ของทะเบียน` : undefined}
        />
        <KpiTile
          testId="kpi-anc-overdue"
          label={`ห่างนัด ANC ≥ ${HOSPITAL_CONSOLE.ancOverdueAfterDays} วัน`}
          count={ancOverdue}
          unit="ราย"
          tone={ancOverdue > 0 ? 'warn' : 'default'}
        />
        <KpiTile
          testId="kpi-anc-due-week"
          label={`ครบกำหนดคลอดใน ${HOSPITAL_CONSOLE.ancDueWithinDays} วัน`}
          count={ancDueWeek}
          unit="ราย"
        />
        <KpiTile
          testId="kpi-refer-in"
          label={`จะส่งต่อมา (GA ≥ ${minGa} สัปดาห์)`}
          count={incomingCount}
          unit="ราย"
          sub={
            incomingCount > 0
              ? `GA ${incomingData?.byTrigger.ga ?? 0} · น้ำหนักทารก ${incomingData?.byTrigger.fw ?? 0} · ความเสี่ยง ${incomingData?.byTrigger.risk ?? 0}`
              : 'ไม่มีรายชื่อในขณะนี้'
          }
        />
      </KpiGrid>

      {/* REFER-IN PIPELINE — pregnancies at spokes that will be sent here.
          Hidden on spoke hospitals (count === 0). */}
      {incomingCount > 0 && (
        <SectionCard
          title={`ผู้คลอดที่จะส่งต่อมา · GA ≥ ${minGa} สัปดาห์`}
          actions={
            <span className="text-label text-ink-muted">
              {incomingCount} ราย · {incomingItems.length === incomingCount ? 'แสดงทั้งหมด' : `แสดง ${incomingItems.length}`}
            </span>
          }
        >
          <DataTable<IncomingTermPregnancyItem>
            caption="ผู้คลอดที่จะส่งต่อมา"
            maxHeight={320}
            columns={INCOMING_COLUMNS}
            rows={incomingItems}
            rowKey={(p) => p.id}
            onRowClick={(p) => router.push(`/pregnancies/${p.id}`)}
            rowLabel={(p) => `เปิดข้อมูลการตั้งครรภ์ ${maskName(p.name)} HN ${p.hn}`}
            empty="ไม่มีรายชื่อในขณะนี้"
          />
        </SectionCard>
      )}

      <section aria-label="ผู้ป่วยในโรงพยาบาล" className="overflow-hidden rounded-2xl bg-surface-card shadow-soft">
        {/* Tabs */}
        <div className="flex flex-wrap items-stretch border-b border-border px-3">
          <button
            onClick={() => setTab('labor')}
            aria-pressed={tab === 'labor'}
            className="-mb-px flex items-center gap-2 px-5 py-2.5 text-label"
            style={{
              color: tab === 'labor' ? 'var(--ink-navy)' : 'var(--ink-navy-muted)',
              fontWeight: tab === 'labor' ? 700 : 500,
              borderBottom:
                tab === 'labor' ? '2px solid var(--accent-navy)' : '2px solid transparent',
            }}
          >
            ห้องคลอด
            <span
              className="rounded-full px-2 py-0.5 font-mono text-caption tabular-nums"
              style={{
                background: tab === 'labor' ? 'var(--accent-navy-soft)' : 'var(--rule-hair)',
                color: tab === 'labor' ? 'var(--accent-navy)' : 'var(--ink-navy-muted)',
              }}
            >
              {laborTotal}
            </span>
            {laborAlarmCount > 0 && (
              <span
                className="rounded-sm px-1.5 py-0.5 text-caption font-bold"
                style={{ background: COLOR.riskHighTint, color: COLOR.riskHighText }}
              >
                สัญญาณเตือน {laborAlarmCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('anc')}
            aria-pressed={tab === 'anc'}
            className="-mb-px flex items-center gap-2 px-5 py-2.5 text-label"
            style={{
              color: tab === 'anc' ? 'var(--ink-navy)' : 'var(--ink-navy-muted)',
              fontWeight: tab === 'anc' ? 700 : 500,
              borderBottom: tab === 'anc' ? '2px solid var(--accent-navy)' : '2px solid transparent',
            }}
          >
            ทะเบียนฝากครรภ์
            <span
              className="rounded-full px-2 py-0.5 font-mono text-caption tabular-nums"
              style={{
                background: tab === 'anc' ? 'var(--accent-navy-soft)' : 'var(--rule-hair)',
                color: tab === 'anc' ? 'var(--accent-navy)' : 'var(--ink-navy-muted)',
              }}
            >
              {ancTotal}
            </span>
            {ancHr3 > 0 && (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: 'var(--risk-high)' }}
              />
            )}
          </button>
        </div>

        {/* Body split */}
        <div className="grid grid-cols-1 @min-[1000px]:grid-cols-[1.05fr_1fr]">
          {/* List */}
          <div ref={listRef} className="px-4 py-4 @min-[1000px]:max-h-[calc(100dvh_-_var(--app-header-h,0px)_-_120px)] @min-[1000px]:overflow-y-auto @min-[1000px]:border-r @min-[1000px]:border-border">
            <div className="mb-2 flex items-baseline justify-between border-b border-brand pb-1">
              <div className="text-label text-ink">
                {tab === 'labor'
                  ? 'ห้องคลอด · เรียงตามความเสี่ยง CPD'
                  : 'ทะเบียนฝากครรภ์ · เรียงตามไตรมาสและความเสี่ยง'}
              </div>
              <div className="text-label text-ink-muted">
                {tab === 'labor'
                  ? labor.length < laborTotal
                    ? `แสดง ${labor.length} จาก ${laborTotal} ราย`
                    : `${laborTotal} ราย`
                  : journeys.length < ancTotal
                    ? `แสดง ${journeys.length} จาก ${ancTotal} ราย`
                    : `${ancTotal} ราย`}
              </div>
            </div>

            {tab === 'labor' ? (
              <>
                {labor.length === 0 ? (
                  <EmptyState
                    illustration="ward"
                    title="ไม่มีผู้คลอดในขณะนี้"
                    description="ข้อมูลจะปรากฏเมื่อโรงพยาบาลรับผู้คลอดเข้าห้องคลอดใน HOSxP"
                  />
                ) : (
                  <div>
                    <GroupHeader title="ผู้คลอดทั้งหมด" sub="เรียงตามคะแนน CPD" count={labor.length} />
                    <div>
                      {labor.map((p) => (
                        <LaborRow
                          key={p.an}
                          p={p}
                          isSelected={effectiveLabor === p.an}
                          onSelect={() => setSelectedLabor(p.an)}
                          onReveal={() => selectRow(() => setSelectedLabor(p.an))}
                          onOpen={() => router.push(`/patients/${buildPatientId(hcode, p.an)}`)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <PartographAuditPanel audit={laborData?.partographAudit} />
              </>
            ) : journeys.length === 0 ? (
              <EmptyState
                title="ยังไม่มีหญิงตั้งครรภ์ลงทะเบียนกับโรงพยาบาลนี้"
                description="ข้อมูลจะปรากฏเมื่อโรงพยาบาลซิงค์ทะเบียนฝากครรภ์จาก HOSxP"
              />
            ) : (
              <div className="space-y-3">
                {(['T3', 'T2', 'T1', 'unknown'] as const).map((tri) => {
                  const list = ancByTrimester[tri];
                  if (list.length === 0) return null;
                  const hr = list.filter((j) => j.ancRiskLevel === 'HR3').length;
                  const title =
                    tri === 'T3'
                      ? 'ไตรมาสที่ 3'
                      : tri === 'T2'
                        ? 'ไตรมาสที่ 2'
                        : tri === 'T1'
                          ? 'ไตรมาสที่ 1'
                          : 'ไม่ทราบอายุครรภ์';
                  const sub =
                    tri === 'T3'
                      ? '28 สัปดาห์ขึ้นไป'
                      : tri === 'T2'
                        ? '13–27 สัปดาห์'
                        : tri === 'T1'
                          ? '0–12 สัปดาห์'
                          : '—';
                  return (
                    <div key={tri}>
                      <GroupHeader title={title} sub={sub} count={list.length} hr={hr} />
                      <div>
                        {list.map((j) => (
                          <AncRow
                            key={j.id}
                            j={j}
                            isSelected={effectiveAnc === j.id}
                            onSelect={() => setSelectedAnc(j.id)}
                            onReveal={() => selectRow(() => setSelectedAnc(j.id))}
                            onOpen={() => router.push(`/pregnancies/${j.id}`)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Detail preview */}
          <div ref={previewRef} className="border-t border-border bg-surface-muted px-4 py-4 @min-[1000px]:max-h-[calc(100dvh_-_var(--app-header-h,0px)_-_120px)] @min-[1000px]:overflow-y-auto @min-[1000px]:border-t-0">
            {tab === 'labor' ? (
              (() => {
                const p = labor.find((x) => x.an === effectiveLabor);
                if (!p) return <EmptyPreview message="เลือกผู้คลอดในรายการเพื่อดูข้อมูลสรุป" />;
                return <LaborPreview patient={p} hcode={hcode} />;
              })()
            ) : effectiveAnc ? (
              <AncPreview journeyId={effectiveAnc} hcode={hcode} />
            ) : (
              <EmptyPreview message="เลือกหญิงตั้งครรภ์ในรายการเพื่อดูประวัติ ANC" />
            )}
          </div>
        </div>
      </section>
    </ListPageLayout>
  );
}
