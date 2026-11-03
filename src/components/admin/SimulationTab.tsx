// SimulationTab — admin panel wrapper around the existing SimulationControl
// so the dev-simulation launcher lives under /admin instead of the dashboard
// header. The control renders a trigger button + dialog; the tab adds the
// surrounding explanation copy so non-developer admins understand the scope
// and destructive side-effects before clicking.
'use client';

import { AlertTriangle } from 'lucide-react';
import { SectionCard } from '@/components/shared/SectionCard';
import { SimulationControl } from '@/components/dashboard/SimulationControl';

export function SimulationTab() {
  return (
    <SectionCard
      title="จำลองข้อมูลผู้ป่วย (Dev Simulation)"
      description="สร้างเหตุการณ์สังเคราะห์ (การรับผู้ป่วย · ANC · referral · partograph) ลงใน local DB ด้วย Gemma-4 เพื่อใช้ทดสอบทุก surface ของแดชบอร์ด — ทุก event type · preset scenario ครบทุกโหมด · และเลือกโรงพยาบาลเองได้"
    >
      <div className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn-tint px-3 py-2 text-label text-warn-text">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warn-text" />
        <div>
          <strong className="font-semibold">คำเตือน</strong>{' '}
          · ข้อมูลที่สร้างจะเขียนจริงลงในตาราง cache ของ nn-lrms และแสดงในแดชบอร์ด
          · ใช้กับ DB ทดสอบเท่านั้น · API /api/dev/simulate
          จะถูกบล็อกโดยเซิร์ฟเวอร์เมื่อ DEV_SIMULATION_ENABLED ไม่ได้เปิดไว้
        </div>
      </div>

      <div className="mt-4">
        <SimulationControl />
      </div>
    </SectionCard>
  );
}
