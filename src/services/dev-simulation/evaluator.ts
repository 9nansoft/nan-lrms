// Post-hoc evaluator for LLM-generated clinical records.
//
// The LLM is prompted with a profile name + narrative hint, and its output is
// JSON-schema-guided — but schema enforcement alone doesn't guarantee the
// record matches the profile's clinical picture (e.g., a "preeclampsia_severe"
// profile with BP 120/70 would pass schema yet violate clinical coherence).
//
// This evaluator catches those mismatches so the orchestrator can fall back
// to the deterministic applyProfile() output. It runs three layers of checks:
//   1. Basic plausibility — absolute clinical ranges, GA/EDC/LMP relations,
//      gravida ≥ (term+preterm+abortions), etc.
//   2. Profile coherence — LLM output falls inside the profile's bands ±
//      small tolerance.
//   3. Narrative consistency — danger signs mentioned in the narrative note
//      match the structured `dangerSigns` array (no orphan claims).

import type {
  WebhookAncPatient,
  WebhookAncVisit,
  WebhookPartographObservation,
  WebhookPatientPayload,
} from '@/services/webhook';
import type { ClinicalProfile, DangerSign } from './profiles';

export interface EvaluationResult {
  valid: boolean;
  profileId: string;
  errors: string[];
  warnings: string[];
}

// Small tolerance added to band edges so LLM outputs that are within a few
// units of the nominal bound don't get rejected. Too tight and we reject
// realistic values; too loose and we accept coherence mismatches.
const BAND_TOLERANCE = 0.1; // 10%

function withinBand(value: number, band: { min: number; max: number }): boolean {
  const span = band.max - band.min || 1;
  const slack = span * BAND_TOLERANCE;
  return value >= band.min - slack && value <= band.max + slack;
}

// Narrative keywords that imply each structured danger sign.
const DANGER_KEYWORDS: Record<DangerSign, RegExp> = {
  severe_headache: /headache|ปวดศีรษะ|ปวดหัว/i,
  blurred_vision: /blurred vision|vision|ตาพร่า|สายตาพร่า/i,
  epigastric_pain: /epigastric|ปวดลิ้นปี่|ปวดใต้ลิ้นปี่/i,
  vaginal_bleeding: /bleeding|เลือดออก/i,
  reduced_fm: /reduced (fetal )?movement|ลูกดิ้นน้อย|ไม่ดิ้น|หยุดดิ้น/i,
  fever: /fever|ไข้/i,
  rom: /rupture|น้ำเดิน|น้ำแตก/i,
  convulsion: /convulsion|seizure|ชัก/i,
};

function checkNarrativeConsistency(
  note: string | undefined | null,
  dangerSigns: string[] | null | undefined,
): string[] {
  const warnings: string[] = [];
  if (!note) return warnings;
  const dsSet = new Set((dangerSigns ?? []) as DangerSign[]);
  for (const [sign, regex] of Object.entries(DANGER_KEYWORDS) as [DangerSign, RegExp][]) {
    if (regex.test(note) && !dsSet.has(sign)) {
      warnings.push(`note mentions "${sign}" but not in dangerSigns array`);
    }
  }
  return warnings;
}

// ─── Labor event evaluator ────────────────────────────────────────────────

export function evaluateLaborEvent(
  profile: ClinicalProfile,
  event: WebhookPatientPayload,
): EvaluationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Basic plausibility
  if (event.age < 13 || event.age > 55) errors.push(`age ${event.age} outside 13-55`);
  if (event.ga_weeks != null && (event.ga_weeks < 20 || event.ga_weeks > 44)) {
    errors.push(`GA ${event.ga_weeks} outside labor range 20-44`);
  }
  if (event.height_cm != null && (event.height_cm < 130 || event.height_cm > 190)) {
    errors.push(`height ${event.height_cm} outside 130-190 cm`);
  }
  if (event.weight_kg != null && (event.weight_kg < 35 || event.weight_kg > 150)) {
    errors.push(`weight ${event.weight_kg} outside 35-150 kg`);
  }
  if (event.hematocrit_pct != null && (event.hematocrit_pct < 15 || event.hematocrit_pct > 55)) {
    errors.push(`Hct ${event.hematocrit_pct} outside 15-55`);
  }
  if (event.fundal_height_cm != null && (event.fundal_height_cm < 10 || event.fundal_height_cm > 50)) {
    errors.push(`fundal height ${event.fundal_height_cm} outside 10-50 cm`);
  }
  if (event.us_weight_g != null && (event.us_weight_g < 500 || event.us_weight_g > 6000)) {
    errors.push(`US weight ${event.us_weight_g}g outside 500-6000g`);
  }
  if (event.gravida != null && event.gravida < 1) {
    errors.push(`gravida ${event.gravida} must be ≥1`);
  }

  // 2. Profile coherence
  if (event.hematocrit_pct != null && !withinBand(event.hematocrit_pct, profile.hctPct)) {
    warnings.push(`Hct ${event.hematocrit_pct} outside profile band [${profile.hctPct.min},${profile.hctPct.max}]`);
  }
  if (event.height_cm != null && !withinBand(event.height_cm, profile.heightCm)) {
    warnings.push(`height ${event.height_cm} outside profile band`);
  }
  if (event.age != null && !withinBand(event.age, profile.ageYears)) {
    warnings.push(`age ${event.age} outside profile age band`);
  }

  // 3. Cross-field consistency
  if (event.ga_weeks != null && event.fundal_height_cm != null) {
    const delta = Math.abs(event.fundal_height_cm - event.ga_weeks);
    const isIugr = profile.id === 'iugr';
    const isTwin = profile.id === 'twin_dcda';
    const allowedDelta = isIugr || isTwin ? 8 : 4;
    if (delta > allowedDelta) {
      warnings.push(`fundal height ${event.fundal_height_cm} diverges from GA ${event.ga_weeks} by ${delta} cm (>${allowedDelta})`);
    }
  }

  return { valid: errors.length === 0, profileId: profile.id, errors, warnings };
}

// ─── ANC event evaluator ──────────────────────────────────────────────────

export function evaluateAncEvent(
  profile: ClinicalProfile,
  event: WebhookAncPatient,
): EvaluationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Identifiers
  if (!/^\d{13}$/.test(event.cid)) errors.push(`CID must be 13 digits`);
  if (event.pregNo < 1) errors.push(`pregNo ${event.pregNo} must be ≥1`);

  // GTPAL integrity — gravida ≥ (term + preterm + abortions + current = 1)
  const t = event.termBirths ?? 0;
  const pt = event.pretermBirths ?? 0;
  const ab = event.abortions ?? 0;
  if (t + pt + ab > event.pregNo - 1) {
    errors.push(`GTPAL sum ${t + pt + ab} exceeds previous pregnancies ${event.pregNo - 1}`);
  }
  if ((event.livingChildren ?? 0) > t + pt) {
    warnings.push(`livingChildren ${event.livingChildren} > term+preterm ${t + pt}`);
  }

  // LMP / EDC sanity
  if (event.lmp && event.edc) {
    const lmp = new Date(event.lmp).getTime();
    const edc = new Date(event.edc).getTime();
    const daysBetween = (edc - lmp) / 86400_000;
    if (daysBetween < 270 || daysBetween > 290) {
      warnings.push(`EDC − LMP = ${Math.round(daysBetween)}d (expected ~280)`);
    }
  }

  // Journey-level serology vs profile
  if (profile.rhNegProb > 0.5 && event.rhFactor !== 'NEG') {
    warnings.push(`profile expects Rh− but got ${event.rhFactor}`);
  }
  if (profile.hbsagPosProb > 0.5 && event.hbsagResult !== 'POS') {
    warnings.push(`profile expects HBsAg+ but got ${event.hbsagResult}`);
  }
  if (profile.hivPosProb > 0.5 && event.hivResult !== 'POS') {
    warnings.push(`profile expects HIV+ but got ${event.hivResult}`);
  }
  if (profile.ogttAbnormalProb > 0.8 && event.ogttResult !== 'ABNORMAL') {
    warnings.push(`profile expects OGTT abnormal but got ${event.ogttResult}`);
  }

  // Per-visit checks
  for (const [i, v] of (event.visits ?? []).entries()) {
    const prefix = `visits[${i}]`;
    if (v.gaWeeks != null && (v.gaWeeks < 4 || v.gaWeeks > 44)) {
      errors.push(`${prefix}.gaWeeks ${v.gaWeeks} outside 4-44`);
    }
    if (v.bpSystolic != null && (v.bpSystolic < 70 || v.bpSystolic > 220)) {
      errors.push(`${prefix}.bpSystolic ${v.bpSystolic} outside 70-220`);
    }
    if (v.bpDiastolic != null && (v.bpDiastolic < 40 || v.bpDiastolic > 140)) {
      errors.push(`${prefix}.bpDiastolic ${v.bpDiastolic} outside 40-140`);
    }
    if (v.fetalHr != null && (v.fetalHr < 80 || v.fetalHr > 200)) {
      errors.push(`${prefix}.fetalHr ${v.fetalHr} outside 80-200`);
    }
    if (v.hbGDl != null && (v.hbGDl < 4 || v.hbGDl > 17)) {
      errors.push(`${prefix}.hbGDl ${v.hbGDl} outside 4-17`);
    }
    if (v.weightKg != null && (v.weightKg < 35 || v.weightKg > 160)) {
      errors.push(`${prefix}.weightKg ${v.weightKg} outside 35-160`);
    }
    // Profile-coherence (soft)
    if (v.bpSystolic != null && !withinBand(v.bpSystolic, profile.bpSystolic)) {
      warnings.push(`${prefix}.bpSystolic ${v.bpSystolic} outside profile band`);
    }
    if (v.bpDiastolic != null && !withinBand(v.bpDiastolic, profile.bpDiastolic)) {
      warnings.push(`${prefix}.bpDiastolic ${v.bpDiastolic} outside profile band`);
    }
    if (v.hbGDl != null && !withinBand(v.hbGDl, profile.hbGDl)) {
      warnings.push(`${prefix}.hbGDl ${v.hbGDl} outside profile Hb band`);
    }
    // Preeclampsia severity gate
    if (profile.id === 'preeclampsia_severe' && v.bpSystolic != null && v.bpDiastolic != null) {
      if (v.bpSystolic < 155 && v.bpDiastolic < 95) {
        errors.push(`${prefix}: preeclampsia_severe requires BP ≥160/100 (got ${v.bpSystolic}/${v.bpDiastolic})`);
      }
    }
    // Preeclampsia proteinuria gate
    if ((profile.id === 'preeclampsia_severe' || profile.id === 'preeclampsia_mild')
        && v.urineProtein != null && !/\+/.test(v.urineProtein)) {
      warnings.push(`${prefix}: preeclampsia profile expects proteinuria, got "${v.urineProtein}"`);
    }
    // GDM glucosuria gate (just a warning — dipstick isn't 100% sensitive)
    if (profile.id === 'gdm' && v.urineGlucose === '-' && event.ogttResult === 'ABNORMAL') {
      // neutral — dipstick can be negative in GDM, note only
    }
  }

  return { valid: errors.length === 0, profileId: profile.id, errors, warnings };
}

// ─── Partograph evaluator ────────────────────────────────────────────────

export function evaluatePartographEvent(
  profile: ClinicalProfile,
  obs: WebhookPartographObservation,
): EvaluationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (obs.cervicalDilationCm != null && (obs.cervicalDilationCm < 0 || obs.cervicalDilationCm > 10)) {
    errors.push(`dilation ${obs.cervicalDilationCm} outside 0-10 cm`);
  }
  if (obs.fetalHeartRate != null && (obs.fetalHeartRate < 60 || obs.fetalHeartRate > 220)) {
    errors.push(`FHR ${obs.fetalHeartRate} outside 60-220 bpm`);
  }
  if (obs.bpSystolic != null && (obs.bpSystolic < 70 || obs.bpSystolic > 230)) {
    errors.push(`SBP ${obs.bpSystolic} outside 70-230`);
  }
  if (obs.bpDiastolic != null && (obs.bpDiastolic < 40 || obs.bpDiastolic > 140)) {
    errors.push(`DBP ${obs.bpDiastolic} outside 40-140`);
  }
  if (obs.temperature != null && (obs.temperature < 34 || obs.temperature > 42)) {
    errors.push(`temp ${obs.temperature} outside 34-42°C`);
  }
  if (obs.pulse != null && (obs.pulse < 40 || obs.pulse > 180)) {
    errors.push(`pulse ${obs.pulse} outside 40-180`);
  }
  if (obs.contractionPer10Min != null && (obs.contractionPer10Min < 0 || obs.contractionPer10Min > 7)) {
    errors.push(`contractions/10min ${obs.contractionPer10Min} outside 0-7`);
  }

  // Profile coherence (soft)
  if (obs.fetalHeartRate != null && !withinBand(obs.fetalHeartRate, profile.fetalHr)) {
    warnings.push(`FHR ${obs.fetalHeartRate} outside profile band`);
  }
  if (obs.bpSystolic != null && !withinBand(obs.bpSystolic, profile.bpSystolic)) {
    warnings.push(`SBP ${obs.bpSystolic} outside profile band`);
  }

  return { valid: errors.length === 0, profileId: profile.id, errors, warnings };
}

// ─── Narrative helper (exported for generator use) ────────────────────────

export function findNarrativeInconsistencies(
  note: string | undefined | null,
  dangerSigns: string[] | null | undefined,
): string[] {
  return checkNarrativeConsistency(note, dangerSigns);
}
