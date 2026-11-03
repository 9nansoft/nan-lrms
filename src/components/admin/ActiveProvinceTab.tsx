// ActiveProvinceTab — single-select for the deployment's main focus province.
// Switching the active province reshapes which hospitals/patients the
// dashboard and sync jobs see. SectionCards on the direction-C tokens with an
// explicit save CTA.
'use client';

import { useEffect, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { Save, CheckCircle2, ListPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import {
  CONFIG_BROADCAST_CHANNEL,
  type ConfigBroadcastMessage,
} from '@/lib/config-broadcast';
import { InlineNotice } from '@/components/shared/InlineNotice';
import { SectionCard } from '@/components/shared/SectionCard';
import { SELECT_CLASS, StatusPill } from './admin-ui';
import { BulkAddHospitalsDialog } from './BulkAddHospitalsDialog';

interface ProvinceRow {
  code: string;
  name: string;
}

interface ConfigResponse {
  config: { active_province_code?: string | null };
}

export function ActiveProvinceTab() {
  const {
    data: provincesData,
    isLoading: pLoading,
    error: provincesError,
    mutate: mutateProvinces,
  } = useSWR<{ provinces: ProvinceRow[] }>('/api/admin/provinces');
  const {
    data: configData,
    isLoading: cLoading,
    error: configError,
    mutate,
  } = useSWR<ConfigResponse>('/api/admin/config');

  const [selectedCode, setSelectedCode] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const { mutate: globalMutate } = useSWRConfig();

  useEffect(() => {
    if (configData?.config?.active_province_code) {
      setSelectedCode(configData.config.active_province_code);
    }
  }, [configData]);

  if (pLoading || cLoading) {
    return <LoadingState message="กำลังโหลดรายการจังหวัด..." />;
  }

  const loadError = provincesError || configError;

  const provinces = provincesData?.provinces ?? [];
  const currentCode = configData?.config?.active_province_code ?? '';
  const currentProvince = provinces.find((p) => p.code === currentCode);
  const changed = selectedCode !== currentCode;

  const handleSave = async () => {
    if (!selectedCode) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeProvinceCode: selectedCode }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? 'save failed');
      }
      setSaveMessage('บันทึกสำเร็จ');
      await mutate();
      // Tell any already-mounted maps (dashboard / kiosk in another tab of
      // the same browser) to switch to the new province right away.
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel(CONFIG_BROADCAST_CHANNEL);
        channel.postMessage({
          type: 'active-province-changed',
          code: selectedCode,
        } satisfies ConfigBroadcastMessage);
        channel.close();
      }
    } catch (e) {
      setSaveMessage((e as Error).message ?? 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {loadError ? (
        <ErrorState
          variant="banner"
          message="โหลดรายการจังหวัด/การตั้งค่าไม่สำเร็จ — ตรวจสอบการเชื่อมต่อแล้วลองใหม่"
          onRetry={() => {
            void mutateProvinces();
            void mutate();
          }}
        />
      ) : null}

      <SectionCard
        title="จังหวัดหลักของระบบ"
        description="เลือกจังหวัดที่ระบบจะโฟกัส — กระทบแดชบอร์ด แผนที่ และการซิงค์ หลังจากบันทึก โรงพยาบาลในจังหวัดอื่นจะไม่แสดงจนกว่าจะเพิ่มเข้าระบบ"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
            <select
              aria-label="จังหวัดหลัก"
              value={selectedCode}
              onChange={(e) => setSelectedCode(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">— เลือกจังหวัด —</option>
              {provinces.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
            <Button
              onClick={handleSave}
              disabled={!changed || saving || !selectedCode}
              className="h-11 gap-1.5 bg-brand text-white hover:bg-brand-strong"
            >
              <Save aria-hidden="true" className="h-4 w-4" />
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </div>

          {currentProvince ? (
            <StatusPill tone="brand" icon={CheckCircle2}>
              กำลังใช้งาน: {currentProvince.name} · {currentProvince.code}
            </StatusPill>
          ) : null}

          {saveMessage ? <InlineNotice tone="info">{saveMessage}</InlineNotice> : null}
        </div>
      </SectionCard>

      {/* Bulk-add shortcut — spares admins from opening the Hospitals tab and
          adding one-by-one when bringing a brand new province online. */}
      {currentProvince ? (
        <SectionCard
          title="เพิ่มหลายโรงพยาบาลพร้อมกัน"
          description={`เลือกโรงพยาบาลในจังหวัด${currentProvince.name}จากทะเบียน MOPH แล้วเพิ่มเข้าระบบในครั้งเดียว — ระบบจะตั้งค่าระดับและประเภทบริการเริ่มต้นให้อัตโนมัติ`}
        >
          <Button onClick={() => setBulkOpen(true)} className="h-11 gap-1.5 bg-brand text-white hover:bg-brand-strong">
            <ListPlus aria-hidden="true" className="h-4 w-4" />
            เลือกโรงพยาบาลจากทะเบียน MOPH
          </Button>
        </SectionCard>
      ) : null}

      <BulkAddHospitalsDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        provinceCode={currentProvince?.code ?? selectedCode}
        provinceName={currentProvince?.name}
        onAdded={async () => {
          // Revalidate the hospital list so HospitalsTab + AdminMapPane pick
          // up the new rows immediately after the bulk dialog closes.
          await globalMutate('/api/admin/hospitals');
        }}
      />
    </div>
  );
}
