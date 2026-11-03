// Admin — system configuration on the direction-C shell (sub-project 5).
// Authorization is NOT here: middleware.ts + isAdminAuthorized gate /admin and
// every /api/admin route. Two columns (panel + map) only when the content box
// itself is ≥ 1160px — the sidebar takes 232px (dashboard D6). The old 1.15 CSS scale is
// gone (it overflowed at 1024px and skewed Leaflet hit-testing).
'use client';

import { useState } from 'react';
import { Activity, Bell, Building2, Database, FlaskConical, Globe, KeyRound, UsersRound, type LucideIcon } from 'lucide-react';
import { useSetBreadcrumbs } from '@/components/layout/BreadcrumbContext';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ActiveProvinceTab } from '@/components/admin/ActiveProvinceTab';
import { HospitalsTab } from '@/components/admin/HospitalsTab';
import { BmsConfigTab } from '@/components/admin/BmsConfigTab';
import { WebhookKeysTab } from '@/components/admin/WebhookKeysTab';
import { SyncOverviewTab } from '@/components/admin/SyncOverviewTab';
import { OnlineUsersTab } from '@/components/admin/OnlineUsersTab';
import { SimulationTab } from '@/components/admin/SimulationTab';
import { MophAlertsTab } from '@/components/admin/MophAlertsTab';
import { AdminMapPane } from '@/components/admin/AdminMapPane';

type TabKey = 'province' | 'hospitals' | 'bms-config' | 'webhook-keys' | 'sync-overview' | 'online-users' | 'simulation' | 'moph-alerts';

const TABS: ReadonlyArray<{ key: TabKey; label: string; icon: LucideIcon }> = [
  { key: 'province', label: 'จังหวัดหลัก', icon: Globe },
  { key: 'hospitals', label: 'โรงพยาบาล', icon: Building2 },
  { key: 'bms-config', label: 'การเชื่อมต่อ BMS', icon: Database },
  { key: 'webhook-keys', label: 'คีย์ Webhook', icon: KeyRound },
  { key: 'sync-overview', label: 'สถานะการซิงค์', icon: Activity },
  { key: 'online-users', label: 'ผู้ใช้ออนไลน์', icon: UsersRound },
  { key: 'simulation', label: 'จำลองข้อมูล', icon: FlaskConical },
  { key: 'moph-alerts', label: 'แจ้งเตือน MOPH (LINE)', icon: Bell },
];

export default function AdminPage() {
  useSetBreadcrumbs([{ label: 'แดชบอร์ด', href: '/' }, { label: 'ตั้งค่า' }]);
  const [activeTab, setActiveTab] = useState<TabKey>('province');
  // Map pin click → HospitalsTab opens the edit dialog for that hcode.
  const [autoEditHcode, setAutoEditHcode] = useState<string | null>(null);
  const handleSelectHospitalFromMap = (hcode: string) => {
    setActiveTab('hospitals');
    setAutoEditHcode(hcode);
  };

  return (
    <div className="@container min-h-full bg-surface-page">
      <div className="flex flex-col gap-5 px-4 py-5 md:px-6">
        <PageHeader
          title="ตั้งค่าระบบ"
          subtitle="จังหวัดหลัก ทะเบียนโรงพยาบาล การเชื่อมต่อ HOSxP คีย์ Webhook และการแจ้งเตือน — สำหรับผู้ดูแลระบบ สสจ."
        />
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="gap-5">
          <TabsList
            variant="line"
            aria-label="หมวดการตั้งค่า"
            className="w-full max-w-full flex-wrap justify-start gap-1 border-b border-border pb-1 group-data-horizontal/tabs:h-auto"
          >
            {TABS.map(({ key, label, icon: Icon }) => (
              <TabsTrigger key={key} value={key} className="h-10 flex-none px-3 text-label data-active:text-brand">
                <Icon aria-hidden="true" className="h-4 w-4" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="grid grid-cols-1 items-start gap-5 @min-[1160px]:grid-cols-[minmax(0,1fr)_420px]">
            <div className="min-w-0">
              <TabsContent value="province"><ActiveProvinceTab /></TabsContent>
              <TabsContent value="hospitals">
                <HospitalsTab autoEditHcode={autoEditHcode} onAutoEditConsumed={() => setAutoEditHcode(null)} />
              </TabsContent>
              <TabsContent value="bms-config"><BmsConfigTab /></TabsContent>
              <TabsContent value="webhook-keys"><WebhookKeysTab /></TabsContent>
              <TabsContent value="sync-overview"><SyncOverviewTab /></TabsContent>
              <TabsContent value="online-users"><OnlineUsersTab /></TabsContent>
              <TabsContent value="simulation"><SimulationTab /></TabsContent>
              <TabsContent value="moph-alerts"><MophAlertsTab /></TabsContent>
            </div>
            <section
              aria-label="แผนที่โรงพยาบาล"
              className="min-w-0 @min-[1160px]:sticky @min-[1160px]:top-[calc(var(--app-header-h,0px)+16px)]"
            >
              <AdminMapPane onSelectHospital={handleSelectHospitalFromMap} />
            </section>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
