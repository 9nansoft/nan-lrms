// Task 39: DischargeTab — read-only "current discharge status" tab. Like
// BedTab, this consumes the BedOccupancy directly. The discharge fields
// (dchdate/dchtime/dchtype/dchstts) aren't in the occupancy snapshot because
// WARD_BEDS_OCCUPANCY filters on confirm_discharge='N', so by definition any
// occupant displayed here is still admitted. We surface that explicitly with
// a placeholder + an echo of the admit timestamp.
'use client';

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

export function DischargeTab({ occupant }: { occupant: BedOccupancy | null }) {
  if (!occupant) {
    return <div className="p-4 text-slate-500">ไม่พบข้อมูล</div>;
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
    </div>
  );
}
