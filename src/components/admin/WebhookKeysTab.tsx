// WebhookKeysTab — manage per-hospital Webhook API keys: KPI tiles, a create
// form, a one-time key reveal and a typed-prefix revoke gate, on the
// direction-C tokens.
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Copy, Check, AlertTriangle, Trash2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { SectionCard } from '@/components/shared/SectionCard';
import { KpiGrid } from '@/components/shared/KpiGrid';
import { KpiTile } from '@/components/shared/KpiTile';
import { DataTable } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { DEFAULT_ACTION_REMEDY } from '@/lib/action-failure';
import { SELECT_CLASS, StatusPill } from './admin-ui';

interface WebhookKey {
  id: string;
  hospitalId: string;
  hcode: string;
  hospitalName: string;
  keyPrefix: string;
  label: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

interface AdminHospital {
  hcode: string;
  name: string;
}

interface JustCreatedKey {
  id: string;
  apiKey: string;
  keyPrefix: string;
  hospitalName: string;
  hcode: string;
  label: string;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('th-TH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function WebhookKeysTab() {
  const {
    data: keysData,
    isLoading,
    error: keysError,
    mutate,
  } = useSWR<{ keys: WebhookKey[] }>('/api/admin/webhooks');
  const {
    data: hospitalsData,
    error: hospitalsError,
    mutate: mutateHospitals,
  } = useSWR<{ hospitals: AdminHospital[] }>('/api/admin/hospitals');

  const [formHcode, setFormHcode] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<JustCreatedKey | null>(null);
  const [copied, setCopied] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<WebhookKey | null>(null);
  const [revokeInput, setRevokeInput] = useState('');
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  if (isLoading) {
    return <LoadingState message="กำลังโหลด API Keys..." />;
  }

  const keys = keysData?.keys ?? [];
  const hospitals = hospitalsData?.hospitals ?? [];
  const activeCount = keys.filter((k) => k.isActive).length;

  const handleCreate = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!formHcode || !formLabel.trim()) return;

    setCreating(true);
    setCreateError(null);
    setCopied(false);

    try {
      const res = await fetch('/api/admin/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hcode: formHcode, label: formLabel.trim() }),
      });
      const result = await res.json();

      if (!res.ok) {
        setCreateError(result.error ?? 'สร้าง API Key ไม่สำเร็จ');
        return;
      }

      setJustCreated({
        id: result.id,
        apiKey: result.apiKey,
        keyPrefix: result.keyPrefix,
        hospitalName: result.hospitalName,
        hcode: result.hcode,
        label: result.label,
      });
      setFormHcode('');
      setFormLabel('');
      mutate();
    } catch {
      setCreateError('เกิดข้อผิดพลาดในการสร้าง API Key');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!justCreated) return;
    try {
      await navigator.clipboard.writeText(justCreated.apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — leave the banner; user can triple-click to select
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget || revokeInput !== revokeTarget.keyPrefix) return;

    setRevoking(true);
    setRevokeError(null);

    try {
      const res = await fetch(`/api/admin/webhooks/${revokeTarget.id}`, { method: 'DELETE' });
      const result = await res.json();

      if (!res.ok) {
        setRevokeError(result.error ?? 'ยกเลิก API Key ไม่สำเร็จ');
        return;
      }

      setRevokeTarget(null);
      setRevokeInput('');
      mutate();
    } catch {
      setRevokeError('เกิดข้อผิดพลาดในการยกเลิก');
    } finally {
      setRevoking(false);
    }
  };

  const closeRevokeModal = () => {
    setRevokeTarget(null);
    setRevokeInput('');
    setRevokeError(null);
  };

  const loadError = keysError || hospitalsError;

  return (
    <div className="space-y-5">
      {loadError ? (
        <ErrorState
          variant="banner"
          className="rounded-xl border"
          message="โหลด API Keys หรือรายชื่อโรงพยาบาลไม่สำเร็จ — รายการอาจไม่ครบถ้วน"
          remedy="ตรวจสอบการเชื่อมต่อ แล้วกด ลองใหม่"
          onRetry={() => {
            void mutate();
            void mutateHospitals();
          }}
        />
      ) : null}

      <KpiGrid>
        <KpiTile label="คีย์ทั้งหมด" count={keys.length} />
        <KpiTile label="ใช้งานได้" count={activeCount} tone="ok" />
        <KpiTile label="ยกเลิกแล้ว" count={keys.length - activeCount} />
      </KpiGrid>

      <SectionCard
        title="สร้าง API Key ใหม่"
        description="เลือกโรงพยาบาลและตั้งชื่อคีย์ — คีย์เต็มจะแสดงเพียงครั้งเดียวหลังสร้าง"
      >
        <form onSubmit={handleCreate}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto]">
            <div>
              <label htmlFor="hcode" className="mb-1 block text-label text-ink">
                โรงพยาบาล
              </label>
              <select
                id="hcode"
                value={formHcode}
                onChange={(e) => setFormHcode(e.target.value)}
                disabled={creating}
                className={SELECT_CLASS}
                required
              >
                <option value="">— เลือก —</option>
                {hospitals.map((h) => (
                  <option key={h.hcode} value={h.hcode}>
                    {h.name} ({h.hcode})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="label" className="mb-1 block text-label text-ink">
                ชื่อคีย์
              </label>
              <Input
                id="label"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="เช่น Production webhook — Chiang Rai"
                disabled={creating}
                required
                className="h-11 text-body"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                disabled={creating || !formHcode || !formLabel.trim()}
                className="h-11 gap-1.5 bg-brand text-white hover:bg-brand-strong"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
                {creating ? 'กำลังสร้าง...' : 'สร้าง Key'}
              </Button>
            </div>
          </div>
          {createError && (
            <ErrorState
              variant="banner"
              className="mt-3 rounded-xl border"
              message={createError}
              remedy={DEFAULT_ACTION_REMEDY}
            />
          )}
        </form>
      </SectionCard>

      {justCreated && (
        <div className="rounded-2xl border border-warn/40 bg-warn-tint p-4">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warn-text" />
              <div>
                <div className="text-body font-semibold text-warn-text">
                  บันทึก API Key นี้ไว้ทันที — ระบบจะไม่แสดงให้เห็นอีก
                </div>
                <div className="mt-0.5 text-label text-ink-muted">
                  {justCreated.hospitalName} ({justCreated.hcode}) · {justCreated.label}
                </div>
              </div>
            </div>
            <button
              onClick={() => setJustCreated(null)}
              className="rounded-lg p-2 text-ink-muted hover:bg-brand-soft hover:text-brand"
              title="ปิด"
              aria-label="ปิด"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-card px-3 py-2">
            <code className="flex-1 overflow-x-auto font-mono text-label text-ink">{justCreated.apiKey}</code>
            <Button onClick={handleCopy} variant="outline" size="sm" className="h-9 gap-1.5 text-label">
              {copied ? (
                <Check aria-hidden="true" className="h-4 w-4 text-ok-text" />
              ) : (
                <Copy aria-hidden="true" className="h-4 w-4" />
              )}
              {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
            </Button>
          </div>
          <div className="mt-2 text-label text-ink-muted">
            ใช้ค่านี้ในส่วน{' '}
            <code className="rounded border border-border bg-surface-card px-1 font-mono text-caption">
              Authorization: Bearer &lt;key&gt;
            </code>{' '}
            เมื่อส่ง webhook
          </div>
        </div>
      )}

      <SectionCard title="API Key ทั้งหมด">
        <DataTable
          caption="API Key ทั้งหมด"
          rows={keys}
          rowKey={(k) => k.id}
          empty={
            <EmptyState
              illustration="generic"
              title="ยังไม่มี API Key"
              description="สร้างคีย์แรกด้านบน แล้วส่งให้ทีม IT ของโรงพยาบาล"
              className="shadow-none"
            />
          }
          columns={[
            {
              key: 'hospital',
              header: 'โรงพยาบาล',
              cell: (k) => (
                <div className="min-w-0">
                  <div className="truncate text-body font-medium text-ink">{k.hospitalName}</div>
                  <div className="font-mono text-caption tabular-nums text-ink-muted">{k.hcode}</div>
                </div>
              ),
            },
            { key: 'label', header: 'ชื่อคีย์', cell: (k) => <span className="text-body text-ink">{k.label}</span> },
            {
              key: 'prefix',
              header: 'รหัสขึ้นต้น',
              cell: (k) => (
                <code className="rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-caption text-ink-muted">
                  {k.keyPrefix}…
                </code>
              ),
            },
            {
              key: 'created',
              header: 'สร้างเมื่อ',
              cell: (k) => <span className="text-label tabular-nums text-ink-muted">{formatDateTime(k.createdAt)}</span>,
            },
            {
              key: 'used',
              header: 'ใช้ล่าสุด',
              cell: (k) =>
                k.lastUsedAt ? (
                  <span className="text-label tabular-nums text-ink-muted">{formatDateTime(k.lastUsedAt)}</span>
                ) : (
                  <span className="text-label text-ink-muted">ยังไม่เคยใช้</span>
                ),
            },
            {
              key: 'status',
              header: 'สถานะ',
              cell: (k) => (
                <StatusPill tone={k.isActive ? 'ok' : 'neutral'}>{k.isActive ? 'ใช้งาน' : 'ยกเลิกแล้ว'}</StatusPill>
              ),
            },
            {
              key: 'actions',
              header: 'จัดการ',
              cell: (k) =>
                k.isActive ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRevokeTarget(k)}
                    aria-label={`ยกเลิกคีย์ ${k.keyPrefix}`}
                    className="h-9 gap-1 text-label text-danger-text hover:bg-danger-tint"
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                    ยกเลิก
                  </Button>
                ) : (
                  <span className="text-ink-muted">—</span>
                ),
            },
          ]}
        />
      </SectionCard>

      <Dialog open={!!revokeTarget} onOpenChange={(open) => !open && closeRevokeModal()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-title text-danger-text">
              <AlertTriangle aria-hidden="true" className="h-5 w-5" />
              ยืนยันการยกเลิก API Key
            </DialogTitle>
          </DialogHeader>

          {revokeTarget && (
            <div className="space-y-4">
              <div className="space-y-1 rounded-lg border border-border bg-surface-muted px-3 py-2 text-label">
                <div>
                  <span className="text-ink-muted">โรงพยาบาล:</span> {revokeTarget.hospitalName}
                </div>
                <div>
                  <span className="text-ink-muted">Label:</span> {revokeTarget.label}
                </div>
                <div>
                  <span className="text-ink-muted">Prefix:</span>{' '}
                  <code className="font-mono">{revokeTarget.keyPrefix}</code>
                </div>
              </div>

              <div className="rounded-lg border border-danger/40 bg-danger-tint px-3 py-2 text-label text-danger-text">
                คีย์ที่ยกเลิกแล้วจะใช้งานไม่ได้ทันที — webhooks
                จากโรงพยาบาลนี้จะถูกปฏิเสธจนกว่าจะสร้างคีย์ใหม่
              </div>

              <div>
                <label htmlFor="confirmPrefix" className="mb-1 block text-label text-ink">
                  พิมพ์{' '}
                  <code className="rounded border border-border bg-surface-muted px-1 font-mono text-caption text-ink-muted">
                    {revokeTarget.keyPrefix}
                  </code>{' '}
                  เพื่อยืนยัน
                </label>
                <Input
                  id="confirmPrefix"
                  value={revokeInput}
                  onChange={(e) => setRevokeInput(e.target.value)}
                  placeholder={revokeTarget.keyPrefix}
                  autoComplete="off"
                  disabled={revoking}
                  className="font-mono"
                />
              </div>

              {revokeError && (
                <ErrorState
                  variant="banner"
                  className="rounded-xl border"
                  message={revokeError}
                  remedy={DEFAULT_ACTION_REMEDY}
                />
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeRevokeModal} disabled={revoking}>
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevoke}
              disabled={revoking || !revokeTarget || revokeInput !== revokeTarget.keyPrefix}
              className="gap-2"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              {revoking ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
