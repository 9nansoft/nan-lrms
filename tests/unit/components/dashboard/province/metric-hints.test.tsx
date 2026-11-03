import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LABOR_TILE_HINTS } from '@/components/dashboard/province/metric-hints';
import { RISK_LEVELS } from '@/config/risk-levels';
import { RiskLevel } from '@/types/domain';

const text = (key: keyof typeof LABOR_TILE_HINTS) =>
  renderToStaticMarkup(<>{LABOR_TILE_HINTS[key].body}</>).replace(/<[^>]+>/g, '');

describe('normal-mode labour tile hints (I1/I3)', () => {
  it('no developer jargon: no labor_status, no file paths', () => {
    for (const key of Object.keys(LABOR_TILE_HINTS) as Array<keyof typeof LABOR_TILE_HINTS>) {
      const t = text(key);
      expect(t).not.toMatch(/labor_status|ACTIVE\b|src\/|\.ts\b/);
    }
  });
  it('states the real rule: not-yet-discharged', () => {
    expect(text('active')).toContain('ยังไม่จำหน่ายจากห้องคลอด');
    expect(text('high')).toContain('ยังไม่จำหน่ายจากห้องคลอด');
  });
  it('thresholds come from RISK_LEVELS', () => {
    const hi = RISK_LEVELS[RiskLevel.HIGH].minScore;
    const med = RISK_LEVELS[RiskLevel.MEDIUM].minScore;
    expect(text('high')).toContain(`เกณฑ์ CPD ของระบบ (สูง ≥ ${hi}, ปานกลาง ≥ ${med})`);
    expect(text('medium')).toContain(`สูง ≥ ${hi}, ปานกลาง ≥ ${med}`);
  });
  it('new-admission sub-line says exactly what it counts', () => {
    for (const key of ['high', 'medium', 'low'] as const) {
      const t = text(key);
      expect(t).toContain('ตามคะแนน CPD ล่าสุด');
      expect(t).not.toContain('ขณะนี้');
      expect(t).toContain('รวมรายที่คลอดหรือจำหน่ายแล้ว');
      expect(t).toContain('รายที่ยังไม่มีคะแนน');
    }
    expect(text('active')).toContain('รวมรายที่คลอดหรือจำหน่ายแล้ว');
  });
});
