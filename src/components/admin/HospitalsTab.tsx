// HospitalsTab — manage the operational hospital list (add from MOPH
// registry / delete / open full settings dialog). Editing is delegated to
// `HospitalEditDialog` which groups General + BMS Tunnel + Webhook Keys
// into a single larger panel.
'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Plus, Pencil, Trash2, Database, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { LoadingState } from '@/components/shared/LoadingState';
import { SectionCard } from '@/components/shared/SectionCard';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { actionFailure, type ActionFailure } from '@/lib/action-failure';
import { cn } from '@/lib/utils';
import { Field, SELECT_CLASS, StatusPill } from './admin-ui';
import { HospitalLevel, HospitalServiceType } from '@/types/domain';
import { guessHospitalLevel } from '@/config/hospitals';
import {
  HospitalEditDialog,
  type AdminHospital,
  isHospitalAuthenticityFailure,
  describeAuthenticityFailure,
} from './HospitalEditDialog';

// Short Thai abbreviations for the compact list row — the full label lives
// in the edit dialog's radio-card tiles.
const SERVICE_TYPE_LABEL: Record<string, string> = {
  [HospitalServiceType.PROVINCIAL_HUB]: 'จังหวัด/ศูนย์',
  [HospitalServiceType.DISTRICT_WITH_MATERNITY]: 'รพช. มีห้องคลอด',
  [HospitalServiceType.DISTRICT_NO_MATERNITY]: 'รพช. ไม่มีห้องคลอด',
};

interface MophHospital {
  hcode: string;
  name: string;
  hospitalTypeId: number | null;
  bedCount: number | null;
  provinceCode: string | null;
  districtCode: string | null;
}

interface ConfigResponse {
  config: { active_province_code?: string | null };
}

interface ProvincesResponse {
  provinces: Array<{ code: string; name: string }>;
}

interface DataCountsResponse {
  counts: Record<string, { totalRows: number; perTable: Record<string, number> }>;
}

const LEVEL_OPTIONS = Object.values(HospitalLevel);

interface HospitalsTabProps {
  /** When set, auto-opens the edit dialog for this hcode once the hospital
   *  list has loaded. Used by the admin page to bridge map-pin clicks into
   *  the edit flow. Consumer must clear via onAutoEditConsumed after open. */
  autoEditHcode?: string | null;
  onAutoEditConsumed?: () => void;
}

export function HospitalsTab({ autoEditHcode, onAutoEditConsumed }: HospitalsTabProps = {}) {
  const {
    data: hospitalsData,
    isLoading,
    error,
    mutate,
  } = useSWR<{ hospitals: AdminHospital[] }>('/api/admin/hospitals');
  const { data: configData } = useSWR<ConfigResponse>('/api/admin/config');
  const { data: provincesData } = useSWR<ProvincesResponse>('/api/admin/provinces');
  const { data: dataCountsData } = useSWR<DataCountsResponse>(
    '/api/admin/hospitals/data-counts',
    { refreshInterval: 30_000 }, // refresh every 30s so counts trail polling sync
  );

  const activeProvince = configData?.config?.active_province_code ?? '40';
  const { data: mophData } = useSWR<{ hospitals: MophHospital[] }>(
    `/api/admin/moph-hospitals?province=${activeProvince}`,
  );

  const [addOpen, setAddOpen] = useState(false);
  const [editHospital, setEditHospital] = useState<AdminHospital | null>(null);

  const [pickedHcode, setPickedHcode] = useState('');
  const [pickedLevel, setPickedLevel] = useState<string>(HospitalLevel.F2);
  const [addMessage, setAddMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<ActionFailure | null>(null);

  const provinceByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of provincesData?.provinces ?? []) map.set(p.code, p.name);
    return map;
  }, [provincesData]);

  const availableMoph = useMemo(() => {
    const registered = new Set((hospitalsData?.hospitals ?? []).map((h) => h.hcode));
    return (mophData?.hospitals ?? []).filter((m) => !registered.has(m.hcode));
  }, [hospitalsData, mophData]);

  // Auto-open the edit dialog when parent signals via autoEditHcode (admin
  // map pin click). Runs after the list loads and clears the signal so a
  // second click on the same hospital re-triggers. Declared before the
  // early-return to preserve hook call order.
  useEffect(() => {
    if (!autoEditHcode || !hospitalsData?.hospitals) return;
    const found = hospitalsData.hospitals.find((h) => h.hcode === autoEditHcode);
    if (!found) return;
    setEditHospital(found);
    onAutoEditConsumed?.();
  }, [autoEditHcode, hospitalsData, onAutoEditConsumed]);

  if (isLoading) {
    return <LoadingState message="กำลังโหลดรายการโรงพยาบาล..." />;
  }

  if (error) {
    // Surface the real failure (e.g. "column X does not exist" after a schema
    // mismatch) so "no hospitals yet" and "server failed" never look alike.
    return (
      <ErrorState
        message="โหลดรายการโรงพยาบาลไม่สำเร็จ"
        detail={(error as Error).message}
        remedy="รีสตาร์ทเซิร์ฟเวอร์เพื่อให้ schema-sync เพิ่มคอลัมน์ที่ขาด แล้วกด ลองใหม่ หากยังไม่ได้ แจ้งผู้ดูแลระบบพร้อมข้อความด้านบน"
        onRetry={() => void mutate()}
      />
    );
  }

  const hospitals = hospitalsData?.hospitals ?? [];

  const openAdd = () => {
    setPickedHcode('');
    setPickedLevel(HospitalLevel.F2);
    setAddMessage(null);
    setAddOpen(true);
  };

  const handleAdd = async () => {
    if (!pickedHcode) {
      setAddMessage('กรุณาเลือกโรงพยาบาลจากทะเบียน MOPH');
      return;
    }
    const moph = availableMoph.find((m) => m.hcode === pickedHcode);
    if (!moph) {
      setAddMessage('ไม่พบรหัสโรงพยาบาลที่เลือก');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/hospitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hcode: moph.hcode,
          name: moph.name,
          level: pickedLevel,
          provinceCode: moph.provinceCode,
          districtCode: moph.districtCode,
          isActive: true,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? 'เพิ่มไม่สำเร็จ');
      }
      await mutate();
      setAddOpen(false);
    } catch (e) {
      setAddMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (h: AdminHospital) => {
    if (!confirm(`ลบ ${h.name} (${h.hcode})?\nข้อมูลการตั้งค่า BMS จะถูกลบไปด้วย`)) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/hospitals/${h.hcode}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? 'ลบไม่สำเร็จ');
      }
      await mutate();
    } catch (e) {
      setActionError(actionFailure(`ลบ ${h.name} (${h.hcode})`, (e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const handleClearPurge = async (h: AdminHospital) => {
    if (
      !confirm(
        `เปิดใช้งาน Sync ของ ${h.name} (${h.hcode}) อีกครั้ง?\n` +
          `\n` +
          `การกดยืนยันจะล้างสถานะระงับฝั่งเซิร์ฟเวอร์เท่านั้น — Sync จริงจะเริ่มทำงานอีกครั้งเมื่อ\n` +
          `ผู้ใช้จากโรงพยาบาลนี้เปิด NN-LRMS จาก HOSxP (ระบบจะใช้ marketplace_token จากเซสชันใหม่)`,
      )
    ) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/hospitals/${h.hcode}/clear-purge`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? 'ดำเนินการไม่สำเร็จ');
      }
      await mutate();
    } catch (e) {
      setActionError(actionFailure(`เปิดใช้งานการซิงค์ของ ${h.name} (${h.hcode})`, (e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const inactive = hospitals.filter((h) => !h.isActive).length;
  const columns: DataTableColumn<AdminHospital>[] = [
    {
      key: 'name',
      header: 'โรงพยาบาล',
      cell: (h) => {
        const failed = isHospitalAuthenticityFailure(h);
        return (
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body font-medium text-ink">{h.name}</span>
              {failed && (
                <StatusPill tone="danger" icon={AlertTriangle} title={describeAuthenticityFailure(h)}>ข้อมูลไม่ผ่านตรวจสอบ</StatusPill>
              )}
            </div>
            <div className="font-mono text-caption text-ink-muted">{h.hcode} · {h.level}</div>
            {failed && (
              <button
                type="button"
                onClick={() => handleClearPurge(h)}
                disabled={busy}
                title="ล้างสถานะระงับการซิงค์ฝั่งเซิร์ฟเวอร์ — การซิงค์จริงจะเริ่มอีกครั้งเมื่อผู้ใช้จากโรงพยาบาลนี้เปิด NN-LRMS จาก HOSxP"
                className="inline-flex min-h-9 items-center rounded-lg border border-ok/40 bg-ok-tint px-2.5 text-caption font-semibold text-ok-text hover:brightness-95 disabled:opacity-50"
              >
                เปิดใช้งานการซิงค์อีกครั้ง
              </button>
            )}
          </div>
        );
      },
    },
    { key: 'service', header: 'ประเภทบริการ', cell: (h) => <span className="whitespace-nowrap text-label text-ink-muted">{SERVICE_TYPE_LABEL[h.serviceType ?? ''] ?? '—'}</span> },
    {
      key: 'province',
      header: 'จังหวัด',
      cell: (h) => (
        <span className="text-label text-ink-muted">
          {h.provinceCode ? `${provinceByCode.get(h.provinceCode) ?? '-'} · ${h.provinceCode}` : '—'}
        </span>
      ),
    },
    {
      key: 'active',
      header: 'สถานะ',
      cell: (h) => (
        <StatusPill tone={h.isActive ? 'ok' : 'neutral'} className="whitespace-nowrap" title={h.isActive ? undefined : 'โรงพยาบาลถูกปิดการใช้งาน — กด "แก้ไข" เพื่อเปิดใช้งานอีกครั้งหรือลบข้อมูล'}>
          {h.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
        </StatusPill>
      ),
    },
    {
      key: 'data',
      header: 'ข้อมูลในระบบ',
      numeric: true,
      cell: (h) => {
        if (dataCountsData === undefined) return <span className="text-caption text-ink-muted">…</span>;
        const total = dataCountsData.counts?.[h.hcode]?.totalRows;
        const perTable = dataCountsData.counts?.[h.hcode]?.perTable;
        const tooltip = perTable
          ? Object.entries(perTable).filter(([, v]) => v > 0).map(([k, v]) => `${k}: ${v.toLocaleString('th-TH')}`).join('\n') || 'ไม่มีข้อมูล'
          : 'ไม่มีข้อมูล';
        return (
          <button
            type="button"
            onClick={() => setEditHospital(h)}
            title={`คลิกเพื่อจัดการข้อมูล\n${tooltip}`}
            disabled={busy}
            className={cn(
              'inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-2 tabular-nums hover:bg-brand-soft',
              total && total > 0 ? 'bg-surface-muted text-brand' : 'text-ink-muted',
            )}
          >
            <Database aria-hidden="true" className="h-3.5 w-3.5" />
            {(total ?? 0).toLocaleString('th-TH')}
          </button>
        );
      },
    },
    {
      key: 'actions',
      header: 'จัดการ',
      cell: (h) => (
        <div className="flex justify-end gap-1">
          <Button variant="outline" size="sm" onClick={() => setEditHospital(h)} disabled={busy} aria-label={`แก้ไข ${h.name}`} className="h-9 gap-1 text-label">
            <Pencil aria-hidden="true" className="h-3.5 w-3.5" /> แก้ไข
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleDelete(h)} disabled={busy} aria-label={`ลบ ${h.name} (${h.hcode})`} className="h-9 gap-1 text-label text-danger-text hover:bg-danger-tint">
            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" /> ลบ
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {actionError && (
        <ErrorState variant="banner" className="rounded-xl border" message={actionError.message} remedy={actionError.remedy} />
      )}
      <SectionCard
        title="โรงพยาบาลในระบบ"
        description={`${hospitals.length} แห่ง · ใช้งาน ${hospitals.length - inactive} · ปิดใช้งาน ${inactive}`}
        actions={
          <Button onClick={openAdd} className="h-10 gap-1.5 bg-brand text-white hover:bg-brand-strong">
            <Plus aria-hidden="true" className="h-4 w-4" /> เพิ่มโรงพยาบาล
          </Button>
        }
      >
        <DataTable
          caption="โรงพยาบาลในระบบ"
          columns={columns}
          rows={hospitals}
          rowKey={(h) => h.hcode}
          empty={<EmptyState illustration="generic" title="ยังไม่มีโรงพยาบาลในระบบ" description='กด "เพิ่มโรงพยาบาล" เพื่อเลือกจากทะเบียน MOPH' className="shadow-none" />}
        />
      </SectionCard>

      <Dialog open={addOpen} onOpenChange={(o) => !o && setAddOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-title text-brand">เพิ่มโรงพยาบาลจากทะเบียน MOPH</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-body text-ink-muted">
              ค้นหาในจังหวัดปัจจุบัน ({provinceByCode.get(activeProvince) ?? activeProvince}) — มี {availableMoph.length} รายการที่ยังไม่ถูกเพิ่ม
            </p>
            <Field label="โรงพยาบาล" htmlFor="add-hcode">
              <select
                id="add-hcode"
                value={pickedHcode}
                onChange={(e) => {
                  setPickedHcode(e.target.value);
                  const moph = availableMoph.find((m) => m.hcode === e.target.value);
                  if (moph) setPickedLevel(guessHospitalLevel(moph.hospitalTypeId));
                }}
                className={SELECT_CLASS}
              >
                <option value="">— เลือกโรงพยาบาล —</option>
                {availableMoph.map((m) => (
                  <option key={m.hcode} value={m.hcode}>{m.hcode} · {m.name} {m.bedCount ? `(${m.bedCount} เตียง)` : ''}</option>
                ))}
              </select>
            </Field>
            <Field label="ระดับโรงพยาบาล" htmlFor="add-level">
              <select id="add-level" value={pickedLevel} onChange={(e) => setPickedLevel(e.target.value)} className={SELECT_CLASS}>
                {LEVEL_OPTIONS.map((l) => (<option key={l} value={l}>{l}</option>))}
              </select>
            </Field>
            {addMessage ? <p role="alert" className="text-body text-danger-text">{addMessage}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={busy}>ยกเลิก</Button>
            <Button onClick={handleAdd} disabled={busy || !pickedHcode} className="gap-1.5 bg-brand text-white hover:bg-brand-strong">
              <Plus aria-hidden="true" className="h-4 w-4" />
              เพิ่ม
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comprehensive settings dialog */}
      <HospitalEditDialog
        hospital={editHospital}
        onClose={() => setEditHospital(null)}
        onSaved={async () => {
          // Refresh hospital list so the dialog sees updated fields on next open.
          const next = await mutate();
          const refreshed = next?.hospitals.find((h) => h.hcode === editHospital?.hcode);
          if (refreshed) setEditHospital(refreshed);
        }}
      />
    </div>
  );
}
