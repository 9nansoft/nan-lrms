// T015: Hospital level definitions and KK province hospital data

import { HospitalLevel } from '@/types/domain';

export interface HospitalLevelConfig {
  level: HospitalLevel;
  nameTh: string;
  nameEn: string;
  description: string;
  sortOrder: number;
}

export const HOSPITAL_LEVELS: Record<HospitalLevel, HospitalLevelConfig> = {
  [HospitalLevel.A_S]: {
    level: HospitalLevel.A_S,
    nameTh: 'รพช. ขนาดใหญ่',
    nameEn: 'Large Community Hospital',
    description: 'โรงพยาบาลชุมชนขนาดใหญ่ (A/S)',
    sortOrder: 1,
  },
  [HospitalLevel.M1]: {
    level: HospitalLevel.M1,
    nameTh: 'รพช. ขนาดกลาง M1',
    nameEn: 'Medium Community Hospital M1',
    description: 'โรงพยาบาลชุมชนขนาดกลาง ระดับ M1',
    sortOrder: 2,
  },
  [HospitalLevel.M2]: {
    level: HospitalLevel.M2,
    nameTh: 'รพช. ขนาดกลาง M2',
    nameEn: 'Medium Community Hospital M2',
    description: 'โรงพยาบาลชุมชนขนาดกลาง-เล็ก ระดับ M2',
    sortOrder: 3,
  },
  [HospitalLevel.F1]: {
    level: HospitalLevel.F1,
    nameTh: 'รพช. ขนาดเล็ก F1',
    nameEn: 'Small Community Hospital F1',
    description: 'โรงพยาบาลชุมชนขนาดเล็ก ระดับ F1',
    sortOrder: 4,
  },
  [HospitalLevel.F2]: {
    level: HospitalLevel.F2,
    nameTh: 'รพช. ขนาดเล็ก F2',
    nameEn: 'Small Community Hospital F2',
    description: 'โรงพยาบาลชุมชนขนาดเล็ก ระดับ F2',
    sortOrder: 5,
  },
  [HospitalLevel.F3]: {
    level: HospitalLevel.F3,
    nameTh: 'รพ.สต./F3',
    nameEn: 'Health Promoting Hospital / F3',
    description: 'โรงพยาบาลส่งเสริมสุขภาพตำบล / ระดับ F3',
    sortOrder: 6,
  },
};

export interface KkHospitalSeed {
  hcode: string;
  name: string;
  level: HospitalLevel;
}

export const KK_HOSPITALS: KkHospitalSeed[] = [
  { hcode: '10670', name: 'รพ.ชุมแพ', level: HospitalLevel.M1 },
  { hcode: '10671', name: 'รพ.น้ำพอง', level: HospitalLevel.M1 },
  { hcode: '10672', name: 'รพ.บ้านไผ่', level: HospitalLevel.A_S },
  { hcode: '10673', name: 'รพ.พล', level: HospitalLevel.M2 },
  { hcode: '10674', name: 'รพ.ภูเวียง', level: HospitalLevel.M1 },
  { hcode: '10675', name: 'รพ.มัญจาคีรี', level: HospitalLevel.M2 },
  { hcode: '10676', name: 'รพ.หนองเรือ', level: HospitalLevel.M2 },
  { hcode: '10677', name: 'รพ.ชนบท', level: HospitalLevel.F1 },
  { hcode: '10678', name: 'รพ.สีชมพู', level: HospitalLevel.F1 },
  { hcode: '10679', name: 'รพ.อุบลรัตน์', level: HospitalLevel.F1 },
  { hcode: '10680', name: 'รพ.กระนวน', level: HospitalLevel.M2 },
  { hcode: '10681', name: 'รพ.บ้านฝาง', level: HospitalLevel.F2 },
  { hcode: '10682', name: 'รพ.พระยืน', level: HospitalLevel.F2 },
  { hcode: '10683', name: 'รพ.หนองสองห้อง', level: HospitalLevel.F1 },
  { hcode: '10684', name: 'รพ.ภูผาม่าน', level: HospitalLevel.F2 },
  { hcode: '10685', name: 'รพ.ซำสูง', level: HospitalLevel.F2 },
  { hcode: '10686', name: 'รพ.โคกโพธิ์ไชย', level: HospitalLevel.F2 },
  { hcode: '10687', name: 'รพ.หนองนาคำ', level: HospitalLevel.F2 },
  { hcode: '10688', name: 'รพ.บ้านแฮด', level: HospitalLevel.F2 },
  { hcode: '10689', name: 'รพ.โนนศิลา', level: HospitalLevel.F2 },
  { hcode: '10690', name: 'รพ.เขาสวนกวาง', level: HospitalLevel.F1 },
  { hcode: '11445', name: 'รพ.เปือยน้อย', level: HospitalLevel.F2 },
  // รพ.วังสะพุง (hcode 11446) was removed — it is in Loei province, not
  // Khon Kaen. KK has 26 districts; Mueang Khon Kaen is served by
  // รพศ.ขอนแก่น (the Regional Hospital, separately managed) so this
  // community-hospital list contains 25 entries.
  { hcode: '10998', name: 'รพ.แวงใหญ่', level: HospitalLevel.F2 },
  { hcode: '10999', name: 'รพ.แวงน้อย', level: HospitalLevel.F2 },
  { hcode: '11000', name: 'รพ.เวียงเก่า', level: HospitalLevel.F3 },
];

export function getHospitalLevelConfig(level: HospitalLevel): HospitalLevelConfig {
  return HOSPITAL_LEVELS[level];
}
