import { auth } from '@/lib/auth';
import { maskName, maskCid } from '@/lib/pii-mask';
import { PageHeader } from '@/components/shared/PageHeader';
import { SectionCard } from '@/components/shared/SectionCard';
import { NotificationPreferenceCard } from '@/components/profile/NotificationPreferenceCard';

export async function ProfilePage() {
  const session = await auth();
  const user = session?.user;
  const displayName = maskName(user?.name);
  const displayCid = maskCid(user?.userCid);
  return (
    // AppShell already renders <main>; this page is a plain container.
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-5 md:px-6">
      <PageHeader title="โปรไฟล์และการแจ้งเตือน" subtitle="ข้อมูลผู้ใช้จากการเข้าสู่ระบบ และการตั้งค่าการแจ้งเตือนทาง LINE" />
      <SectionCard title="ข้อมูลผู้ใช้" description="แสดงแบบปิดบังบางส่วนตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
          <dt className="text-ink-muted">โรงพยาบาล</dt>
          <dd className="text-ink">{user?.hospitalName || '—'}</dd>
          <dt className="text-ink-muted">ชื่อ</dt>
          <dd className="text-body-lg text-ink">{displayName || '—'}</dd>
          <dt className="text-ink-muted">เลขบัตรประชาชน</dt>
          <dd className="font-mono text-ink">{displayCid || '—'}</dd>
        </dl>
      </SectionCard>
      <NotificationPreferenceCard />
    </div>
  );
}

export default ProfilePage;
