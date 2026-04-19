// Task 34: MedicationsTab — read-only table of free-text labour-medication
// rows. Source table labour_medication has a stable single-column PK, so we
// key on labour_medication_id directly.
'use client';

import useSWR from 'swr';
import { useBmsSession } from '@/hooks/useBmsSession';
import { getPatientLabourMedications } from '@/services/maternity-ward';
import type { LabourMedRow } from '@/types/maternity-ward';

export function MedicationsTab({ an }: { an: string }) {
  const { config } = useBmsSession();
  const { data, error, isLoading } = useSWR<LabourMedRow[]>(
    config ? ['labour-meds', config.apiUrl, an] : null,
    () => getPatientLabourMedications(config!, an),
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
            <th className="py-2">รหัสยา</th>
            <th>จำนวน</th>
            <th>วิธีใช้</th>
            <th>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.labour_medication_id} className="border-b">
              <td className="py-2">{row.icode}</td>
              <td>{row.qty ?? '-'}</td>
              <td>{row.drugusage ?? '-'}</td>
              <td>{row.medication_note_text ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
