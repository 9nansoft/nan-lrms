// Task 36: ComplicationsTab — read-only table of labour complications. The
// underlying ipt_labour_complication FKs on ipt_labour_id rather than an, so
// this tab does a two-step fetch:
//   1. resolve ipt_labour_id via getPatientLabour(an)
//   2. fetch complications via getPatientComplications(iptLabourId)
// Step 2's SWR key is conditional on the labour record being present, so an
// admission without a labour row never triggers a complications request.
'use client';

import useSWR from 'swr';
import { useBmsSession } from '@/hooks/useBmsSession';
import {
  getPatientComplications,
  getPatientLabour,
} from '@/services/maternity-ward';
import type { ComplicationRow, LabourRecord } from '@/types/maternity-ward';

export function ComplicationsTab({ an }: { an: string }) {
  const { config } = useBmsSession();
  const labour = useSWR<LabourRecord | null>(
    config ? ['labour', config.apiUrl, an] : null,
    () => getPatientLabour(config!, an),
  );
  const iptLabourId = labour.data?.ipt_labour_id ?? null;
  const comps = useSWR<ComplicationRow[]>(
    config && iptLabourId ? ['complications', config.apiUrl, iptLabourId] : null,
    () => getPatientComplications(config!, iptLabourId!),
  );

  if (!config) {
    return <div className="p-4 text-slate-500">ไม่พร้อมใช้งาน (ไม่มี BMS session)</div>;
  }
  if (labour.isLoading || (iptLabourId && comps.isLoading)) {
    return <div className="p-4 text-slate-500">กำลังโหลด…</div>;
  }
  const err = labour.error ?? comps.error;
  if (err) {
    return <div className="p-4 text-red-600">โหลดไม่สำเร็จ: {(err as Error).message}</div>;
  }
  // No labour record → no complications can exist (FK requires ipt_labour_id),
  // so render the same empty state used when complications are simply absent.
  if (!iptLabourId || !comps.data || comps.data.length === 0) {
    return <div className="p-4 text-slate-500">ไม่พบข้อมูล</div>;
  }

  return (
    <div className="overflow-x-auto p-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-slate-500">
            <th className="py-2">ภาวะแทรกซ้อน</th>
            <th>หมายเหตุ</th>
            <th>Stage</th>
          </tr>
        </thead>
        <tbody>
          {comps.data.map((row) => (
            <tr key={row.ipt_labour_complication_id} className="border-b">
              <td className="py-2">{row.complication_name ?? '-'}</td>
              <td>{row.complication_note ?? '-'}</td>
              <td>{row.labour_stage_id ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
