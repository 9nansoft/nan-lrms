// src/components/auth/AccessDeniedNotice.tsx
// Preflight said the hospital is not registered / deactivated. Copy unchanged
// from the pre-redesign login; only the styling moved onto the tokens.
import { ShieldAlert } from 'lucide-react';

export interface AccessDeniedInfo {
  reason: 'not_registered' | 'deactivated';
  hospitalCode: string;
  hospitalName: string;
  message: string;
}

export function AccessDeniedNotice({ info }: { info: AccessDeniedInfo }) {
  const deactivated = info.reason === 'deactivated';
  return (
    <div role="alert" className="rounded-xl border border-danger/40 bg-danger-tint p-4 text-danger-text">
      <div className="flex items-start gap-2">
        <ShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="text-body font-semibold">{deactivated ? 'โรงพยาบาลถูกปิดการใช้งาน' : 'ไม่ได้รับสิทธิ์ใช้งานระบบ'}</p>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 text-label">
        <dt>โรงพยาบาล:</dt>
        <dd className="font-semibold">{info.hospitalName || '—'}</dd>
        <dt>รหัสโรงพยาบาล:</dt>
        <dd className="font-mono font-semibold">{info.hospitalCode || '—'}</dd>
      </dl>
      <p className="mt-2 border-t border-danger/40 pt-2 text-label">
        {deactivated
          ? 'โรงพยาบาลของท่านถูกปิดการใช้งานในระบบ NN-LRMS หากท่านคิดว่าเป็นความผิดพลาด กรุณาติดต่อผู้ดูแลระบบ (สสจ.น่าน) เพื่อขอเปิดใช้งานอีกครั้ง'
          : 'โรงพยาบาลของท่านยังไม่ได้รับการลงทะเบียนในระบบ NN-LRMS หากท่านคิดว่าเป็นความผิดพลาด หรือต้องการเข้าร่วมเครือข่าย กรุณาติดต่อผู้ดูแลระบบ (สสจ.น่าน) เพื่อขอลงทะเบียนโรงพยาบาลของท่านในระบบ'}
      </p>
    </div>
  );
}
