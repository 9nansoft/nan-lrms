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

export const HOSPITAL_CAPABILITIES: HospitalCapability[] = [
  { hcode: '10670', name: 'รพ.ขอนแก่น', minGaWeeks: 0, minFetalWeightG: 0, maxRiskLevel: AncRiskLevel.HR3, referTo: null },
  { hcode: '10675', name: 'รพ.สิรินธร', minGaWeeks: 32, minFetalWeightG: 1500, maxRiskLevel: AncRiskLevel.HR3, referTo: '10670' },
  { hcode: '10674', name: 'รพ.บ้านไผ่', minGaWeeks: 34, minFetalWeightG: 1800, maxRiskLevel: AncRiskLevel.HR3, referTo: '10670' },
  { hcode: '10679', name: 'รพ.พล', minGaWeeks: 35, minFetalWeightG: 2000, maxRiskLevel: AncRiskLevel.HR3, referTo: '10670' },
  { hcode: '11446', name: 'รพ.ชุมแพ', minGaWeeks: 32, minFetalWeightG: 1500, maxRiskLevel: AncRiskLevel.HR3, referTo: '10670' },
  { hcode: '10998', name: 'รพ.ศรีนครินทร์', minGaWeeks: 0, minFetalWeightG: 0, maxRiskLevel: AncRiskLevel.HR3, referTo: null },
  { hcode: '10671', name: 'รพ.หนองเรือ', minGaWeeks: 35, minFetalWeightG: 2000, maxRiskLevel: AncRiskLevel.HR2, referTo: '10675' },
  { hcode: '10672', name: 'รพ.ชุมแพ(เดิม)', minGaWeeks: 35, minFetalWeightG: 2000, maxRiskLevel: AncRiskLevel.HR2, referTo: '11446' },
  { hcode: '10673', name: 'รพ.สีชมพู', minGaWeeks: 35, minFetalWeightG: 2000, maxRiskLevel: AncRiskLevel.HR2, referTo: '11446' },
  { hcode: '10676', name: 'รพ.น้ำพอง', minGaWeeks: 35, minFetalWeightG: 2000, maxRiskLevel: AncRiskLevel.HR2, referTo: '10670' },
  { hcode: '10677', name: 'รพ.อุบลรัตน์', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '10676' },
  { hcode: '10678', name: 'รพ.บ้านฝาง', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '10674' },
  { hcode: '10680', name: 'รพ.แวงใหญ่', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '10679' },
  { hcode: '10681', name: 'รพ.แวงน้อย', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '10679' },
  { hcode: '10682', name: 'รพ.หนองสองห้อง', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '10679' },
  { hcode: '10683', name: 'รพ.ภูเวียง', minGaWeeks: 35, minFetalWeightG: 2000, maxRiskLevel: AncRiskLevel.HR2, referTo: '11446' },
  { hcode: '10684', name: 'รพ.มัญจาคีรี', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '10679' },
  { hcode: '10685', name: 'รพ.ชนบท', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '10674' },
  { hcode: '10686', name: 'รพ.เขาสวนกวาง', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '10676' },
  { hcode: '10687', name: 'รพ.ภูผาม่าน', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '11446' },
  { hcode: '10688', name: 'รพ.ซำสูง', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '10676' },
  { hcode: '10689', name: 'รพ.โคกโพธิ์ไชย', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '10674' },
  { hcode: '10690', name: 'รพ.หนองนาคำ', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '11446' },
  { hcode: '11445', name: 'รพ.บ้านแฮด', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '10674' },
  { hcode: '10999', name: 'รพ.พระยืน', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '10675' },
  { hcode: '11000', name: 'รพ.เวียงเก่า', minGaWeeks: 36, minFetalWeightG: 2200, maxRiskLevel: AncRiskLevel.HR1, referTo: '11446' },
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
