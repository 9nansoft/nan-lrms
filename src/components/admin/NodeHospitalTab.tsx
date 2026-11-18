// NodeHospitalTab — manage the "รพ.โหนด" (node hospital) supervision tree.
// One row = "node hospital supervises child hospital". A node hospital may
// read the patients of every hospital below it without needing a referral.
//
// Mirrors MophAlertsTab: SWR list + add form + delete per row, Thai copy.
'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { InlineNotice } from '@/components/shared/InlineNotice';
import { SectionCard } from '@/components/shared/SectionCard';
import { DataTable } from '@/components/shared/DataTable';
import { Field, SELECT_CLASS } from './admin-ui';
import type { AdminHospital } from './HospitalEditDialog';

interface NodePair {
  id: string;
  nodeHcode: string;
  nodeName: string;
  childHcode: string;
  childName: string;
  createdAt: string;
}

export function NodeHospitalTab() {
  const { data, isLoading, error, mutate } = useSWR<{ nodePairs: NodePair[] }>(
    '/api/admin/hospital-nodes',
  );
  const { data: hospitalsData, error: hospitalsError } = useSWR<{ hospitals: AdminHospital[] }>(
    '/api/admin/hospitals',
  );

  const [nodeHcode, setNodeHcode] = useState('');
  const [childHcode, setChildHcode] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    tone: 'ok' | 'error';
    text: string;
    remedy?: string;
  } | null>(null);

  const nodePairs = data?.nodePairs ?? [];
  const activeHospitals = useMemo(
    () => (hospitalsData?.hospitals ?? []).filter((h) => h.isActive),
    [hospitalsData],
  );

  // The save is blocked until both picks are made and they are two different
  // hospitals — the reason is shown in Thai so the operator knows what to fix.
  const blockReason = !nodeHcode
    ? 'กรุณาเลือก รพ.โหนด'
    : !childHcode
      ? 'กรุณาเลือก รพ.ที่อยู่ในกำกับ'
      : nodeHcode === childHcode
        ? 'รพ.โหนด และ รพ.ที่อยู่ในกำกับ ต้องไม่ใช่โรงพยาบาลเดียวกัน'
        : null;

  const handleSave = async () => {
    if (blockReason) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/hospital-nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeHcode, childHcode }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? 'บันทึกไม่สำเร็จ');
      }
      await mutate();
      setNodeHcode('');
      setChildHcode('');
      setMessage({ tone: 'ok', text: 'บันทึกสำเร็จ' });
    } catch (e) {
      setMessage({
        tone: 'error',
        text: `บันทึกไม่สำเร็จ: ${(e as Error).message}`,
        remedy:
          'ตรวจสอบว่าเลือก รพ.โหนด และ รพ.ที่อยู่ในกำกับ ถูกต้องแล้วกดบันทึกอีกครั้ง หากยังไม่ได้ แจ้งผู้ดูแลระบบพร้อมข้อความนี้',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (pair: NodePair) => {
    const confirmed = confirm(
      `ต้องการลบความสัมพันธ์ รพ.โหนด ${pair.nodeName} (${pair.nodeHcode}) กับ ${pair.childName} (${pair.childHcode}) ใช่หรือไม่?`,
    );
    if (!confirmed) return;
    setDeleteBusyId(pair.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/hospital-nodes/${pair.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? 'ลบไม่สำเร็จ');
      }
      await mutate();
      setMessage({ tone: 'ok', text: 'ลบความสัมพันธ์ รพ.โหนดสำเร็จ' });
    } catch (e) {
      setMessage({
        tone: 'error',
        text: `ลบไม่สำเร็จ: ${(e as Error).message}`,
        remedy:
          'รีเฟรชหน้าแล้วลองลบอีกครั้ง หากยังไม่ได้ แจ้งผู้ดูแลระบบพร้อมข้อความนี้',
      });
    } finally {
      setDeleteBusyId(null);
    }
  };

  return (
    <SectionCard
      title="รพ.โหนด (โรงพยาบาลกำกับ)"
      description="กำหนดว่า รพ. ใดกำกับดูแล รพ. ใด — รพ.โหนด ดูข้อมูลผู้ป่วยของ รพ. ที่อยู่ในกำกับได้โดยไม่ต้องมีการส่งต่อ"
    >
      <div className="space-y-4">
        {message &&
          (message.tone === 'ok' ? (
            <InlineNotice tone="ok">{message.text}</InlineNotice>
          ) : (
            <ErrorState
              variant="banner"
              className="rounded-xl border"
              message={message.text}
              remedy={message.remedy}
            />
          ))}

        {hospitalsError ? (
          <ErrorState
            variant="banner"
            className="rounded-xl border"
            message="โหลดรายชื่อโรงพยาบาลไม่สำเร็จ"
            remedy="ตรวจสอบการเชื่อมต่อ แล้วเปิดแท็บนี้อีกครั้ง"
          />
        ) : null}

        {/* Add form */}
        <div className="space-y-3 rounded-xl border border-border p-4">
          <div className="text-label text-ink">เพิ่มความสัมพันธ์ รพ.โหนด</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="รพ.โหนด" htmlFor="node-hospital-select">
              <select
                id="node-hospital-select"
                value={nodeHcode}
                onChange={(e) => setNodeHcode(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">— เลือก รพ.โหนด —</option>
                {activeHospitals.map((h) => (
                  <option key={h.hcode} value={h.hcode}>
                    {h.name} ({h.hcode})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="รพ.ที่อยู่ในกำกับ" htmlFor="child-hospital-select">
              <select
                id="child-hospital-select"
                value={childHcode}
                onChange={(e) => setChildHcode(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">— เลือก รพ.ที่อยู่ในกำกับ —</option>
                {activeHospitals.map((h) => (
                  <option key={h.hcode} value={h.hcode}>
                    {h.name} ({h.hcode})
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {blockReason ? (
            <div className="rounded-xl border border-warn/40 bg-warn-tint px-3 py-2 text-label text-warn-text">
              {blockReason}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={busy || !!blockReason}
              className="h-11 gap-1.5 bg-brand text-white hover:bg-brand-strong"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              {busy ? 'กำลังบันทึก...' : 'เพิ่มความสัมพันธ์ รพ.โหนด'}
            </Button>
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <LoadingState message="กำลังโหลดข้อมูล รพ.โหนด..." />
        ) : error ? (
          <ErrorState
            message="โหลดข้อมูล รพ.โหนดไม่สำเร็จ"
            remedy="ตรวจสอบการเชื่อมต่อ แล้วเปิดแท็บนี้อีกครั้ง"
          />
        ) : (
          <DataTable
            caption="ความสัมพันธ์ รพ.โหนด"
            rows={nodePairs}
            rowKey={(p) => p.id}
            empty={
              <EmptyState
                illustration="generic"
                title="ยังไม่มีความสัมพันธ์ รพ.โหนด"
                description="เพิ่มความสัมพันธ์ รพ.โหนด ด้วยฟอร์มด้านบน"
                className="shadow-none"
              />
            }
            columns={[
              {
                key: 'node',
                header: 'รพ.โหนด',
                cell: (p) => (
                  <div>
                    <div className="text-body text-ink">{p.nodeName}</div>
                    <code className="font-mono text-caption text-ink-muted">{p.nodeHcode}</code>
                  </div>
                ),
              },
              {
                key: 'child',
                header: 'รพ.ที่อยู่ในกำกับ',
                cell: (p) => (
                  <div>
                    <div className="text-body text-ink">{p.childName}</div>
                    <code className="font-mono text-caption text-ink-muted">{p.childHcode}</code>
                  </div>
                ),
              },
              {
                key: 'actions',
                header: 'จัดการ',
                cell: (p) => (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(p)}
                    disabled={busy || deleteBusyId === p.id}
                    aria-label={`ลบความสัมพันธ์ รพ.โหนด ${p.nodeName} กับ ${p.childName}`}
                    className="h-9 px-3 text-label"
                  >
                    {deleteBusyId === p.id ? (
                      '...'
                    ) : (
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    )}
                  </Button>
                ),
              },
            ]}
          />
        )}
      </div>
    </SectionCard>
  );
}
