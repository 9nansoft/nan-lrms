// HospitalEditDialog — comprehensive hospital settings modal used by the
// admin page. Three tabs:
//   1. General       — name, level, province, lat/lon, active
//   2. BMS Tunnel    — per-hospital tunnel URL + live test-connection
//   3. Webhook Keys  — create / list / revoke API keys for this hospital
// Each tab persists independently via its own endpoint so partial saves
// don't clobber unrelated fields.
'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  Settings2,
  Cable,
  KeyRound,
  MapPin,
  Save,
  FlaskConical,
  Wifi,
  WifiOff,
  AlertTriangle,
  Plus,
  Copy,
  Check,
  Trash2,
  Database,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { HospitalLevel, HospitalServiceType } from '@/types/domain';

const LEVEL_OPTIONS = Object.values(HospitalLevel);

// Three maternity-role tiers requested by the clinical team:
//   PROVINCIAL_HUB            — main provincial / regional referral center
//   DISTRICT_WITH_MATERNITY   — district hospital that runs a labor ward
//   DISTRICT_NO_MATERNITY     — district hospital that only does ANC + refers
interface ServiceTypeMeta {
  value: HospitalServiceType;
  labelTh: string;
  blurb: string;
}
const SERVICE_TYPE_META: ServiceTypeMeta[] = [
  {
    value: HospitalServiceType.PROVINCIAL_HUB,
    labelTh: 'โรงพยาบาลจังหวัด / ศูนย์',
    blurb: 'รับส่งต่อระดับจังหวัด · ห้องคลอดครบวงจร',
  },
  {
    value: HospitalServiceType.DISTRICT_WITH_MATERNITY,
    labelTh: 'รพช. ที่มีห้องคลอด',
    blurb: 'รับคลอดในพื้นที่ · ส่งต่อเมื่อเกินศักยภาพ',
  },
  {
    value: HospitalServiceType.DISTRICT_NO_MATERNITY,
    labelTh: 'รพช. ไม่มีห้องคลอด',
    blurb: 'ฝากครรภ์ + refer ออกทั้งหมด · ไม่ sync partograph',
  },
];

// ───────────────── Types that match existing APIs ─────────────────

export interface AdminHospital {
  hcode: string;
  name: string;
  level: string;
  serviceType: string | null;
  provinceCode: string | null;
  districtCode?: string | null;
  lat?: number | null;
  lon?: number | null;
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

interface ProvincesResponse {
  provinces: Array<{ code: string; name: string }>;
}

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

interface TestResult {
  connected: boolean;
  databaseType?: string;
  databaseVersion?: string;
  tablesFound?: string[];
  error?: string;
}

// ───────────────── Component ─────────────────

type SectionKey = 'general' | 'tunnel' | 'webhooks';

interface Props {
  hospital: AdminHospital | null;
  onClose: () => void;
  /** Called after General save so the parent SWR cache can revalidate. */
  onSaved: () => Promise<void> | void;
}

export function HospitalEditDialog({ hospital, onClose, onSaved }: Props) {
  if (!hospital) return null;

  return (
    <Dialog open={!!hospital} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-4xl p-0"
        style={{ width: 'min(96vw, 960px)' }}
      >
        {/* key on the inner shell re-mounts state (active section, form fields)
            when switching hospitals without a useEffect-driven reset. */}
        <DialogInner key={hospital.hcode} hospital={hospital} onClose={onClose} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  );
}

function DialogInner({ hospital, onSaved }: Props & { hospital: AdminHospital }) {
  const [section, setSection] = useState<SectionKey>('general');

  return (
    <>
      <DialogHeader className="border-b px-5 pt-4 pb-3"
        style={{ borderColor: 'var(--rule-strong)' }}
      >
        <DialogTitle className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-navy-muted)]">
              EDIT HOSPITAL · {hospital.hcode}
            </div>
            <div
              className="mt-0.5 truncate text-[18px] font-semibold leading-tight"
              style={{ color: 'var(--ink-navy)' }}
            >
              {hospital.name}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span
                    className="border px-1.5 py-0.5 font-mono text-[10px]"
                    style={{
                      borderColor: 'var(--rule-strong)',
                      color: 'var(--ink-navy-dim)',
                    }}
                  >
                    {hospital.level}
                  </span>
                  {hospital.serviceType ? (
                    <span
                      className="border px-1.5 py-0.5 font-mono text-[10px]"
                      style={{
                        borderColor: 'var(--accent-navy)',
                        color: 'var(--accent-navy)',
                        background: 'var(--accent-navy-soft)',
                      }}
                    >
                      {SERVICE_TYPE_META.find((s) => s.value === hospital.serviceType)?.labelTh ??
                        hospital.serviceType}
                    </span>
                  ) : null}
                  <span
                    className="inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[10px]"
                    style={{
                      borderColor: hospital.isActive
                        ? 'var(--risk-low)'
                        : 'var(--ink-navy-muted)',
                      color: hospital.isActive
                        ? 'var(--risk-low)'
                        : 'var(--ink-navy-muted)',
                    }}
                  >
                    {hospital.isActive ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <AlertTriangle className="h-3 w-3" />
                    )}
                    {hospital.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </span>
              <span
                className="inline-flex items-center gap-1 font-mono text-[10px] text-[var(--ink-navy-muted)]"
              >
                <MapPin className="h-3 w-3" />
                {typeof hospital.lat === 'number' && typeof hospital.lon === 'number'
                  ? `${hospital.lat.toFixed(4)}, ${hospital.lon.toFixed(4)}`
                  : 'no coords'}
              </span>
            </div>
          </div>
        </DialogTitle>
      </DialogHeader>

        {/* Section tabs */}
        <div
          className="flex border-b bg-white px-5"
          style={{ borderColor: 'var(--rule-strong)' }}
        >
          {(
            [
              { k: 'general' as const, label: 'ข้อมูลทั่วไป', icon: Settings2 },
              { k: 'tunnel' as const, label: 'BMS Tunnel', icon: Cable },
              { k: 'webhooks' as const, label: 'Webhook Keys', icon: KeyRound },
            ]
          ).map((t) => {
            const active = section === t.k;
            const Icon = t.icon;
            return (
              <button
                key={t.k}
                onClick={() => setSection(t.k)}
                className={cn(
                  'relative -mb-px inline-flex items-center gap-1.5 px-3 py-2 font-mono text-[11px] tracking-[0.06em] transition-colors',
                  active ? 'font-semibold' : 'font-normal hover:text-[var(--accent-navy)]',
                )}
                style={{
                  color: active ? 'var(--accent-navy)' : 'var(--ink-navy-dim)',
                  borderBottom: active
                    ? '2px solid var(--accent-navy)'
                    : '2px solid transparent',
                }}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Section content — fixed-ish height so switching tabs doesn't jitter */}
        <div
          className="max-h-[70vh] overflow-y-auto px-5 py-4"
          style={{ background: 'var(--surface-cool)' }}
        >
        {section === 'general' ? (
          <GeneralSection hospital={hospital} onSaved={onSaved} />
        ) : section === 'tunnel' ? (
          <TunnelSection hospital={hospital} />
        ) : (
          <WebhooksSection hospital={hospital} />
        )}
      </div>
    </>
  );
}

// ───────────────── General section ─────────────────

function GeneralSection({
  hospital,
  onSaved,
}: {
  hospital: AdminHospital;
  onSaved: () => Promise<void> | void;
}) {
  const { data: provincesData } = useSWR<ProvincesResponse>('/api/admin/provinces');
  const [name, setName] = useState(hospital.name);
  const [level, setLevel] = useState(hospital.level);
  const [serviceType, setServiceType] = useState<string>(
    hospital.serviceType ?? HospitalServiceType.DISTRICT_WITH_MATERNITY,
  );
  const [provinceCode, setProvinceCode] = useState(hospital.provinceCode ?? '');
  const [lat, setLat] = useState(
    typeof hospital.lat === 'number' ? String(hospital.lat) : '',
  );
  const [lon, setLon] = useState(
    typeof hospital.lon === 'number' ? String(hospital.lon) : '',
  );
  const [isActive, setIsActive] = useState(hospital.isActive);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setName(hospital.name);
    setLevel(hospital.level);
    setServiceType(hospital.serviceType ?? HospitalServiceType.DISTRICT_WITH_MATERNITY);
    setProvinceCode(hospital.provinceCode ?? '');
    setLat(typeof hospital.lat === 'number' ? String(hospital.lat) : '');
    setLon(typeof hospital.lon === 'number' ? String(hospital.lon) : '');
    setIsActive(hospital.isActive);
    setMessage(null);
  }, [hospital.hcode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const latNum = lat === '' ? null : Number(lat);
      const lonNum = lon === '' ? null : Number(lon);
      if (lat !== '' && !Number.isFinite(latNum)) throw new Error('lat ไม่ถูกต้อง');
      if (lon !== '' && !Number.isFinite(lonNum)) throw new Error('lon ไม่ถูกต้อง');

      const res = await fetch(`/api/admin/hospitals/${hospital.hcode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          level,
          serviceType,
          provinceCode: provinceCode || null,
          lat: latNum,
          lon: lonNum,
          isActive,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? 'บันทึกไม่สำเร็จ');
      }
      setMessage('บันทึกสำเร็จ');
      await onSaved();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Service-type picker — three radio-card tiles so the ops team sees the
          consequence blurb before committing. Drives sync eligibility and
          dashboard filters, so worth surfacing above the MOPH level. */}
      <div>
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-navy-muted)]">
          SERVICE TYPE · ประเภทการให้บริการ
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {SERVICE_TYPE_META.map((m) => {
            const active = serviceType === m.value;
            return (
              <button
                type="button"
                key={m.value}
                onClick={() => setServiceType(m.value)}
                className="flex flex-col gap-0.5 border px-3 py-2 text-left transition-colors"
                style={{
                  borderColor: active ? 'var(--accent-navy)' : 'var(--rule-strong)',
                  background: active ? 'var(--accent-navy-soft)' : 'white',
                  color: active ? 'var(--accent-navy)' : 'var(--ink-navy-dim)',
                  boxShadow: active ? 'inset 0 0 0 1px var(--accent-navy)' : undefined,
                }}
              >
                <div className="text-[13px] font-semibold leading-tight">{m.labelTh}</div>
                <div className="font-mono text-[10px] leading-snug text-[var(--ink-navy-muted)]">
                  {m.blurb}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="ชื่อโรงพยาบาล">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
        </Field>
        <Field label="ระดับ MOPH">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="h-9 w-full border bg-white px-2 font-mono text-sm"
            style={{ borderColor: 'var(--rule-strong)' }}
          >
            {LEVEL_OPTIONS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="จังหวัด">
          <select
            value={provinceCode}
            onChange={(e) => setProvinceCode(e.target.value)}
            className="h-9 w-full border bg-white px-2 font-mono text-sm"
            style={{ borderColor: 'var(--rule-strong)' }}
          >
            <option value="">—</option>
            {(provincesData?.provinces ?? []).map((p) => (
              <option key={p.code} value={p.code}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </Field>
        <Field label="สถานะ">
          <label className="inline-flex h-9 items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            เปิดใช้งาน (ส่งผลต่อการ sync และแสดงบน dashboard)
          </label>
        </Field>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-navy-muted)]">
          <MapPin className="h-3 w-3" />
          GEO COORDINATES · ใช้สำหรับปักหมุดบนแผนที่
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude">
            <Input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="16.4419"
              className="h-9 font-mono"
            />
          </Field>
          <Field label="Longitude">
            <Input
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              placeholder="102.8358"
              className="h-9 font-mono"
            />
          </Field>
        </div>
        <p className="mt-1 font-mono text-[10px] leading-snug text-[var(--ink-navy-muted)]">
          ถ้าไม่ใส่พิกัด ระบบจะใช้ centroid ของอำเภอแทน
        </p>
      </div>

      {message ? (
        <div
          className="border px-3 py-2 font-mono text-[11px]"
          style={{
            borderColor: message === 'บันทึกสำเร็จ' ? 'var(--risk-low)' : 'var(--risk-high)',
            color: message === 'บันทึกสำเร็จ' ? 'var(--risk-low)' : 'var(--risk-high)',
            background: 'white',
          }}
        >
          {message}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={busy || !name.trim()} className="gap-1.5">
          <Save className="h-4 w-4" />
          {busy ? 'กำลังบันทึก...' : 'บันทึก'}
        </Button>
      </div>
    </div>
  );
}

// ───────────────── Tunnel section ─────────────────

function TunnelSection({ hospital }: { hospital: AdminHospital }) {
  const [tunnelUrl, setTunnelUrl] = useState(hospital.bmsConfig?.tunnelUrl ?? '');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    setTunnelUrl(hospital.bmsConfig?.tunnelUrl ?? '');
    setSaveMessage(null);
    setTestResult(null);
  }, [hospital.hcode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!tunnelUrl.trim()) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch(`/api/admin/hospitals/${hospital.hcode}/bms-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tunnelUrl: tunnelUrl.trim() }),
      });
      const result = await res.json();
      if (!res.ok) {
        setSaveMessage(`ผิดพลาด: ${result.error ?? 'บันทึกไม่สำเร็จ'}`);
        return;
      }
      setSaveMessage(
        result.sessionValidated
          ? `บันทึกสำเร็จ — Session validated, DB: ${result.databaseType}`
          : 'บันทึก URL แล้ว — ยังไม่สามารถ validate session ได้',
      );
    } catch {
      setSaveMessage('เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(
        `/api/admin/hospitals/${hospital.hcode}/test-connection`,
        { method: 'POST' },
      );
      const result = (await res.json()) as TestResult;
      setTestResult(result);
    } catch {
      setTestResult({ connected: false, error: 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  const hasUrl = !!hospital.bmsConfig?.tunnelUrl;

  return (
    <div className="space-y-4">
      {/* Status strip */}
      <div
        className="grid gap-0 border bg-white"
        style={{
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          borderColor: 'var(--rule-strong)',
        }}
      >
        <StatBox
          label="TUNNEL URL"
          value={hasUrl ? 'configured' : 'not set'}
          tone={hasUrl ? 'low' : 'muted'}
          Icon={hasUrl ? Wifi : WifiOff}
        />
        <StatBox
          label="SESSION"
          value={hospital.bmsConfig?.hasSession ? 'active' : '—'}
          tone={hospital.bmsConfig?.hasSession ? 'low' : 'muted'}
          Icon={hospital.bmsConfig?.hasSession ? CheckCircle2 : AlertTriangle}
        />
        <StatBox
          label="DATABASE"
          value={hospital.bmsConfig?.databaseType ?? '—'}
          tone={hospital.bmsConfig?.databaseType ? 'navy' : 'muted'}
          Icon={Database}
        />
      </div>

      <div className="border bg-white p-4" style={{ borderColor: 'var(--rule-strong)' }}>
        <Field label="Tunnel URL">
          <Input
            value={tunnelUrl}
            onChange={(e) => setTunnelUrl(e.target.value)}
            placeholder="https://xxxxx-ondemand-win-xxxxxxxxx.tunnel.hosxp.net"
            className="h-9 font-mono text-[12px]"
          />
        </Field>
        <p className="mt-1 font-mono text-[10px] leading-snug text-[var(--ink-navy-muted)]">
          ระบบจะใช้ URL นี้สำหรับดึงข้อมูลจาก BMS ของโรงพยาบาล · ต้องสามารถเข้าถึงได้จากเซิร์ฟเวอร์ของระบบ
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={saving || !tunnelUrl.trim()} className="gap-1.5">
            <Save className="h-4 w-4" />
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </Button>
          <Button
            onClick={handleTest}
            disabled={testing || !hasUrl}
            variant="outline"
            className="gap-1.5"
          >
            <FlaskConical className="h-4 w-4" />
            {testing ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ'}
          </Button>
        </div>

        {saveMessage ? (
          <div
            className="mt-3 border px-3 py-2 font-mono text-[11px]"
            style={{
              borderColor: saveMessage.includes('สำเร็จ')
                ? 'var(--risk-low)'
                : 'var(--risk-high)',
              color: saveMessage.includes('สำเร็จ')
                ? 'var(--risk-low)'
                : 'var(--risk-high)',
            }}
          >
            {saveMessage}
          </div>
        ) : null}

        {testResult ? (
          <div
            className="mt-3 space-y-1 border px-3 py-2 font-mono text-[11px]"
            style={{
              borderColor: testResult.connected ? 'var(--risk-low)' : 'var(--risk-high)',
              color: testResult.connected ? 'var(--risk-low)' : 'var(--risk-high)',
            }}
          >
            <div>
              {testResult.connected ? '✓ เชื่อมต่อสำเร็จ' : '✗ เชื่อมต่อไม่สำเร็จ'}
              {testResult.databaseType ? ` · ${testResult.databaseType}` : ''}
              {testResult.databaseVersion ? ` · v${testResult.databaseVersion}` : ''}
            </div>
            {testResult.tablesFound && testResult.tablesFound.length > 0 ? (
              <div className="text-[var(--ink-navy-dim)]">
                Tables: {testResult.tablesFound.slice(0, 5).join(', ')}
                {testResult.tablesFound.length > 5 ? '…' : ''}
              </div>
            ) : null}
            {testResult.error ? (
              <div className="text-[var(--ink-navy-dim)]">Error: {testResult.error}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ───────────────── Webhooks section ─────────────────

function WebhooksSection({ hospital }: { hospital: AdminHospital }) {
  const { data, mutate } = useSWR<{ keys: WebhookKey[] }>('/api/admin/webhooks');
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<{
    apiKey: string;
    keyPrefix: string;
    label: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<WebhookKey | null>(null);
  const [revokeInput, setRevokeInput] = useState('');
  const [revoking, setRevoking] = useState(false);

  // Filter keys to this hospital only so the dialog is focused.
  const keys = useMemo(
    () => (data?.keys ?? []).filter((k) => k.hcode === hospital.hcode),
    [data, hospital.hcode],
  );

  const handleCreate = async () => {
    if (!label.trim()) return;
    setCreating(true);
    setCreateError(null);
    setJustCreated(null);
    setCopied(false);
    try {
      const res = await fetch('/api/admin/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hcode: hospital.hcode, label: label.trim() }),
      });
      const result = await res.json();
      if (!res.ok) {
        setCreateError(result.error ?? 'สร้างไม่สำเร็จ');
        return;
      }
      setJustCreated({
        apiKey: result.apiKey,
        keyPrefix: result.keyPrefix,
        label: result.label,
      });
      setLabel('');
      await mutate();
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
      // clipboard blocked — user can select manually
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget || revokeInput !== revokeTarget.keyPrefix) return;
    setRevoking(true);
    try {
      const res = await fetch(`/api/admin/webhooks/${revokeTarget.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        alert(err?.error ?? 'ยกเลิกไม่สำเร็จ');
        return;
      }
      setRevokeTarget(null);
      setRevokeInput('');
      await mutate();
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Create form */}
      <div className="border bg-white p-4" style={{ borderColor: 'var(--rule-strong)' }}>
        <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em]">
          <KeyRound className="h-3 w-3" style={{ color: 'var(--accent-navy)' }} />
          <span style={{ color: 'var(--accent-navy)' }}>สร้าง API Key ใหม่</span>
          <span className="text-[var(--ink-navy-muted)]">· {hospital.hcode}</span>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1" style={{ minWidth: 260 }}>
            <Field label="Label">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="เช่น Production webhook"
                className="h-9"
              />
            </Field>
          </div>
          <Button onClick={handleCreate} disabled={creating || !label.trim()} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {creating ? 'กำลังสร้าง...' : 'สร้าง Key'}
          </Button>
        </div>
        {createError ? (
          <div
            className="mt-2 border px-3 py-2 font-mono text-[11px]"
            style={{ borderColor: 'var(--risk-high)', color: 'var(--risk-high)' }}
          >
            {createError}
          </div>
        ) : null}
      </div>

      {/* Just-created reveal */}
      {justCreated ? (
        <div
          className="border-2 bg-white px-4 py-3"
          style={{ borderColor: 'var(--risk-medium)' }}
        >
          <div className="mb-2 flex items-start gap-2">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ color: 'var(--risk-medium)' }}
            />
            <div>
              <div
                className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: 'var(--risk-medium)' }}
              >
                บันทึก API Key นี้ไว้ทันที — ระบบจะไม่แสดงอีก
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-[var(--ink-navy-dim)]">
                {justCreated.label}
              </div>
            </div>
          </div>
          <div
            className="flex items-center gap-2 border bg-[var(--surface-cool)] px-3 py-2"
            style={{ borderColor: 'var(--rule-strong)' }}
          >
            <code className="flex-1 overflow-x-auto font-mono text-[12px] text-[var(--ink-navy)]">
              {justCreated.apiKey}
            </code>
            <Button onClick={handleCopy} variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]">
              {copied ? (
                <Check className="h-3 w-3" style={{ color: 'var(--risk-low)' }} />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Keys list */}
      <div className="border bg-white" style={{ borderColor: 'var(--rule-strong)' }}>
        <div
          className="grid gap-2 border-b px-3 py-2 font-mono text-[10px] tracking-[0.1em] text-[var(--ink-navy-muted)]"
          style={{ gridTemplateColumns: '1fr 110px 120px 70px 80px', borderColor: 'var(--rule-strong)' }}
        >
          <div>LABEL</div>
          <div>PREFIX</div>
          <div>LAST USED</div>
          <div>STATUS</div>
          <div className="text-right">ACTION</div>
        </div>
        {keys.length === 0 ? (
          <div className="px-3 py-6 text-center font-mono text-[11px] text-[var(--ink-navy-muted)]">
            ยังไม่มี API Key สำหรับโรงพยาบาลนี้
          </div>
        ) : (
          keys.map((k) => (
            <div
              key={k.id}
              className="grid items-center gap-2 border-b px-3 py-2 text-[12px] last:border-b-0"
              style={{
                gridTemplateColumns: '1fr 110px 120px 70px 80px',
                borderColor: 'var(--rule-hair)',
                opacity: k.isActive ? 1 : 0.55,
              }}
            >
              <div className="truncate">{k.label}</div>
              <code
                className="border px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-navy-dim)]"
                style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface-cool)' }}
              >
                {k.keyPrefix}…
              </code>
              <div className="font-mono text-[11px] text-[var(--ink-navy-dim)]">
                {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString('th-TH') : '—'}
              </div>
              <div>
                <span
                  className="inline-block border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.06em]"
                  style={{
                    color: k.isActive ? 'var(--risk-low)' : 'var(--ink-navy-muted)',
                    borderColor: k.isActive ? 'var(--risk-low)' : 'var(--rule-strong)',
                  }}
                >
                  {k.isActive ? 'ACTIVE' : 'REVOKED'}
                </span>
              </div>
              <div className="text-right">
                {k.isActive ? (
                  <button
                    onClick={() => {
                      setRevokeTarget(k);
                      setRevokeInput('');
                    }}
                    className="inline-flex items-center gap-1 px-1.5 py-1 font-mono text-[10px] hover:bg-red-50"
                    style={{ color: 'var(--risk-high)' }}
                  >
                    <Trash2 className="h-3 w-3" />
                    ยกเลิก
                  </button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Inline revoke confirm */}
      {revokeTarget ? (
        <div
          className="border-2 bg-white p-3"
          style={{ borderColor: 'var(--risk-high)' }}
        >
          <div className="mb-2 flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: 'var(--risk-high)' }}>
            <AlertTriangle className="h-3.5 w-3.5" />
            ยืนยันการยกเลิก · {revokeTarget.label}
          </div>
          <p className="mb-2 font-mono text-[10px] leading-snug text-[var(--ink-navy-dim)]">
            คีย์ที่ยกเลิกแล้วจะใช้ไม่ได้ทันที · พิมพ์ prefix <code>{revokeTarget.keyPrefix}</code> เพื่อยืนยัน
          </p>
          <div className="flex gap-2">
            <Input
              value={revokeInput}
              onChange={(e) => setRevokeInput(e.target.value)}
              placeholder={revokeTarget.keyPrefix}
              className="h-9 font-mono"
              autoFocus
            />
            <Button variant="ghost" onClick={() => setRevokeTarget(null)} disabled={revoking}>
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevoke}
              disabled={revoking || revokeInput !== revokeTarget.keyPrefix}
              className="gap-1.5"
            >
              <Trash2 className="h-4 w-4" />
              {revoking ? 'กำลังยกเลิก...' : 'ยืนยัน'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ───────────────── Shared mini components ─────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-navy-muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}

function StatBox({
  label,
  value,
  tone,
  Icon,
}: {
  label: string;
  value: string;
  tone: 'low' | 'muted' | 'navy';
  Icon: React.ComponentType<{ className?: string }>;
}) {
  const color =
    tone === 'low'
      ? 'var(--risk-low)'
      : tone === 'navy'
        ? 'var(--accent-navy)'
        : 'var(--ink-navy-muted)';
  return (
    <div className="px-4 py-3" style={{ borderLeft: `2px solid ${color}` }}>
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-navy-muted)]">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div
        className="mt-1 font-mono text-[14px] font-semibold leading-none"
        style={{ color }}
      >
        {value}
      </div>
    </div>
  );
}
