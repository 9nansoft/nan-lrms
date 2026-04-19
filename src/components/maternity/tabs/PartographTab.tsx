// Task 30: PartographTab — read-only table of all partograph observations
// for a single admission. Wires the BMS session-derived ConnectionConfig into
// SWR so the cache key includes the tunnel URL (preventing cross-hospital
// pollution if the user switches sessions).
'use client';

import useSWR from 'swr';
import { useBmsSession } from '@/hooks/useBmsSession';
import { getPatientPartograph } from '@/services/maternity-ward';
import type { PartographRow } from '@/types/maternity-ward';

export function PartographTab({ an }: { an: string }) {
  const { config } = useBmsSession();
  const { data, error, isLoading } = useSWR<PartographRow[]>(
    config ? ['partograph', config.apiUrl, an] : null,
    () => getPatientPartograph(config!, an),
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
            <th className="py-2">เวลา</th>
            <th>ชั่วโมง</th>
            <th>FHR</th>
            <th>ปากมดลูก (ซม)</th>
            <th>การหด</th>
            <th>BP</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.ipt_labour_partograph_id} className="border-b">
              <td className="py-2">{row.observe_datetime}</td>
              <td>{row.hour_no ?? '-'}</td>
              <td>{row.fetal_heart_rate ?? '-'}</td>
              <td>{row.cervical_dilation_cm ?? '-'}</td>
              <td>{row.contraction_per_10min ?? '-'}</td>
              <td>
                {row.bp_systolic ?? '-'}/{row.bp_diastolic ?? '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
