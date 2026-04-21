// Profile catalog + evaluator coherence tests.
//
// The deterministic applyProfile() output is the "reference" clinical record —
// its values come from each profile's own bands, so it MUST pass that
// profile's evaluator with no errors. Any warning is acceptable (soft
// check), but errors indicate a bug in either the profile definition or
// the evaluator.

import { describe, it, expect } from 'vitest';
import {
  PROFILES,
  sampleProfile,
  sampleBand,
  sampleGrade,
  sampleGravida,
  coin,
  getProfileById,
} from '@/services/dev-simulation/profiles';
import {
  applyProfileToAnc,
  applyProfileToAncVisit,
  applyProfileToLabor,
  applyProfileToPartograph,
} from '@/services/dev-simulation/apply-profile';
import {
  evaluateAncEvent,
  evaluateLaborEvent,
  evaluatePartographEvent,
  findNarrativeInconsistencies,
} from '@/services/dev-simulation/evaluator';

describe('profile catalog', () => {
  it('has at least 15 profiles including the core clinical pictures', () => {
    const ids = PROFILES.map((p) => p.id);
    expect(ids).toContain('low_risk');
    expect(ids).toContain('preeclampsia_mild');
    expect(ids).toContain('preeclampsia_severe');
    expect(ids).toContain('gdm');
    expect(ids).toContain('anemia_mild');
    expect(ids).toContain('anemia_severe');
    expect(ids).toContain('thalassemia_disease');
    expect(ids).toContain('previous_csection');
    expect(ids.length).toBeGreaterThanOrEqual(15);
  });

  it('every profile has min ≤ max for all numeric bands', () => {
    for (const p of PROFILES) {
      expect(p.bpSystolic.min, `${p.id} bpSys`).toBeLessThanOrEqual(p.bpSystolic.max);
      expect(p.bpDiastolic.min, `${p.id} bpDia`).toBeLessThanOrEqual(p.bpDiastolic.max);
      expect(p.hbGDl.min, `${p.id} hb`).toBeLessThanOrEqual(p.hbGDl.max);
      expect(p.hctPct.min, `${p.id} hct`).toBeLessThanOrEqual(p.hctPct.max);
      expect(p.fetalHr.min, `${p.id} fhr`).toBeLessThanOrEqual(p.fetalHr.max);
      expect(p.heightCm.min, `${p.id} height`).toBeLessThanOrEqual(p.heightCm.max);
      expect(p.ageYears.min, `${p.id} age`).toBeLessThanOrEqual(p.ageYears.max);
    }
  });

  it('urine-grade distributions include only valid grades and sum to a positive weight', () => {
    const validGrades = new Set(['-', 'trace', '+', '++', '+++']);
    for (const p of PROFILES) {
      for (const key of Object.keys(p.urineProtein)) {
        expect(validGrades.has(key), `${p.id} urineProtein grade ${key}`).toBe(true);
      }
      const protSum = Object.values(p.urineProtein).reduce((a, b) => a + b, 0);
      expect(protSum, `${p.id} urineProtein weights`).toBeGreaterThan(0);
    }
  });

  it('preeclampsia_severe mandates high BP + proteinuria-heavy distribution', () => {
    const p = getProfileById('preeclampsia_severe')!;
    expect(p.bpSystolic.min).toBeGreaterThanOrEqual(155);
    expect(p.bpDiastolic.min).toBeGreaterThanOrEqual(95);
    // proteinuria "-" and "trace" must be impossible under severe preeclampsia
    expect(p.urineProtein['-']).toBe(0);
    expect(p.urineProtein['trace']).toBe(0);
  });

  it('gdm profile guarantees abnormal OGTT', () => {
    const p = getProfileById('gdm')!;
    expect(p.ogttAbnormalProb).toBe(1);
  });

  it('rh_negative profile guarantees Rh−', () => {
    const p = getProfileById('rh_negative')!;
    expect(p.rhNegProb).toBe(1);
  });

  it('sampleProfile returns a profile from the catalog', () => {
    for (let i = 0; i < 20; i++) {
      const p = sampleProfile();
      expect(PROFILES).toContain(p);
    }
  });

  it('sampleBand returns values within the band', () => {
    const p = getProfileById('preeclampsia_severe')!;
    for (let i = 0; i < 30; i++) {
      const v = sampleBand(p.bpSystolic);
      expect(v).toBeGreaterThanOrEqual(p.bpSystolic.min);
      expect(v).toBeLessThanOrEqual(p.bpSystolic.max);
    }
  });

  it('sampleGrade returns a valid urine grade key', () => {
    const p = getProfileById('low_risk')!;
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(sampleGrade(p.urineProtein));
    for (const g of seen) expect(['-', 'trace', '+', '++', '+++']).toContain(g);
  });

  it('sampleGravida returns an integer ≥ 1 for every profile', () => {
    for (const p of PROFILES) {
      for (let i = 0; i < 10; i++) {
        const g = sampleGravida(p);
        expect(g).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(g)).toBe(true);
      }
    }
  });

  it('coin is a proper Bernoulli trial', () => {
    // 1000 trials at p=0.5 should land between 400-600
    let hits = 0;
    for (let i = 0; i < 1000; i++) if (coin(0.5)) hits += 1;
    expect(hits).toBeGreaterThan(400);
    expect(hits).toBeLessThan(600);
  });
});

describe('applyProfile deterministic output passes evaluator', () => {
  // 20 repeats per profile — randomness must always land inside own bands.
  for (const profile of PROFILES) {
    it(`${profile.id}: 20 labor events all pass`, () => {
      for (let i = 0; i < 20; i++) {
        const event = applyProfileToLabor({
          profile,
          name: 'นางทดลอง ระบบ',
          hn: '000012345',
          an: '690001234',
          cid: '1234567890123',
          gaWeeks: 38,
          gravida: 2,
          ancCount: 5,
          admitIso: new Date().toISOString(),
        });
        const r = evaluateLaborEvent(profile, event);
        expect(r.errors, `${profile.id} labor errors: ${r.errors.join('; ')}`).toEqual([]);
      }
    });

    it(`${profile.id}: 10 ANC events all pass`, () => {
      for (let i = 0; i < 10; i++) {
        const gaWeeks = 24 + (i % 14);
        // Profile-appropriate gravida (e.g., grand_multipara expects ≥5).
        const gravida = sampleGravida(profile);
        const visits = Array.from({ length: 3 }, (_, k) =>
          applyProfileToAncVisit(profile, Math.max(8, gaWeeks - 6 + k * 3), k + 1, new Date().toISOString()),
        );
        const anc = applyProfileToAnc({
          profile,
          name: 'นางทดลอง ระบบ',
          hn: '000012345',
          cid: '1234567890123',
          birthday: '1995-04-12',
          gravida,
          lmpIso: new Date(Date.now() - gaWeeks * 7 * 86400_000).toISOString(),
          edcIso: new Date(Date.now() + (40 - gaWeeks) * 7 * 86400_000).toISOString(),
          changwatCode: '40',
          amphurCode: '01',
          visits,
        });
        const r = evaluateAncEvent(profile, anc);
        expect(r.errors, `${profile.id} anc errors: ${r.errors.join('; ')}`).toEqual([]);
      }
    });

    it(`${profile.id}: partograph observations at hour 0..5 all pass`, () => {
      for (let hour = 0; hour <= 5; hour++) {
        const obs = applyProfileToPartograph({
          profile,
          an: '690001234',
          externalObservationId: `OBS-test-${hour}`,
          hourNo: hour,
          observeIso: new Date().toISOString(),
        });
        const r = evaluatePartographEvent(profile, obs);
        expect(r.errors, `${profile.id} partograph h${hour} errors: ${r.errors.join('; ')}`).toEqual([]);
      }
    });
  }
});

describe('evaluator catches real violations', () => {
  const severe = getProfileById('preeclampsia_severe')!;
  const lowRisk = getProfileById('low_risk')!;

  it('rejects preeclampsia_severe with low BP', () => {
    const event = applyProfileToLabor({
      profile: severe,
      name: 'X', hn: '000012345', an: '690001234', cid: '1234567890123',
      gaWeeks: 38, gravida: 1, ancCount: 4, admitIso: new Date().toISOString(),
    });
    // Tamper with ANC visit BP to 120/70 — under severe profile should flag error.
    const anc = applyProfileToAnc({
      profile: severe,
      name: 'X', hn: '000012345', cid: '1234567890123',
      birthday: '1995-01-01', gravida: 1,
      lmpIso: new Date(Date.now() - 32 * 7 * 86400_000).toISOString(),
      edcIso: new Date(Date.now() + 8 * 7 * 86400_000).toISOString(),
      changwatCode: '40', amphurCode: '01',
      visits: [{
        date: '2026-04-01', visitNumber: 1, gaWeeks: 32,
        fundalHeightCm: 31, weightKg: 62,
        bpSystolic: 120, bpDiastolic: 70,  // — way under severe profile
        fetalHr: 140, presentation: 'CEPHALIC', engagement: 'FLOATING',
        urineProtein: '+', urineGlucose: '-', hbGDl: 11, hctPct: 34,
        ttDoseNo: 2, ironFolicGiven: true, calciumGiven: true,
        dangerSigns: [], fetalMovementOk: true,
      }],
    });
    const r = evaluateAncEvent(severe, anc);
    expect(r.valid).toBe(false);
    expect(r.errors.join('; ')).toMatch(/preeclampsia_severe requires BP/);
    // Silence unused-variable lint on event.
    expect(event.labor_status).toBe('ACTIVE');
  });

  it('rejects impossible GA', () => {
    const event = applyProfileToLabor({
      profile: lowRisk,
      name: 'X', hn: '000012345', an: '690001234', cid: '1234567890123',
      gaWeeks: 38, gravida: 1, ancCount: 4, admitIso: new Date().toISOString(),
    });
    event.ga_weeks = 55; // impossible
    const r = evaluateLaborEvent(lowRisk, event);
    expect(r.valid).toBe(false);
    expect(r.errors.join('; ')).toMatch(/GA 55/);
  });

  it('rejects GTPAL sum exceeding previous pregnancies', () => {
    const anc = applyProfileToAnc({
      profile: lowRisk,
      name: 'X', hn: '000012345', cid: '1234567890123',
      birthday: '1995-01-01', gravida: 1,
      lmpIso: new Date(Date.now() - 20 * 7 * 86400_000).toISOString(),
      edcIso: new Date(Date.now() + 20 * 7 * 86400_000).toISOString(),
      changwatCode: '40', amphurCode: '01',
      visits: [],
    });
    anc.pregNo = 1;
    anc.termBirths = 2;  // impossible — first pregnancy
    anc.pretermBirths = 0;
    anc.abortions = 0;
    const r = evaluateAncEvent(lowRisk, anc);
    expect(r.valid).toBe(false);
    expect(r.errors.join('; ')).toMatch(/GTPAL sum/);
  });

  it('rejects impossible partograph values', () => {
    const obs = applyProfileToPartograph({
      profile: lowRisk,
      an: '690001234', externalObservationId: 'OBS-x', hourNo: 1,
      observeIso: new Date().toISOString(),
    });
    obs.fetalHeartRate = 30;  // out of biological range
    const r = evaluatePartographEvent(lowRisk, obs);
    expect(r.valid).toBe(false);
    expect(r.errors.join('; ')).toMatch(/FHR 30/);
  });
});

describe('narrative consistency', () => {
  it('flags orphan narrative danger-sign claims', () => {
    const issues = findNarrativeInconsistencies(
      'Patient reports severe headache and blurred vision. BP 162/102.',
      [], // dangerSigns array is empty — narrative has two claims
    );
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });

  it('accepts matching narrative + dangerSigns', () => {
    const issues = findNarrativeInconsistencies(
      'Severe headache reported.',
      ['severe_headache'],
    );
    expect(issues).toEqual([]);
  });

  it('accepts narrative with no danger-sign keywords', () => {
    const issues = findNarrativeInconsistencies('Routine ANC visit, all within normal limits.', null);
    expect(issues).toEqual([]);
  });
});
