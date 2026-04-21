// Event generators — produce realistic webhook-shaped events using a 3-tier
// pipeline:
//
//   Tier 3 (planner)   → per-hospital shift plan decides which profile + name
//                         to use for each event (narrative coherence).
//   Tier 2 (LLM JSON)  → Gemma-4 fills the full clinical record under a
//                         guided-JSON schema bounded by the profile's bands.
//   Tier 1 (profiles)  → deterministic applyProfile() fills any remaining
//                         fields and acts as a fallback when the LLM misfires.
//
// Evaluator validates every LLM payload before acceptance. On any error we
// swap in the deterministic output silently and log the rejection with the
// profile id — you'll see these in recentEvents as "llm_fallback: <reason>".
// MVP still supports labor / anc / referral / referral_update / partograph.

import { llmChat, llmJson } from '@/lib/llm-client';
import { logger } from '@/lib/logger';
import type {
  WebhookPatientPayload,
  WebhookAncPatient,
  WebhookReferralCreatePayload,
  WebhookReferralUpdatePayload,
  WebhookPartographPayload,
  WebhookPartographObservation,
} from '@/services/webhook';
import {
  addPatient,
  addAdmission,
  addReferral,
  findExistingAncPatient,
  graduateToLabor,
  pickRecentAdmission,
  pickRecentReferralForUpdate,
  incPartographHour,
  advanceReferralStatus,
  type PooledPatient,
} from './pool';
import {
  PROFILE_IDS,
  getProfileById,
  profilePromptHint,
  sampleProfile,
  type ClinicalProfile,
} from './profiles';
import {
  applyProfileToLabor,
  applyProfileToAnc,
  applyProfileToAncVisit,
  applyProfileToPartograph,
} from './apply-profile';
import {
  evaluateAncEvent,
  evaluateLaborEvent,
  evaluatePartographEvent,
  findNarrativeInconsistencies,
  type EvaluationResult,
} from './evaluator';
import {
  consumeNextPlannedEvent,
  profileForPlannedEvent,
  type PlannedEvent,
} from './planner';
import type { SimEventType } from './types';

export interface HospitalContext {
  hcode: string;
  name: string;
}

interface PatientNarrative {
  name: string;
  note: string;
}
interface ReferralNarrative {
  name: string;
  reason: string;
  diagnosisCode: string;
  urgency: 'ROUTINE' | 'URGENT' | 'EMERGENCY';
}

// ─── Evaluation telemetry (picked up by orchestrator.status) ──────────────

export interface EvaluationStats {
  accepted: number;
  rejected: number;
  warnings: number;
  lastRejection: { profile: string; errors: string[] } | null;
}
export const evalStats: EvaluationStats = {
  accepted: 0,
  rejected: 0,
  warnings: 0,
  lastRejection: null,
};
export function resetEvalStats(): void {
  evalStats.accepted = 0;
  evalStats.rejected = 0;
  evalStats.warnings = 0;
  evalStats.lastRejection = null;
}
function recordEvaluation(res: EvaluationResult): void {
  if (res.valid) {
    evalStats.accepted += 1;
    if (res.warnings.length > 0) evalStats.warnings += 1;
  } else {
    evalStats.rejected += 1;
    evalStats.lastRejection = { profile: res.profileId, errors: res.errors.slice(0, 5) };
    logger.info('sim_llm_rejected', { profile: res.profileId, errors: res.errors.slice(0, 3) });
  }
}

// ─── Deterministic helpers ─────────────────────────────────────────────

const AMPHUR_CODES = ['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26'];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function rnd(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function synthCid(seed: number): string {
  const rand = mulberry32(seed);
  const digits = Array.from({ length: 12 }, () => Math.floor(rand() * 10));
  const sum = digits.reduce((a, d, i) => a + d * (13 - i), 0);
  const check = (11 - (sum % 11)) % 10;
  return digits.join('') + check.toString();
}
function synthHn(): string {
  return String(rnd(1, 999_999_999)).padStart(9, '0');
}
function synthAn(): string {
  const be = (new Date().getFullYear() + 543) % 100;
  const seq = rnd(1, 9_999_999);
  return `${String(be).padStart(2, '0')}${String(seq).padStart(7, '0')}`;
}

// ─── Profile selection (planner if available, else sampler) ───────────────

interface ResolvedPlan {
  profile: ClinicalProfile;
  /** Pre-picked name (from plan) or null to let LLM pick. */
  plannedName: string | null;
  /** Pre-picked clinical note (from plan) — fed to LLM as steering context. */
  plannedNote: string | null;
  /** True when the event came from the planner (vs sampled locally). */
  fromPlan: boolean;
}

function resolveProfile(hcode: string, desiredType: SimEventType): ResolvedPlan {
  const planned = consumeNextPlannedEvent(hcode, desiredType);
  if (planned) {
    return {
      profile: profileForPlannedEvent(planned),
      plannedName: planned.name,
      plannedNote: planned.note,
      fromPlan: true,
    };
  }
  return {
    profile: sampleProfile(),
    plannedName: null,
    plannedNote: null,
    fromPlan: false,
  };
}

// ─── System prompt ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = [
  'You are generating realistic DEV-ONLY synthetic obstetric data for a Thai',
  'maternal-care dashboard covering Khon Kaen Province (OneLR / ห้องคลอดหนึ่งเดียว).',
  'All data is fabricated — no real patient is represented. Output must be',
  'valid JSON only, no markdown, no commentary. Names must be plausible Thai',
  'names (ชื่อ-นามสกุล). Clinical details must match the profile provided and',
  'stay within the numeric ranges supplied by the JSON schema.',
].join(' ');

// ─── Labor admission ───────────────────────────────────────────────────

function laborJsonSchema(p: ClinicalProfile) {
  return {
    type: 'object',
    required: ['name', 'note', 'heightCm', 'prePregnancyWeightKg', 'weightKgNow',
               'weightGainKg', 'fundalHeightCm', 'ultrasoundWeightG', 'hematocritPct'],
    properties: {
      name: { type: 'string', maxLength: 60 },
      note: { type: 'string', maxLength: 140 },
      heightCm: { type: 'integer', minimum: p.heightCm.min, maximum: p.heightCm.max },
      prePregnancyWeightKg: { type: 'integer', minimum: p.prePregWeightKg.min, maximum: p.prePregWeightKg.max },
      weightKgNow: { type: 'integer', minimum: p.prePregWeightKg.min, maximum: Math.min(160, p.prePregWeightKg.max + p.totalWeightGainKg.max) },
      weightGainKg: { type: 'integer', minimum: p.totalWeightGainKg.min, maximum: p.totalWeightGainKg.max },
      fundalHeightCm: { type: 'number', minimum: 16, maximum: 42 },
      ultrasoundWeightG: { type: 'integer', minimum: 1500, maximum: 4800 },
      hematocritPct: { type: 'integer', minimum: p.hctPct.min, maximum: p.hctPct.max },
    },
  };
}

interface LaborLlmOutput {
  name: string;
  note: string;
  heightCm: number;
  prePregnancyWeightKg: number;
  weightKgNow: number;
  weightGainKg: number;
  fundalHeightCm: number;
  ultrasoundWeightG: number;
  hematocritPct: number;
}

export async function generateLaborEvent(
  hosp: HospitalContext,
  scenario: string | undefined,
  signal: AbortSignal,
  model: string,
): Promise<WebhookPatientPayload> {
  const resolved = resolveProfile(hosp.hcode, 'labor');
  const profile = resolved.profile;

  // Reuse an existing ANC patient when available so CIDs walk ANC → Labor.
  const existing = Math.random() < 0.4 ? findExistingAncPatient(hosp.hcode) : null;
  const seed = Date.now() + Math.floor(Math.random() * 1e6);
  const cid = existing?.cid ?? synthCid(seed);
  const hn = existing?.hn ?? synthHn();
  const an = synthAn();
  const gaWeeks = existing?.ga ?? rnd(36, profile.id === 'post_term' ? 42 : 41);
  const ancCount = existing ? Math.max(existing.ancVisits, 0) : pick([0, 2, 3, 4, 4, 5, 6, 8]);
  const gravida = existing ? 1 : Math.min(5, Math.max(1, Math.floor(Math.random() * 3) + 1));
  const admitIso = new Date().toISOString();

  let event: WebhookPatientPayload;
  try {
    const raw = await llmJson<LaborLlmOutput>({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            `Create one labor-room admission for ${hosp.name} (hcode ${hosp.hcode}).`,
            profilePromptHint(profile),
            resolved.plannedNote ? `Planner note: ${resolved.plannedNote}` : '',
            scenario ? `Scenario: ${scenario}` : '',
            'Respond with JSON conforming to the schema. All numeric values must be consistent',
            'with the clinical profile.',
            resolved.plannedName ? `Use the name "${resolved.plannedName}" exactly.` : '',
          ].filter(Boolean).join('\n'),
        },
      ],
      jsonSchema: laborJsonSchema(profile),
      signal,
      temperature: 0.85,
      maxTokens: 300,
    });
    const name = existing?.name ?? (resolved.plannedName || raw.name || 'นาง ทดลอง ระบบ');
    event = {
      hn,
      an,
      name,
      cid,
      age: rnd(profile.ageYears.min, profile.ageYears.max),
      gravida,
      ga_weeks: gaWeeks,
      anc_count: ancCount,
      admit_date: admitIso,
      height_cm: raw.heightCm,
      weight_kg: raw.weightKgNow,
      weight_diff_kg: raw.weightGainKg,
      fundal_height_cm: raw.fundalHeightCm,
      us_weight_g: raw.ultrasoundWeightG,
      hematocrit_pct: raw.hematocritPct,
      labor_status: 'ACTIVE',
    };
    const evalRes = evaluateLaborEvent(profile, event);
    recordEvaluation(evalRes);
    if (!evalRes.valid) throw new Error(`evaluator rejected: ${evalRes.errors[0]}`);
  } catch (err) {
    // Fallback — deterministic profile-driven output. We know this passes
    // the evaluator because its bands come from the same profile.
    logger.warn('sim_labor_llm_fallback', {
      profile: profile.id,
      reason: err instanceof Error ? err.message : String(err),
    });
    event = applyProfileToLabor({
      profile,
      name: existing?.name ?? resolved.plannedName ?? 'นาง ทดลอง ระบบ',
      hn, an, cid,
      gaWeeks,
      gravida,
      ancCount,
      admitIso,
    });
  }

  if (existing) graduateToLabor(hosp.hcode, cid);
  addAdmission(hosp.hcode, {
    an,
    hn,
    cid,
    name: event.name,
    admittedAt: Date.now(),
    partographHours: 0,
  });
  return event;
}

// ─── ANC registration ──────────────────────────────────────────────────

function ancJsonSchema(p: ClinicalProfile) {
  return {
    type: 'object',
    required: ['name', 'note', 'bloodGroup', 'rhFactor', 'hbsagResult', 'vdrlResult',
               'hivResult', 'ogttResult', 'termBirths', 'pretermBirths', 'abortions',
               'livingChildren'],
    properties: {
      name: { type: 'string', maxLength: 60 },
      note: { type: 'string', maxLength: 140 },
      bloodGroup: { type: 'string', enum: ['A', 'B', 'AB', 'O'] },
      rhFactor: { type: 'string', enum: ['POS', 'NEG'] },
      hbsagResult: { type: 'string', enum: ['POS', 'NEG', 'PENDING'] },
      vdrlResult: { type: 'string', enum: ['POS', 'NEG', 'PENDING'] },
      hivResult: { type: 'string', enum: ['POS', 'NEG', 'PENDING'] },
      ogttResult: { type: 'string', enum: ['NORMAL', 'ABNORMAL', 'PENDING'] },
      termBirths: { type: 'integer', minimum: p.term.min, maximum: p.term.max },
      pretermBirths: { type: 'integer', minimum: p.preterm.min, maximum: p.preterm.max },
      abortions: { type: 'integer', minimum: p.abortions.min, maximum: p.abortions.max },
      livingChildren: { type: 'integer', minimum: 0, maximum: 10 },
      pastMedicalHistory: { type: 'string', maxLength: 80 },
    },
  };
}
interface AncLlmOutput {
  name: string;
  note: string;
  bloodGroup: 'A' | 'B' | 'AB' | 'O';
  rhFactor: 'POS' | 'NEG';
  hbsagResult: 'POS' | 'NEG' | 'PENDING';
  vdrlResult: 'POS' | 'NEG' | 'PENDING';
  hivResult: 'POS' | 'NEG' | 'PENDING';
  ogttResult: 'NORMAL' | 'ABNORMAL' | 'PENDING';
  termBirths: number;
  pretermBirths: number;
  abortions: number;
  livingChildren: number;
  pastMedicalHistory?: string;
}

export async function generateAncEvent(
  hosp: HospitalContext,
  scenario: string | undefined,
  signal: AbortSignal,
  model: string,
): Promise<WebhookAncPatient> {
  const resolved = resolveProfile(hosp.hcode, 'anc');
  const profile = resolved.profile;

  // 40% of ANC events target an existing pool entry — accumulates realistic history.
  const existing = Math.random() < 0.4 ? findExistingAncPatient(hosp.hcode) : null;
  const seed = Date.now() + Math.floor(Math.random() * 1e6);
  const today = new Date();
  const weeksAgo = existing
    ? Math.min(40, existing.ga + rnd(1, 3))
    : rnd(8, 40);
  const lmp = new Date(today.getTime() - weeksAgo * 7 * 86400_000);
  const edc = new Date(lmp.getTime() + 280 * 86400_000);
  const birthdayYear = today.getFullYear() - rnd(profile.ageYears.min, profile.ageYears.max);
  const birthday = `${birthdayYear}-${String(rnd(1, 12)).padStart(2, '0')}-${String(rnd(1, 28)).padStart(2, '0')}`;

  // Build per-visit records from the profile deterministically — every visit
  // gets its own clinical row with profile-coherent values. LLM doesn't need
  // to generate each visit; it just owns the journey-level labs + narrative.
  const existingVisits = existing?.ancVisits ?? 0;
  const newVisitCount = existing ? 1 : Math.random() < 0.6 ? rnd(1, Math.min(Math.floor(weeksAgo / 4), 8)) : 0;
  const visits = Array.from({ length: newVisitCount }, (_, i) => {
    const visitGa = weeksAgo - newVisitCount + i;
    const visitAt = new Date(lmp.getTime() + visitGa * 7 * 86400_000);
    return applyProfileToAncVisit(profile, visitGa, existingVisits + i + 1, visitAt.toISOString());
  });

  const gravida = existing?.ancVisits ? (existing.ga > 0 ? 1 : 1) : pick([1, 1, 1, 2, 2, 3]);
  const cid = existing?.cid ?? synthCid(seed);
  const hn = existing?.hn ?? synthHn();

  let event: WebhookAncPatient;
  try {
    const raw = await llmJson<AncLlmOutput>({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            `Create one ANC (antenatal) registration for ${hosp.name}.`,
            profilePromptHint(profile),
            resolved.plannedNote ? `Planner note: ${resolved.plannedNote}` : '',
            scenario ? `Scenario: ${scenario}` : '',
            'Thai mothers in this region are ~60% O, ~25% B, ~10% A, ~5% AB blood group.',
            `Rh− is rare (<1%) unless the profile explicitly calls for it.`,
            'Respond with JSON conforming to the schema.',
            resolved.plannedName ? `Use the name "${resolved.plannedName}".` : '',
          ].filter(Boolean).join('\n'),
        },
      ],
      jsonSchema: ancJsonSchema(profile),
      signal,
      temperature: 0.85,
      maxTokens: 500,
    });
    const name = existing?.name ?? (resolved.plannedName || raw.name || 'นาง ทดลอง ระบบ');
    event = {
      hn,
      name,
      cid,
      birthday,
      pregNo: gravida,
      lmp: lmp.toISOString(),
      edc: edc.toISOString(),
      riskLevel: String(profile.riskLevel),
      changwatCode: '40',
      amphurCode: pick(AMPHUR_CODES),
      visits,
      bloodGroup: raw.bloodGroup,
      rhFactor: raw.rhFactor,
      hbsagResult: raw.hbsagResult,
      vdrlResult: raw.vdrlResult,
      hivResult: raw.hivResult,
      ogttResult: weeksAgo >= 24 ? raw.ogttResult : 'PENDING',
      termBirths: raw.termBirths,
      pretermBirths: raw.pretermBirths,
      abortions: raw.abortions,
      livingChildren: raw.livingChildren,
      pastMedicalHistory: raw.pastMedicalHistory ?? null,
    };
    const evalRes = evaluateAncEvent(profile, event);
    recordEvaluation(evalRes);
    // Cross-check LLM note vs danger signs on any visit — advisory only.
    for (const v of event.visits ?? []) {
      const issues = findNarrativeInconsistencies(raw.note, v.dangerSigns);
      if (issues.length > 0) evalStats.warnings += 1;
    }
    if (!evalRes.valid) throw new Error(`evaluator rejected: ${evalRes.errors[0]}`);
  } catch (err) {
    logger.warn('sim_anc_llm_fallback', {
      profile: profile.id,
      reason: err instanceof Error ? err.message : String(err),
    });
    event = applyProfileToAnc({
      profile,
      name: existing?.name ?? resolved.plannedName ?? 'นาง ทดลอง ระบบ',
      hn, cid,
      birthday,
      gravida,
      lmpIso: lmp.toISOString(),
      edcIso: edc.toISOString(),
      changwatCode: '40',
      amphurCode: pick(AMPHUR_CODES),
      visits,
    });
  }

  // Track in pool so subsequent labor events can graduate the same CID.
  const pooled: PooledPatient = {
    cid,
    hn,
    name: event.name,
    ga: weeksAgo,
    ancVisits: existingVisits + visits.length,
    stage: 'ANC',
    createdAt: Date.now(),
  };
  if (!existing) addPatient(hosp.hcode, pooled);
  return event;
}

// ─── Referral create ───────────────────────────────────────────────────

export async function generateReferralEvent(
  hosp: HospitalContext,
  destinations: HospitalContext[],
  scenario: string | undefined,
  signal: AbortSignal,
  model: string,
): Promise<WebhookReferralCreatePayload> {
  const resolved = resolveProfile(hosp.hcode, 'referral');
  const profile = resolved.profile;
  const pool = destinations.filter((d) => d.hcode !== hosp.hcode);
  const dest = pool.length ? pick(pool) : hosp;

  const raw = await llmJson<ReferralNarrative>({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          `Referral from ${hosp.name} (${hosp.hcode}) to ${dest.name} (${dest.hcode}).`,
          profilePromptHint(profile),
          resolved.plannedNote ? `Planner note: ${resolved.plannedNote}` : '',
          scenario ? `Scenario: ${scenario}` : '',
          'Respond with JSON: {',
          ' "name": "ชื่อ-นามสกุล Thai",',
          ' "reason": "short Thai reason for referral, <80 chars",',
          ' "diagnosisCode": "ICD-10 code starting with O (obstetric), e.g. O14.0",',
          ' "urgency": "ROUTINE | URGENT | EMERGENCY"',
          '}',
          resolved.plannedName ? `Use the name "${resolved.plannedName}".` : '',
        ].filter(Boolean).join('\n'),
      },
    ],
    jsonSchema: {
      type: 'object',
      required: ['name', 'reason', 'diagnosisCode', 'urgency'],
      properties: {
        name: { type: 'string', maxLength: 60 },
        reason: { type: 'string', maxLength: 80 },
        diagnosisCode: { type: 'string', pattern: '^O[0-9]{2}(\\.[0-9X])?$' },
        urgency: { type: 'string', enum: ['ROUTINE', 'URGENT', 'EMERGENCY'] },
      },
    },
    signal,
    temperature: 0.85,
    maxTokens: 200,
  }).catch((err) => {
    logger.warn('sim_referral_llm_fallback', {
      profile: profile.id,
      reason: err instanceof Error ? err.message : String(err),
    });
    return {
      name: resolved.plannedName || 'นาง ทดลอง ระบบ',
      reason: profile.id === 'preeclampsia_severe' ? 'ครรภ์เป็นพิษรุนแรง'
        : profile.id === 'iugr' ? 'ทารกเจริญช้าในครรภ์'
        : 'เกินศักยภาพ',
      diagnosisCode: profile.id === 'preeclampsia_severe' ? 'O14.1'
        : profile.id === 'gdm' ? 'O24.4'
        : 'O14.0',
      urgency: profile.riskLevel === 'HR3' ? 'EMERGENCY'
        : profile.riskLevel === 'HR2' ? 'URGENT'
        : 'ROUTINE',
    } as ReferralNarrative;
  });

  const seed = Date.now() + Math.floor(Math.random() * 1e6);
  const referralId = `REF-${hosp.hcode}-${String(seed).slice(-8)}`;
  addReferral(hosp.hcode, {
    referralId,
    fromHcode: hosp.hcode,
    toHcode: dest.hcode,
    createdAt: Date.now(),
    status: 'INITIATED',
  });

  return {
    type: 'referral',
    hospitalCode: hosp.hcode,
    referralId,
    hn: synthHn(),
    cid: synthCid(seed),
    name: raw.name || 'นาง ทดลอง ระบบ',
    toHospitalCode: dest.hcode,
    reason: raw.reason,
    diagnosisCode: raw.diagnosisCode || 'O14.0',
    urgencyLevel: raw.urgency,
    changwatCode: '40',
    amphurCode: pick(AMPHUR_CODES),
  };
}

// ─── Referral update (receiving hospital) ──────────────────────────────

/** Returns null if there's no pending referral to update for this hospital. */
export function generateReferralUpdateEvent(
  hosp: HospitalContext,
): WebhookReferralUpdatePayload | null {
  const pending = pickRecentReferralForUpdate(hosp.hcode);
  if (!pending) return null;
  const nextStatus = advanceReferralStatus(pending);
  const now = new Date().toISOString();
  const body: WebhookReferralUpdatePayload = {
    type: 'referral_update',
    hospitalCode: hosp.hcode,
    referralId: pending.referralId,
    fromHospitalCode: pending.fromHcode,
    status: nextStatus,
  };
  if (nextStatus === 'REJECTED') body.rejectionReason = 'เกินศักยภาพปลายทาง';
  if (nextStatus === 'IN_TRANSIT') body.transportMode = pick(['ambulance', 'self', 'private']);
  if (nextStatus === 'ARRIVED') body.arrivedAt = now;
  return body;
}

// ─── Partograph observation (continuation on admitted patient) ─────────

/** Returns null if this hospital has no recent labor admission. */
export async function generatePartographEvent(
  hosp: HospitalContext,
  signal: AbortSignal,
  model: string,
): Promise<WebhookPartographPayload | null> {
  const admit = pickRecentAdmission(hosp.hcode);
  if (!admit) return null;
  const hourNo = incPartographHour(hosp.hcode, admit.an);

  const resolved = resolveProfile(hosp.hcode, 'partograph');
  const profile = resolved.profile;

  const baseObs = applyProfileToPartograph({
    profile,
    an: admit.an,
    externalObservationId: `OBS-${admit.an}-${hourNo}-${String(Date.now()).slice(-5)}`,
    hourNo,
    observeIso: new Date().toISOString(),
  });

  // Tier 2: ask LLM for a short nurse-note + confirm the vitals are coherent.
  // Partograph fields are progressive time-series so we already have good
  // deterministic output; LLM only augments the note.
  try {
    const raw = await llmChat({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            `Partograph observation hour ${hourNo} at ${hosp.name}.`,
            profilePromptHint(profile),
            'Return ONLY a 1-sentence Thai nurse note describing the progression',
            '(e.g. คลอดปกติดี, รก drain ดี). <100 Thai chars, no JSON.',
          ].join('\n'),
        },
      ],
      signal,
      temperature: 0.8,
      maxTokens: 80,
    });
    const cleaned = (raw ?? '').trim().slice(0, 100);
    if (cleaned) (baseObs as WebhookPartographObservation & { note?: string }).note = cleaned;
  } catch {
    // Nurse-note is optional — silently skip on failure.
  }

  const evalRes = evaluatePartographEvent(profile, baseObs);
  recordEvaluation(evalRes);
  // We always use baseObs — profile-driven. The LLM here only embellishes the
  // note, so evaluator rejection is unusual but still logged.

  return {
    type: 'partograph',
    hospitalCode: hosp.hcode,
    observations: [baseObs],
  };
}

// ─── Dispatch registry ──────────────────────────────────────────────

export const SUPPORTED_EVENT_TYPES: SimEventType[] = [
  'labor',
  'anc',
  'referral',
  'referral_update',
  'partograph',
];

/** Exposed for planner reset so test / clear code can purge profile state. */
export { PROFILE_IDS, getProfileById };
