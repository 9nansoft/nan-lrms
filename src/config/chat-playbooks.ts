// Chat playbooks — kk-lrms's own clinical and operational conventions, written
// as instructions the model loads ON DEMAND via the `load_playbook` tool.
//
// Division of labour, deliberately:
//   - ask_medical_ebook  → general medical literature (textbooks, monographs)
//   - load_playbook      → how THIS system encodes things: CPD bands, partograph
//                          alert/action lines, ANC tiers, referral SLA, which
//                          aggregate answers which statistics question
// The model cannot know the second group from its weights, and the ebook cannot
// tell it either — these are local conventions.
//
// ANTI-DRIFT (the reason these are .ts and not .md like the reference chatbot's
// src/skills/*.md): every threshold is INTERPOLATED from the same constant the
// services enforce. Change RISK_LEVELS or REFERRAL_SLA and the playbook text
// changes with it, so the bot can never quote a rule the app no longer applies.
import { RiskLevel } from '@/types/domain';
import { RISK_LEVELS } from '@/config/risk-levels';
import { REFERRAL_SLA } from '@/config/referral-sla';
import {
  ANC_MAX_GA_WEEKS,
  ANC_EDC_MAX_PAST_DAYS,
  ANC_LAST_VISIT_MAX_AGE_DAYS,
} from '@/config/anc-freshness';

export interface ChatPlaybook {
  id: string;
  /** One line shown in the always-present index, so the model knows it exists. */
  summary: string;
  /** Full instructions, returned only when the model asks for this playbook. */
  body: string;
}

const LOW = RISK_LEVELS[RiskLevel.LOW];
const MEDIUM = RISK_LEVELS[RiskLevel.MEDIUM];
const HIGH = RISK_LEVELS[RiskLevel.HIGH];

/** Alert line starts at this dilation; the action line sits 4h to its right.
 *  Mirrors calculateAlertLine/calculateActionLine in src/services/partogram.ts. */
const ALERT_LINE_START_CM = 4;
const ACTION_LINE_OFFSET_HOURS = 4;

export const CHAT_PLAYBOOKS: readonly ChatPlaybook[] = [
  {
    id: 'cpd-interpretation',
    summary:
      'แปลผลคะแนน CPD และระดับความเสี่ยงของ KK-LRMS (ใช้เมื่อถามว่าคะแนนนี้แปลว่าอะไร/ต้องทำอะไรต่อ)',
    body: [
      '# การแปลผลคะแนน CPD ในระบบ KK-LRMS',
      '',
      'คะแนน CPD (Cephalopelvic Disproportion) คำนวณจากปัจจัยเสี่ยงของผู้คลอด',
      'แล้วจัดระดับตามเกณฑ์ของระบบนี้ (ไม่ใช่เกณฑ์สากล) ดังนี้:',
      '',
      `- **${LOW.labelTh}** คะแนน ${LOW.minScore}–${LOW.maxScore} → แนวทาง: ${LOW.action}`,
      `- **${MEDIUM.labelTh}** คะแนน ${MEDIUM.minScore}–${MEDIUM.maxScore} → แนวทาง: ${MEDIUM.action}`,
      `- **${HIGH.labelTh}** คะแนน ตั้งแต่ ${HIGH.minScore} ขึ้นไป → แนวทาง: ${HIGH.action}`,
      '',
      '## กฎการตอบ',
      '1. บอกระดับความเสี่ยงพร้อมคะแนน และแนวทางตามตารางข้างบนเสมอ',
      '2. ห้ามคิดเกณฑ์เอง และห้ามปัดคะแนนข้ามระดับ',
      '3. คะแนนคือ "สัญญาณให้เฝ้าระวัง" ไม่ใช่คำวินิจฉัย — การตัดสินใจสุดท้ายเป็นของแพทย์',
      '4. ถ้าผู้ป่วยยังไม่มีคะแนน CPD ให้บอกว่ายังไม่ได้ประเมิน ห้ามเดาระดับจากข้อมูลอื่น',
      '',
      '## สิ่งที่ห้ามทำ',
      '- ห้ามบอกว่า "เสี่ยงต่ำจึงไม่ต้องเฝ้าระวัง" — ทุกระดับยังต้องติดตามตามมาตรฐาน',
      '- ถ้าถามเหตุผลว่าทำไมคะแนนสูง ให้อธิบายจากปัจจัยที่ระบบบันทึกไว้เท่านั้น',
    ].join('\n'),
  },
  {
    id: 'partograph-reading',
    summary:
      'อ่านกราฟ partograph: alert line / action line และระดับการแจ้งเตือน (ใช้เมื่อถามถึงการตีความ partogram)',
    body: [
      '# การอ่าน Partograph ใน KK-LRMS',
      '',
      '## เส้นอ้างอิง',
      `- **Alert line** เริ่มคำนวณเมื่อปากมดลูกเปิด ${ALERT_LINE_START_CM} ซม. (อัตราอ้างอิง 1 ซม./ชม.)`,
      `- **Action line** คือ alert line เลื่อนไปทางขวา ${ACTION_LINE_OFFSET_HOURS} ชั่วโมง`,
      '- กราฟที่ "ตกไปทางขวาของ alert line" = ความก้าวหน้าช้ากว่าที่ควร ต้องประเมินซ้ำ',
      '- กราฟที่ "ข้าม action line" = ต้องรายงานแพทย์/พิจารณาแทรกแซงทันที',
      '',
      '## ระดับการแจ้งเตือนของ CDSS (เรียงจากเบาไปหนัก)',
      '- `INFO` = ข้อมูลประกอบ',
      '- `WARN` = ควรเฝ้าระวังเพิ่ม',
      '- `ALERT` = ผิดปกติ ต้องประเมินซ้ำและรายงาน',
      '- `CRITICAL` = ต้องจัดการทันที',
      '',
      '## กฎการตอบ',
      '1. อ้างระดับตามคำที่ระบบใช้ (INFO/WARN/ALERT/CRITICAL) ห้ามคิดคำใหม่',
      '2. ถ้ามีหลายการแจ้งเตือน ให้สรุประดับสูงสุดก่อน แล้วจึงลงรายละเอียด',
      '3. ถ้าไม่มีข้อมูล partograph ให้บอกตรง ๆ ว่ายังไม่มีการบันทึก ห้ามอนุมานจากคะแนน CPD',
      '4. ระบุเวลาที่บันทึกล่าสุดเสมอ — กราฟที่ข้อมูลเก่าอาจไม่สะท้อนสถานการณ์ปัจจุบัน',
    ].join('\n'),
  },
  {
    id: 'anc-followup',
    summary: 'ระดับความเสี่ยง ANC (LOW/HR1/HR2/HR3) และเกณฑ์ความสดของข้อมูลที่ระบบใช้',
    body: [
      '# การติดตาม ANC ใน KK-LRMS',
      '',
      '## ระดับความเสี่ยง (ตามการจำแนกที่ระบบใช้)',
      '- `LOW` = ครรภ์ความเสี่ยงต่ำ ติดตามตามนัดปกติ',
      '- `HR1` = ความเสี่ยงระดับ 1',
      '- `HR2` = ความเสี่ยงระดับ 2',
      '- `HR3` = ความเสี่ยงสูง — ต้องได้รับการดูแลโดยสูติแพทย์และวางแผนสถานที่คลอด',
      '',
      '## เกณฑ์ "ยังติดตามอยู่" ที่ระบบใช้กรองทะเบียน ANC',
      `- อายุครรภ์ไม่เกิน ${ANC_MAX_GA_WEEKS} สัปดาห์`,
      `- กำหนดคลอด (EDC) ไม่เลยมาเกิน ${ANC_EDC_MAX_PAST_DAYS} วัน`,
      `- มีการมาฝากครรภ์ครั้งล่าสุดภายใน ${ANC_LAST_VISIT_MAX_AGE_DAYS} วัน`,
      'รายที่หลุดเกณฑ์เหล่านี้ถือว่า "ขาดการติดตาม/คลอดไปแล้วโดยไม่ได้บันทึก"',
      'และจะไม่ถูกนับในตัวเลข ANC ของแดชบอร์ด',
      '',
      '## กฎการตอบ',
      '1. เวลาบอกจำนวน ANC ให้ระบุว่าเป็นยอด "ที่ยังติดตามอยู่" ตามเกณฑ์ข้างบน',
      '2. ห้ามสรุปว่าผู้ป่วย HR3 ต้องส่งต่อทุกราย — ให้บอกว่าต้องได้รับการประเมินโดยสูติแพทย์',
      '3. ถ้าถูกถามถึงรายที่ขาดการติดตาม ให้ชี้ไปที่เกณฑ์วัน ไม่ใช่เดาสาเหตุ',
    ].join('\n'),
  },
  {
    id: 'referral-triage',
    summary: `เกณฑ์เวลาการส่งต่อ (ค้างเกิน ${REFERRAL_SLA.overdueAfterHours} ชม. / วิกฤตเกิน ${REFERRAL_SLA.criticalAfterHours} ชม.)`,
    body: [
      '# เกณฑ์การส่งต่อ (Referral SLA) ใน KK-LRMS',
      '',
      '## การนับอายุใบส่งต่อ',
      `- ค้างเกิน **${REFERRAL_SLA.overdueAfterHours} ชั่วโมง** = overdue (แสดงสีเหลืองและนับใน KPI งานค้าง)`,
      `- ค้างเกิน **${REFERRAL_SLA.criticalAfterHours} ชั่วโมง** = critical (แสดงสีแดง)`,
      '- **นับเฉพาะใบที่สถานะยัง `INITIATED` เท่านั้น** — เมื่อปลายทางตอบรับแล้ว',
      '  (ACCEPTED / IN_TRANSIT / ARRIVED / REJECTED) ต้นทางไม่ได้เป็นผู้ถือความล่าช้าอีกต่อไป',
      `- เคส EMERGENCY ที่เปิดภายใน ${REFERRAL_SLA.emergencyPinHours} ชม. จะถูกปักไว้บนสุดของคิว`,
      '',
      '## กฎการตอบ',
      '1. เวลาบอกจำนวน "ส่งต่อค้าง" ให้ระบุด้วยว่านับเฉพาะสถานะ INITIATED',
      '2. ห้ามแนะนำให้ "ยกเลิก" หรือ "ปิด" ใบส่งต่อ — ระบบนี้อ่านอย่างเดียว',
      '3. ถ้าถามว่าควรส่งต่อหรือไม่ นั่นเป็นการตัดสินใจทางคลินิกของแพทย์',
      '   ให้เสนอข้อมูลประกอบ (ระดับความเสี่ยง ระยะทาง ศักยภาพปลายทาง) ไม่ใช่คำสั่ง',
    ].join('\n'),
  },
  {
    id: 'province-statistics',
    summary:
      'ตัวเลขไหนตอบคำถามแบบไหน และกฎการรายงานสถิติของแดชบอร์ด (ใช้เมื่อถามยอดรวม/เปรียบเทียบ รพ.)',
    body: [
      '# กฎการรายงานสถิติของแดชบอร์ด KK-LRMS',
      '',
      '## นิยามที่ต้องใช้ให้ตรง',
      '- **"รอคลอด" / "กำลังคลอด" / "อยู่ในห้องคลอด"** = ผู้ป่วยที่ `labor_status = ACTIVE`',
      '  → เป็นตัวเลขเดียวกันทั้งหมด อย่าตอบต่างกันเพราะผู้ใช้ใช้คำต่างกัน',
      '- **"ANC กำลังติดตาม"** = ทะเบียนตั้งครรภ์ที่ยังไม่คลอด (ดู playbook `anc-followup`)',
      '- **"คลอดแล้วเดือนนี้"** = นับตามเดือนปฏิทินไทย (Asia/Bangkok)',
      '',
      '## เลือกเครื่องมือให้ถูก',
      '- ยอดรวมทั้งจังหวัดแยกตามระยะ → `get_stage_kpis`',
      '- เปรียบเทียบระหว่างโรงพยาบาล / "รพ.ไหนมากที่สุด" → `get_province_overview`',
      '- แนวโน้ม/เทียบกับช่วงก่อนหน้า → `get_trends`',
      '- งานค้างที่ต้องรีบจัดการ → `get_alerts`',
      '',
      '## กฎการตอบ (สำคัญที่สุด)',
      '1. ใช้ตัวเลขจากเครื่องมือหรือบล็อกบริบทเท่านั้น **ห้ามคำนวณยอดรวมเอง**',
      '   จากรายการที่ถูกตัดให้สั้น — ยอดรวมที่ระบบให้มาคือตัวเลขที่ถูกต้อง',
      '2. ระบุเวลาอ้างอิงของข้อมูลเสมอ ("ข้อมูล ณ …")',
      '3. ผลรวมของกลุ่มเสี่ยง (สูง+กลาง+ต่ำ) อาจ **น้อยกว่า** ยอดรวม เพราะผู้ที่ยัง',
      '   ไม่ได้ประเมิน CPD จะไม่ถูกนับในกลุ่มใดเลย — อย่าสรุปว่าตัวเลขขัดกัน',
      '4. ถ้าไม่มีตัวเลขที่ถูกถาม ให้บอกว่าไม่มีข้อมูล และบอกว่ามีตัวเลขอะไรให้แทน',
      '   ห้ามประมาณการเด็ดขาด',
    ].join('\n'),
  },
] as const;

export function findPlaybook(id: string): ChatPlaybook | null {
  return CHAT_PLAYBOOKS.find((p) => p.id === id) ?? null;
}

export function playbookIds(): string[] {
  return CHAT_PLAYBOOKS.map((p) => p.id);
}

/**
 * The always-present index injected into the system prompt. Only summaries —
 * the bodies are pulled on demand, so the per-turn prompt stays small no matter
 * how many playbooks exist.
 */
export function renderPlaybookIndex(): string {
  const lines = CHAT_PLAYBOOKS.map((p) => `- \`${p.id}\`: ${p.summary}`);
  return [
    'คู่มือการทำงานเฉพาะของระบบนี้ (เรียกดูเนื้อหาเต็มด้วยเครื่องมือ load_playbook):',
    ...lines,
    'ถ้าคำถามเกี่ยวข้องกับหัวข้อใดข้างต้น ให้เรียก load_playbook ก่อนตอบเสมอ',
  ].join('\n');
}
