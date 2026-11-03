'use client';

// The two static reference tables of the public /about page. They live in a
// client module because DataTable takes render callbacks (rowKey / cell), and
// functions cannot cross the server -> client boundary from page.tsx.
import { DataTable } from '@/components/shared/DataTable';

const CPD_FACTOR_ROWS = [
  { factor: 'จำนวนครรภ์ (Gravida)', criteria: 'ท้องแรก (Primigravida)', max: '2 คะแนน' },
  { factor: 'จำนวน ANC', criteria: 'ฝากครรภ์น้อยกว่า 4 ครั้ง', max: '1.5 คะแนน' },
  { factor: 'อายุครรภ์ (GA)', criteria: 'ตั้งแต่ 40 สัปดาห์ขึ้นไป', max: '1.5 คะแนน' },
  {
    factor: 'ส่วนสูงมารดา',
    criteria: 'น้อยกว่า 150 ซม. (2 คะแนน) หรือ 150-155 ซม. (1 คะแนน)',
    max: '2 คะแนน',
  },
  {
    factor: 'ส่วนต่างน้ำหนัก',
    criteria: 'มากกว่า 20 กก. (2 คะแนน) หรือ 15-20 กก. (1 คะแนน)',
    max: '2 คะแนน',
  },
  {
    factor: 'ยอดมดลูก',
    criteria: 'มากกว่า 36 ซม. (2 คะแนน) หรือ 34-36 ซม. (1 คะแนน)',
    max: '2 คะแนน',
  },
  {
    factor: 'น้ำหนักเด็ก (U/S)',
    criteria: 'มากกว่า 3,500 กรัม (2 คะแนน) หรือ 3,000-3,500 กรัม (1 คะแนน)',
    max: '2 คะแนน',
  },
  { factor: 'Hematocrit', criteria: 'น้อยกว่า 30%', max: '1.5 คะแนน' },
];

const USER_GROUP_ROWS = [
  {
    role: 'สูติแพทย์',
    position: 'แพทย์เฉพาะทาง รพ.น่าน',
    usage: 'Monitor Case ให้คำแนะนำส่งต่อ ประเมินความเสี่ยง',
  },
  {
    role: 'พยาบาลห้องคลอด รพ.แม่ข่าย',
    position: 'พยาบาลวิชาชีพ รพ.น่าน',
    usage: 'ติดตาม Partogram รับแจ้งเตือน ประสานงานส่งต่อ',
  },
  {
    role: 'พยาบาล รพช.',
    position: 'พยาบาลวิชาชีพ รพช. ในจังหวัดน่าน',
    usage: 'บันทึกข้อมูลผู้คลอดใน HOSxP อัปเดตสถานะ',
  },
  {
    role: 'ผู้ดูแลระบบ',
    position: 'IT Admin สสจ.น่าน',
    usage: 'ตั้งค่าการเชื่อมต่อ HOSxP จัดการสิทธิ์ผู้ใช้งาน',
  },
];

export function CpdFactorTable() {
  return (
    <DataTable
      caption="ปัจจัยเสี่ยง CPD"
      rowKey={(r) => r.factor}
      rows={CPD_FACTOR_ROWS}
      columns={[
        {
          key: 'factor',
          header: 'ปัจจัย',
          cell: (r) => <span className="font-medium">{r.factor}</span>,
        },
        { key: 'criteria', header: 'เกณฑ์ที่เพิ่มความเสี่ยง', cell: (r) => r.criteria },
        {
          key: 'max',
          header: 'คะแนนสูงสุด',
          numeric: true,
          cell: (r) => <span className="font-mono font-semibold">{r.max}</span>,
        },
      ]}
    />
  );
}

export function UserGroupTable() {
  return (
    <DataTable
      caption="กลุ่มผู้ใช้งาน"
      rowKey={(r) => r.role}
      rows={USER_GROUP_ROWS}
      columns={[
        {
          key: 'role',
          header: 'บทบาท',
          cell: (r) => <span className="font-medium">{r.role}</span>,
        },
        { key: 'position', header: 'ตำแหน่ง', cell: (r) => r.position },
        { key: 'usage', header: 'การใช้งานหลัก', cell: (r) => r.usage },
      ]}
    />
  );
}
