// InfantTab — ipt_newborn + ipt_labour_infant CRUD with table + inline-edit row.
// Visual matches the v2 dialog design language used by Medications/StageMed:
//   * Sex chips (ชาย/หญิง) wired to a free-form text input so callers may also
//     type Thai HOSxP codes ('1'/'2') or legacy 'M'/'F'.
//   * Birth weight quick-pick chips (2500/3000/3500/4000) above a numeric input.
//   * Body length / head length numeric inputs (cm).
//   * APGAR 1' / 5' / 10' as 0–10 chip ladders with a clinical color zone:
//     0–3 critical, 4–6 warn, 7–10 ok.
//   * Birth checks (VitK/Eye paste/BCG/Hep B/Feed milk) as toggle chips that
//     write 'Y'/null on click — matches the HOSxP char(1) convention.
//   * Auto-fills today's date + now-time when adding a new infant.
//   * EditRow + helpers live at module scope so React keeps stable identity
//     across parent re-renders (avoids the picker remount bug we hit on the
//     Medications tab).
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useBmsSession } from '@/hooks/useBmsSession';
import {
  deleteInfant,
  getPatientInfants,
  upsertLabourInfant,
  upsertNewborn,
} from '@/services/maternity-ward';
import type { InfantRow } from '@/types/maternity-ward';
import { cn } from '@/lib/utils';

// ─── Types & helpers ──────────────────────────────────────────────────────

type EditState = {
  ipt_newborn_id?: number;
  ipt_labour_infant_id?: number;
  sex: string;
  birth_weight: string;
  body_length: string;
  head_length: string;
  birth_date: string;       // ISO yyyy-mm-dd
  birth_time: string;       // HH:mm
  apgar1: string;
  apgar5: string;
  apgar10: string;
  vitk: 'Y' | '';
  eyepaste: 'Y' | '';
  bcg: 'Y' | '';
  hepb: 'Y' | '';
  feed_milk: 'Y' | '';
};

const EMPTY_DRAFT: EditState = {
  sex: '',
  birth_weight: '',
  body_length: '',
  head_length: '',
  birth_date: '',
  birth_time: '',
  apgar1: '',
  apgar5: '',
  apgar10: '',
  vitk: '',
  eyepaste: '',
  bcg: '',
  hepb: '',
  feed_milk: '',
};

function toNumberOrNull(v: string): number | null {
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function rowKey(row: InfantRow, index: number): string | number {
  return row.ipt_labour_infant_id ?? row.ipt_newborn_id ?? index;
}

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function nowHhmm(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

const SEX_CHIPS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'ชาย ♂', value: '1' },
  { label: 'หญิง ♀', value: '2' },
];
const BIRTH_WEIGHT_PRESETS = ['2500', '3000', '3500', '4000'];

// APGAR 0–10 ladder with severity zones (clinical convention):
//   0–3: severe distress (red)  ·  4–6: depressed (amber)  ·  7–10: ok (green)
const APGAR_SCORES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;
function apgarZone(v: string): 'crit' | 'warn' | 'ok' | 'none' {
  if (v === '') return 'none';
  const n = Number(v);
  if (!Number.isFinite(n)) return 'none';
  if (n <= 3) return 'crit';
  if (n <= 6) return 'warn';
  return 'ok';
}

// ─── Reusable input + chip primitives (module scope) ──────────────────────

interface ChipRowProps {
  options: ReadonlyArray<string | { label: string; value: string }>;
  selected: string;
  onPick: (v: string) => void;
  ariaLabel: string;
  zoneOf?: (v: string) => 'crit' | 'warn' | 'ok' | 'none';
}

function ChipRow({ options, selected, onPick, ariaLabel, zoneOf }: ChipRowProps) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const value = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt : opt.label;
        const isSelected = selected === value;
        const zone = zoneOf ? zoneOf(value) : 'none';
        let tone = '';
        if (isSelected) {
          if (zone === 'crit') tone = 'border-rose-600 bg-rose-600 text-white shadow-sm ring-2 ring-rose-600/20';
          else if (zone === 'warn') tone = 'border-amber-600 bg-amber-500 text-white shadow-sm ring-2 ring-amber-500/20';
          else if (zone === 'ok') tone = 'border-emerald-600 bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-600/20';
          else tone = 'border-cyan-600 bg-cyan-600 text-white shadow-sm ring-2 ring-cyan-600/20';
        } else {
          tone = 'border-slate-200 bg-white text-slate-700 hover:border-cyan-400 hover:bg-cyan-50/60 hover:text-cyan-700';
        }
        return (
          <button
            key={value}
            type="button"
            onClick={() => onPick(value)}
            className={cn(
              'rounded-md border px-2.5 py-1 text-[12px] font-semibold transition-all',
              tone,
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

interface ToggleChipProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
}
function ToggleChip({ label, checked, onToggle }: ToggleChipProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className={cn(
        'rounded-md border px-3 py-1.5 text-[12px] font-semibold transition-all',
        checked
          ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-600/20'
          : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-400 hover:bg-emerald-50/60 hover:text-emerald-700',
      )}
    >
      {checked ? '✓ ' : ''}{label}
    </button>
  );
}

interface InlineInputProps {
  ariaLabel: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'number' | 'date' | 'time';
  width?: string;
}
function InlineInput({ ariaLabel, value, onChange, placeholder, type = 'text', width }: InlineInputProps) {
  return (
    <input
      type={type === 'number' ? 'text' : type}
      inputMode={type === 'number' ? 'numeric' : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={cn(
        'h-10 rounded-md border border-slate-200 bg-white px-3 text-[14px] text-slate-900 shadow-sm transition-colors hover:border-slate-300 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20',
        width ?? 'w-full',
        type === 'number' && 'font-semibold tabular-nums',
      )}
    />
  );
}

// ─── EditRow (module scope) ────────────────────────────────────────────────

interface EditRowProps {
  draft: EditState;
  setDraft: React.Dispatch<React.SetStateAction<EditState>>;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}

function EditRow({ draft, setDraft, saving, onCancel, onSave }: EditRowProps) {
  return (
    <tr className="bg-cyan-50/40">
      <td colSpan={5} className="px-4 py-4">
        <div className="space-y-4">
          {/* IDENTITY: sex + birth date+time */}
          <div className="rounded-md border border-cyan-200 bg-white p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr]">
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-slate-700">เพศ</label>
                <ChipRow
                  ariaLabel="sex quick picks"
                  options={SEX_CHIPS}
                  selected={draft.sex}
                  onPick={(v) => setDraft((d) => ({ ...d, sex: v }))}
                />
                <InlineInput
                  ariaLabel="sex"
                  value={draft.sex}
                  onChange={(v) => setDraft((d) => ({ ...d, sex: v }))}
                  placeholder="1=ชาย / 2=หญิง"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-slate-700">วันเกิด</label>
                <div className="h-7" aria-hidden />
                <InlineInput
                  ariaLabel="birth_date"
                  value={draft.birth_date}
                  onChange={(v) => setDraft((d) => ({ ...d, birth_date: v }))}
                  type="date"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-slate-700">เวลาเกิด</label>
                <div className="h-7" aria-hidden />
                <InlineInput
                  ariaLabel="birth_time"
                  value={draft.birth_time}
                  onChange={(v) => setDraft((d) => ({ ...d, birth_time: v }))}
                  type="time"
                />
              </div>
            </div>
          </div>

          {/* ANTHROPOMETRY */}
          <div className="rounded-md border border-cyan-200 bg-white p-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              ขนาดแรกเกิด
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-slate-700">
                  น้ำหนักแรกเกิด (กรัม)
                </label>
                <ChipRow
                  ariaLabel="birth_weight quick picks"
                  options={BIRTH_WEIGHT_PRESETS}
                  selected={draft.birth_weight}
                  onPick={(v) => setDraft((d) => ({ ...d, birth_weight: v }))}
                />
                <InlineInput
                  ariaLabel="birth_weight"
                  value={draft.birth_weight}
                  onChange={(v) => setDraft((d) => ({ ...d, birth_weight: v }))}
                  type="number"
                  placeholder="เช่น 3200"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-slate-700">ความยาว (ซม.)</label>
                <div className="h-7" aria-hidden />
                <InlineInput
                  ariaLabel="body_length"
                  value={draft.body_length}
                  onChange={(v) => setDraft((d) => ({ ...d, body_length: v }))}
                  type="number"
                  placeholder="เช่น 50"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-slate-700">รอบศีรษะ (ซม.)</label>
                <div className="h-7" aria-hidden />
                <InlineInput
                  ariaLabel="head_length"
                  value={draft.head_length}
                  onChange={(v) => setDraft((d) => ({ ...d, head_length: v }))}
                  type="number"
                  placeholder="เช่น 34"
                />
              </div>
            </div>
          </div>

          {/* APGAR LADDER */}
          <div className="rounded-md border border-cyan-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                APGAR Score
              </span>
              <span className="text-[10px] text-slate-400">
                <span className="text-emerald-600">●</span> 7–10 ปกติ
                <span className="ml-2 text-amber-600">●</span> 4–6 ต้องเฝ้าระวัง
                <span className="ml-2 text-rose-600">●</span> 0–3 วิกฤต
              </span>
            </div>
            <div className="space-y-2">
              {[
                { label: '1 นาที', key: 'apgar1' as const },
                { label: '5 นาที', key: 'apgar5' as const },
                { label: '10 นาที', key: 'apgar10' as const },
              ].map(({ label, key }) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-16 text-[12px] font-semibold text-slate-600">{label}</span>
                  <ChipRow
                    ariaLabel={`${key} score`}
                    options={[...APGAR_SCORES]}
                    selected={draft[key]}
                    onPick={(v) => setDraft((d) => ({ ...d, [key]: v }))}
                    zoneOf={apgarZone}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* BIRTH CHECKS */}
          <div className="rounded-md border border-cyan-200 bg-white p-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              การให้ยา / วัคซีนแรกเกิด
            </div>
            <div className="flex flex-wrap gap-2">
              <ToggleChip
                label="Vitamin K"
                checked={draft.vitk === 'Y'}
                onToggle={() => setDraft((d) => ({ ...d, vitk: d.vitk === 'Y' ? '' : 'Y' }))}
              />
              <ToggleChip
                label="Eye paste"
                checked={draft.eyepaste === 'Y'}
                onToggle={() => setDraft((d) => ({ ...d, eyepaste: d.eyepaste === 'Y' ? '' : 'Y' }))}
              />
              <ToggleChip
                label="BCG"
                checked={draft.bcg === 'Y'}
                onToggle={() => setDraft((d) => ({ ...d, bcg: d.bcg === 'Y' ? '' : 'Y' }))}
              />
              <ToggleChip
                label="Hep B"
                checked={draft.hepb === 'Y'}
                onToggle={() => setDraft((d) => ({ ...d, hepb: d.hepb === 'Y' ? '' : 'Y' }))}
              />
              <ToggleChip
                label="Feed milk"
                checked={draft.feed_milk === 'Y'}
                onToggle={() =>
                  setDraft((d) => ({ ...d, feed_milk: d.feed_milk === 'Y' ? '' : 'Y' }))
                }
              />
            </div>
          </div>

          {/* Action bar */}
          <div className="flex justify-end gap-2 border-t border-cyan-200 pt-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving || (!draft.sex.trim() && !draft.birth_weight.trim())}
              className="rounded-md border-2 border-cyan-700 bg-cyan-700 px-5 py-2 text-[13px] font-bold text-white transition-colors hover:bg-cyan-800 disabled:opacity-40"
              title={
                !draft.sex.trim() && !draft.birth_weight.trim()
                  ? 'ระบุเพศหรือน้ำหนักก่อนบันทึก'
                  : undefined
              }
            >
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

export function InfantTab({ an }: { an: string }) {
  const { config, userInfo } = useBmsSession();
  const { data, error, isLoading, mutate } = useSWR<InfantRow[]>(
    config ? ['infants', config.apiUrl, an] : null,
    () => getPatientInfants(config!, an),
  );

  const [editingKey, setEditingKey] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<EditState>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!config) {
    return <div className="p-4 text-slate-500">ไม่พร้อมใช้งาน (ไม่มี BMS session)</div>;
  }
  if (isLoading) return <div className="p-4 text-slate-500">กำลังโหลด…</div>;
  if (error) {
    return <div className="p-4 text-red-600">โหลดไม่สำเร็จ: {(error as Error).message}</div>;
  }

  const hcode = userInfo?.hospcode ?? '';
  const rows = data ?? [];
  const isEmpty = rows.length === 0 && editingKey !== 'new';

  function startAdd() {
    setEditingKey('new');
    setDraft({ ...EMPTY_DRAFT, birth_date: todayIso(), birth_time: nowHhmm() });
    setSaveError(null);
  }

  function startEdit(row: InfantRow, index: number) {
    setEditingKey(String(rowKey(row, index)));
    const rRaw = row as Record<string, unknown>;
    const str = (k: string): string => {
      const v = rRaw[k];
      if (v === null || v === undefined) return '';
      return String(v);
    };
    const yn = (k: string): 'Y' | '' => (rRaw[k] === 'Y' ? 'Y' : '');
    setDraft({
      ipt_newborn_id: row.ipt_newborn_id,
      ipt_labour_infant_id: row.ipt_labour_infant_id,
      sex: row.sex ?? '',
      birth_weight: row.birth_weight?.toString() ?? '',
      body_length: str('body_length'),
      head_length: str('head_length'),
      birth_date: str('birth_date').slice(0, 10),
      birth_time: str('birth_time').slice(0, 5),
      apgar1: str('apgar_score_min1'),
      apgar5: str('apgar_score_min5'),
      apgar10: str('apgar_score_min10'),
      vitk: yn('infant_check_vitk'),
      eyepaste: yn('infant_check_eyepaste'),
      bcg: yn('infant_check_bcg'),
      hepb: yn('infant_check_hepb'),
      feed_milk: yn('infant_check_feed_milk'),
    });
    setSaveError(null);
  }

  function cancel() {
    setEditingKey(null);
    setDraft(EMPTY_DRAFT);
    setSaveError(null);
  }

  async function save() {
    if (!config || !userInfo) return;
    setSaving(true);
    setSaveError(null);
    try {
      const fields: Partial<InfantRow> = {
        sex: draft.sex || null,
        birth_weight: toNumberOrNull(draft.birth_weight),
        body_length: toNumberOrNull(draft.body_length),
        head_length: toNumberOrNull(draft.head_length),
        birth_date: draft.birth_date || null,
        birth_time: draft.birth_time ? `${draft.birth_time}:00` : null,
        apgar_score_min1: toNumberOrNull(draft.apgar1),
        apgar_score_min5: toNumberOrNull(draft.apgar5),
        apgar_score_min10: toNumberOrNull(draft.apgar10),
        infant_check_vitk: draft.vitk || null,
        infant_check_eyepaste: draft.eyepaste || null,
        infant_check_bcg: draft.bcg || null,
        infant_check_hepb: draft.hepb || null,
        infant_check_feed_milk: draft.feed_milk || null,
      };
      try {
        await upsertNewborn(
          config,
          userInfo,
          an,
          { ...fields, ipt_newborn_id: draft.ipt_newborn_id },
          hcode,
        );
      } catch (e) {
        setSaveError(`บันทึก ipt_newborn ไม่สำเร็จ: ${(e as Error).message}`);
        return;
      }
      try {
        await upsertLabourInfant(
          config,
          userInfo,
          an,
          { ...fields, ipt_labour_infant_id: draft.ipt_labour_infant_id },
          hcode,
        );
      } catch (e) {
        setSaveError(
          `บันทึก ipt_newborn สำเร็จ แต่ ipt_labour_infant ไม่สำเร็จ: ${(e as Error).message}`,
        );
        return;
      }
      await mutate();
      setEditingKey(null);
      setDraft(EMPTY_DRAFT);
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: InfantRow) {
    if (!config || !userInfo) return;
    if (row.ipt_newborn_id === undefined) return;
    if (!window.confirm('ยืนยันการลบรายการนี้หรือไม่?')) return;
    setSaving(true);
    try {
      await deleteInfant(config, userInfo, row.ipt_newborn_id, row.ipt_labour_infant_id, hcode);
      await mutate();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-900 pb-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="block h-1.5 w-8 bg-cyan-600" />
          <h2 className="text-[18px] font-bold tracking-tight text-slate-900">ข้อมูลทารก</h2>
          {rows.length > 0 && (
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-[12px] font-semibold text-slate-700">
              {rows.length} ราย
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={startAdd}
          disabled={editingKey !== null}
          className="rounded-md border-2 border-cyan-700 bg-cyan-700 px-4 py-2 text-[14px] font-bold text-white transition-colors hover:bg-cyan-800 disabled:opacity-40"
        >
          + เพิ่มทารก
        </button>
      </div>

      {saveError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
          {saveError}
        </div>
      )}

      {isEmpty ? (
        <div className="rounded-lg border-2 border-dashed border-slate-200 bg-white p-8 text-center">
          <div className="text-[14px] font-medium text-slate-600">ไม่พบข้อมูล</div>
          <div className="mt-1 text-[12px] text-slate-500">
            กดปุ่ม <strong>+ เพิ่มทารก</strong> ด้านบนเพื่อบันทึกทารกใหม่
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-[12px] font-bold uppercase tracking-wide text-slate-600">
                <th className="px-4 py-3">เพศ</th>
                <th className="px-4 py-3 text-right">น้ำหนัก (ก.)</th>
                <th className="px-4 py-3">APGAR (1′ / 5′ / 10′)</th>
                <th className="px-4 py-3">HN ทารก</th>
                <th className="px-4 py-3 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {editingKey === 'new' && (
                <EditRow
                  draft={draft}
                  setDraft={setDraft}
                  saving={saving}
                  onCancel={cancel}
                  onSave={save}
                />
              )}
              {rows.map((row, index) => {
                const k = String(rowKey(row, index));
                if (editingKey === k) {
                  return (
                    <EditRow
                      key={`edit-${k}`}
                      draft={draft}
                      setDraft={setDraft}
                      saving={saving}
                      onCancel={cancel}
                      onSave={save}
                    />
                  );
                }
                const r = row as Record<string, unknown>;
                const apg = (k2: string) => {
                  const v = r[k2];
                  return v === null || v === undefined || v === '' ? '—' : String(v);
                };
                return (
                  <tr key={k} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-semibold text-slate-900">{row.sex ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {row.birth_weight ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-[13px] tabular-nums text-slate-700">
                      {apg('apgar_score_min1')} / {apg('apgar_score_min5')} / {apg('apgar_score_min10')}
                    </td>
                    <td className="px-4 py-3 font-mono text-[13px] text-slate-700">
                      {(row.infant_hn as string | undefined) ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(row, index)}
                          disabled={editingKey !== null}
                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 transition-colors hover:border-cyan-400 hover:text-cyan-700 disabled:opacity-40"
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(row)}
                          disabled={
                            editingKey !== null || saving || row.ipt_newborn_id === undefined
                          }
                          className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-40"
                        >
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
