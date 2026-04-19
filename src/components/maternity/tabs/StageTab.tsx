// Task 33: StageTab — read-only view of the labour stage record. Joins the
// ipt_labour summary (G/GA/ANC count) with the legacy `labor` row that holds
// delivery-room measurements (mother g-value, hct, aging). Two parallel SWR
// fetches with merged loading/error state.
'use client';

import useSWR from 'swr';
import { useBmsSession } from '@/hooks/useBmsSession';
import {
  getPatientLabor,
  getPatientLabour,
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

export function StageTab({ an }: { an: string }) {
  const { config } = useBmsSession();
  const labour = useSWR<LabourRecord | null>(
    config ? ['labour', config.apiUrl, an] : null,
    () => getPatientLabour(config!, an),
  );
  const labor = useSWR<LaborRecord | null>(
    config ? ['labor', config.apiUrl, an] : null,
    () => getPatientLabor(config!, an),
  );

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

  return (
    <div className="space-y-6 p-4">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Labour (ipt_labour)</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Field label="G" value={labour.data?.g ?? null} />
          <Field label="GA" value={labour.data?.ga ?? null} />
          <Field label="ANC count" value={labour.data?.anc_count ?? null} />
        </dl>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Labor (delivery)</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Field label="Mother G" value={labor.data?.mother_gvalue ?? null} />
          <Field label="HCT" value={labor.data?.mother_hct ?? null} />
          <Field label="Aging" value={labor.data?.mother_aging ?? null} />
        </dl>
      </section>
    </div>
  );
}
