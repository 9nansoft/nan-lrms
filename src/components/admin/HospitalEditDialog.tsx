// HospitalEditDialog — comprehensive hospital settings modal used by the
// admin page. Six sections:
//   1. ข้อมูลทั่วไป      — name, level, province, lat/lon, active
//   2. แพทย์ที่ปรึกษา    — referral consult doctor contacts for this hospital
//   3. การเชื่อมต่อ BMS  — per-hospital tunnel URL + live test-connection
//   4. บันทึกการซิงค์    — per-run progress trail and errors
//   5. คีย์ Webhook      — create / list / revoke API keys for this hospital
//   6. ลบข้อมูล          — typed-hcode purge of cached clinical data
// Each section persists independently via its own endpoint so partial saves
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
  Users,
  Phone,
  Briefcase,
  Pencil,
  Building2,
  CalendarClock,
  Activity,
  ShieldCheck,
  ShieldAlert,
  Eraser,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { InlineNotice } from '@/components/shared/InlineNotice';
import { SYNC_LOG_POLL_MS, SYNC_OUTCOME_META, SYNC_STEP_TONE, formatSyncDuration, syncTriggerLabel } from '@/config/sync-run-status';
import type { StatusTone } from '@/config/status-tone';
import { DEFAULT_ACTION_REMEDY } from '@/lib/action-failure';
import { cn, formatRelativeTime } from '@/lib/utils';
import { Field, SELECT_CLASS, StatusPill, TONE_CLASSES } from './admin-ui';
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
    hasMarketplaceToken?: boolean;
    authenticity?: {
      // null = never probed; 'authentic' = OK;
      // anything else = sync is suppressed for this hospital until re-onboard
      status:
        | 'authentic'
        | 'cid_unstable'
        | 'hn_unstable'
        | 'no_id_field'
        | 'probe_failed'
        | 'missing_marketplace_token'
        | 'no_data'
        | null;
      checkedAt: string | null;
      reason: string | null;
    };
  } | null;
}

export function isHospitalAuthenticityFailure(
  hospital: AdminHospital,
): boolean {
  const status = hospital.bmsConfig?.authenticity?.status;
  if (!status) return false;
  return status !== 'authentic' && status !== 'no_data';
}

export function describeAuthenticityFailure(
  hospital: AdminHospital,
): string {
  const a = hospital.bmsConfig?.authenticity;
  if (!a?.status) return '';
  switch (a.status) {
    case 'missing_marketplace_token':
      return 'ไม่มี marketplace_token — กรุณา onboard ใหม่จากหน้า HOSxP จริงเพื่อบันทึก token ที่ถูกต้อง';
    case 'cid_unstable':
    case 'hn_unstable':
      return 'ข้อมูลที่ได้จาก HOSxP ไม่ผ่านการตรวจสอบ (CID/HN ไม่ตรงกับฐานข้อมูล) — กรุณา onboard ใหม่ผ่าน HOSxP จริงเพื่อขอ marketplace_token ใหม่';
    case 'no_id_field':
      return 'ข้อมูลที่ได้จาก HOSxP ไม่มี CID/HN ที่อ่านได้ — กรุณาตรวจสอบ HOSxP API';
    case 'probe_failed':
      return 'ตรวจสอบความถูกต้องของข้อมูลไม่สำเร็จ — กรุณาตรวจสอบสถานะ BMS Tunnel';
    default:
      return '';
  }
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

interface ConsultDoctor {
  id: string;
  hospitalId: string;
  hcode: string;
  cid: string;
  name: string;
  position: string | null;
  phoneNumber: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TestResult {
  connected: boolean;
  databaseType?: string;
  databaseVersion?: string;
  tablesFound?: string[];
  error?: string;
}

// ───────────────── Component ─────────────────

type SectionKey =
  | 'general'
  | 'consult'
  | 'tunnel'
  | 'sync-log'
  | 'webhooks'
  | 'danger';

interface Props {
  hospital: AdminHospital | null;
  onClose: () => void;
  /** Called after General save so the parent SWR cache can revalidate. */
  onSaved: () => Promise<void> | void;
  /** Optional starting tab — defaults to 'general'. The Sync Overview
   *  tab passes 'sync-log' so clicking a row lands operators directly
   *  on the run trail. */
  initialSection?: SectionKey;
}

export function HospitalEditDialog({ hospital, onClose, onSaved, initialSection }: Props) {
  if (!hospital) return null;

  return (
    <Dialog open={!!hospital} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-h-[94vh] max-w-[calc(100vw-2rem)] overflow-hidden p-0 sm:max-w-none"
        style={{ width: 'min(96vw, 1080px)' }}
      >
        {/* key on the inner shell re-mounts state (active section, form fields)
            when switching hospitals without a useEffect-driven reset. */}
        <DialogInner
          key={hospital.hcode}
          hospital={hospital}
          onClose={onClose}
          onSaved={onSaved}
          initialSection={initialSection}
        />
      </DialogContent>
    </Dialog>
  );
}

function serviceMeta(serviceType: string | null) {
  return SERVICE_TYPE_META.find((s) => s.value === serviceType) ?? null;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function coordinatesLabel(hospital: AdminHospital) {
  if (typeof hospital.lat !== 'number' || typeof hospital.lon !== 'number') {
    return 'ยังไม่ได้กำหนด';
  }
  return `${hospital.lat.toFixed(4)}, ${hospital.lon.toFixed(4)}`;
}

function connectionTone(status: string): StatusTone {
  if (status === 'CONNECTED') return 'ok';
  if (status === 'ERROR' || status === 'FAILED') return 'danger';
  return 'neutral';
}

function DialogInner({
  hospital,
  onSaved,
  initialSection,
}: Props & { hospital: AdminHospital }) {
  const [section, setSection] = useState<SectionKey>(initialSection ?? 'general');
  const { data: doctorsData } = useSWR<{ doctors: ConsultDoctor[] }>(
    `/api/admin/hospitals/${hospital.hcode}/consult-doctors`,
  );
  const { data: webhookData } = useSWR<{ keys: WebhookKey[] }>('/api/admin/webhooks');

  const service = serviceMeta(hospital.serviceType);
  const doctorCount = doctorsData?.doctors.length;
  const webhookCount = useMemo(
    () =>
      (webhookData?.keys ?? []).filter((key) => key.hcode === hospital.hcode && key.isActive)
        .length,
    [hospital.hcode, webhookData],
  );
  const hasCoords = typeof hospital.lat === 'number' && typeof hospital.lon === 'number';
  const bmsStatus = hospital.bmsConfig?.hasSession
    ? 'มี BMS session'
    : hospital.bmsConfig?.tunnelUrl
      ? 'บันทึก URL แล้ว'
      : 'ยังไม่ตั้งค่า';
  const tabs: Array<{
    k: SectionKey;
    label: string;
    detail: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      k: 'general',
      label: 'ข้อมูลทั่วไป',
      detail: service?.labelTh ?? 'ยังไม่ระบุประเภท',
      icon: Settings2,
    },
    {
      k: 'consult',
      label: 'แพทย์ที่ปรึกษา',
      detail: doctorCount === undefined ? 'ผู้ติดต่อ' : `${doctorCount} คน`,
      icon: Users,
    },
    { k: 'tunnel', label: 'การเชื่อมต่อ BMS', detail: bmsStatus, icon: Cable },
    {
      k: 'sync-log',
      label: 'บันทึกการซิงค์',
      detail: 'ความคืบหน้าและข้อผิดพลาด',
      icon: Activity,
    },
    {
      k: 'webhooks',
      label: 'คีย์ Webhook',
      detail: `ใช้งาน ${webhookCount} คีย์`,
      icon: KeyRound,
    },
    {
      k: 'danger',
      label: 'ลบข้อมูล',
      detail: 'ลบข้อมูลคลินิก',
      icon: ShieldAlert,
    },
  ];

  return (
    <>
      <DialogHeader className="border-b border-border bg-surface-card px-5 pt-4 pb-4">
        <DialogTitle className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-label text-ink-muted">
                  <Building2 aria-hidden="true" className="h-4 w-4" />
                  ข้อมูลการทำงานของโรงพยาบาล
                </span>
                <span className="rounded border border-border bg-surface-muted px-2 py-0.5 font-mono text-caption text-ink-muted">
                  hcode {hospital.hcode}
                </span>
              </div>
              <div className="mt-1 truncate text-title text-ink">{hospital.name}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusPill
                  tone={hospital.isActive ? 'ok' : 'neutral'}
                  icon={hospital.isActive ? CheckCircle2 : AlertTriangle}
                >
                  {hospital.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
                </StatusPill>
                <StatusPill tone={connectionTone(hospital.connectionStatus)} icon={Activity}>
                  {`ซิงค์ ${hospital.connectionStatus || 'UNKNOWN'}`}
                </StatusPill>
                <StatusPill
                  tone={hospital.bmsConfig?.hasSession ? 'ok' : hospital.bmsConfig?.tunnelUrl ? 'warn' : 'neutral'}
                  icon={Database}
                >
                  {bmsStatus}
                </StatusPill>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-left text-ink md:w-[360px]">
              <ProfileMetric label="ระดับ" value={hospital.level} Icon={ShieldCheck} tone="brand" />
              <ProfileMetric
                label="ซิงค์ล่าสุด"
                value={formatDateTime(hospital.lastSyncAt)}
                Icon={CalendarClock}
                tone={hospital.lastSyncAt ? 'brand' : 'neutral'}
              />
            </div>
          </div>

          <div className="grid gap-2 rounded-xl border border-border bg-surface-muted px-3 py-2 text-caption md:grid-cols-[1.2fr_1fr_1fr]">
            <HeaderFact label="ประเภทบริการ" value={service?.labelTh ?? 'ยังไม่ระบุประเภท'} />
            <HeaderFact
              label="พิกัด"
              value={coordinatesLabel(hospital)}
              Icon={MapPin}
              muted={!hasCoords}
            />
            <HeaderFact
              label="ฐานข้อมูล"
              value={hospital.bmsConfig?.databaseType ?? 'ยังไม่ทราบชนิดฐานข้อมูล'}
              Icon={Database}
              muted={!hospital.bmsConfig?.databaseType}
            />
          </div>
        </DialogTitle>
      </DialogHeader>

      {/* Section tabs */}
      <div className="flex overflow-x-auto border-b border-border bg-surface-card px-5">
        {tabs.map((t) => {
          const active = section === t.k;
          const Icon = t.icon;
          return (
            <button
              key={t.k}
              onClick={() => setSection(t.k)}
              aria-pressed={active}
              className={cn(
                'relative -mb-px inline-flex min-w-[160px] items-center gap-2 border-b-2 px-3 py-2.5 text-left transition-colors',
                active
                  ? 'border-brand font-semibold text-brand'
                  : 'border-transparent text-ink-muted hover:text-brand',
              )}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              <span className="min-w-0">
                <span className="block truncate text-label">{t.label}</span>
                <span className="block truncate text-caption font-normal text-ink-muted">{t.detail}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Section content — fixed-ish height so switching tabs doesn't jitter */}
      <div className="max-h-[calc(94vh-230px)] min-h-[340px] overflow-y-auto bg-surface-muted px-5 py-4">
        {section === 'general' ? (
          <GeneralSection hospital={hospital} onSaved={onSaved} />
        ) : section === 'consult' ? (
          <ConsultDoctorsSection hospital={hospital} />
        ) : section === 'tunnel' ? (
          <TunnelSection hospital={hospital} />
        ) : section === 'sync-log' ? (
          <SyncLogSection hospital={hospital} />
        ) : section === 'webhooks' ? (
          <WebhooksSection hospital={hospital} />
        ) : (
          <DangerZoneSection hospital={hospital} onSaved={onSaved} />
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
      <SectionIntro
        eyebrow="ข้อมูลระบุตัวโรงพยาบาล"
        title="ข้อมูลหลักของโรงพยาบาล"
        detail="ข้อมูลนี้ใช้กำหนดบทบาทบริการ สถานะการใช้งาน และตำแหน่งบนแผนที่ของระบบ"
        Icon={Settings2}
        meta={`สถานะ: ${isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}`}
      />

      {/* Service-type picker — three radio-card tiles so the ops team sees the
          consequence blurb before committing. Drives sync eligibility and
          dashboard filters, so worth surfacing above the MOPH level. */}
      <div>
        <div className="mb-1 text-label text-ink">ประเภทการให้บริการ</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {SERVICE_TYPE_META.map((m) => {
            const active = serviceType === m.value;
            return (
              <button
                type="button"
                key={m.value}
                onClick={() => setServiceType(m.value)}
                aria-pressed={active}
                className={cn(
                  'flex flex-col gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors',
                  active
                    ? 'border-brand bg-brand-soft text-brand ring-1 ring-brand'
                    : 'border-border bg-surface-card text-ink hover:bg-surface-muted',
                )}
              >
                <div className="text-label font-semibold leading-tight">{m.labelTh}</div>
                <div className="text-caption text-ink-muted">{m.blurb}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="ชื่อโรงพยาบาล">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11 text-body" />
        </Field>
        <Field label="ระดับ MOPH">
          <select value={level} onChange={(e) => setLevel(e.target.value)} className={SELECT_CLASS}>
            {LEVEL_OPTIONS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="จังหวัด">
          <select value={provinceCode} onChange={(e) => setProvinceCode(e.target.value)} className={SELECT_CLASS}>
            <option value="">—</option>
            {(provincesData?.provinces ?? []).map((p) => (
              <option key={p.code} value={p.code}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </Field>
        <Field label="สถานะ">
          <label className="inline-flex min-h-11 items-center gap-2 text-body text-ink">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-5 w-5 accent-brand"
            />
            เปิดใช้งาน (ส่งผลต่อการซิงค์และการแสดงบนแดชบอร์ด)
          </label>
        </Field>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1.5 text-label text-ink">
          <MapPin aria-hidden="true" className="h-4 w-4" />
          พิกัดภูมิศาสตร์ · ใช้สำหรับปักหมุดบนแผนที่
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ละติจูด">
            <Input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="16.4419"
              className="h-11 font-mono text-body"
            />
          </Field>
          <Field label="ลองจิจูด">
            <Input
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              placeholder="102.8358"
              className="h-11 font-mono text-body"
            />
          </Field>
        </div>
        <p className="mt-1 text-caption text-ink-muted">
          ถ้าไม่ใส่พิกัด ระบบจะใช้ centroid ของอำเภอแทน
        </p>
      </div>

      {message ? (
        message === 'บันทึกสำเร็จ' ? (
          <InlineNotice tone="ok">{message}</InlineNotice>
        ) : (
          <ErrorState variant="banner" className="rounded-xl border" message={message} remedy={DEFAULT_ACTION_REMEDY} />
        )
      ) : null}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={busy || !name.trim()} className="h-11 gap-1.5 bg-brand text-white hover:bg-brand-strong">
          <Save aria-hidden="true" className="h-4 w-4" />
          {busy ? 'กำลังบันทึก...' : 'บันทึก'}
        </Button>
      </div>
    </div>
  );
}

// ───────────────── Consult doctors section ─────────────────

interface DoctorFormState {
  id: string | null;
  cid: string;
  name: string;
  position: string;
  phoneNumber: string;
}

const EMPTY_DOCTOR_FORM: DoctorFormState = {
  id: null,
  cid: '',
  name: '',
  position: '',
  phoneNumber: '',
};

function ConsultDoctorsSection({ hospital }: { hospital: AdminHospital }) {
  const { data, isLoading, mutate } = useSWR<{ doctors: ConsultDoctor[] }>(
    `/api/admin/hospitals/${hospital.hcode}/consult-doctors`,
  );
  const [form, setForm] = useState<DoctorFormState>(EMPTY_DOCTOR_FORM);
  const [busy, setBusy] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setForm(EMPTY_DOCTOR_FORM);
    setMessage(null);
    setDeleteBusyId(null);
  }, [hospital.hcode]);

  const doctors = data?.doctors ?? [];
  const editing = !!form.id;
  const phoneCount = doctors.filter((doctor) => !!doctor.phoneNumber).length;

  const setField = (key: keyof DoctorFormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetForm = () => {
    setForm(EMPTY_DOCTOR_FORM);
    setMessage(null);
  };

  const startEdit = (doctor: ConsultDoctor) => {
    setForm({
      id: doctor.id,
      cid: doctor.cid,
      name: doctor.name,
      position: doctor.position ?? '',
      phoneNumber: doctor.phoneNumber ?? '',
    });
    setMessage(null);
  };

  const handleSave = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const cid = form.cid.trim();
      const name = form.name.trim();
      if (!/^\d{13}$/.test(cid)) {
        throw new Error('CID ต้องเป็นตัวเลข 13 หลัก');
      }
      if (!name) {
        throw new Error('กรุณาระบุชื่อแพทย์');
      }

      const path = editing
        ? `/api/admin/hospitals/${hospital.hcode}/consult-doctors/${form.id}`
        : `/api/admin/hospitals/${hospital.hcode}/consult-doctors`;
      const res = await fetch(path, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cid,
          name,
          position: form.position.trim() || null,
          phoneNumber: form.phoneNumber.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? 'บันทึกไม่สำเร็จ');
      }

      await mutate();
      setForm(EMPTY_DOCTOR_FORM);
      setMessage({ tone: 'ok', text: editing ? 'แก้ไขแพทย์ consult สำเร็จ' : 'เพิ่มแพทย์ consult สำเร็จ' });
    } catch (e) {
      setMessage({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (doctor: ConsultDoctor) => {
    if (!confirm(`ลบแพทย์ consult ${doctor.name}?`)) return;
    setDeleteBusyId(doctor.id);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/hospitals/${hospital.hcode}/consult-doctors/${doctor.id}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? 'ลบไม่สำเร็จ');
      }
      if (form.id === doctor.id) {
        setForm(EMPTY_DOCTOR_FORM);
      }
      await mutate();
      setMessage({ tone: 'ok', text: 'ลบแพทย์ consult สำเร็จ' });
    } catch (e) {
      setMessage({ tone: 'error', text: (e as Error).message });
    } finally {
      setDeleteBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <SectionIntro
        eyebrow="ผู้ติดต่อเคสส่งต่อ"
        title="แพทย์ Consult ประจำโรงพยาบาล"
        detail="รายชื่อแพทย์ที่ใช้สำหรับประสานงานเคสส่งต่อและการปรึกษาทางคลินิก"
        Icon={Users}
        meta={`${doctors.length} คน · มีเบอร์โทร ${phoneCount} คน`}
      />

      <div className="rounded-xl border border-border bg-surface-card p-4">
        <div className="mb-3 flex items-center gap-1.5 text-label">
          <Users aria-hidden="true" className="h-4 w-4 text-brand" />
          <span className="text-brand">{editing ? 'แก้ไขแพทย์ Consult' : 'เพิ่มแพทย์ Consult'}</span>
          <span className="text-ink-muted">· {hospital.hcode}</span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="CID">
            <Input
              value={form.cid}
              onChange={(e) => setField('cid', e.target.value.replace(/\D/g, '').slice(0, 13))}
              placeholder="1234567890123"
              className="h-11 font-mono text-body"
              inputMode="numeric"
              maxLength={13}
            />
          </Field>
          <Field label="ชื่อแพทย์">
            <Input
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="ชื่อ-สกุล"
              className="h-11 text-body"
            />
          </Field>
          <Field label="ตำแหน่ง">
            <div className="relative">
              <Briefcase aria-hidden="true" className="pointer-events-none absolute left-2 top-3.5 h-4 w-4 text-ink-muted" />
              <Input
                value={form.position}
                onChange={(e) => setField('position', e.target.value)}
                placeholder="เช่น สูติแพทย์"
                className="h-11 pl-8 text-body"
              />
            </div>
          </Field>
          <Field label="เบอร์โทรศัพท์">
            <div className="relative">
              <Phone aria-hidden="true" className="pointer-events-none absolute left-2 top-3.5 h-4 w-4 text-ink-muted" />
              <Input
                value={form.phoneNumber}
                onChange={(e) => setField('phoneNumber', e.target.value)}
                placeholder="08x-xxx-xxxx"
                className="h-11 pl-8 font-mono text-body"
              />
            </div>
          </Field>
        </div>

        {message ? (
          message.tone === 'ok' ? (
            <InlineNotice tone="ok" className="mt-3">{message.text}</InlineNotice>
          ) : (
            <ErrorState variant="banner" className="mt-3 rounded-xl border" message={message.text} remedy={DEFAULT_ACTION_REMEDY} />
          )
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          {editing ? (
            <Button variant="ghost" onClick={resetForm} disabled={busy} className="h-11">
              ยกเลิก
            </Button>
          ) : null}
          <Button
            onClick={handleSave}
            disabled={busy || !form.cid.trim() || !form.name.trim()}
            className="h-11 gap-1.5 bg-brand text-white hover:bg-brand-strong"
          >
            <Save aria-hidden="true" className="h-4 w-4" />
            {busy ? 'กำลังบันทึก...' : editing ? 'บันทึกการแก้ไข' : 'เพิ่มแพทย์'}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface-card">
        <div className="grid min-w-[720px] grid-cols-[130px_minmax(180px,1fr)_minmax(120px,160px)_minmax(120px,150px)_110px] gap-2 border-b border-border px-3 py-2 text-label text-ink-muted">
          <div>CID</div>
          <div>ชื่อ</div>
          <div>ตำแหน่ง</div>
          <div>โทรศัพท์</div>
          <div className="text-right">จัดการ</div>
        </div>
        {isLoading ? (
          <div className="px-3 py-6 text-center text-body text-ink-muted">กำลังโหลดรายชื่อแพทย์ consult...</div>
        ) : doctors.length === 0 ? (
          <div className="px-3 py-6 text-center text-body text-ink-muted">ยังไม่มีแพทย์ consult สำหรับโรงพยาบาลนี้</div>
        ) : (
          doctors.map((doctor) => (
            <div
              key={doctor.id}
              className="grid min-w-[720px] grid-cols-[130px_minmax(180px,1fr)_minmax(120px,160px)_minmax(120px,150px)_110px] items-center gap-2 border-b border-border px-3 py-2 text-body last:border-b-0"
            >
              <code className="font-mono text-caption text-ink-muted">{doctor.cid}</code>
              <div className="truncate font-medium text-ink">{doctor.name}</div>
              <div className="truncate text-ink-muted">{doctor.position ?? '—'}</div>
              <div className="truncate font-mono text-caption text-ink-muted">{doctor.phoneNumber ?? '—'}</div>
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  aria-label={`แก้ไขแพทย์ ${doctor.name}`}
                  onClick={() => startEdit(doctor)}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-label text-ink-muted hover:bg-brand-soft"
                  disabled={busy || !!deleteBusyId}
                >
                  <Pencil aria-hidden="true" className="h-4 w-4" />
                  แก้
                </button>
                <button
                  type="button"
                  aria-label={`ลบแพทย์ ${doctor.name}`}
                  onClick={() => handleDelete(doctor)}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-label text-danger-text hover:bg-danger-tint"
                  disabled={busy || deleteBusyId === doctor.id}
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                  ลบ
                </button>
              </div>
            </div>
          ))
        )}
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
      <SectionIntro
        eyebrow="การเชื่อมต่อ BMS"
        title="สถานะการเชื่อมต่อฐานข้อมูลโรงพยาบาล"
        detail="ตั้งค่า tunnel, session, และตรวจสอบชนิดฐานข้อมูลที่ใช้สำหรับซิงค์ข้อมูล"
        Icon={Cable}
        meta={hospital.bmsConfig?.databaseType ?? 'ฐานข้อมูล: —'}
      />

      {/* Status strip */}
      <div className="grid grid-cols-1 gap-0 overflow-hidden rounded-xl border border-border bg-surface-card md:grid-cols-3">
        <StatBox
          label="Tunnel URL"
          value={hasUrl ? 'ตั้งค่าแล้ว' : 'ยังไม่ตั้งค่า'}
          tone={hasUrl ? 'ok' : 'neutral'}
          Icon={hasUrl ? Wifi : WifiOff}
        />
        <StatBox
          label="BMS session"
          value={hospital.bmsConfig?.hasSession ? 'ใช้งานอยู่' : '—'}
          tone={hospital.bmsConfig?.hasSession ? 'ok' : 'neutral'}
          Icon={hospital.bmsConfig?.hasSession ? CheckCircle2 : AlertTriangle}
        />
        <StatBox
          label="ฐานข้อมูล"
          value={hospital.bmsConfig?.databaseType ?? '—'}
          tone={hospital.bmsConfig?.databaseType ? 'brand' : 'neutral'}
          Icon={Database}
        />
      </div>

      <div className="rounded-xl border border-border bg-surface-card p-4">
        <Field label="Tunnel URL">
          <Input
            value={tunnelUrl}
            onChange={(e) => setTunnelUrl(e.target.value)}
            placeholder="https://xxxxx-ondemand-win-xxxxxxxxx.tunnel.hosxp.net"
            className="h-11 font-mono text-label"
          />
        </Field>
        <p className="mt-1 text-caption text-ink-muted">
          ระบบจะใช้ URL นี้สำหรับดึงข้อมูลจาก BMS ของโรงพยาบาล · ต้องสามารถเข้าถึงได้จากเซิร์ฟเวอร์ของระบบ
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={saving || !tunnelUrl.trim()} className="h-11 gap-1.5 bg-brand text-white hover:bg-brand-strong">
            <Save aria-hidden="true" className="h-4 w-4" />
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </Button>
          <Button onClick={handleTest} disabled={testing || !hasUrl} variant="outline" className="h-11 gap-1.5">
            <FlaskConical aria-hidden="true" className="h-4 w-4" />
            {testing ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ'}
          </Button>
        </div>

        {saveMessage ? (
          saveMessage.includes('สำเร็จ') ? (
            <InlineNotice tone="ok" className="mt-3">{saveMessage}</InlineNotice>
          ) : (
            <ErrorState
              variant="banner"
              className="mt-3 rounded-xl border"
              message={saveMessage}
              remedy="ตรวจสอบ Tunnel URL แล้วกด บันทึก อีกครั้ง"
            />
          )
        ) : null}

        {testResult ? (
          <div
            className={cn(
              'mt-3 space-y-1 rounded-xl border px-3 py-2 text-label',
              testResult.connected
                ? 'border-ok/40 bg-ok-tint text-ok-text'
                : 'border-danger/40 bg-danger-tint text-danger-text',
            )}
          >
            <div>
              {testResult.connected ? '✓ เชื่อมต่อสำเร็จ' : '✗ เชื่อมต่อไม่สำเร็จ'}
              {testResult.databaseType ? ` · ${testResult.databaseType}` : ''}
              {testResult.databaseVersion ? ` · v${testResult.databaseVersion}` : ''}
            </div>
            {testResult.tablesFound && testResult.tablesFound.length > 0 ? (
              <div>
                Tables: {testResult.tablesFound.slice(0, 5).join(', ')}
                {testResult.tablesFound.length > 5 ? '…' : ''}
              </div>
            ) : null}
            {testResult.error ? <div>Error: {testResult.error}</div> : null}
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
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // Filter keys to this hospital only so the dialog is focused.
  const keys = useMemo(
    () => (data?.keys ?? []).filter((k) => k.hcode === hospital.hcode),
    [data, hospital.hcode],
  );
  const activeKeyCount = keys.filter((key) => key.isActive).length;

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
    setRevokeError(null);
    try {
      const res = await fetch(`/api/admin/webhooks/${revokeTarget.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        setRevokeError(err?.error ?? 'ยกเลิกคีย์ไม่สำเร็จ');
        return;
      }
      setRevokeTarget(null);
      setRevokeInput('');
      await mutate();
    } catch {
      setRevokeError('ยกเลิกคีย์ไม่สำเร็จ — ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionIntro
        eyebrow="การเชื่อมต่อระบบภายนอก"
        title="Webhook API Keys"
        detail="คีย์สำหรับรับข้อมูลจากระบบภายนอกของโรงพยาบาลนี้"
        Icon={KeyRound}
        meta={`ใช้งาน ${activeKeyCount} · ยกเลิกแล้ว ${keys.length - activeKeyCount}`}
      />

      {/* Create form */}
      <div className="rounded-xl border border-border bg-surface-card p-4">
        <div className="mb-2 flex items-center gap-1.5 text-label">
          <KeyRound aria-hidden="true" className="h-4 w-4 text-brand" />
          <span className="text-brand">สร้าง API Key ใหม่</span>
          <span className="text-ink-muted">· {hospital.hcode}</span>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[260px] flex-1">
            <Field label="ชื่อคีย์">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="เช่น Production webhook"
                className="h-11 text-body"
              />
            </Field>
          </div>
          <Button
            onClick={handleCreate}
            disabled={creating || !label.trim()}
            className="h-11 gap-1.5 bg-brand text-white hover:bg-brand-strong"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {creating ? 'กำลังสร้าง...' : 'สร้าง Key'}
          </Button>
        </div>
        {createError ? (
          <ErrorState variant="banner" className="mt-2 rounded-xl border" message={createError} remedy={DEFAULT_ACTION_REMEDY} />
        ) : null}
      </div>

      {/* Just-created reveal */}
      {justCreated ? (
        <div className="rounded-2xl border border-warn/40 bg-warn-tint px-4 py-3">
          <div className="mb-2 flex items-start gap-2">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warn-text" />
            <div>
              <div className="text-body font-semibold text-warn-text">
                บันทึก API Key นี้ไว้ทันที — ระบบจะไม่แสดงอีก
              </div>
              <div className="mt-0.5 text-label text-ink-muted">{justCreated.label}</div>
            </div>
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
        </div>
      ) : null}

      {/* Keys list */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface-card">
        <div className="grid min-w-[600px] grid-cols-[minmax(0,1fr)_110px_120px_100px_110px] gap-2 border-b border-border px-3 py-2 text-label text-ink-muted">
          <div>ชื่อคีย์</div>
          <div>รหัสขึ้นต้น</div>
          <div>ใช้ล่าสุด</div>
          <div>สถานะ</div>
          <div className="text-right">จัดการ</div>
        </div>
        {keys.length === 0 ? (
          <div className="px-3 py-6 text-center text-body text-ink-muted">ยังไม่มี API Key สำหรับโรงพยาบาลนี้</div>
        ) : (
          keys.map((k) => (
            <div
              key={k.id}
              className={cn(
                'grid min-w-[600px] grid-cols-[minmax(0,1fr)_110px_120px_100px_110px] items-center gap-2 border-b border-border px-3 py-2 text-body last:border-b-0',
                !k.isActive && 'text-ink-muted',
              )}
            >
              <div className="truncate">{k.label}</div>
              <code className="rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-caption text-ink-muted">
                {k.keyPrefix}…
              </code>
              <div className="text-label text-ink-muted">
                {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString('th-TH') : '—'}
              </div>
              <div>
                <StatusPill tone={k.isActive ? 'ok' : 'neutral'}>{k.isActive ? 'ใช้งาน' : 'ยกเลิกแล้ว'}</StatusPill>
              </div>
              <div className="text-right">
                {k.isActive ? (
                  <button
                    type="button"
                    aria-label={`ยกเลิกคีย์ ${k.keyPrefix}`}
                    onClick={() => {
                      setRevokeTarget(k);
                      setRevokeInput('');
                      setRevokeError(null);
                    }}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-label text-danger-text hover:bg-danger-tint"
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
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
        <div className="rounded-2xl border border-danger/40 bg-danger-tint p-3">
          <div className="mb-2 flex items-center gap-1.5 text-label font-semibold text-danger-text">
            <AlertTriangle aria-hidden="true" className="h-4 w-4" />
            ยืนยันการยกเลิก · {revokeTarget.label}
          </div>
          <p className="mb-2 text-label text-ink-muted">
            คีย์ที่ยกเลิกแล้วจะใช้ไม่ได้ทันที · พิมพ์ prefix <code>{revokeTarget.keyPrefix}</code> เพื่อยืนยัน
          </p>
          <div className="flex gap-2">
            <Input
              value={revokeInput}
              onChange={(e) => setRevokeInput(e.target.value)}
              placeholder={revokeTarget.keyPrefix}
              aria-label={`พิมพ์ ${revokeTarget.keyPrefix} เพื่อยืนยันการยกเลิก`}
              className="h-11 font-mono"
              autoFocus
            />
            <Button variant="ghost" onClick={() => setRevokeTarget(null)} disabled={revoking} className="h-11">
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevoke}
              disabled={revoking || revokeInput !== revokeTarget.keyPrefix}
              className="h-11 gap-1.5"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              {revoking ? 'กำลังยกเลิก...' : 'ยืนยัน'}
            </Button>
          </div>
          {revokeError ? (
            <ErrorState variant="banner" className="mt-2 rounded-xl border" message={revokeError} remedy="ลองอีกครั้ง หากยังไม่ได้ให้รีเฟรชหน้าแล้วตรวจสอบสถานะคีย์" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ───────────────── Danger Zone section ─────────────────

interface PurgeCounts {
  cpd_scores?: number;
  cached_vital_signs?: number;
  cached_partograph_observations?: number;
  cached_anc_visits?: number;
  cached_anc_risks?: number;
  cached_newborns?: number;
  cached_referrals?: number;
  cached_patients?: number;
  maternal_journeys?: number;
}

interface PurgeResult {
  ok?: boolean;
  stoppedSync?: boolean;
  totalRowsDeleted?: number;
  counts?: PurgeCounts;
  error?: string;
  detail?: string;
}

const PURGE_TABLE_LABELS: Array<{ key: keyof PurgeCounts; label: string }> = [
  { key: 'cached_patients', label: 'ผู้ป่วย' },
  { key: 'maternal_journeys', label: 'เส้นทางการตั้งครรภ์' },
  { key: 'cached_partograph_observations', label: 'การบันทึกพาร์โทกราฟ' },
  { key: 'cached_vital_signs', label: 'สัญญาณชีพ' },
  { key: 'cpd_scores', label: 'คะแนน CPD' },
  { key: 'cached_anc_visits', label: 'การฝากครรภ์ (ANC)' },
  { key: 'cached_anc_risks', label: 'ความเสี่ยง ANC' },
  { key: 'cached_newborns', label: 'ทารกแรกเกิด' },
  { key: 'cached_referrals', label: 'การส่งต่อ' },
];

interface CountsResponse {
  ok?: boolean;
  totalRows?: number;
  counts?: PurgeCounts;
  error?: string;
}

function DangerZoneSection({
  hospital,
  onSaved,
}: {
  hospital: AdminHospital;
  onSaved: () => Promise<void> | void;
}) {
  const { data: countsData, isLoading: countsLoading, mutate: mutateCounts } =
    useSWR<CountsResponse>(`/api/admin/hospitals/${hospital.hcode}/data`);
  const [confirmInput, setConfirmInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PurgeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setConfirmInput('');
    setResult(null);
    setError(null);
  }, [hospital.hcode]);

  const liveCounts = countsData?.counts ?? null;
  const liveTotal = countsData?.totalRows ?? 0;

  const canSubmit = confirmInput.trim() === hospital.hcode && !busy;

  const handlePurge = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/hospitals/${hospital.hcode}/data`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmHcode: hospital.hcode }),
      });
      const payload = (await res.json().catch(() => null)) as PurgeResult | null;
      if (!res.ok || !payload?.ok) {
        const msg = payload?.detail ?? payload?.error ?? `HTTP ${res.status}`;
        setError(`ลบข้อมูลไม่สำเร็จ: ${msg}`);
        return;
      }
      setResult(payload);
      setConfirmInput('');
      await mutateCounts();
      await onSaved();
    } catch (e) {
      setError(`ลบข้อมูลไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const lines: Array<{ label: string; count: number }> = result?.counts
    ? PURGE_TABLE_LABELS
        .map((t) => ({ label: t.label, count: result.counts?.[t.key] ?? 0 }))
        .filter((row) => row.count > 0)
    : [];

  const ready = confirmInput.trim() === hospital.hcode;

  return (
    <div className="space-y-4">
      <SectionIntro
        eyebrow="การลบข้อมูล"
        title="ลบข้อมูลของโรงพยาบาลนี้"
        detail="ใช้สำหรับล้างข้อมูล cached เพื่อ re-onboard ใหม่ · จะไม่ลบ tunnel config / consult doctors / webhook keys"
        Icon={ShieldAlert}
        meta={
          countsLoading
            ? 'กำลังนับ...'
            : `${liveTotal.toLocaleString('th-TH')} แถวในระบบ`
        }
      />

      {/* Live counts — what's currently in nn-lrms for this hospital */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface-card">
        <div className="flex items-center justify-between border-b border-border bg-surface-muted px-4 py-2">
          <div className="flex items-center gap-1.5 text-label text-ink-muted">
            <Database aria-hidden="true" className="h-4 w-4" />
            ข้อมูลปัจจุบันในระบบ · hcode {hospital.hcode}
          </div>
          <div className={cn('text-label font-semibold', liveTotal > 0 ? 'text-brand' : 'text-ink-muted')}>
            {countsLoading ? '...' : `${liveTotal.toLocaleString('th-TH')} แถวรวม`}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3">
          {PURGE_TABLE_LABELS.map((row) => {
            const count = liveCounts?.[row.key] ?? 0;
            return (
              <div key={row.key} className="border-b border-border px-3 py-2.5 sm:border-r">
                <div className="text-label text-ink-muted">
                  {row.label}
                  <span className="ml-1 font-mono text-caption text-ink-muted">{row.key}</span>
                </div>
                <div className={cn('mt-0.5 text-body font-semibold tabular-nums', count > 0 ? 'text-ink' : 'text-ink-muted')}>
                  {countsLoading ? '—' : count.toLocaleString('th-TH')}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-danger/40 bg-danger-tint p-4">
        <div className="mb-3 flex items-center gap-2 text-label font-semibold text-danger-text">
          <Eraser aria-hidden="true" className="h-4 w-4" />
          ลบข้อมูล cached ของ {hospital.name}
        </div>

        <ul className="mb-3 space-y-1 text-label text-ink">
          <li>· ผู้ป่วยที่ admit (cached_patients) และ partograph / vital-signs / CPD scores ที่เกี่ยวข้อง</li>
          <li>· Maternal journeys และ ANC visits / risks / newborns ที่ผูกกับ journey</li>
          <li>· Referrals ที่โรงพยาบาลนี้เป็นต้นทางหรือปลายทาง</li>
          <li>· รีเซ็ต connection_status / last_sync_at เป็น UNKNOWN</li>
        </ul>

        <div className="mb-3 rounded-lg border border-border bg-surface-card px-3 py-2 text-label text-ink-muted">
          <strong className="text-ink">จะไม่ถูกลบ:</strong> tunnel URL / session,
          consult doctors, webhook API keys, audit logs, และข้อมูลโรงพยาบาลในตาราง <code>hospitals</code>
        </div>

        <Field label={`พิมพ์รหัสโรงพยาบาล (${hospital.hcode}) เพื่อยืนยัน`}>
          <Input
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder={hospital.hcode}
            className="h-11 bg-surface-card font-mono"
            autoComplete="off"
            disabled={busy}
          />
        </Field>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <span className="text-label text-ink-muted">
            {ready ? '✓ พร้อมยืนยันการลบ' : 'พิมพ์รหัสโรงพยาบาลให้ตรงเพื่อเปิดปุ่ม'}
          </span>
          <Button variant="destructive" onClick={handlePurge} disabled={!canSubmit} className="h-11 gap-1.5">
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            {busy ? 'กำลังลบ...' : 'ลบข้อมูลของโรงพยาบาลนี้'}
          </Button>
        </div>

        {error ? (
          <ErrorState variant="banner" className="mt-3 rounded-xl border" message={error} remedy={DEFAULT_ACTION_REMEDY} />
        ) : null}

        {result?.ok ? (
          <div className="mt-3 space-y-2">
            <InlineNotice tone="ok">
              ลบข้อมูลสำเร็จ · ทั้งหมด {result.totalRowsDeleted ?? 0} แถว
            </InlineNotice>
            <div className="rounded-xl border border-border bg-surface-card px-3 py-2 text-label text-ink-muted">
              {result.stoppedSync ? <div>· หยุด onboarding sync ที่กำลังทำงานอยู่แล้ว</div> : null}
              {lines.length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {lines.map((row) => (
                    <li key={row.label}>
                      · {row.label}: <strong className="text-ink">{row.count}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <div>ไม่มีแถวข้อมูลให้ลบ (โรงพยาบาลยังไม่เคยถูก sync)</div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ───────────────── Shared mini components ─────────────────

function ProfileMetric({
  label,
  value,
  Icon,
  tone,
}: {
  label: string;
  value: string;
  Icon: React.ComponentType<{ className?: string }>;
  tone: StatusTone;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-muted px-3 py-2">
      <div className="flex items-center gap-1.5 text-label text-ink-muted">
        <Icon aria-hidden="true" className="h-4 w-4" />
        {label}
      </div>
      <div className={cn('mt-1 truncate text-label font-semibold', TONE_CLASSES[tone].text)}>{value}</div>
    </div>
  );
}

function HeaderFact({
  label,
  value,
  Icon,
  muted = false,
}: {
  label: string;
  value: string;
  Icon?: React.ComponentType<{ className?: string }>;
  muted?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-label text-ink-muted">
        {Icon ? <Icon aria-hidden="true" className="h-4 w-4" /> : null}
        {label}
      </div>
      <div className={cn('mt-0.5 truncate text-label', muted ? 'text-ink-muted' : 'text-ink')}>{value}</div>
    </div>
  );
}

// ───────────────── Sync Log section ─────────────────
//
// Surfaces the per-cycle progress trail that pollHospital() persists to
// Redis. The intent is to answer "why did THIS hospital fail to sync?"
// without an admin needing log access. Auto-refreshes every 10s so an
// operator can watch a re-onboard land in real time.

interface SyncLogStep {
  name: string;
  status: 'running' | 'success' | 'warning' | 'error' | 'info';
  message: string;
  detail?: string;
  counts?: Record<string, number>;
  at: string;
}

interface SyncLogRun {
  runId: string;
  hospitalId: string;
  hcode: string;
  trigger: 'scheduled' | 'immediate' | 'onboarding';
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  outcome: 'running' | 'success' | 'partial' | 'failed';
  finalMessage: string | null;
  errorMessage: string | null;
  steps: SyncLogStep[];
}

interface SyncProgressResponse {
  hcode: string;
  latest: SyncLogRun | null;
  runs: SyncLogRun[];
}

function formatTimeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function SyncLogSection({ hospital }: { hospital: AdminHospital }) {
  const { data, error, isLoading, mutate } = useSWR<SyncProgressResponse>(
    `/api/admin/hospitals/${hospital.hcode}/sync-progress?limit=20`,
    { refreshInterval: SYNC_LOG_POLL_MS },
  );
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const runs = data?.runs ?? [];
  const latest = data?.latest ?? null;

  // Auto-expand the latest run so operators see the freshest details on
  // open without an extra click. They can collapse and pick another.
  const effectiveExpanded = expandedRunId ?? latest?.runId ?? null;

  return (
    <div className="space-y-4">
      <SectionIntro
        eyebrow="การสังเกตการณ์"
        title="ความคืบหน้าและข้อผิดพลาดของการซิงค์"
        detail="ติดตามทุกรอบการซิงค์ (ทุก ~30 วินาที) จาก HOSxP โดยอัตโนมัติ — แสดงทุกขั้นตอน, ข้อผิดพลาด, และเหตุผลที่บางรอบไม่สำเร็จ. ข้อมูลเก็บใน Redis ใช้งานได้ 24 ชม.ย้อนหลัง"
        Icon={Activity}
        meta={`${runs.length} รอบล่าสุด`}
      />

      {isLoading && (
        <div className="rounded-xl border border-border bg-surface-card px-4 py-6 text-center text-body text-ink-muted">
          กำลังโหลด…
        </div>
      )}

      {error && (
        <ErrorState
          variant="banner"
          className="rounded-xl border"
          message="โหลดประวัติการซิงค์ไม่สำเร็จ"
          remedy="ตรวจสอบการเชื่อมต่อ แล้วกด รีเฟรช หากยังไม่ได้ ตรวจสอบ Redis ของเซิร์ฟเวอร์"
          onRetry={() => void mutate()}
        />
      )}

      {!isLoading && !error && runs.length === 0 && (
        <div className="rounded-xl border border-border bg-surface-card px-4 py-6 text-center text-body text-ink-muted">
          ยังไม่มีรอบซิงค์บันทึกใน 24 ชม.ที่ผ่านมา — ตรวจสอบว่าผู้ใช้จากโรงพยาบาลนี้เปิด NN-LRMS แล้วหรือยัง
        </div>
      )}

      {/* Run list */}
      {runs.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-2 text-label text-ink-muted">
            <span>ประวัติการซิงค์ · 24 ชม. · รีเฟรชอัตโนมัติทุก {SYNC_LOG_POLL_MS / 1000} วินาที</span>
            <button
              type="button"
              onClick={() => mutate()}
              className="min-h-9 rounded-lg border border-brand px-3 text-label text-brand hover:bg-brand-soft"
            >
              รีเฟรช
            </button>
          </div>
          <div className="divide-y divide-border">
            {runs.map((run) => {
              const meta = SYNC_OUTCOME_META[run.outcome];
              const expanded = effectiveExpanded === run.runId;
              const lastStep = run.steps[run.steps.length - 1];
              const summary = run.errorMessage ?? run.finalMessage ?? lastStep?.message ?? '—';
              return (
                <div key={run.runId}>
                  <button
                    type="button"
                    onClick={() => setExpandedRunId(expanded ? null : run.runId)}
                    className="grid w-full grid-cols-[110px_minmax(0,1fr)_90px_90px] items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-muted"
                  >
                    <StatusPill tone={meta.tone} className="justify-center">
                      {meta.labelTh}
                    </StatusPill>
                    <span className="truncate text-body text-ink">{summary}</span>
                    <span className="text-right text-label text-ink-muted">{syncTriggerLabel(run.trigger)}</span>
                    <span className="text-right text-label tabular-nums text-ink-muted">
                      {formatRelativeTime(run.startedAt)}
                    </span>
                  </button>

                  {expanded && (
                    <div className="border-t border-border bg-surface-muted px-3 py-2">
                      <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-label text-ink-muted">
                        <span>
                          เริ่ม: <span className="text-ink">{new Date(run.startedAt).toLocaleString('th-TH')}</span>
                        </span>
                        {run.finishedAt && (
                          <span>
                            จบ: <span className="text-ink">{new Date(run.finishedAt).toLocaleString('th-TH')}</span>
                          </span>
                        )}
                        {run.durationMs != null && (
                          <span>
                            ใช้เวลา: <span className="text-ink">{formatSyncDuration(run.durationMs)}</span>
                          </span>
                        )}
                        <span>
                          ขั้นตอน: <span className="text-ink">{run.steps.length}</span>
                        </span>
                      </div>

                      {run.errorMessage && (
                        <div className="mb-2 rounded-lg border border-danger/40 bg-danger-tint px-3 py-2 text-label text-danger-text">
                          <strong>ข้อผิดพลาด:</strong> {run.errorMessage}
                        </div>
                      )}

                      <ol className="rounded-lg border border-border bg-surface-card">
                        {run.steps.length === 0 ? (
                          <li className="px-3 py-2 text-label text-ink-muted">ไม่มีขั้นตอนบันทึกในรอบนี้</li>
                        ) : (
                          run.steps.map((step, i) => {
                            const stepTone = SYNC_STEP_TONE[step.status];
                            const warnOrError = step.status === 'warning' || step.status === 'error';
                            return (
                              <li
                                key={i}
                                className="grid grid-cols-[12px_100px_minmax(0,1fr)_70px] items-start gap-2 border-b border-border px-3 py-1.5 last:border-b-0"
                              >
                                <span
                                  aria-hidden="true"
                                  className={cn('mt-1.5 h-2 w-2 rounded-full', TONE_CLASSES[stepTone].dot)}
                                />
                                <span className="mt-0.5 break-words font-mono text-caption text-ink-muted">{step.name}</span>
                                <div>
                                  <div className={cn('text-label', warnOrError ? TONE_CLASSES[stepTone].text : 'text-ink')}>
                                    {step.message}
                                  </div>
                                  {step.detail && (
                                    <div className="mt-0.5 break-words font-mono text-caption text-ink-muted">{step.detail}</div>
                                  )}
                                  {step.counts && Object.keys(step.counts).length > 0 && (
                                    <div className="mt-0.5 font-mono text-caption text-ink-muted">
                                      {Object.entries(step.counts)
                                        .map(([k, v]) => `${k}=${v}`)
                                        .join(' · ')}
                                    </div>
                                  )}
                                </div>
                                <span className="mt-0.5 text-right font-mono text-caption tabular-nums text-ink-muted">
                                  {formatTimeShort(step.at)}
                                </span>
                              </li>
                            );
                          })
                        )}
                      </ol>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionIntro({
  eyebrow,
  title,
  detail,
  Icon,
  meta,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  Icon: React.ComponentType<{ className?: string }>;
  meta?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-card px-4 py-3 md:flex-row md:items-start md:justify-between">
      <div className="flex min-w-0 gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <Icon aria-hidden="true" className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-label text-ink-muted">{eyebrow}</div>
          <div className="mt-0.5 text-body-lg text-ink">{title}</div>
          <div className="mt-1 text-label text-ink-muted">{detail}</div>
        </div>
      </div>
      {meta ? (
        <div className="shrink-0 rounded-lg border border-border bg-surface-muted px-2.5 py-1.5 text-label text-ink-muted md:text-right">
          {meta}
        </div>
      ) : null}
    </div>
  );
}

const STAT_BAR: Record<StatusTone, string> = {
  ok: 'border-ok',
  warn: 'border-warn',
  danger: 'border-danger',
  brand: 'border-brand',
  neutral: 'border-border',
};

function StatBox({
  label,
  value,
  tone,
  Icon,
}: {
  label: string;
  value: string;
  tone: StatusTone;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className={cn('border-l-4 px-4 py-3', STAT_BAR[tone])}>
      <div className="flex items-center gap-1.5 text-label text-ink-muted">
        <Icon aria-hidden="true" className="h-4 w-4" />
        {label}
      </div>
      <div className={cn('mt-1 text-body font-semibold', TONE_CLASSES[tone].text)}>{value}</div>
    </div>
  );
}
