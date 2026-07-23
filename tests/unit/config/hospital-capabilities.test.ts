import { describe, it, expect } from 'vitest';
import {
  HOSPITAL_CAPABILITIES,
  findCapableHospital,
  getHospitalCapability,
} from '@/config/hospital-capabilities';
import { AncRiskLevel } from '@/types/domain';

describe('Hospital Capabilities Configuration', () => {
  it('has capabilities for key hospitals', () => {
    const kkHosp = HOSPITAL_CAPABILITIES.find((h) => h.hcode === '10716');
    expect(kkHosp).toBeDefined();
    expect(kkHosp!.name).toBe('รพ.น่าน');
    expect(kkHosp!.referTo).toBeNull();

    // รพ.สิรินธร — MOPH hcode 12275, M1 referral
    const sirin = HOSPITAL_CAPABILITIES.find((h) => h.hcode === '12275');
    expect(sirin).toBeDefined();
    expect(sirin!.minGaWeeks).toBe(32);
    expect(sirin!.minFetalWeightG).toBe(1500);
  });

  it('รพ.พล has GA>=35, FW>=2000, refers to รพ.ขอนแก่น', () => {
    // รพ.พล — MOPH hcode 11004
    const phon = HOSPITAL_CAPABILITIES.find((h) => h.hcode === '11004');
    expect(phon).toBeDefined();
    expect(phon!.minGaWeeks).toBe(35);
    expect(phon!.minFetalWeightG).toBe(2000);
    expect(phon!.referTo).toBe('10670');
  });

  it('รพ.บ้านไผ่ has GA>=34, FW>=1800', () => {
    // รพ.บ้านไผ่ — MOPH hcode 11002
    const banphai = HOSPITAL_CAPABILITIES.find((h) => h.hcode === '11002');
    expect(banphai).toBeDefined();
    expect(banphai!.minGaWeeks).toBe(34);
    expect(banphai!.minFetalWeightG).toBe(1800);
  });

  it('has 26 hospitals total', () => {
    expect(HOSPITAL_CAPABILITIES.length).toBe(26);
  });

  describe('getHospitalCapability', () => {
    it('returns capability for known hospital', () => {
      const cap = getHospitalCapability('10716');
      expect(cap).toBeDefined();
      expect(cap!.name).toBe('รพ.น่าน');
    });

    it('returns undefined for unknown hospital', () => {
      expect(getHospitalCapability('99999')).toBeUndefined();
    });
  });

  describe('findCapableHospital', () => {
    it('returns null for terminal hospital (รพ.น่าน)', () => {
      const result = findCapableHospital('10716', 28, 1200, AncRiskLevel.HR3);
      expect(result).toBeNull();
    });

    it('returns referTo when GA below minimum', () => {
      // รพ.พล (11004) — GA<35 triggers refer to KK Regional (10670)
      const result = findCapableHospital('11004', 30, 2500, AncRiskLevel.LOW);
      expect(result).toBe('10670');
    });

    it('returns referTo when fetal weight below minimum', () => {
      // รพ.พล (11004) — FW<2000 triggers refer to KK Regional (10670)
      const result = findCapableHospital('11004', 37, 1500, AncRiskLevel.LOW);
      expect(result).toBe('10670');
    });

    it('returns null when case is within capability', () => {
      const result = findCapableHospital('11004', 37, 2500, AncRiskLevel.LOW);
      expect(result).toBeNull();
    });

    it('returns null for unknown hospital', () => {
      const result = findCapableHospital('99999', 30, 1500, AncRiskLevel.HR3);
      expect(result).toBeNull();
    });

    it('returns referTo when risk exceeds maxRiskLevel', () => {
      // รพ.อุบลรัตน์ (11001) maxRiskLevel=HR1, patient is HR2 — refer to น้ำพอง (11000)
      const result = findCapableHospital('11001', 37, 2500, AncRiskLevel.HR2);
      expect(result).toBe('11000');
    });
  });
});
