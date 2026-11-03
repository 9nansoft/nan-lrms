// T101: StaleBanner — warning when hospitals are offline
'use client';

interface StaleBannerProps {
  allOffline: boolean;
  offlineHospitals?: string[];
}

const REMEDY = 'วิธีแก้: เปิด NN-LRMS บนเครื่องห้องคลอดที่ล็อกอิน HOSxP ไว้ ระบบจะซิงค์ให้อัตโนมัติ';

export function StaleBanner({ allOffline, offlineHospitals = [] }: StaleBannerProps) {
  if (!allOffline && offlineHospitals.length === 0) return null;

  if (allOffline) {
    return (
      <div
        role="alert"
        className="fixed top-0 left-0 right-0 z-50 bg-danger px-4 py-2 text-center text-sm text-white"
      >
        ระบบไม่สามารถเชื่อมต่อ HOSxP ได้ — ข้อมูลที่แสดงอาจไม่เป็นปัจจุบัน
        <span className="ml-2">{REMEDY}</span>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="fixed top-0 left-0 right-0 z-50 border-b border-warn bg-warn-tint px-4 py-2 text-center text-sm text-warn-text"
    >
      โรงพยาบาลออฟไลน์: {offlineHospitals.join(', ')}
      <span className="ml-2">{REMEDY}</span>
    </div>
  );
}
