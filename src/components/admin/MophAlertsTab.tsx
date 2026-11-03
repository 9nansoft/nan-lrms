// MophAlertsTab — manage province center-monitor recipients for MOPH Prompt
// (LINE) alerts. Codex UI-placement rec: a dedicated top-level admin tab,
// province = scope (derived from the deployment's active_province_code).
//
// Mirrors the ConsultDoctorsSection interaction pattern (CID 13-digit
// validation, add/edit/delete, active toggle) but province-scoped instead of
// hospital-scoped. DELETE soft-deletes (is_active=false) via the API.
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { InlineNotice } from '@/components/shared/InlineNotice';
import { SectionCard } from '@/components/shared/SectionCard';
import { DataTable } from '@/components/shared/DataTable';
import { cn } from '@/lib/utils';
import { StatusPill } from './admin-ui';

interface CenterMonitor {
  id: string;
  province: string;
  cid: string;
  name: string;
  position: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ConfigResponse {
  config: { active_province_code?: string | null };
}

interface AlertStatusResponse {
  eventQueue: { awaitingRecipients: number; expired: number };
}

const EMPTY_FORM = { id: '', cid: '', name: '', position: '', isActive: true };

function maskCid(cid: string): string {
  return cid.length >= 4 ? `********${cid.slice(-4)}` : '****';
}

export function MophAlertsTab() {
  // 1. Resolve the deployment's active province (codex: default active-province-only).
  const {
    data: configData,
    isLoading: configLoading,
    error: configError,
  } = useSWR<ConfigResponse>('/api/admin/config');
  const provinceCode = configData?.config?.active_province_code ?? '';

  // 2. List center monitors for that province.
  const { data, isLoading, error, mutate } = useSWR<{ monitors: CenterMonitor[] }>(
    provinceCode ? `/api/admin/provinces/${provinceCode}/center-monitors` : null,
  );
  const { data: alertStatus } = useSWR<AlertStatusResponse>('/api/admin/moph-alerts?limit=1');

  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const monitors = data?.monitors ?? [];
  const editing = !!form.id;
  const activeCount = monitors.filter((m) => m.isActive).length;

  const setField = (key: keyof typeof EMPTY_FORM, value: string | boolean) => {
    setForm((c) => ({ ...c, [key]: value }));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setMessage(null);
  };

  const startEdit = (m: CenterMonitor) => {
    setForm({
      id: m.id,
      cid: m.cid,
      name: m.name,
      position: m.position ?? '',
      isActive: m.isActive,
    });
    setMessage(null);
  };

  const handleSave = async () => {
    if (!provinceCode) return;
    setBusy(true);
    setMessage(null);
    try {
      const cid = form.cid.trim();
      const name = form.name.trim();
      if (!/^\d{13}$/.test(cid)) {
        throw new Error('CID ต้องเป็นตัวเลข 13 หลัก');
      }
      if (!name) {
        throw new Error('กรุณาระบุชื่อผู้รับเตือน');
      }

      const path = editing
        ? `/api/admin/provinces/${provinceCode}/center-monitors/${form.id}`
        : `/api/admin/provinces/${provinceCode}/center-monitors`;
      const res = await fetch(path, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid,
          name,
          position: form.position.trim() || null,
          isActive: form.isActive,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? 'บันทึกไม่สำเร็จ');
      }

      await mutate();
      setForm(EMPTY_FORM);
      setMessage({
        tone: 'ok',
        text: editing ? 'แก้ไขผู้รับเตือนสำเร็จ' : 'เพิ่มผู้รับเตือนสำเร็จ',
      });
    } catch (e) {
      setMessage({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (m: CenterMonitor) => {
    if (!provinceCode) return;
    if (!confirm(`ลบผู้รับเตือน ${m.name}? (จะปิดการใช้งาน — ไม่ลบข้อมูล)`)) return;
    setDeleteBusyId(m.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/provinces/${provinceCode}/center-monitors/${m.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? 'ลบไม่สำเร็จ');
      }
      if (form.id === m.id) setForm(EMPTY_FORM);
      await mutate();
      setMessage({ tone: 'ok', text: 'ลบผู้รับเตือนสำเร็จ' });
    } catch (e) {
      setMessage({ tone: 'error', text: (e as Error).message });
    } finally {
      setDeleteBusyId(null);
    }
  };

  if (configLoading) return <LoadingState message="กำลังโหลดจังหวัดหลัก..." />;
  if (configError)
    return <ErrorState message="โหลดจังหวัดหลักไม่สำเร็จ" remedy="ตรวจสอบการเชื่อมต่อ แล้วเปิดแท็บนี้อีกครั้ง" />;
  if (!provinceCode) {
    return (
      <ErrorState message="ยังไม่ได้ตั้งจังหวัดหลัก — กรุณาตั้งในแท็บ 'จังหวัดหลัก' ก่อนเพิ่มผู้รับเตือน" />
    );
  }

  return (
    <SectionCard
      title="ผู้รับการแจ้งเตือน MOPH Prompt (ศูนย์กลางจังหวัด)"
      description={`จังหวัด ${provinceCode} · ใช้งาน ${activeCount} · ปิด ${monitors.length - activeCount} — ผู้รับเหล่านี้จะได้รับแจ้งเตือน LINE เมื่อมีกรณีเสี่ยงสูง/ฉุกเฉินจากโรงพยาบาลใดๆ ในจังหวัด`}
    >
      <div className="space-y-4">
        {alertStatus?.eventQueue && (
          <div
            className={cn(
              'rounded-xl border px-3 py-2 text-label',
              alertStatus.eventQueue.awaitingRecipients > 0
                ? 'border-warn/40 bg-warn-tint text-warn-text'
                : 'border-border text-ink-muted',
            )}
          >
            เหตุการณ์รอผู้รับ {alertStatus.eventQueue.awaitingRecipients} · หมดอายุโดยไม่ได้ส่ง{' '}
            {alertStatus.eventQueue.expired}
            {alertStatus.eventQueue.awaitingRecipients > 0 && (
              <span className="ml-2 text-warn-text">
                เพิ่มหรือเปิดใช้งานผู้รับแจ้งเตือนเพื่อส่งเหตุการณ์ของวันนี้
              </span>
            )}
          </div>
        )}

        {message &&
          (message.tone === 'ok' ? (
            <InlineNotice tone="ok">{message.text}</InlineNotice>
          ) : (
            <ErrorState
              variant="banner"
              className="rounded-xl border"
              message={message.text}
              remedy="ตรวจข้อมูลในฟอร์มแล้วกดบันทึกอีกครั้ง หากยังไม่ได้ แจ้งผู้ดูแลระบบพร้อมข้อความนี้"
            />
          ))}

        {/* Add/Edit form */}
        <div className="space-y-3 rounded-xl border border-border p-4">
          <div className="text-label text-ink">{editing ? 'แก้ไขผู้รับเตือน' : 'เพิ่มผู้รับเตือนใหม่'}</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-label text-ink">CID (13 หลัก)</span>
              <Input
                value={form.cid}
                onChange={(e) => setField('cid', e.target.value.replace(/\D/g, '').slice(0, 13))}
                placeholder="เลขบัตรประชาชน 13 หลัก"
                inputMode="numeric"
                className="h-11 text-body"
              />
            </label>
            <label className="space-y-1">
              <span className="text-label text-ink">ชื่อ</span>
              <Input
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="ชื่อผู้รับการแจ้งเตือน"
                className="h-11 text-body"
              />
            </label>
            <label className="space-y-1">
              <span className="text-label text-ink">ตำแหน่ง</span>
              <Input
                value={form.position}
                onChange={(e) => setField('position', e.target.value)}
                placeholder="ตำแหน่ง (ไม่บังคับ)"
                className="h-11 text-body"
              />
            </label>
            <label className="flex items-center gap-2 self-end pb-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setField('isActive', e.target.checked)}
                className="h-5 w-5 accent-brand"
              />
              <span className="text-label text-ink">ใช้งาน</span>
            </label>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={busy || !form.cid.trim() || !form.name.trim()}
              className="h-11 gap-1.5 bg-brand text-white hover:bg-brand-strong"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              {busy ? 'กำลังบันทึก...' : editing ? 'บันทึกการแก้ไข' : 'เพิ่มผู้รับเตือน'}
            </Button>
            {editing && (
              <Button variant="outline" onClick={resetForm} className="h-11 gap-1.5">
                <X aria-hidden="true" className="h-4 w-4" />
                ยกเลิกแก้ไข
              </Button>
            )}
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <LoadingState message="กำลังโหลดผู้รับเตือน..." />
        ) : error ? (
          <ErrorState message="โหลดผู้รับเตือนไม่สำเร็จ" remedy="ตรวจสอบการเชื่อมต่อ แล้วเปิดแท็บนี้อีกครั้ง" />
        ) : (
          <DataTable
            caption="ผู้รับการแจ้งเตือน"
            rows={monitors}
            rowKey={(m) => m.id}
            empty={
              <EmptyState
                illustration="generic"
                title="ยังไม่มีผู้รับเตือน"
                description="เพิ่มผู้รับเตือนด้วยฟอร์มด้านบน"
                className="shadow-none"
              />
            }
            columns={[
              { key: 'name', header: 'ชื่อ', cell: (m) => <span className="text-body text-ink">{m.name}</span> },
              {
                key: 'cid',
                header: 'CID',
                cell: (m) => <code className="font-mono text-label text-ink-muted">{maskCid(m.cid)}</code>,
              },
              { key: 'position', header: 'ตำแหน่ง', cell: (m) => <span className="text-label text-ink-muted">{m.position ?? '—'}</span> },
              {
                key: 'status',
                header: 'สถานะ',
                cell: (m) => <StatusPill tone={m.isActive ? 'ok' : 'neutral'}>{m.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}</StatusPill>,
              },
              {
                key: 'actions',
                header: 'จัดการ',
                cell: (m) => (
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEdit(m)}
                      disabled={busy || !!deleteBusyId}
                      className="h-9 px-3 text-label"
                    >
                      แก้ไข
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(m)}
                      disabled={busy || deleteBusyId === m.id}
                      aria-label={`ลบผู้รับเตือน ${m.name}`}
                      className="h-9 px-3 text-label"
                    >
                      {deleteBusyId === m.id ? '...' : <Trash2 aria-hidden="true" className="h-4 w-4" />}
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>
    </SectionCard>
  );
}
