// StageTab — labor-stage data entry covering BOTH ipt_labour and the legacy
// `labor` table (delivery outcome). Save writes both sequentially; if the
// first succeeds and the second fails, an inline Thai message names the
// failed side and the failed side stays editable.
//
// Bug fixed (2026-04-28): the previous version returned early with
// "ไม่พบข้อมูล" when both rows were null — typical for fresh admissions —
// hiding the edit button entirely so users couldn't enter data. Now the
// form always renders; auto-enters edit mode when no data exists; save
// dispatches insert vs. update based on whether each row was found.
//
// Field set expanded per HOSxPLaborPackage_FULL.md `labor` schema to surface
// the canonical 5-stage timeline (onset → 3cm → full dilation → birth →
// placenta) the original 6-field port was missing.
'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useBmsSession } from '@/hooks/useBmsSession';
import {
  getPatientLabor,
  getPatientLabour,
  getPatientPartograph,
  upsertLabor,
  upsertLabour,
} from '@/services/maternity-ward';
import type { LaborRecord, LabourRecord, PartographRow } from '@/types/maternity-ward';
import { cn } from '@/lib/utils';

// ─── Draft state ──────────────────────────────────────────────────────────

interface DraftState {
  // ipt_labour summary
  labour_g: string;
  labour_ga: string;
  anc_count: string;
  // labor (delivery outcome) — labs
  mother_gvalue: string;
  mother_hct: string;
  mother_aging: string;
  // labor — stage timeline (date + time pairs)
  start_date: string;       start_time: string;
  cervical_3cm_date: string; cervical_3cm_time: string;
  close_date: string;       close_time: string;
  finish_date: string;      finish_time: string;
  other_date: string;       other_time: string;
}

function blankDraft(): DraftState {
  return {
    labour_g: '', labour_ga: '', anc_count: '',
    mother_gvalue: '', mother_hct: '', mother_aging: '',
    start_date: '',       start_time: '',
    cervical_3cm_date: '', cervical_3cm_time: '',
    close_date: '',       close_time: '',
    finish_date: '',      finish_time: '',
    other_date: '',       other_time: '',
  };
}

function strField(row: Record<string, unknown> | null | undefined, k: string): string {
  if (!row) return '';
  const v = row[k];
  if (v === null || v === undefined) return '';
  return String(v);
}

// Derive the first three Stage milestones from Partograph observations:
//   - onset (labour_startdate/time)            ← earliest observe_datetime
//   - active phase (labour_cervical_3cm_date/time) ← first observation
//                                                with cervical_dilation_cm ≥ 3
//   - full dilation (labour_closedate/time)    ← first observation
//                                                with cervical_dilation_cm ≥ 10
// Birth (labour_finishdate/time) and placenta (labour_otherdate/time) stay
// manual — the partograph doesn't carry an explicit birth marker. Manual
// values entered on the Stage tab always win over derived ones (see
// rowsToDraft below); we only fill blanks.
interface DerivedTimes {
  start_date: string;       start_time: string;
  cervical_3cm_date: string; cervical_3cm_time: string;
  close_date: string;       close_time: string;
}

function splitDateTime(observeDt: string): { date: string; time: string } {
  // observe_datetime comes back as 'YYYY-MM-DD HH:mm:ss' or 'YYYY-MM-DDTHH:mm:ss…'
  // Normalize either by extracting the first 10 + the next 8 chars.
  if (!observeDt) return { date: '', time: '' };
  const sep = observeDt.indexOf('T') >= 0 ? 'T' : ' ';
  const [date, rest = ''] = observeDt.split(sep);
  return { date: date ?? '', time: rest.slice(0, 8) };
}

function deriveStageTimesFromPartograph(rows: PartographRow[] | undefined): DerivedTimes {
  const empty: DerivedTimes = {
    start_date: '', start_time: '',
    cervical_3cm_date: '', cervical_3cm_time: '',
    close_date: '', close_time: '',
  };
  if (!rows || rows.length === 0) return empty;
  // Ascending sort so [0] is the earliest observation.
  const sorted = [...rows].sort((a, b) => a.observe_datetime.localeCompare(b.observe_datetime));
  const earliest = sorted[0];
  const first3cm = sorted.find((r) => (r.cervical_dilation_cm ?? -1) >= 3);
  const firstFull = sorted.find((r) => (r.cervical_dilation_cm ?? -1) >= 10);

  const onset = earliest ? splitDateTime(earliest.observe_datetime) : { date: '', time: '' };
  const active = first3cm ? splitDateTime(first3cm.observe_datetime) : { date: '', time: '' };
  const full = firstFull ? splitDateTime(firstFull.observe_datetime) : { date: '', time: '' };

  return {
    start_date: onset.date,         start_time: onset.time,
    cervical_3cm_date: active.date, cervical_3cm_time: active.time,
    close_date: full.date,          close_time: full.time,
  };
}

// Fill blanks from `derived`, but never override a value the nurse already
// typed on the labor row.
function preferLabor(stored: string, derived: string): string {
  return stored !== '' ? stored : derived;
}

function rowsToDraft(
  labour: LabourRecord | null | undefined,
  labor: LaborRecord | null | undefined,
  partograph?: PartographRow[],
): DraftState {
  const d = blankDraft();
  if (labour) {
    d.labour_g = labour.g?.toString() ?? '';
    d.labour_ga = labour.ga?.toString() ?? '';
    d.anc_count = labour.anc_count?.toString() ?? '';
  }
  if (labor) {
    const lr = labor as Record<string, unknown>;
    d.mother_gvalue = labor.mother_gvalue?.toString() ?? '';
    d.mother_hct = labor.mother_hct?.toString() ?? '';
    d.mother_aging = labor.mother_aging?.toString() ?? '';
    d.start_date         = strField(lr, 'labour_startdate');
    d.start_time         = strField(lr, 'labour_starttime');
    d.cervical_3cm_date  = strField(lr, 'labour_cervical_3cm_date');
    d.cervical_3cm_time  = strField(lr, 'labour_cervical_3cm_time');
    d.close_date         = strField(lr, 'labour_closedate');
    d.close_time         = strField(lr, 'labour_closetime');
    d.finish_date        = strField(lr, 'labour_finishdate');
    d.finish_time        = strField(lr, 'labour_finishtime');
    d.other_date         = strField(lr, 'labour_otherdate');
    d.other_time         = strField(lr, 'labour_othertime');
  }
  // Auto-fill stage-1/2/3 timestamps from partograph observations when the
  // labor row didn't store them. Manual-entered values always win.
  const derived = deriveStageTimesFromPartograph(partograph);
  d.start_date         = preferLabor(d.start_date, derived.start_date);
  d.start_time         = preferLabor(d.start_time, derived.start_time);
  d.cervical_3cm_date  = preferLabor(d.cervical_3cm_date, derived.cervical_3cm_date);
  d.cervical_3cm_time  = preferLabor(d.cervical_3cm_time, derived.cervical_3cm_time);
  d.close_date         = preferLabor(d.close_date, derived.close_date);
  d.close_time         = preferLabor(d.close_time, derived.close_time);
  return d;
}

function toIntOrNull(v: string): number | null {
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function toFloatOrNull(v: string): number | null {
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toStrOrNull(v: string): string | null {
  return v === '' ? null : v;
}

// ─── UI primitives (shared style with PreLabourTab) ──────────────────────

interface FieldProps {
  label: string;
  ariaLabel?: string;
  value: string;
  onChange?: (v: string) => void;
  type?: 'text' | 'date' | 'time' | 'number';
  hint?: string;
  readOnly?: boolean;
}

function Field({
  label, ariaLabel, value, onChange, type = 'text', hint, readOnly,
}: FieldProps) {
  const inputCls =
    'h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-[15px] text-slate-900 shadow-sm transition-colors hover:border-slate-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20';
  const numericCls = type === 'number' ? 'font-semibold tabular-nums' : '';

  if (readOnly) {
    const display = value === '' || value === undefined || value === null ? '—' : value;
    return (
      <div className="flex flex-col gap-1">
        <span className="flex items-baseline gap-2 text-[13px] font-semibold text-slate-800">
          <span className="truncate">{label}</span>
          {hint && <span className="text-[11px] font-normal text-slate-500">{hint}</span>}
        </span>
        <span
          className={cn(
            'min-h-[44px] flex items-center text-[15px] font-medium text-slate-900',
            (type === 'number' || type === 'time') && 'tabular-nums font-semibold',
          )}
        >
          {display}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-baseline gap-2 text-[13px] font-semibold text-slate-800">
        <span className="truncate">{label}</span>
        {hint && <span className="text-[11px] font-normal text-slate-500">{hint}</span>}
      </label>
      <input
        type={type === 'number' ? 'text' : type}
        inputMode={type === 'number' ? 'numeric' : undefined}
        aria-label={ariaLabel ?? label}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className={cn(inputCls, numericCls)}
      />
    </div>
  );
}

interface SectionProps {
  title: string;
  tone: 'timeline' | 'labs' | 'summary';
  cols?: string;
  children: React.ReactNode;
}

const TONE_TOKENS = {
  timeline: { ink: 'text-violet-700', bar: 'bg-violet-500', bg: 'bg-violet-50/40', ring: 'ring-violet-200/60' },
  labs:     { ink: 'text-cyan-700',   bar: 'bg-cyan-500',   bg: 'bg-cyan-50/40',   ring: 'ring-cyan-200/60' },
  summary:  { ink: 'text-indigo-700', bar: 'bg-indigo-500', bg: 'bg-indigo-50/40', ring: 'ring-indigo-200/60' },
};

function Section({ title, tone, cols = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4', children }: SectionProps) {
  const t = TONE_TOKENS[tone];
  return (
    <section className={cn('relative overflow-hidden rounded-lg bg-white shadow-sm ring-1', t.ring)}>
      <span aria-hidden className={cn('absolute left-0 top-0 bottom-0 w-1', t.bar)} />
      <h4 className={cn('flex items-center gap-2 border-b border-slate-100 px-5 py-3 text-[15px] font-bold tracking-tight', t.ink, t.bg)}>
        {title}
      </h4>
      <div className={cn('grid gap-x-4 gap-y-3.5 p-5', cols)}>{children}</div>
    </section>
  );
}

// Compact two-column "date + time" pair for stage milestones.
interface TimePairProps {
  label: string;
  hint?: string;
  date: string;
  time: string;
  onDate?: (v: string) => void;
  onTime?: (v: string) => void;
  ariaDate: string;
  ariaTime: string;
  readOnly?: boolean;
}
function TimePair({ label, hint, date, time, onDate, onTime, ariaDate, ariaTime, readOnly }: TimePairProps) {
  return (
    <div className="col-span-2 grid grid-cols-2 gap-3">
      <div className="col-span-2 -mb-2 flex items-baseline gap-2 text-[13px] font-semibold text-slate-800">
        <span>{label}</span>
        {hint && <span className="text-[11px] font-normal text-slate-500">{hint}</span>}
      </div>
      <Field label="วันที่" ariaLabel={ariaDate} value={date} onChange={onDate} type="date" readOnly={readOnly} />
      <Field label="เวลา"  ariaLabel={ariaTime} value={time} onChange={onTime} type="time" readOnly={readOnly} />
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

export function StageTab({ an }: { an: string }) {
  const { config, userInfo } = useBmsSession();
  const labour = useSWR<LabourRecord | null>(
    config ? ['labour', config.apiUrl, an] : null,
    () => getPatientLabour(config!, an),
  );
  const labor = useSWR<LaborRecord | null>(
    config ? ['labor', config.apiUrl, an] : null,
    () => getPatientLabor(config!, an),
  );
  // Partograph observations feed the derived stage-1/2/3 timestamps. We
  // tolerate failures here (treated as "no derivation available") so a
  // partograph fetch error doesn't block manual stage entry.
  const partograph = useSWR<PartographRow[]>(
    config ? ['partograph', config.apiUrl, an] : null,
    () => getPatientPartograph(config!, an),
  );

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftState>(() => blankDraft());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Pre-compute derived times so the section header can show a count + source
  // hint even when the user has already filled the labor row manually.
  const derivedTimes = useMemo(
    () => deriveStageTimesFromPartograph(partograph.data),
    [partograph.data],
  );
  const partographCount = partograph.data?.length ?? 0;

  const labourReady = !labour.isLoading && !labour.error;
  const laborReady = !labor.isLoading && !labor.error;
  // Partograph readiness intentionally NOT a blocker — derive runs whenever
  // its data lands, but the form is usable even before partograph loads.
  useEffect(() => {
    if (!labourReady || !laborReady) return;
    if (editing) return;
    setDraft(rowsToDraft(labour.data, labor.data, partograph.data));
    if (labour.data === null && labor.data === null) {
      setEditing(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labourReady, laborReady, labour.data, labor.data, partograph.data]);

  if (!config) {
    return <div className="p-4 text-slate-500">ไม่พร้อมใช้งาน (ไม่มี BMS session)</div>;
  }
  if (labour.isLoading || labor.isLoading) {
    return <div className="p-4 text-slate-500">กำลังโหลด…</div>;
  }
  const err = labour.error ?? labor.error;
  if (err) {
    return <div className="p-4 text-red-600">โหลดไม่สำเร็จ: {(err as Error).message}</div>;
  }

  const hcode = userInfo?.hospcode ?? '';
  const labourExists = labour.data !== null;
  const laborExists = labor.data !== null;
  const noRowsYet = !labourExists && !laborExists;

  function startEdit() {
    setDraft(rowsToDraft(labour.data, labor.data, partograph.data));
    setSaveError(null);
    setEditing(true);
  }
  function cancel() {
    setDraft(rowsToDraft(labour.data, labor.data, partograph.data));
    setSaveError(null);
    setEditing(false);
  }

  async function save() {
    if (!config || !userInfo) return;
    setSaving(true);
    setSaveError(null);
    try {
      try {
        // Forward the surrogate PK on the update path — BMS REST endpoint
        // expects /api/rest/ipt_labour/{ipt_labour_id}, not /{an}.
        const labourFields: Partial<LabourRecord> & { ipt_labour_id?: number } = {
          g: toIntOrNull(draft.labour_g),
          ga: toIntOrNull(draft.labour_ga),
          anc_count: toIntOrNull(draft.anc_count),
        };
        if (labourExists && labour.data?.ipt_labour_id !== undefined) {
          labourFields.ipt_labour_id = labour.data.ipt_labour_id;
        }
        await upsertLabour(
          config,
          userInfo,
          an,
          labourFields,
          hcode,
          labourExists,
        );
      } catch (e) {
        setSaveError(`บันทึก ipt_labour ไม่สำเร็จ: ${(e as Error).message}`);
        return;
      }
      try {
        const laborFields: Partial<LaborRecord> & { laborid?: number } = {
          mother_gvalue: toIntOrNull(draft.mother_gvalue),
          mother_hct: toFloatOrNull(draft.mother_hct),
          mother_aging: toIntOrNull(draft.mother_aging),
          labour_startdate: toStrOrNull(draft.start_date),
          labour_starttime: toStrOrNull(draft.start_time),
          labour_cervical_3cm_date: toStrOrNull(draft.cervical_3cm_date),
          labour_cervical_3cm_time: toStrOrNull(draft.cervical_3cm_time),
          labour_closedate: toStrOrNull(draft.close_date),
          labour_closetime: toStrOrNull(draft.close_time),
          labour_finishdate: toStrOrNull(draft.finish_date),
          labour_finishtime: toStrOrNull(draft.finish_time),
          labour_otherdate: toStrOrNull(draft.other_date),
          labour_othertime: toStrOrNull(draft.other_time),
        };
        if (laborExists && labor.data?.laborid !== undefined) {
          laborFields.laborid = labor.data.laborid;
        }
        await upsertLabor(
          config,
          userInfo,
          an,
          laborFields,
          hcode,
          laborExists,
        );
      } catch (e) {
        setSaveError(`บันทึก ipt_labour สำเร็จ แต่ labor ไม่สำเร็จ: ${(e as Error).message}`);
        return;
      }
      await Promise.all([labour.mutate(), labor.mutate()]);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      {/* Title + action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-900 pb-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="block h-1.5 w-8 bg-cyan-600" />
          <h2 className="text-[18px] font-bold tracking-tight text-slate-900">
            บันทึก Stage
          </h2>
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={startEdit}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-[14px] font-semibold text-slate-700 transition-colors hover:border-cyan-400 hover:text-cyan-700"
          >
            แก้ไข
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-[14px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md border-2 border-cyan-700 bg-cyan-700 px-6 py-2 text-[14px] font-bold text-white transition-colors hover:bg-cyan-800 disabled:opacity-40"
            >
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
          </div>
        )}
      </div>

      {/* Empty-state banner — keeps "ไม่พบข้อมูล" phrase + adds CTA */}
      {noRowsYet && editing && (
        <div className="rounded-lg border-2 border-cyan-200 bg-cyan-50 px-4 py-3 text-[13px] text-cyan-900">
          ไม่พบข้อมูลระยะคลอดสำหรับ AN <span className="font-mono font-bold">{an}</span> — กรอกฟอร์มด้านล่างแล้วกด <strong>บันทึก</strong> เพื่อสร้างข้อมูลใหม่
        </div>
      )}

      {saveError && (
        <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-700 shadow-sm">
          {saveError}
        </div>
      )}

      {/* Partograph auto-sync banner — surfaces when derivation contributed
          values, so the nurse knows where the timestamps came from and can
          override or accept by clicking บันทึก. */}
      {partographCount > 0 &&
        (derivedTimes.start_date ||
          derivedTimes.cervical_3cm_date ||
          derivedTimes.close_date) && (
          <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-[12px] text-violet-900">
            <span className="font-semibold">ระยะที่ 1–3 ดึงจาก Partograph อัตโนมัติ</span>
            {' · '}
            <span className="text-violet-700">{partographCount} observations</span>
            {derivedTimes.start_date && (
              <>
                {' · '}เริ่มเจ็บ <span className="font-mono font-semibold">{derivedTimes.start_date} {derivedTimes.start_time.slice(0, 5)}</span>
              </>
            )}
            {derivedTimes.cervical_3cm_date && (
              <>
                {' · '}3 ซม. <span className="font-mono font-semibold">{derivedTimes.cervical_3cm_date} {derivedTimes.cervical_3cm_time.slice(0, 5)}</span>
              </>
            )}
            {derivedTimes.close_date && (
              <>
                {' · '}ปากเปิดหมด <span className="font-mono font-semibold">{derivedTimes.close_date} {derivedTimes.close_time.slice(0, 5)}</span>
              </>
            )}
            <div className="mt-0.5 text-[11px] text-violet-600">
              ค่าที่กรอกเองจะแทนที่ค่าจาก Partograph เสมอ — กดบันทึกเพื่อยืนยัน
            </div>
          </div>
        )}

      {/* Stage timeline — 5 milestones, each a date+time pair */}
      <Section title="ระยะการคลอด · Timeline" tone="timeline" cols="grid-cols-2 sm:grid-cols-4 lg:grid-cols-4">
        <TimePair label="1 · เริ่มเจ็บครรภ์" hint="onset" date={draft.start_date} time={draft.start_time} onDate={(v) => setDraft((d) => ({ ...d, start_date: v }))} onTime={(v) => setDraft((d) => ({ ...d, start_time: v }))} ariaDate="labour_startdate" ariaTime="labour_starttime" readOnly={!editing} />
        <TimePair label="2 · ปากมดลูกเปิด 3 ซม." hint="active phase" date={draft.cervical_3cm_date} time={draft.cervical_3cm_time} onDate={(v) => setDraft((d) => ({ ...d, cervical_3cm_date: v }))} onTime={(v) => setDraft((d) => ({ ...d, cervical_3cm_time: v }))} ariaDate="labour_cervical_3cm_date" ariaTime="labour_cervical_3cm_time" readOnly={!editing} />
        <TimePair label="3 · ปากเปิดหมด" hint="full dilation" date={draft.close_date} time={draft.close_time} onDate={(v) => setDraft((d) => ({ ...d, close_date: v }))} onTime={(v) => setDraft((d) => ({ ...d, close_time: v }))} ariaDate="labour_closedate" ariaTime="labour_closetime" readOnly={!editing} />
        <TimePair label="4 · เด็กเกิด" hint="birth" date={draft.finish_date} time={draft.finish_time} onDate={(v) => setDraft((d) => ({ ...d, finish_date: v }))} onTime={(v) => setDraft((d) => ({ ...d, finish_time: v }))} ariaDate="labour_finishdate" ariaTime="labour_finishtime" readOnly={!editing} />
        <TimePair label="5 · รกคลอด" hint="placenta" date={draft.other_date} time={draft.other_time} onDate={(v) => setDraft((d) => ({ ...d, other_date: v }))} onTime={(v) => setDraft((d) => ({ ...d, other_time: v }))} ariaDate="labour_otherdate" ariaTime="labour_othertime" readOnly={!editing} />
      </Section>

      {/* Maternal labs */}
      <Section title="ผลห้องปฏิบัติการมารดา · Maternal Labs" tone="labs" cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="Mother G" ariaLabel="mother_gvalue" type="number" value={draft.mother_gvalue} onChange={(v) => setDraft((d) => ({ ...d, mother_gvalue: v }))} readOnly={!editing} hint="gravidity" />
        <Field label="HCT" ariaLabel="mother_hct" type="number" value={draft.mother_hct} onChange={(v) => setDraft((d) => ({ ...d, mother_hct: v }))} readOnly={!editing} hint="%" />
        <Field label="อายุมารดา" ariaLabel="mother_aging" type="number" value={draft.mother_aging} onChange={(v) => setDraft((d) => ({ ...d, mother_aging: v }))} readOnly={!editing} hint="ปี" />
      </Section>

      {/* Labour summary — fields shared with PreLabourTab; kept here for
          backward-compat with existing tests that exercise labour_g etc. */}
      <Section title="Labour summary · ipt_labour" tone="summary" cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="G" ariaLabel="labour_g" type="number" value={draft.labour_g} onChange={(v) => setDraft((d) => ({ ...d, labour_g: v }))} readOnly={!editing} />
        <Field label="GA" ariaLabel="labour_ga" type="number" value={draft.labour_ga} onChange={(v) => setDraft((d) => ({ ...d, labour_ga: v }))} readOnly={!editing} hint="weeks" />
        <Field label="ANC count" ariaLabel="anc_count" type="number" value={draft.anc_count} onChange={(v) => setDraft((d) => ({ ...d, anc_count: v }))} readOnly={!editing} hint="visits" />
      </Section>
    </div>
  );
}
