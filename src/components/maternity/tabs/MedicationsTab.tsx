// Task 34: MedicationsTab read-only.
// Task 45: extended with table+inline-edit CRUD (Add / Edit / Save / Delete /
// Cancel). For v1 the icode field is a free text input — drug picker is future
// work. Editable fields: icode, qty, drugusage, medication_note_text.
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useBmsSession } from '@/hooks/useBmsSession';
import {
  deleteLabourMedication,
  getPatientLabourMedications,
  upsertLabourMedication,
} from '@/services/maternity-ward';
import type { LabourMedRow } from '@/types/maternity-ward';

type EditState = {
  labour_medication_id?: number;
  icode: string;
  qty: string;
  drugusage: string;
  medication_note_text: string;
};

const EMPTY_DRAFT: EditState = {
  icode: '',
  qty: '',
  drugusage: '',
  medication_note_text: '',
};

function toNumberOrNull(v: string): number | null {
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function MedicationsTab({ an }: { an: string }) {
  const { config, userInfo } = useBmsSession();
  const { data, error, isLoading, mutate } = useSWR<LabourMedRow[]>(
    config ? ['labour-meds', config.apiUrl, an] : null,
    () => getPatientLabourMedications(config!, an),
  );

  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<EditState>(EMPTY_DRAFT);
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
    setDraft(EMPTY_DRAFT);
  }

  function startEdit(row: LabourMedRow) {
    setEditingId(row.labour_medication_id);
    setDraft({
      labour_medication_id: row.labour_medication_id,
      icode: row.icode ?? '',
      qty: row.qty?.toString() ?? '',
      drugusage: row.drugusage ?? '',
      medication_note_text: row.medication_note_text ?? '',
    });
  }

  function cancel() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  }

  async function save() {
    if (!config || !userInfo) return;
    setSaving(true);
    try {
      const payload: Partial<LabourMedRow> = {
        icode: draft.icode,
        qty: toNumberOrNull(draft.qty),
        drugusage: draft.drugusage || null,
        medication_note_text: draft.medication_note_text || null,
      };
      if (typeof draft.labour_medication_id === 'number') {
        payload.labour_medication_id = draft.labour_medication_id;
      }
      await upsertLabourMedication(config, userInfo, an, payload, hcode);
      await mutate();
      setEditingId(null);
      setDraft(EMPTY_DRAFT);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    if (!config || !userInfo) return;
    if (!window.confirm('ยืนยันการลบรายการนี้หรือไม่?')) return;
    setSaving(true);
    try {
      await deleteLabourMedication(config, userInfo, id, hcode);
      await mutate();
    } finally {
      setSaving(false);
    }
  }

  function textInput(name: keyof Omit<EditState, 'labour_medication_id'>, width = 'w-24') {
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
        <td className="py-2">{textInput('icode')}</td>
        <td>{textInput('qty', 'w-12')}</td>
        <td>{textInput('drugusage', 'w-32')}</td>
        <td>{textInput('medication_note_text', 'w-40')}</td>
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
        <h3 className="text-sm font-medium text-slate-700">บันทึกการให้ยา</h3>
        <button
          type="button"
          onClick={startAdd}
          disabled={editingId !== null}
          className="rounded bg-emerald-600 px-3 py-1 text-xs text-white disabled:opacity-50"
        >
          + เพิ่มรายการยา
        </button>
      </div>
      {isEmpty ? (
        <div className="p-4 text-slate-500">ไม่พบข้อมูล</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-slate-500">
              <th className="py-2">รหัสยา</th>
              <th>จำนวน</th>
              <th>วิธีใช้</th>
              <th>หมายเหตุ</th>
              <th className="text-right">การจัดการ</th>
            </tr>
          </thead>
          <tbody>
            {editingId === 'new' && editRow('new')}
            {rows.map((row) =>
              editingId === row.labour_medication_id ? (
                editRow(`edit-${row.labour_medication_id}`)
              ) : (
                <tr key={row.labour_medication_id} className="border-b">
                  <td className="py-2">{row.icode}</td>
                  <td>{row.qty ?? '-'}</td>
                  <td>{row.drugusage ?? '-'}</td>
                  <td>{row.medication_note_text ?? '-'}</td>
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
                      onClick={() => remove(row.labour_medication_id)}
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
