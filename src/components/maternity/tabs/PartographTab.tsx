// Task 30: PartographTab — initially read-only.
// Task 41: extended with CRUD (Add / Edit / Save / Delete / Cancel) following
// the canonical pattern reused by Tasks 42-50. Editing is YAGNI-scoped to the
// five most clinically relevant fields (cervical_dilation_cm, fetal_heart_rate,
// contraction_per_10min, bp_systolic, bp_diastolic); other fields stay read-
// only ("-") in the inline form and can be added later without breaking the
// service contract (it accepts Partial<PartographRow>).
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useBmsSession } from '@/hooks/useBmsSession';
import {
  deletePartograph,
  getPatientPartograph,
  upsertPartograph,
} from '@/services/maternity-ward';
import type { PartographRow } from '@/types/maternity-ward';

// The five fields the inline form lets the user edit. Keep numeric so empty
// strings can be sent as null (matches BMS column nullability).
type EditableField =
  | 'cervical_dilation_cm'
  | 'fetal_heart_rate'
  | 'contraction_per_10min'
  | 'bp_systolic'
  | 'bp_diastolic';

const EDITABLE_FIELDS: EditableField[] = [
  'cervical_dilation_cm',
  'fetal_heart_rate',
  'contraction_per_10min',
  'bp_systolic',
  'bp_diastolic',
];

type EditState = Partial<Record<EditableField, string>> & {
  ipt_labour_partograph_id?: number;
  observe_datetime?: string;
};

function toNumberOrNull(v: string | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function PartographTab({ an }: { an: string }) {
  const { config, userInfo } = useBmsSession();
  const { data, error, isLoading, mutate } = useSWR<PartographRow[]>(
    config ? ['partograph', config.apiUrl, an] : null,
    () => getPatientPartograph(config!, an),
  );

  // editingId === 'new' for the add row; numeric for an existing row's PK;
  // null when nothing is being edited.
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<EditState>({});
  const [saving, setSaving] = useState(false);

  if (!config) {
    return <div className="p-4 text-slate-500">ไม่พร้อมใช้งาน (ไม่มี BMS session)</div>;
  }
  if (isLoading) return <div className="p-4 text-slate-500">กำลังโหลด…</div>;
  if (error) {
    return <div className="p-4 text-red-600">โหลดไม่สำเร็จ: {(error as Error).message}</div>;
  }

  const hcode = userInfo?.hospcode ?? '';
  const rows = data ?? [];
  const isEmpty = rows.length === 0 && editingId !== 'new';

  function startAdd() {
    setEditingId('new');
    setDraft({});
  }

  function startEdit(row: PartographRow) {
    setEditingId(row.ipt_labour_partograph_id);
    setDraft({
      ipt_labour_partograph_id: row.ipt_labour_partograph_id,
      observe_datetime: row.observe_datetime,
      cervical_dilation_cm: row.cervical_dilation_cm?.toString() ?? '',
      fetal_heart_rate: row.fetal_heart_rate?.toString() ?? '',
      contraction_per_10min: row.contraction_per_10min?.toString() ?? '',
      bp_systolic: row.bp_systolic?.toString() ?? '',
      bp_diastolic: row.bp_diastolic?.toString() ?? '',
    });
  }

  function cancel() {
    setEditingId(null);
    setDraft({});
  }

  async function save() {
    if (!config || !userInfo) return;
    setSaving(true);
    try {
      const payload: Partial<PartographRow> = {
        cervical_dilation_cm: toNumberOrNull(draft.cervical_dilation_cm),
        fetal_heart_rate: toNumberOrNull(draft.fetal_heart_rate),
        contraction_per_10min: toNumberOrNull(draft.contraction_per_10min),
        bp_systolic: toNumberOrNull(draft.bp_systolic),
        bp_diastolic: toNumberOrNull(draft.bp_diastolic),
      };
      if (typeof draft.ipt_labour_partograph_id === 'number') {
        payload.ipt_labour_partograph_id = draft.ipt_labour_partograph_id;
      }
      await upsertPartograph(config, userInfo, an, payload, hcode);
      await mutate();
      setEditingId(null);
      setDraft({});
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    if (!config || !userInfo) return;
    if (!window.confirm('ยืนยันการลบรายการนี้หรือไม่?')) return;
    setSaving(true);
    try {
      await deletePartograph(config, userInfo, id, hcode);
      await mutate();
    } finally {
      setSaving(false);
    }
  }

  function fieldInput(name: EditableField) {
    return (
      <input
        type="text"
        inputMode="numeric"
        value={draft[name] ?? ''}
        onChange={(e) => setDraft((d) => ({ ...d, [name]: e.target.value }))}
        className="w-16 rounded border border-slate-300 px-1 py-0.5 text-sm"
        aria-label={name}
      />
    );
  }

  function editRow(key: string) {
    return (
      <tr key={key} className="border-b bg-amber-50">
        <td className="py-2">{draft.observe_datetime ?? '-'}</td>
        <td>-</td>
        <td>{fieldInput('fetal_heart_rate')}</td>
        <td>{fieldInput('cervical_dilation_cm')}</td>
        <td>{fieldInput('contraction_per_10min')}</td>
        <td className="space-x-1">
          {fieldInput('bp_systolic')}
          /{fieldInput('bp_diastolic')}
        </td>
        <td className="space-x-2 text-right">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
          >
            ยกเลิก
          </button>
        </td>
      </tr>
    );
  }

  return (
    <div className="overflow-x-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-700">บันทึก Partograph</h3>
        <button
          type="button"
          onClick={startAdd}
          disabled={editingId !== null}
          className="rounded bg-emerald-600 px-3 py-1 text-xs text-white disabled:opacity-50"
        >
          + เพิ่มเวลาใหม่
        </button>
      </div>
      {isEmpty ? (
        <div className="p-4 text-slate-500">ไม่พบข้อมูล</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-slate-500">
              <th className="py-2">เวลา</th>
              <th>ชั่วโมง</th>
              <th>FHR</th>
              <th>ปากมดลูก (ซม)</th>
              <th>การหด</th>
              <th>BP</th>
              <th className="text-right">การจัดการ</th>
            </tr>
          </thead>
          <tbody>
            {editingId === 'new' && editRow('new')}
            {rows.map((row) =>
              editingId === row.ipt_labour_partograph_id ? (
                editRow(`edit-${row.ipt_labour_partograph_id}`)
              ) : (
                <tr key={row.ipt_labour_partograph_id} className="border-b">
                  <td className="py-2">{row.observe_datetime}</td>
                  <td>{row.hour_no ?? '-'}</td>
                  <td>{row.fetal_heart_rate ?? '-'}</td>
                  <td>{row.cervical_dilation_cm ?? '-'}</td>
                  <td>{row.contraction_per_10min ?? '-'}</td>
                  <td>
                    {row.bp_systolic ?? '-'}/{row.bp_diastolic ?? '-'}
                  </td>
                  <td className="space-x-2 text-right">
                    <button
                      type="button"
                      onClick={() => startEdit(row)}
                      disabled={editingId !== null}
                      className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-50"
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(row.ipt_labour_partograph_id)}
                      disabled={editingId !== null || saving}
                      className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-50"
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
