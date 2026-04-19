// Task 37: InfantTab read-only.
// Task 48: extended with table+inline-edit CRUD spanning ipt_newborn AND
// ipt_labour_infant. For v1 the same fields (sex, birth_weight) are mirrored
// to BOTH tables on save; this keeps the UI minimal and correct for the
// minimal field set. On save: write ipt_newborn first, then ipt_labour_infant
// (best-effort: if the second write fails, the page state surfaces a Thai
// error message naming the failed side). Delete tears down child first then
// parent (FK order).
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

type EditState = {
  ipt_newborn_id?: number;
  ipt_labour_infant_id?: number;
  sex: string;
  birth_weight: string;
};

const EMPTY_DRAFT: EditState = { sex: '', birth_weight: '' };

function toNumberOrNull(v: string): number | null {
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function rowKey(row: InfantRow, index: number): string | number {
  return row.ipt_labour_infant_id ?? row.ipt_newborn_id ?? index;
}

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
    setDraft(EMPTY_DRAFT);
    setSaveError(null);
  }

  function startEdit(row: InfantRow, index: number) {
    setEditingKey(String(rowKey(row, index)));
    setDraft({
      ipt_newborn_id: row.ipt_newborn_id,
      ipt_labour_infant_id: row.ipt_labour_infant_id,
      sex: row.sex ?? '',
      birth_weight: row.birth_weight?.toString() ?? '',
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

  function fieldInput(name: 'sex' | 'birth_weight', width = 'w-20') {
    return (
      <input
        type="text"
        value={draft[name] ?? ''}
        onChange={(e) => setDraft((d) => ({ ...d, [name]: e.target.value }))}
        className={`${width} rounded border border-slate-300 px-1 py-0.5 text-sm`}
        aria-label={name}
      />
    );
  }

  function editRow(key: string) {
    return (
      <tr key={key} className="border-b bg-amber-50">
        <td className="py-2">{fieldInput('sex', 'w-12')}</td>
        <td>{fieldInput('birth_weight')}</td>
        <td>-</td>
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
        <h3 className="text-sm font-medium text-slate-700">ข้อมูลทารก</h3>
        <button
          type="button"
          onClick={startAdd}
          disabled={editingKey !== null}
          className="rounded bg-emerald-600 px-3 py-1 text-xs text-white disabled:opacity-50"
        >
          + เพิ่มทารก
        </button>
      </div>
      {saveError && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {saveError}
        </div>
      )}
      {isEmpty ? (
        <div className="p-4 text-slate-500">ไม่พบข้อมูล</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-slate-500">
              <th className="py-2">เพศ</th>
              <th>น้ำหนักแรกเกิด (กรัม)</th>
              <th>HN ทารก</th>
              <th className="text-right">การจัดการ</th>
            </tr>
          </thead>
          <tbody>
            {editingKey === 'new' && editRow('new')}
            {rows.map((row, index) => {
              const k = String(rowKey(row, index));
              if (editingKey === k) {
                return editRow(`edit-${k}`);
              }
              return (
                <tr key={k} className="border-b">
                  <td className="py-2">{row.sex ?? '-'}</td>
                  <td>{row.birth_weight ?? '-'}</td>
                  <td>{(row.infant_hn as string | undefined) ?? '-'}</td>
                  <td className="space-x-2 text-right">
                    <button
                      type="button"
                      onClick={() => startEdit(row, index)}
                      disabled={editingKey !== null}
                      className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 disabled:opacity-50"
                    >
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(row)}
                      disabled={editingKey !== null || saving || row.ipt_newborn_id === undefined}
                      className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-50"
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
