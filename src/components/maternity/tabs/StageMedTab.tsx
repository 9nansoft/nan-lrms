// Task 35: StageMedTab — read-only table of delivery-room (stage) medication
// rows. The PATIENT_STAGE_MED_BY_AN template joins s_drugitems and opduser
// server-side, so each row already carries medication_name + staff_name. Keyed
// on labour_stage_medication_id (stable single-column PK).
'use client';

import useSWR from 'swr';
import { useBmsSession } from '@/hooks/useBmsSession';
import { getPatientStageMedications } from '@/services/maternity-ward';
import type { StageMedRow } from '@/types/maternity-ward';

export function StageMedTab({ an }: { an: string }) {
  const { config } = useBmsSession();
  const { data, error, isLoading } = useSWR<StageMedRow[]>(
    config ? ['stage-meds', config.apiUrl, an] : null,
    () => getPatientStageMedications(config!, an),
  );

  if (!config) {
    return <div className="p-4 text-slate-500">ไม่พร้อมใช้งาน (ไม่มี BMS session)</div>;
  }
  if (isLoading) return <div className="p-4 text-slate-500">กำลังโหลด…</div>;
  if (error) {
    return <div className="p-4 text-red-600">โหลดไม่สำเร็จ: {(error as Error).message}</div>;
  }
  if (!data || data.length === 0) {
    return <div className="p-4 text-slate-500">ไม่พบข้อมูล</div>;
  }

  return (
    <div className="overflow-x-auto p-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-slate-500">
            <th className="py-2">วันที่</th>
            <th>เวลา</th>
            <th>ยา</th>
            <th>ผู้บันทึก</th>
            <th>จำนวน</th>
            <th>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.labour_stage_medication_id} className="border-b">
              <td className="py-2">{row.medication_date ?? '-'}</td>
              <td>{row.medication_time ?? '-'}</td>
              <td>{row.medication_name ?? row.icode}</td>
              <td>{row.staff_name ?? row.staff ?? '-'}</td>
              <td>{row.qty ?? '-'}</td>
              <td>{row.medication_note ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
