// tests/unit/types/domain-enums.test.ts
import { describe, it, expect } from 'vitest';
import {
  CareStage,
  AncRiskLevel,
  ReferralStatus,
  UrgencyLevel,
} from '@/types/domain';

describe('New Domain Enums', () => {
  describe('CareStage', () => {
    it('has all 4 stages', () => {
      expect(CareStage.PREGNANCY).toBe('PREGNANCY');
      expect(CareStage.LABOR).toBe('LABOR');
      expect(CareStage.DELIVERED).toBe('DELIVERED');
      expect(CareStage.POSTPARTUM).toBe('POSTPARTUM');
    });
  });

  describe('AncRiskLevel', () => {
    it('has 4 tiers: LOW, HR1, HR2, HR3', () => {
      expect(AncRiskLevel.LOW).toBe('LOW');
      expect(AncRiskLevel.HR1).toBe('HR1');
      expect(AncRiskLevel.HR2).toBe('HR2');
      expect(AncRiskLevel.HR3).toBe('HR3');
    });
  });

  describe('ReferralStatus', () => {
    it('has all 5 statuses', () => {
      expect(ReferralStatus.INITIATED).toBe('INITIATED');
      expect(ReferralStatus.ACCEPTED).toBe('ACCEPTED');
      expect(ReferralStatus.REJECTED).toBe('REJECTED');
      expect(ReferralStatus.IN_TRANSIT).toBe('IN_TRANSIT');
      expect(ReferralStatus.ARRIVED).toBe('ARRIVED');
    });
  });

  describe('UrgencyLevel', () => {
    it('has 3 levels', () => {
      expect(UrgencyLevel.ROUTINE).toBe('ROUTINE');
      expect(UrgencyLevel.URGENT).toBe('URGENT');
      expect(UrgencyLevel.EMERGENCY).toBe('EMERGENCY');
    });
  });
});
