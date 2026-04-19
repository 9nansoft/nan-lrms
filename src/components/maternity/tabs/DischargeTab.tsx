// Task 39: DischargeTab read-only.
// Task 50: extended with discharge-form CRUD. Form-driven: dchdate, dchtime,
// dchtype, dchstts. Confirms before firing dischargePatient (which does a
// composite write to ipt + iptadm). Editable iff occupant is admitted (no
// current discharge); since the WARD_BEDS_OCCUPANCY query already filters on
// confirm_discharge='N', any occupant displayed here is by definition still
// admitted. Lookup wiring for dchtype/dchstts is future work — for v1 we hard-
// code three sample values for each.
'use client';

import { useState } from 'react';
import { useBmsSession } from '@/hooks/useBmsSession';
import { dischargePatient } from '@/services/maternity-ward';
import type { BedOccupancy } from '@/types/maternity-ward';

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

function formatAdmit(occupant: BedOccupancy): string {
  return occupant.regtime ? `${occupant.regdate} ${occupant.regtime}` : occupant.regdate;
}

interface DraftState {
  dchdate: string;
  dchtime: string;
  dchtype: string;
  dchstts: string;
}

const EMPTY_DRAFT: DraftState = { dchdate: '', dchtime: '', dchtype: '1', dchstts: '1' };

export function DischargeTab({ occupant }: { occupant: BedOccupancy | null }) {
  const { config, userInfo } = useBmsSession();
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [discharged, setDischarged] = useState(false);

  if (!occupant) {
    return <div className="p-4 text-slate-500">ไม่พบข้อมูล</div>;
  }

  const hcode = userInfo?.hospcode ?? '';

  async function confirmAndSave() {
    if (!config || !userInfo || !occupant) return;
    if (!draft.dchdate || !draft.dchtime) {
      setSaveError('กรุณาระบุวันที่และเวลาจำหน่าย');
      return;
    }
    if (!window.confirm('ยืนยันการจำหน่ายผู้ป่วย? การดำเนินการนี้จะเปลี่ยนสถานะใน HOSxP')) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await dischargePatient(config, userInfo, hcode, {
        an: occupant.an,
        dchdate: draft.dchdate,
        dchtime: draft.dchtime,
        dchtype: draft.dchtype,
        dchstts: draft.dchstts,
      });
      setDischarged(true);
    } catch (e) {
      setSaveError(`จำหน่ายไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  if (discharged) {
    return (
      <div className="space-y-4 p-4">
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          ดำเนินการจำหน่ายเรียบร้อย ({draft.dchdate} {draft.dchtime})
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Field label="AN" value={occupant.an} />
          <Field label="แอดมิตเมื่อ" value={formatAdmit(occupant)} />
        </dl>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        ยังไม่มีการจำหน่าย (สถานะปัจจุบัน: ผู้ป่วยใน)
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <Field label="แอดมิตเมื่อ" value={formatAdmit(occupant)} />
        <Field label="AN" value={occupant.an} />
      </dl>
      <section className="space-y-3 rounded-md border border-slate-200 p-4">
        <h3 className="text-sm font-medium text-slate-700">บันทึกการจำหน่าย</h3>
        {saveError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {saveError}
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-slate-500">วันที่จำหน่าย</label>
            <input
              type="date"
              value={draft.dchdate}
              onChange={(e) => setDraft((d) => ({ ...d, dchdate: e.target.value }))}
              aria-label="dchdate"
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-slate-500">เวลาจำหน่าย</label>
            <input
              type="time"
              step="1"
              value={draft.dchtime}
              onChange={(e) => setDraft((d) => ({ ...d, dchtime: e.target.value }))}
              aria-label="dchtime"
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-slate-500">ประเภทจำหน่าย</label>
            <select
              value={draft.dchtype}
              onChange={(e) => setDraft((d) => ({ ...d, dchtype: e.target.value }))}
              aria-label="dchtype"
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-xs text-slate-500">สถานะจำหน่าย</label>
            <select
              value={draft.dchstts}
              onChange={(e) => setDraft((d) => ({ ...d, dchstts: e.target.value }))}
              aria-label="dchstts"
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </div>
        </div>
        <div>
          <button
            type="button"
            onClick={confirmAndSave}
            disabled={saving || !config}
            className="rounded bg-red-600 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก…' : 'ยืนยันการจำหน่าย'}
          </button>
        </div>
      </section>
    </div>
  );
}
