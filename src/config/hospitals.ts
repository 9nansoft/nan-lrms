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

// Source of truth: MOPH `hospcode` table — verified via
//   SELECT hospcode, name, hospital_type_id
//   FROM hospcode
//   WHERE chwpart = '40' AND hospital_type_id IN (5,6,7) AND CHAR_LENGTH(hospcode) = 5
// against a live HOSxP MySQL on 2026-04-19. 26 facilities total in
// Khon Kaen province (chwpart = '40'):
//   - hospital_type_id 5 → A_S (general/regional, just the KK Regional)
//   - hospital_type_id 6 → M1 (large referral — Chumphae, Sirindhorn)
//   - hospital_type_id 7 → F2 (community)
// Names use the รพ. abbreviation per existing convention; full MOPH
// names would be "โรงพยาบาล…".
export const KK_HOSPITALS: KkHospitalSeed[] = [
  { hcode: '10670', name: 'รพ.ขอนแก่น', level: HospitalLevel.A_S },
  { hcode: '10995', name: 'รพ.บ้านฝาง', level: HospitalLevel.F2 },
  { hcode: '10996', name: 'รพ.พระยืน', level: HospitalLevel.F2 },
  { hcode: '10997', name: 'รพ.หนองเรือ', level: HospitalLevel.F2 },
  { hcode: '10998', name: 'รพ.ชุมแพ', level: HospitalLevel.M1 },
  { hcode: '10999', name: 'รพ.สีชมพู', level: HospitalLevel.F2 },
  { hcode: '11000', name: 'รพ.น้ำพอง', level: HospitalLevel.F2 },
  { hcode: '11001', name: 'รพ.อุบลรัตน์', level: HospitalLevel.F2 },
  { hcode: '11002', name: 'รพ.บ้านไผ่', level: HospitalLevel.F2 },
  { hcode: '11003', name: 'รพ.เปือยน้อย', level: HospitalLevel.F2 },
  { hcode: '11004', name: 'รพ.พล', level: HospitalLevel.F2 },
  { hcode: '11005', name: 'รพ.แวงใหญ่', level: HospitalLevel.F2 },
  { hcode: '11006', name: 'รพ.แวงน้อย', level: HospitalLevel.F2 },
  { hcode: '11007', name: 'รพ.หนองสองห้อง', level: HospitalLevel.F2 },
  { hcode: '11008', name: 'รพ.ภูเวียง', level: HospitalLevel.F2 },
  { hcode: '11009', name: 'รพ.มัญจาคีรี', level: HospitalLevel.F2 },
  { hcode: '11010', name: 'รพ.ชนบท', level: HospitalLevel.F2 },
  { hcode: '11011', name: 'รพ.เขาสวนกวาง', level: HospitalLevel.F2 },
  { hcode: '11012', name: 'รพ.ภูผาม่าน', level: HospitalLevel.F2 },
  { hcode: '11445', name: 'รพ.สมเด็จพระยุพราชกระนวน', level: HospitalLevel.F2 },
  { hcode: '12275', name: 'รพ.สิรินธร จังหวัดขอนแก่น', level: HospitalLevel.M1 },
  { hcode: '14132', name: 'รพ.ซำสูง', level: HospitalLevel.F2 },
  { hcode: '77649', name: 'รพ.หนองนาคำ', level: HospitalLevel.F2 },
  { hcode: '77650', name: 'รพ.เวียงเก่า', level: HospitalLevel.F2 },
  { hcode: '77651', name: 'รพ.โคกโพธิ์ไชย', level: HospitalLevel.F2 },
  { hcode: '77652', name: 'รพ.โนนศิลา', level: HospitalLevel.F2 },
];

export function getHospitalLevelConfig(level: HospitalLevel): HospitalLevelConfig {
  return HOSPITAL_LEVELS[level];
}
