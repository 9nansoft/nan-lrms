import { describe, it, expect } from 'vitest';
import {
  HOSPITAL_CAPABILITIES,
  findCapableHospital,
  getHospitalCapability,
} from '@/config/hospital-capabilities';
import { AncRiskLevel } from '@/types/domain';

describe('Hospital Capabilities Configuration', () => {
  it('has capabilities for key hospitals', () => {
    const kkHosp = HOSPITAL_CAPABILITIES.find((h) => h.hcode === '10670');
    expect(kkHosp).toBeDefined();
    expect(kkHosp!.name).toBe('รพ.ขอนแก่น');
    expect(kkHosp!.referTo).toBeNull();

    const sirin = HOSPITAL_CAPABILITIES.find((h) => h.hcode === '10675');
    expect(sirin).toBeDefined();
    expect(sirin!.minGaWeeks).toBe(32);
    expect(sirin!.minFetalWeightG).toBe(1500);
  });

  it('รพ.พล has GA>=35, FW>=2000, refers to รพ.ขอนแก่น', () => {
    const phon = HOSPITAL_CAPABILITIES.find((h) => h.hcode === '10679');
    expect(phon).toBeDefined();
    expect(phon!.minGaWeeks).toBe(35);
    expect(phon!.minFetalWeightG).toBe(2000);
    expect(phon!.referTo).toBe('10670');
  });

  it('รพ.บ้านไผ่ has GA>=34, FW>=1800', () => {
    const banphai = HOSPITAL_CAPABILITIES.find((h) => h.hcode === '10674');
    expect(banphai).toBeDefined();
    expect(banphai!.minGaWeeks).toBe(34);
    expect(banphai!.minFetalWeightG).toBe(1800);
  });

  it('has 26 hospitals total', () => {
    expect(HOSPITAL_CAPABILITIES.length).toBe(26);
  });

  describe('getHospitalCapability', () => {
    it('returns capability for known hospital', () => {
      const cap = getHospitalCapability('10670');
      expect(cap).toBeDefined();
      expect(cap!.name).toBe('รพ.ขอนแก่น');
    });

    it('returns undefined for unknown hospital', () => {
      expect(getHospitalCapability('99999')).toBeUndefined();
    });
  });

  describe('findCapableHospital', () => {
    it('returns null for terminal hospital (รพ.ขอนแก่น)', () => {
      const result = findCapableHospital('10670', 28, 1200, AncRiskLevel.HR3);
      expect(result).toBeNull();
    });

    it('returns referTo when GA below minimum', () => {
      const result = findCapableHospital('10679', 30, 2500, AncRiskLevel.LOW);
      expect(result).toBe('10670');
    });

    it('returns referTo when fetal weight below minimum', () => {
      const result = findCapableHospital('10679', 37, 1500, AncRiskLevel.LOW);
      expect(result).toBe('10670');
    });

    it('returns null when case is within capability', () => {
      const result = findCapableHospital('10679', 37, 2500, AncRiskLevel.LOW);
      expect(result).toBeNull();
    });

    it('returns null for unknown hospital', () => {
      const result = findCapableHospital('99999', 30, 1500, AncRiskLevel.HR3);
      expect(result).toBeNull();
    });

    it('returns referTo when risk exceeds maxRiskLevel', () => {
      // รพ.อุบลรัตน์ maxRiskLevel=HR1, patient is HR2
      const result = findCapableHospital('10677', 37, 2500, AncRiskLevel.HR2);
      expect(result).toBe('10676');
    });
  });
});
