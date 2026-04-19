import { AncRiskLevel } from '@/types/domain';
import { ANC_RISK_LEVEL_ORDER } from './anc-risk-rules';

export interface HospitalCapability {
  hcode: string;
  name: string;
  minGaWeeks: number;
  minFetalWeightG: number;
  maxRiskLevel: AncRiskLevel;
  referTo: string | null;
}

// Capability rules for the 26 Khon Kaen MOPH community hospitals
// (chwpart='40', hospital_type_id IN (5,6,7), CHAR_LENGTH(hospcode)=5).
// Source-of-truth hcodes match `src/config/hospitals.ts` KK_HOSPITALS.
//
// Capability tiers (clinical thresholds preserved from the previous
// authoritative table):
//   - Terminal A_S (no referTo): KK Regional (10670)
//   - M1 (large referral): สิรินธร (12275), ชุมแพ (10998) — GA>=32, FW>=1500
//   - F2 with broader scope: บ้านไผ่ (11002, GA>=34/1800), พล (11004, GA>=35/2000)
//   - F2 mid-tier: GA>=35, FW>=2000, HR2 max — refer to nearest A_S/M1
//   - F2 small: GA>=36, FW>=2200, HR1 max — refer to nearest mid-tier or M1
export const HOSPITAL_CAPABILITIES: HospitalCapability[] = [
  // Terminal A_S
  { hcode: '10670', name: 'รพ.ขอนแก่น', minGaWeeks: 0, minFetalWeightG: 0, maxRiskLevel: AncRiskLevel.HR3, referTo: null },
  // M1 referrals
  { hcode: '12275', name: 'รพ.สิรินธร จังหวัดขอนแก่น', minGaWeeks: 32, minFetalWeightG: 1500, maxRiskLevel: AncRiskLevel.HR3, referTo: '10670' },
  { hcode: '10998', name: 'รพ.ชุมแพ', minGaWeeks: 32, minFetalWeightG: 1500, maxRiskLevel: AncRiskLevel.HR3, referTo: '10670' },
  // F2 broader scope
  { hcode: '11002', name: 'รพ.บ้านไผ่', minGaWeeks: 34, minFetalWeightG: 1800, maxRiskLevel: AncRiskLevel.HR3, referTo: '10670' },
  { hcode: '11004', name: 'รพ.พล', minGaWeeks: 35, minFetalWeightG: 2000, maxRiskLevel: AncRiskLevel.HR3, referTo: '10670' },
  // F2 mid-tier (GA>=35, FW>=2000, HR2 max)
  { hcode: '10997', name: 'รพ.หนองเรือ', minGaWeeks: 35, minFetalWeightG: 2000, maxRiskLevel: AncRiskLevel.HR2, referTo: '12275' },
  { hcode: '10999', name: 'รพ.สีชมพู', minGaWeeks: 35, minFetalWeightG: 2000, maxRiskLevel: AncRiskLevel.HR2, referTo: '10998' },
  { hcode: '11000', name: 'รพ.น้ำพอง', minGaWeeks: 35, minFetalWeightG: 2000, maxRiskLevel: AncRiskLevel.HR2, referTo: '10670' },
  { hcode: '11008', name: 'รพ.ภูเวียง', minGaWeeks: 35, minFetalWeightG: 2000, maxRiskLevel: AncRiskLevel.HR2, referTo: '10998' },
  // F2 small (GA>=36, FW>=2200, HR1 max)
  { hcode: '10995', name: 'รพ.บ้านฝาง', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '11002' },
  { hcode: '10996', name: 'รพ.พระยืน', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '12275' },
  { hcode: '11001', name: 'รพ.อุบลรัตน์', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '11000' },
  { hcode: '11003', name: 'รพ.เปือยน้อย', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '11002' },
  { hcode: '11005', name: 'รพ.แวงใหญ่', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '11004' },
  { hcode: '11006', name: 'รพ.แวงน้อย', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '11004' },
  { hcode: '11007', name: 'รพ.หนองสองห้อง', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '11004' },
  { hcode: '11009', name: 'รพ.มัญจาคีรี', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '11004' },
  { hcode: '11010', name: 'รพ.ชนบท', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '11002' },
  { hcode: '11011', name: 'รพ.เขาสวนกวาง', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '11000' },
  { hcode: '11012', name: 'รพ.ภูผาม่าน', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '10998' },
  { hcode: '11445', name: 'รพ.สมเด็จพระยุพราชกระนวน', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '11000' },
  { hcode: '14132', name: 'รพ.ซำสูง', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '11000' },
  { hcode: '77649', name: 'รพ.หนองนาคำ', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '10998' },
  { hcode: '77650', name: 'รพ.เวียงเก่า', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '10998' },
  { hcode: '77651', name: 'รพ.โคกโพธิ์ไชย', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '11002' },
  { hcode: '77652', name: 'รพ.โนนศิลา', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '11004' },
];

export function getHospitalCapability(hcode: string): HospitalCapability | undefined {
  return HOSPITAL_CAPABILITIES.find((h) => h.hcode === hcode);
}

export function findCapableHospital(
  currentHcode: string,
  gaWeeks: number,
  fetalWeightG: number,
  riskLevel: AncRiskLevel,
): string | null {
  const current = getHospitalCapability(currentHcode);
  if (!current) return null;

  const exceedsGa = gaWeeks < current.minGaWeeks;
  const exceedsFw = fetalWeightG < current.minFetalWeightG;
  const exceedsRisk = ANC_RISK_LEVEL_ORDER[riskLevel] > ANC_RISK_LEVEL_ORDER[current.maxRiskLevel];

  if (exceedsGa || exceedsFw || exceedsRisk) {
    return current.referTo;
  }

  return null;
}
