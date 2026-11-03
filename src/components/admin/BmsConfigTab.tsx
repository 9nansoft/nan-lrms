// BmsConfigTab — per-hospital BMS tunnel URL configuration: KPI tiles and
// bordered hospital tiles on the direction-C tokens.
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Wifi, WifiOff, Pencil, FlaskConical, Save, Database } from 'lucide-react';
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
import { InlineNotice } from '@/components/shared/InlineNotice';
import { KpiGrid } from '@/components/shared/KpiGrid';
import { KpiTile } from '@/components/shared/KpiTile';
import type { StatusTone } from '@/config/status-tone';
import { StatusPill, TONE_CLASSES } from './admin-ui';

interface AdminHospital {
  hcode: string;
  name: string;
  level: string;
  isActive: boolean;
  connectionStatus: string;
  lastSyncAt: string | null;
  bmsConfig: {
    tunnelUrl: string;
    hasSession: boolean;
    sessionExpiresAt: string | null;
    databaseType: string | null;
  } | null;
}

interface TestResult {
  connected: boolean;
  databaseType?: string;
  databaseVersion?: string;
  tablesFound?: string[];
  error?: string;
}

type TunnelStatus = 'ONLINE' | 'CONFIGURED' | 'EXPIRED' | 'NOT_CONFIGURED';

function hasFutureSession(expiresAt: string | null | undefined) {
  if (!expiresAt) return false;
  const time = new Date(expiresAt).getTime();
  return Number.isFinite(time) && time > Date.now();
}

function getTunnelStatus(hospital: AdminHospital): TunnelStatus {
  if (!hospital.bmsConfig?.tunnelUrl) return 'NOT_CONFIGURED';
  if (hospital.bmsConfig.hasSession && hasFutureSession(hospital.bmsConfig.sessionExpiresAt)) {
    return 'ONLINE';
  }
  if (
    hospital.bmsConfig.sessionExpiresAt &&
    !hasFutureSession(hospital.bmsConfig.sessionExpiresAt)
  ) {
    return 'EXPIRED';
  }
  return 'CONFIGURED';
}

const TUNNEL_STATUS_META: Record<
  TunnelStatus,
  {
    label: string;
    tone: StatusTone;
    Icon: typeof Wifi;
  }
> = {
  ONLINE: { label: 'BMS tunnel ออนไลน์', tone: 'ok', Icon: Wifi },
  CONFIGURED: { label: 'บันทึก URL แล้ว · ยังไม่ยืนยัน', tone: 'warn', Icon: WifiOff },
  EXPIRED: { label: 'session หมดอายุ', tone: 'danger', Icon: WifiOff },
  NOT_CONFIGURED: { label: 'ยังไม่ตั้งค่า Tunnel URL', tone: 'neutral', Icon: WifiOff },
};

function formatLastSync(value: string | null) {
  if (!value) return 'ซิงค์ล่าสุด —';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'ซิงค์ล่าสุด —';
  return `ซิงค์ล่าสุด ${date.toLocaleString('th-TH', {
    dateStyle: 'short',
    timeStyle: 'short',
  })}`;
}

export function BmsConfigTab() {
  const { data, isLoading, error, mutate } = useSWR<{ hospitals: AdminHospital[] }>(
    '/api/admin/hospitals',
  );
  const [editHospital, setEditHospital] = useState<AdminHospital | null>(null);
  const [tunnelUrl, setTunnelUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  if (isLoading) {
    return <LoadingState message="กำลังโหลดข้อมูลโรงพยาบาล..." />;
  }

  const hospitals = data?.hospitals ?? [];
  const configuredCount = hospitals.filter((h) => h.bmsConfig?.tunnelUrl).length;
  const connectedCount = hospitals.filter((h) => getTunnelStatus(h) === 'ONLINE').length;

  const handleEdit = (hospital: AdminHospital) => {
    setEditHospital(hospital);
    setTunnelUrl(hospital.bmsConfig?.tunnelUrl ?? '');
    setTestResult(null);
    setSaveMessage(null);
  };

  const handleSave = async () => {
    if (!editHospital || !tunnelUrl.trim()) return;

    setSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch(`/api/admin/hospitals/${editHospital.hcode}/bms-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tunnelUrl: tunnelUrl.trim() }),
      });

      const result = await res.json();

      if (res.ok) {
        setSaveMessage(
          result.sessionValidated
            ? `บันทึกสำเร็จ — Session validated, DB: ${result.databaseType}`
            : 'บันทึก URL แล้ว — ยังไม่สามารถ validate session ได้',
        );
        mutate();
      } else {
        setSaveMessage(`ผิดพลาด: ${result.error}`);
      }
    } catch {
      setSaveMessage('เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!editHospital) return;

    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch(`/api/admin/hospitals/${editHospital.hcode}/test-connection`, {
        method: 'POST',
      });

      const result = await res.json();
      setTestResult(result);
    } catch {
      setTestResult({ connected: false, error: 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-5">
      {error ? (
        <ErrorState
          variant="banner"
          className="rounded-xl border"
          message="โหลดรายชื่อโรงพยาบาลไม่สำเร็จ — ตัวเลขและสถานะ tunnel อาจไม่เป็นปัจจุบัน"
          remedy="ตรวจสอบการเชื่อมต่อ แล้วกด ลองใหม่"
          onRetry={() => void mutate()}
        />
      ) : null}

      <KpiGrid>
        <KpiTile label="โรงพยาบาลทั้งหมด" count={hospitals.length} />
        <KpiTile label="มี BMS session" count={connectedCount} tone="ok" />
        <KpiTile label="มี Tunnel URL" count={configuredCount} />
      </KpiGrid>

      {/* Hospital tiles */}
      <div className="grid grid-cols-1 gap-3 @min-[640px]:grid-cols-2">
        {hospitals.map((h) => {
          const hasConfig = !!h.bmsConfig?.tunnelUrl;
          const tunnelStatus = getTunnelStatus(h);
          const tunnelStatusMeta = TUNNEL_STATUS_META[tunnelStatus];
          const TunnelIcon = tunnelStatusMeta.Icon;
          return (
            <div
              key={h.hcode}
              className="flex flex-col gap-2 rounded-xl border border-border bg-surface-card p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-body font-medium text-ink">{h.name}</span>
                    <span className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-caption tabular-nums text-ink-muted">
                      {h.level}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-caption tabular-nums text-ink-muted">{h.hcode}</div>
                </div>
                <button
                  onClick={() => handleEdit(h)}
                  className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-brand-soft hover:text-brand"
                  title="แก้ไข"
                  aria-label={`แก้ไข BMS ของ ${h.name}`}
                >
                  <Pencil aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-1.5 text-caption">
                <TunnelIcon
                  aria-hidden="true"
                  className={`h-3.5 w-3.5 shrink-0 ${TONE_CLASSES[tunnelStatusMeta.tone].text}`}
                />
                <span className={hasConfig ? 'truncate font-mono text-ink-muted' : 'text-ink-muted'}>
                  {h.bmsConfig?.tunnelUrl ?? 'ยังไม่ตั้งค่า Tunnel URL'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
                <StatusPill tone={tunnelStatusMeta.tone} icon={tunnelStatusMeta.Icon}>
                  {tunnelStatusMeta.label}
                </StatusPill>
                <span className="text-caption text-ink-muted">{formatLastSync(h.lastSyncAt)}</span>
                {h.bmsConfig?.databaseType && (
                  <span className="inline-flex items-center gap-1 font-mono text-caption text-ink-muted">
                    <Database aria-hidden="true" className="h-3.5 w-3.5" />
                    {h.bmsConfig.databaseType}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!editHospital} onOpenChange={(open) => !open && setEditHospital(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              แก้ไข BMS Config — {editHospital?.name} ({editHospital?.hcode})
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="tunnelUrl" className="text-label text-ink">
                Tunnel URL
              </label>
              <Input
                id="tunnelUrl"
                value={tunnelUrl}
                onChange={(e) => setTunnelUrl(e.target.value)}
                placeholder="https://xxxxx-ondemand-win-xxxxxxxxx.tunnel.hosxp.net"
              />
            </div>

            {saveMessage &&
              (saveMessage.includes('สำเร็จ') ? (
                <InlineNotice tone="ok">{saveMessage}</InlineNotice>
              ) : (
                <ErrorState
                  variant="banner"
                  className="rounded-xl border"
                  message={saveMessage}
                  remedy="ตรวจสอบ Tunnel URL แล้วกด บันทึก อีกครั้ง"
                />
              ))}

            {testResult && (
              <div
                className={`rounded-xl border px-3 py-2 text-label ${
                  testResult.connected
                    ? 'border-ok/40 bg-ok-tint text-ok-text'
                    : 'border-danger/40 bg-danger-tint text-danger-text'
                }`}
              >
                {testResult.connected ? (
                  <div className="space-y-0.5">
                    <div className="font-semibold">เชื่อมต่อสำเร็จ</div>
                    <div>
                      Database: {testResult.databaseType} — {testResult.databaseVersion}
                    </div>
                    <div>Tables: {testResult.tablesFound?.join(', ') ?? 'none'}</div>
                  </div>
                ) : (
                  <div>เชื่อมต่อไม่สำเร็จ: {testResult.error}</div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing || !tunnelUrl.trim()}
              className="gap-2"
            >
              <FlaskConical className="h-4 w-4" />
              {testing ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ'}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !tunnelUrl.trim()}
              className="gap-2 bg-brand text-white hover:bg-brand-strong"
            >
              <Save className="h-4 w-4" />
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
