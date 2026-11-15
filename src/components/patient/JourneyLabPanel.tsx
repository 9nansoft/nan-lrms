// Every ANC lab result on file for a pregnancy, from all hospitals involved.
// Display decisions come from buildJourneyLabPanel / presentLabResult.
'use client';

import type { ReactNode } from 'react';
import { Sparkline } from '@/components/charts/Sparkline';
import { LabTile, type LabTileStatus } from '@/components/patient/LabTile';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { InlineNotice } from '@/components/shared/InlineNotice';
import { LoadingState } from '@/components/shared/LoadingState';
import { SectionCard } from '@/components/shared/SectionCard';
import {
  ANC_LAB_ACCESS_DENIED,
  ANC_LAB_EARLIER_POSITIVE_NOTE,
  ANC_LAB_GREY_LEGEND,
  ANC_LAB_OWN_RESULTS_NOTICE,
  ANC_LAB_SOURCE_LABEL,
} from '@/config/anc-lab-display';
import { useJourneyLabs } from '@/hooks/useJourneyLabs';
import { formatBangkokDate, formatBangkokStamp } from '@/lib/bangkok-time';
import type { JourneyLabResult } from '@/services/anc-lab-results';
import {
  buildJourneyLabPanel,
  presentLabResult,
  type JourneyLabPanelModel,
  type LabTone,
  type LabTrend,
} from '@/services/anc-lab-presentation';

const SECTION_TITLE = 'ผลตรวจทางห้องปฏิบัติการทั้งหมดจาก HOSxP';

const STATUS_FOR_TONE: Record<LabTone, LabTileStatus> = {
  abnormal: 'abnormal',
  normal: 'normal',
  neutral: 'neutral',
  concealed: 'concealed',
  unreadable: 'unreadable',
  none: 'missing',
};

const GRID = 'grid gap-1.5';
const GRID_COLUMNS = { gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' };

function resultContext(r: JourneyLabResult): string {
  return [
    r.resultDate ? formatBangkokDate(new Date(r.resultDate)) : 'ไม่ระบุวันที่',
    r.gaWeeks === null ? null : `GA ${r.gaWeeks} สัปดาห์`,
    r.hospitalName,
    ANC_LAB_SOURCE_LABEL[r.source],
  ]
    .filter(Boolean)
    .join(' · ');
}

function ResultNotes({ r }: { r: JourneyLabResult }) {
  const p = presentLabResult(r);
  return (
    <div className="text-caption leading-snug text-[var(--ink-navy-dim)]">
      <div>{resultContext(r)}</div>
      {r.normalReference && <div>ค่าอ้างอิง HOSxP: {r.normalReference}</div>}
      {r.canonicalTest === null && p.hosxpFlagged && <div>HOSxP ระบุว่าผิดปกติ</div>}
      {r.classificationNote === 'value_shape_mismatch' && (
        <div>รูปแบบผลไม่ตรงกับชื่อการตรวจ กรุณาตรวจสอบใน HOSxP</div>
      )}
      {p.note && <div className="text-[var(--risk-medium-text)]">{p.note}</div>}
      {p.contextUnreadable && p.tone !== 'unreadable' && (
        <div className="text-[var(--risk-medium-text)]">
          อ่านข้อมูลประกอบบางส่วนไม่ได้ กรุณาตรวจสอบใน HOSxP
        </div>
      )}
    </div>
  );
}

function OlderResults({ rows }: { rows: JourneyLabResult[] }) {
  if (rows.length === 0) return null;
  return (
    <ul className="mt-1 border-t pt-1 text-caption" style={{ borderColor: 'var(--rule-hair)' }}>
      {rows.map((r) => {
        const p = presentLabResult(r);
        return (
          <li key={r.id} className="text-[var(--ink-navy-dim)]">
            <span
              className="font-mono font-semibold tabular-nums"
              style={p.tone === 'abnormal' ? { color: 'var(--risk-high-text)' } : undefined}
            >
              {p.value ?? p.stateLabel ?? '—'}
              {p.value !== null && r.unit ? ` ${r.unit}` : ''}
            </span>{' '}
            {p.value !== null && p.stateLabel ? `${p.stateLabel} · ` : ''}
            {resultContext(r)}
          </li>
        );
      })}
    </ul>
  );
}

function ResultTile({
  label,
  r,
  older = [],
  earlierPositive = null,
}: {
  label: string;
  r: JourneyLabResult;
  older?: JourneyLabResult[];
  earlierPositive?: JourneyLabResult | null;
}) {
  const p = presentLabResult(r, { earlierPositive: earlierPositive !== null });
  return (
    <LabTile
      testId={`lab-tile-${label}`}
      label={label}
      value={p.value}
      unit={r.unit}
      status={STATUS_FOR_TONE[p.tone]}
      statusLabel={p.stateLabel}
    >
      {earlierPositive && (
        <div
          data-testid="lab-earlier-positive"
          className="text-caption font-semibold"
          style={{ color: 'var(--risk-high-text)' }}
        >
          {ANC_LAB_EARLIER_POSITIVE_NOTE}{' '}
          {earlierPositive.resultDate
            ? formatBangkokDate(new Date(earlierPositive.resultDate))
            : 'ไม่ระบุวันที่'}
        </div>
      )}
      <ResultNotes r={r} />
      <OlderResults rows={older} />
    </LabTile>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 mt-3 font-mono text-caption uppercase tracking-[0.12em] text-[var(--ink-navy-muted)]">
      {children}
    </div>
  );
}

function TrendCard({ trend }: { trend: LabTrend }) {
  const first = trend.points[0];
  const last = trend.points[trend.points.length - 1];
  return (
    <div className="border bg-white px-2.5 py-1.5" style={{ borderColor: 'var(--rule-strong)' }}>
      <div className="font-mono text-caption font-bold text-[var(--ink-navy)]">
        {trend.labelTh} {last.value}
        {trend.unit ? ` ${trend.unit}` : ''}
      </div>
      <Sparkline
        values={trend.points.map((p) => p.value)}
        width={200}
        ariaLabel={`แนวโน้ม ${trend.labelTh} ${trend.points.length} ครั้ง`}
      />
      <div className="text-caption text-[var(--ink-navy-dim)]">
        {formatBangkokDate(new Date(first.date))} ถึง {formatBangkokDate(new Date(last.date))} ·{' '}
        {trend.points.length} ครั้ง
      </div>
    </div>
  );
}

function MissingTests({ items }: { items: JourneyLabPanelModel['missing'] }) {
  if (items.length === 0) return null;
  return (
    <div data-testid="lab-missing-list" className="mt-3 text-caption text-[var(--ink-navy-dim)]">
      <span className="font-semibold">ยังไม่มีผลในระบบ: </span>
      {items.map((m) => m.labelTh).join(' · ')}
    </div>
  );
}

function Provenance({ sources }: { sources: JourneyLabPanelModel['sources'] }) {
  return (
    <p data-testid="lab-provenance" className="text-caption text-[var(--ink-navy-muted)]">
      แหล่งข้อมูล: HOSxP
      {sources.map((s) => (
        <span key={s.hospitalName}>
          {' '}
          · {s.hospitalName} ซิงก์ล่าสุด {formatBangkokStamp(new Date(s.lastSyncedAt))}
        </span>
      ))}
    </p>
  );
}

function PanelBody({
  panel,
  showMissing,
}: {
  panel: JourneyLabPanelModel;
  /** Off when only part of the record is visible: absent here may exist elsewhere. */
  showMissing: boolean;
}) {
  return (
    <>
      <Provenance sources={panel.sources} />
      <p className="mt-1 text-caption text-[var(--ink-navy-muted)]">
        สีแดงแสดงเฉพาะผลที่ HOSxP หรือตัวผลตรวจระบุว่าผิดปกติ ระบบไม่ได้ประเมินค่าตัวเลขในส่วนนี้
      </p>
      <p className="mt-1 text-caption text-[var(--ink-navy-muted)]">{ANC_LAB_GREY_LEGEND}</p>
      {panel.trends.length > 0 && (
        <>
          <SubHeading>แนวโน้ม</SubHeading>
          <div className={GRID} style={GRID_COLUMNS}>
            {panel.trends.map((t) => (
              <TrendCard key={t.test} trend={t} />
            ))}
          </div>
        </>
      )}
      {panel.groups.map((group) => (
        <div key={group.id}>
          <SubHeading>{group.titleTh}</SubHeading>
          <div className={GRID} style={GRID_COLUMNS}>
            {group.tests.map((t) => (
              <ResultTile
                key={t.test}
                label={t.labelTh}
                r={t.latest}
                older={t.older}
                earlierPositive={t.earlierPositive}
              />
            ))}
          </div>
        </div>
      ))}
      {panel.other.length > 0 && (
        <div data-testid="lab-other">
          <SubHeading>ผลตรวจอื่น ๆ</SubHeading>
          <div className={GRID} style={GRID_COLUMNS}>
            {panel.other.map((r) => (
              <ResultTile
                key={r.id}
                label={r.labItemsName ?? r.ancLabName ?? 'ไม่ระบุชื่อการตรวจ'}
                r={r}
              />
            ))}
          </div>
        </div>
      )}
      {showMissing && <MissingTests items={panel.missing} />}
    </>
  );
}

export function JourneyLabPanel({ journeyId }: { journeyId: string }) {
  const { results, tier, error, isForbidden, isLoading, mutate } = useJourneyLabs(journeyId);
  const ownResultsOnly = tier === 'own_results';

  let body: ReactNode;
  if (isForbidden) {
    body = (
      <ErrorState
        variant="banner"
        message={ANC_LAB_ACCESS_DENIED.message}
        remedy={ANC_LAB_ACCESS_DENIED.remedy}
      />
    );
  } else if (results === null && isLoading) {
    body = <LoadingState message="กำลังโหลดผลตรวจ..." />;
  } else if (results === null) {
    body = (
      <ErrorState
        message="โหลดผลตรวจไม่สำเร็จ"
        remedy="กดลองใหม่ หากยังไม่ได้ให้แจ้งผู้ดูแลระบบ"
        onRetry={() => void mutate()}
      />
    );
  } else {
    const panel = buildJourneyLabPanel(results);
    body = (
      <>
        {error && (
          <ErrorState
            variant="banner"
            message="อัปเดตผลตรวจไม่สำเร็จ กำลังแสดงข้อมูลล่าสุดที่โหลดไว้"
            remedy="กดลองใหม่ หากยังไม่ได้ให้แจ้งผู้ดูแลระบบ"
            onRetry={() => void mutate()}
          />
        )}
        {ownResultsOnly && (
          <InlineNotice tone="info" className="mb-2">
            {ANC_LAB_OWN_RESULTS_NOTICE}
          </InlineNotice>
        )}
        {results.length === 0 ? (
          <>
            <EmptyState
              title={
                ownResultsOnly
                  ? 'โรงพยาบาลนี้ยังไม่มีผลตรวจของผู้ป่วยรายนี้'
                  : 'ยังไม่มีผลตรวจในระบบ'
              }
              description="ผลตรวจจะแสดงเมื่อ HOSxP ของโรงพยาบาลซิงก์ข้อมูลเข้ามา"
            />
            {!ownResultsOnly && <MissingTests items={panel.missing} />}
          </>
        ) : (
          <PanelBody panel={panel} showMissing={!ownResultsOnly} />
        )}
      </>
    );
  }

  return <SectionCard title={SECTION_TITLE}>{body}</SectionCard>;
}
