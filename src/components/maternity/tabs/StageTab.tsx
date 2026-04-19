// Task 33: StageTab read-only.
// Task 44: extended with form-based CRUD covering BOTH ipt_labour and the
// legacy `labor` table. Save writes both sequentially (best-effort: if the
// first succeeds and the second fails, an inline Thai message names the
// failed side). No delete — these are 1:1 records per AN.
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useBmsSession } from '@/hooks/useBmsSession';
import {
  getPatientLabor,
  getPatientLabour,
  upsertLabor,
  upsertLabour,
} from '@/services/maternity-ward';
import type { LaborRecord, LabourRecord } from '@/types/maternity-ward';

interface FieldProps {
  label: string;
  value: string | number | null | undefined;
}

function Field({ label, value }: FieldProps) {
  const display = value === null || value === undefined || value === '' ? '-' : String(value);
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{display}</dd>
    </div>
  );
}

interface FormInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}

function FormInput({ label, value, onChange, ariaLabel }: FormInputProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-xs text-slate-500">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="rounded border border-slate-300 px-2 py-1 text-sm"
      />
    </div>
  );
}

function toNumberOrNull(v: string): number | null {
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface DraftState {
  labour_g: string;
  labour_ga: string;
  anc_count: string;
  mother_gvalue: string;
  mother_hct: string;
  mother_aging: string;
}

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

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftState>({
    labour_g: '',
    labour_ga: '',
    anc_count: '',
    mother_gvalue: '',
    mother_hct: '',
    mother_aging: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
  if (!labour.data && !labor.data) {
    return <div className="p-4 text-slate-500">ไม่พบข้อมูล</div>;
  }

  const hcode = userInfo?.hospcode ?? '';

  function startEdit() {
    setDraft({
      labour_g: labour.data?.g?.toString() ?? '',
      labour_ga: labour.data?.ga?.toString() ?? '',
      anc_count: labour.data?.anc_count?.toString() ?? '',
      mother_gvalue: labor.data?.mother_gvalue?.toString() ?? '',
      mother_hct: labor.data?.mother_hct?.toString() ?? '',
      mother_aging: labor.data?.mother_aging?.toString() ?? '',
    });
    setSaveError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setSaveError(null);
  }

  async function save() {
    if (!config || !userInfo) return;
    setSaving(true);
    setSaveError(null);
    try {
      try {
        await upsertLabour(
          config,
          userInfo,
          an,
          {
            g: toNumberOrNull(draft.labour_g),
            ga: toNumberOrNull(draft.labour_ga),
            anc_count: toNumberOrNull(draft.anc_count),
          },
          hcode,
        );
      } catch (e) {
        setSaveError(`บันทึก ipt_labour ไม่สำเร็จ: ${(e as Error).message}`);
        return;
      }
      try {
        await upsertLabor(
          config,
          userInfo,
          an,
          {
            mother_gvalue: toNumberOrNull(draft.mother_gvalue),
            mother_hct: toNumberOrNull(draft.mother_hct),
            mother_aging: toNumberOrNull(draft.mother_aging),
          },
          hcode,
        );
      } catch (e) {
        setSaveError(
          `บันทึก ipt_labour สำเร็จ แต่ labor ไม่สำเร็จ: ${(e as Error).message}`,
        );
        return;
      }
      await Promise.all([labour.mutate(), labor.mutate()]);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-700">บันทึก Stage</h2>
        {!editing ? (
          <button
            type="button"
            onClick={startEdit}
            className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700"
          >
            แก้ไข
          </button>
        ) : (
          <div className="space-x-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded bg-blue-600 px-3 py-1 text-xs text-white disabled:opacity-50"
            >
              {saving ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700"
            >
              ยกเลิก
            </button>
          </div>
        )}
      </div>
      {saveError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {saveError}
        </div>
      )}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Labour (ipt_labour)</h3>
        {editing ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <FormInput
              label="G"
              ariaLabel="labour_g"
              value={draft.labour_g}
              onChange={(v) => setDraft((d) => ({ ...d, labour_g: v }))}
            />
            <FormInput
              label="GA"
              ariaLabel="labour_ga"
              value={draft.labour_ga}
              onChange={(v) => setDraft((d) => ({ ...d, labour_ga: v }))}
            />
            <FormInput
              label="ANC count"
              ariaLabel="anc_count"
              value={draft.anc_count}
              onChange={(v) => setDraft((d) => ({ ...d, anc_count: v }))}
            />
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Field label="G" value={labour.data?.g ?? null} />
            <Field label="GA" value={labour.data?.ga ?? null} />
            <Field label="ANC count" value={labour.data?.anc_count ?? null} />
          </dl>
        )}
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Labor (delivery)</h3>
        {editing ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <FormInput
              label="Mother G"
              ariaLabel="mother_gvalue"
              value={draft.mother_gvalue}
              onChange={(v) => setDraft((d) => ({ ...d, mother_gvalue: v }))}
            />
            <FormInput
              label="HCT"
              ariaLabel="mother_hct"
              value={draft.mother_hct}
              onChange={(v) => setDraft((d) => ({ ...d, mother_hct: v }))}
            />
            <FormInput
              label="Aging"
              ariaLabel="mother_aging"
              value={draft.mother_aging}
              onChange={(v) => setDraft((d) => ({ ...d, mother_aging: v }))}
            />
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Field label="Mother G" value={labor.data?.mother_gvalue ?? null} />
            <Field label="HCT" value={labor.data?.mother_hct ?? null} />
            <Field label="Aging" value={labor.data?.mother_aging ?? null} />
          </dl>
        )}
      </section>
    </div>
  );
}
