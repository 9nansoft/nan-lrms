// About page — public, accessible without login
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Baby,
  Bell,
  BarChart3,
  ChevronRight,
  HeartPulse,
  Network,
  Printer,
  Shield,
  Stethoscope,
} from 'lucide-react';
import { AboutHeader } from '@/components/about/AboutHeader';
import { CpdFactorTable, UserGroupTable } from '@/components/about/about-tables';
import { WebhookApiContent } from '@/components/about/WebhookApiSection';
import {
  FactTile,
  FeatureCard,
  HospitalLevelRow,
  RiskLevelCard,
  StepItem,
} from '@/components/about/about-blocks';
import { SectionCard } from '@/components/shared/SectionCard';
import { NAN_HOSPITALS } from '@/config/hospitals';
import { CPD_FACTOR_WEIGHTS, RISK_LEVELS, type RiskLevelConfig } from '@/config/risk-levels';
import { RiskLevel } from '@/types/domain';

// Risk thresholds, labels, and colours are owned by src/config/risk-levels.ts.
// This page renders them so the public documentation cannot drift from the
// values the CPD engine actually uses. The action prose below is page-specific
// (more descriptive than the config's terse `action`) and intentionally local.
const ABOUT_RISK_LEVELS = [RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH] as const;

const RISK_LEVEL_ACTION_PROSE: Record<RiskLevel, string> = {
  [RiskLevel.LOW]: 'ติดตามปกติ ดูแลตามแนวทางมาตรฐาน',
  [RiskLevel.MEDIUM]: 'เฝ้าระวังใกล้ชิด เตรียมพร้อมส่งต่อ',
  [RiskLevel.HIGH]: 'ควรประสานส่งต่อไปยัง รพ.แม่ข่ายทันที!',
};

// Renders "0 — 4.99", "5 — 9.99", or "10 ขึ้นไป" (open-ended) from the config.
function formatRiskScoreRange(config: RiskLevelConfig): string {
  return config.maxScore === Infinity
    ? `${config.minScore} ขึ้นไป`
    : `${config.minScore} — ${config.maxScore}`;
}

const SECTIONS = [
  { id: 'overview', title: 'ภาพรวมระบบ' },
  { id: 'objectives', title: 'วัตถุประสงค์' },
  { id: 'features', title: 'ฟีเจอร์หลักของระบบ' },
  { id: 'cpd', title: 'ระบบประเมินความเสี่ยง CPD' },
  { id: 'network', title: 'โครงสร้างเครือข่ายโรงพยาบาล' },
  { id: 'workflow', title: 'ขั้นตอนการทำงานของระบบ' },
  { id: 'webhook', title: 'Webhook & API สำหรับโรงพยาบาลภายนอก' },
  { id: 'users', title: 'กลุ่มผู้ใช้งาน' },
  { id: 'security', title: 'ความปลอดภัยและความเป็นส่วนตัว' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];
const title = (id: SectionId) => SECTIONS.find((s) => s.id === id)!.title;

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-surface-page">
      <AboutHeader />
      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <nav aria-label="สารบัญ" className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full border border-border bg-surface-card px-3 py-1.5 text-label text-brand hover:bg-brand-soft"
            >
              {s.title}
            </a>
          ))}
        </nav>
        <SectionCard id="overview" title={title('overview')}>
          <div className="space-y-6">
            <p className="text-ink-muted text-body-lg">
              <strong>NN-LRMS</strong> (Nan Labor Room Monitoring System)
              คือระบบติดตามการคลอดแบบรวมศูนย์ ระดับจังหวัด
              ที่ออกแบบมาเพื่อให้สูติแพทย์และพยาบาลห้องคลอดของ<strong>โรงพยาบาลแม่ข่าย</strong>
              (รพ.น่าน และ รพ.ศรีนครินทร์) สามารถ<strong>ติดตามผู้คลอด</strong>ที่รอคลอดใน
              <strong>โรงพยาบาลชุมชน (รพช.) ทุกแห่ง</strong>ในจังหวัดน่านได้แบบ Real-time
            </p>
            <p className="text-ink-muted">
              ระบบดึงข้อมูลอัตโนมัติจาก <strong>HOSxP HIS</strong> (ระบบสารสนเทศโรงพยาบาล)
              ที่ใช้งานอยู่ใน รพช. ทุกแห่ง ผ่าน <strong>BMS Central API</strong>{' '}
              ซึ่งทำหน้าที่เป็นตัวกลางเชื่อมต่อข้อมูล ทำให้เจ้าหน้าที่{' '}
              <strong>ไม่ต้องบันทึกข้อมูลซ้ำ</strong> — ข้อมูลที่บันทึกใน HOSxP จะไหลเข้ามาที่
              NN-LRMS โดยอัตโนมัติภายใน 30 วินาที
            </p>
            <div className="grid grid-cols-2 gap-4 pt-4 md:grid-cols-4">
              <FactTile
                testId="fact-hospitals"
                value={String(NAN_HOSPITALS.length)}
                label="โรงพยาบาลในเครือข่าย"
              />
              <FactTile testId="fact-refresh" value="30" label="วินาที อัปเดตข้อมูล" />
              <FactTile
                testId="fact-cpd-factors"
                value={String(Object.keys(CPD_FACTOR_WEIGHTS).length)}
                label="ปัจจัยเสี่ยง CPD"
              />
              <FactTile testId="fact-always-on" value="24/7" label="ติดตามตลอดเวลา" />
            </div>
          </div>
        </SectionCard>
        <SectionCard id="objectives" title={title('objectives')}>
          <div className="space-y-5">
            <StepItem
              step={1}
              title="เพิ่มความปลอดภัยในการคลอด"
              description="ติดตามความเสี่ยง CPD (Cephalopelvic Disproportion — ภาวะศีรษะทารกไม่สมดุลกับช่องเชิงกรานมารดา) แบบ Real-time คำนวณคะแนนอัตโนมัติจาก 8 ปัจจัยเสี่ยง เพื่อให้ทีมแพทย์ตัดสินใจได้รวดเร็ว"
            />
            <StepItem
              step={2}
              title="สร้างมาตรฐานการส่งต่อผู้ป่วย"
              description="ระบบแนะนำการส่งต่อตาม MOU ของเขตสุขภาพที่ 7 ผู้คลอดที่มีความเสี่ยงสูงจะได้รับคำแนะนำให้ประสานส่งต่อไปยังโรงพยาบาลแม่ข่ายทันที"
            />
            <StepItem
              step={3}
              title="ลดอัตราการเสียชีวิตและภาวะแทรกซ้อนจากการคลอด"
              description="เมื่อสูติแพทย์เห็นข้อมูลผู้คลอดทุกแห่งในเวลาเดียวกัน สามารถให้คำแนะนำ ประเมินสถานการณ์ และตัดสินใจส่งต่อได้ก่อนที่จะเกิดภาวะแทรกซ้อน"
            />
            <StepItem
              step={4}
              title="ลดภาระการบันทึกข้อมูลซ้ำ"
              description="ข้อมูลที่เจ้าหน้าที่ รพช. บันทึกใน HOSxP จะถูกดึงมาแสดงใน NN-LRMS โดยอัตโนมัติ ไม่ต้องพิมพ์ข้อมูลซ้ำอีกครั้ง ประหยัดเวลาและลดความผิดพลาดจากการคัดลอกข้อมูล"
            />
          </div>
        </SectionCard>
        <SectionCard id="features" title={title('features')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <FeatureCard
              icon={<HeartPulse className="h-6 w-6" />}
              title="Dashboard แบบ Real-time"
              description="แสดงภาพรวมผู้คลอดทั้งจังหวัด จำแนกตามระดับความเสี่ยง (สูง/ปานกลาง/ต่ำ) แสดงสถานะการเชื่อมต่อของแต่ละ รพ. และแจ้งเตือนเมื่อมีผู้คลอดเสี่ยงสูง อัปเดตข้อมูลทุก 30 วินาที"
            />
            <FeatureCard
              icon={<AlertTriangle className="h-6 w-6" />}
              title="CPD Risk Score อัตโนมัติ"
              description="คำนวณคะแนนความเสี่ยง CPD จาก 8 ปัจจัย ได้แก่ จำนวนครรภ์ จำนวนฝากครรภ์ อายุครรภ์ ส่วนสูง ส่วนต่างน้ำหนัก ยอดมดลูก น้ำหนักเด็กจาก U/S และค่า Hematocrit แสดงกราฟวิเคราะห์ว่าปัจจัยใดส่งผลมากที่สุด"
            />
            <FeatureCard
              icon={<Activity className="h-6 w-6" />}
              title="Partogram ติดตามการคลอด"
              description="แสดงกราฟ Partogram แสดงความก้าวหน้าการขยายปากมดลูก เทียบกับเส้นเตือน (Alert Line) และเส้นปฏิบัติ (Action Line) พร้อมแสดงอัตราการขยาย (ซม./ชม.) และระยะการคลอดปัจจุบัน"
            />
            <FeatureCard
              icon={<Stethoscope className="h-6 w-6" />}
              title="สัญญาณชีพแบบครบถ้วน"
              description="แสดงสัญญาณชีพปัจจุบันพร้อมสถานะ (ปกติ/เฝ้าระวัง/ผิดปกติ): ชีพจรมารดา (Maternal HR) ชีพจรทารก (Fetal HR) ความดันโลหิต (BP) และปริมาณเลือดออก (PPH) พร้อม Sparkline แนวโน้มย้อนหลัง"
            />
            <FeatureCard
              icon={<Network className="h-6 w-6" />}
              title="เชื่อมต่อ 26 โรงพยาบาล"
              description="ครอบคลุมโรงพยาบาลชุมชนทุกระดับในจังหวัดน่าน ตั้งแต่ระดับ A (S) จนถึง F3 แสดงสถานะเชื่อมต่อ (ออนไลน์/ออฟไลน์) และเวลาอัปเดตข้อมูลล่าสุดของแต่ละ รพ."
            />
            <FeatureCard
              icon={<Bell className="h-6 w-6" />}
              title="แจ้งเตือนผู้คลอดเสี่ยงสูง"
              description={`เมื่อผู้คลอดมีคะแนน CPD ถึงระดับเสี่ยงสูง (≥${RISK_LEVELS[RiskLevel.HIGH].minScore} คะแนน) ระบบจะแจ้งเตือนทันที พร้อมคำแนะนำให้ประสานส่งต่อ แสดงแบนเนอร์คำแนะนำการส่งต่อตามระดับความเสี่ยง`}
            />
            <FeatureCard
              icon={<Baby className="h-6 w-6" />}
              title="ข้อมูลทางคลินิกครบถ้วน"
              description="แสดงข้อมูลทางคลินิกที่จำเป็นสำหรับการดูแลผู้คลอด: Gravida อายุครรภ์ ANC ส่วนสูง น้ำหนัก ยอดมดลูก น้ำหนักเด็ก Hematocrit พร้อมแสดงค่าผิดปกติด้วยสี"
            />
            <FeatureCard
              icon={<Printer className="h-6 w-6" />}
              title="พิมพ์บันทึกการคลอด"
              description="สามารถพิมพ์บันทึกการคลอดในรูปแบบ A4 ได้ทันที แสดงข้อมูลผู้คลอด สัญญาณชีพ และข้อมูลทางคลินิก พร้อมตารางบันทึก V/S สำหรับใช้เป็นเอกสารประกอบ"
            />
          </div>
        </SectionCard>
        <SectionCard id="cpd" title={title('cpd')}>
          <div className="space-y-6">
            <p className="text-ink-muted">
              <strong>CPD (Cephalopelvic Disproportion)</strong>{' '}
              คือภาวะที่ศีรษะทารกไม่สามารถผ่านช่องเชิงกราน ของมารดาได้ เป็นสาเหตุสำคัญของการคลอดยาก
              ระบบ NN-LRMS คำนวณคะแนนความเสี่ยง CPD อัตโนมัติจาก <strong>8 ปัจจัย</strong> ดังนี้:
            </p>
            <CpdFactorTable />
            <h3 className="text-body-lg text-ink pt-4">ระดับความเสี่ยง</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {ABOUT_RISK_LEVELS.map((level) => (
                <RiskLevelCard
                  key={level}
                  level={level}
                  score={formatRiskScoreRange(RISK_LEVELS[level])}
                  action={RISK_LEVEL_ACTION_PROSE[level]}
                />
              ))}
            </div>
          </div>
        </SectionCard>
        <SectionCard id="network" title={title('network')}>
          <p className="text-ink-muted">
            ระบบ NN-LRMS ใช้โมเดล <strong>Hub-and-Spoke</strong> โดยมี รพ.น่าน เป็นศูนย์กลาง
            (Hub) เชื่อมต่อกับ รพช. ทุกระดับในจังหวัดน่าน:
          </p>
          <div className="space-y-1">
            <HospitalLevelRow
              level="Hub"
              name="รพ.น่าน"
              description="โรงพยาบาลศูนย์ — ศูนย์กลาง NN-LRMS สูติแพทย์และพยาบาลห้องคลอดใช้ Monitor ผู้คลอดจากทุก รพ."
            />
            <HospitalLevelRow
              level="A (S)"
              name="รพช.ขนาดใหญ่"
              description="เช่น รพร.ปัว — มีสูติแพทย์ประจำ สามารถผ่าตัดคลอดได้"
            />
            <HospitalLevelRow
              level="M1"
              name="รพช.ขนาดกลาง"
              description="โรงพยาบาลชุมชนขนาดกลาง มีพยาบาลห้องคลอดประจำ"
            />
            <HospitalLevelRow
              level="M2"
              name="รพช.ขนาดกลาง-เล็ก"
              description="โรงพยาบาลชุมชนขนาดกลาง-เล็ก รองรับการคลอดปกติ"
            />
            <HospitalLevelRow
              level="F1"
              name="รพช.ขนาดเล็กระดับ 1"
              description="โรงพยาบาลชุมชนขนาดเล็ก รองรับการคลอดปกติ"
            />
            <HospitalLevelRow
              level="F2"
              name="รพช.ขนาดเล็กระดับ 2"
              description="โรงพยาบาลชุมชนขนาดเล็ก รองรับการคลอดเบื้องต้น"
            />
            <HospitalLevelRow
              level="F3"
              name="รพช.ขนาดเล็กระดับ 3 / รพ.สต."
              description="โรงพยาบาลขนาดเล็กที่สุด ส่งต่อกรณีที่มีความเสี่ยง"
            />
          </div>
        </SectionCard>
        <SectionCard id="workflow" title={title('workflow')}>
          <div className="space-y-8">
            <StepItem
              step={1}
              title="เจ้าหน้าที่ รพช. บันทึกข้อมูลใน HOSxP"
              description="พยาบาลห้องคลอดที่ รพช. บันทึกข้อมูลผู้คลอดตามปกติใน HOSxP HIS (ระบบสารสนเทศที่ใช้อยู่เดิม) ทั้งข้อมูลทั่วไป สัญญาณชีพ การตรวจภายใน และอื่นๆ"
            />
            <div className="flex justify-center">
              <ChevronRight className="h-6 w-6 text-ink-muted rotate-90" />
            </div>
            <StepItem
              step={2}
              title="BMS Central API ดึงข้อมูลจาก HOSxP"
              description="BMS Central API (ตัวกลางเชื่อมต่อข้อมูล) จะเชื่อมต่อกับฐานข้อมูล HOSxP ของแต่ละ รพช. โดยอัตโนมัติ ดึงข้อมูลผู้คลอดที่กำลังรอคลอด (Active Labor) ออกมา"
            />
            <div className="flex justify-center">
              <ChevronRight className="h-6 w-6 text-ink-muted rotate-90" />
            </div>
            <StepItem
              step={3}
              title="NN-LRMS ประมวลผลและแสดงข้อมูล"
              description="ระบบ NN-LRMS รับข้อมูลจาก BMS API คำนวณ CPD Risk Score อัตโนมัติจาก 8 ปัจจัยเสี่ยง สร้าง Partogram และแสดงบน Dashboard กลาง โดยอัปเดตทุก 30 วินาที"
            />
            <div className="flex justify-center">
              <ChevronRight className="h-6 w-6 text-ink-muted rotate-90" />
            </div>
            <StepItem
              step={4}
              title="สูติแพทย์ติดตามและให้คำแนะนำ"
              description="สูติแพทย์ที่ รพ.น่าน เปิด Dashboard ดูผู้คลอดทั้งจังหวัด หากพบผู้คลอดเสี่ยงสูง สามารถประสานงานส่งต่อ ให้คำแนะนำ หรือเตรียมรับผู้ป่วยได้ทันที"
            />
          </div>
        </SectionCard>
        <SectionCard id="webhook" title={title('webhook')}>
          <WebhookApiContent />
        </SectionCard>
        <SectionCard id="users" title={title('users')}>
          <UserGroupTable />
        </SectionCard>
        <SectionCard id="security" title={title('security')}>
          <p className="text-ink-muted">
            ระบบ NN-LRMS ออกแบบให้เป็นไปตาม <strong>พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล (PDPA)</strong>:
          </p>
          <ul className="space-y-3 text-ink-muted">
            <li className="flex gap-3">
              <Shield className="h-5 w-5 shrink-0 text-brand mt-0.5" />
              <span>
                <strong>เข้ารหัสข้อมูลส่วนบุคคล</strong> — ชื่อ-สกุลและเลขบัตรประชาชนถูกเข้ารหัส
                (Encrypt) ทั้งในฐานข้อมูลและระหว่างการส่งข้อมูล
              </span>
            </li>
            <li className="flex gap-3">
              <Shield className="h-5 w-5 shrink-0 text-brand mt-0.5" />
              <span>
                <strong>ระบบยืนยันตัวตน</strong> — ผู้ใช้ต้องเข้าสู่ระบบด้วย BMS Session ID จาก
                HOSxP หรือ ProviderID (สิทธิ์อ่านอย่างเดียว)
                ไม่สามารถเข้าถึงข้อมูลได้โดยไม่ผ่านการยืนยันตัวตน
              </span>
            </li>
            <li className="flex gap-3">
              <Shield className="h-5 w-5 shrink-0 text-brand mt-0.5" />
              <span>
                <strong>บันทึกการเข้าถึง (Audit Log)</strong> — ทุกครั้งที่มีการเปิดดูข้อมูลผู้คลอด
                ระบบจะบันทึกว่าใครเข้าดูข้อมูลอะไร เมื่อไหร่
              </span>
            </li>
            <li className="flex gap-3">
              <Shield className="h-5 w-5 shrink-0 text-brand mt-0.5" />
              <span>
                <strong>แสดงชื่อแบบย่อ</strong> — หน้าจอแสดงชื่อผู้คลอดพร้อมอักษรแรกของนามสกุล (เช่น
                สมหญิง ข.) และเลขบัตรประชาชนแบบปิดบัง (เช่น 3XXXXXXXX2121) เพื่อความเป็นส่วนตัว
              </span>
            </li>
            <li className="flex gap-3">
              <Shield className="h-5 w-5 shrink-0 text-brand mt-0.5" />
              <span>
                <strong>การเชื่อมต่อปลอดภัย</strong> — ใช้ HTTPS ในการเชื่อมต่อทั้งหมด พร้อม
                Security Headers มาตรฐาน
              </span>
            </li>
          </ul>
        </SectionCard>
        <footer className="space-y-2 border-t border-border pt-8 pb-4 text-center text-body text-ink-muted">
          <p className="font-semibold text-ink">
            NN-LRMS v1.0.0 — ระบบติดตามการคลอดแบบรวมศูนย์ จังหวัดน่าน
          </p>
          <p>สำนักงานสาธารณสุขจังหวัดน่าน — เขตสุขภาพที่ 7</p>
          <p className="pt-4">
            <Link
              href="/login"
              className="font-medium text-brand transition-colors hover:text-brand-strong"
            >
              เข้าสู่ระบบ
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}
