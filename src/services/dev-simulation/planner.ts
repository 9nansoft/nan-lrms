// Tier-3 hospital day-plan — one LLM call at sim start per hospital produces
// a shift narrative plus a sequence of planned clinical events. Each event
// already carries its profile id, patient name, and a short note so subsequent
// generator calls inherit narrative coherence across the shift.
//
// The plan is stored in process memory (HMR-safe via `global`) keyed by hcode.
// It's consumed in order: each dispatch calls `consumeNextPlannedEvent(hcode,
// desiredType)` which returns the next matching event and advances the cursor.
// When the plan is exhausted we regenerate in the background; while that's
// in-flight, generators fall back to profile sampling directly.
//
// See profiles.ts for the catalog of profile ids referenced here. See
// generators.ts for consumption.

import { llmJson } from '@/lib/llm-client';
import { logger } from '@/lib/logger';
import { getProfileById, PROFILE_IDS, sampleProfile, type ClinicalProfile } from './profiles';
import type { SimEventType } from './types';

const PLAN_SIZE = 20;             // events per plan generation
const PLAN_REFILL_THRESHOLD = 4;  // refill in background when this many left
const PLAN_LLM_TIMEOUT_MS = 25_000;

export interface PlannedEvent {
  order: number;
  eventType: SimEventType;
  profileId: string;
  name: string;
  note: string;
  consumed: boolean;
}

export interface HospitalDayPlan {
  hcode: string;
  hospitalName: string;
  /** Shift-wide narrative describing the vibe ("heavy rain, many referrals"). */
  narrative: string;
  events: PlannedEvent[];
  /** Index of next event to consume. Advances monotonically. */
  cursor: number;
  /** Is a background refill already in flight? */
  refilling: boolean;
  generatedAt: number;
}

// ─── Process-global plan store (survives HMR) ─────────────────────────────

const globalAny = global as unknown as {
  __simPlanStore?: Map<string, HospitalDayPlan>;
  __simPlanPending?: Map<string, Promise<HospitalDayPlan>>;
};
const store: Map<string, HospitalDayPlan> =
  globalAny.__simPlanStore ?? new Map();
if (!globalAny.__simPlanStore) globalAny.__simPlanStore = store;
const pending: Map<string, Promise<HospitalDayPlan>> =
  globalAny.__simPlanPending ?? new Map();
if (!globalAny.__simPlanPending) globalAny.__simPlanPending = pending;

export function getHospitalPlan(hcode: string): HospitalDayPlan | undefined {
  return store.get(hcode);
}

export function resetPlans(): void {
  store.clear();
  pending.clear();
}

// ─── LLM call ─────────────────────────────────────────────────────────────

// JSON schema guides vLLM output — guarantees an array of well-typed events.
const PLAN_SCHEMA = {
  type: 'object',
  required: ['narrative', 'events'],
  properties: {
    narrative: { type: 'string', maxLength: 400 },
    events: {
      type: 'array',
      minItems: PLAN_SIZE,
      maxItems: PLAN_SIZE,
      items: {
        type: 'object',
        required: ['order', 'eventType', 'profileId', 'name', 'note'],
        properties: {
          order: { type: 'integer', minimum: 1, maximum: PLAN_SIZE },
          eventType: {
            type: 'string',
            enum: ['labor', 'anc', 'referral', 'referral_update', 'partograph'],
          },
          profileId: { type: 'string', enum: PROFILE_IDS },
          name: { type: 'string', maxLength: 60 },
          note: { type: 'string', maxLength: 140 },
        },
      },
    },
  },
};

function buildPlanPrompt(
  hospitalName: string,
  hcode: string,
  scenario: string | undefined,
  eventTypes: SimEventType[],
): string {
  return [
    `Plan a realistic ${PLAN_SIZE}-event shift at ${hospitalName} (hcode ${hcode}),`,
    'a community hospital in Khon Kaen Province, Thailand.',
    '',
    `Allowed event types: ${eventTypes.join(', ')}.`,
    'Target rough proportions (when allowed):',
    ' - anc ~55%  (routine to high-risk, first-to-eighth contacts)',
    ' - labor ~20% (admissions for active labor)',
    ' - partograph ~10% (follow-up observations on existing admissions)',
    ' - referral ~10% (out-refer to regional/provincial hospitals)',
    ' - referral_update ~5% (in-bound status updates)',
    '',
    'Each event has:',
    ' - order: 1..N chronological',
    ' - eventType: one of the allowed values',
    ` - profileId: pick from [${PROFILE_IDS.join(', ')}] — weight toward low_risk;`,
    '   reserve HR2/HR3 profiles for ~15% of events total',
    ' - name: plausible Thai name (นาย/นาง/น.ส. ชื่อ นามสกุล, 2–4 words, <60 chars)',
    ' - note: 1-sentence Thai clinical note (<120 chars). If profile has clinical',
    '   red flags (e.g., preeclampsia, IUGR), mention them in the note.',
    '',
    'Also produce a single-sentence "narrative" describing the overall shift tone.',
    scenario ? `\nScenario steer: ${scenario}` : '',
  ].join('\n');
}

async function generatePlan(
  hospitalName: string,
  hcode: string,
  scenario: string | undefined,
  eventTypes: SimEventType[],
  model: string,
  signal: AbortSignal,
): Promise<HospitalDayPlan> {
  const prompt = buildPlanPrompt(hospitalName, hcode, scenario, eventTypes);
  const timeoutCtl = new AbortController();
  const timeout = setTimeout(() => timeoutCtl.abort(), PLAN_LLM_TIMEOUT_MS);
  // Merge caller signal into our timeout so both cancel the fetch.
  signal.addEventListener('abort', () => timeoutCtl.abort());
  try {
    const raw = await llmJson<{
      narrative: string;
      events: Array<{ order: number; eventType: SimEventType; profileId: string; name: string; note: string }>;
    }>({
      model,
      messages: [
        { role: 'system', content: 'You are an obstetric-ward planner for a Thai community hospital. Output strict JSON only.' },
        { role: 'user', content: prompt },
      ],
      jsonSchema: PLAN_SCHEMA,
      signal: timeoutCtl.signal,
      temperature: 0.9,
      maxTokens: 3500,
    });
    // Validate + normalize.
    const events: PlannedEvent[] = [];
    for (const [i, e] of (raw.events ?? []).entries()) {
      if (!eventTypes.includes(e.eventType)) continue;
      if (!PROFILE_IDS.includes(e.profileId)) continue;
      events.push({
        order: i + 1,
        eventType: e.eventType,
        profileId: e.profileId,
        name: (e.name || '').slice(0, 60) || 'นาง ทดลอง ระบบ',
        note: (e.note || '').slice(0, 140),
        consumed: false,
      });
    }
    if (events.length === 0) {
      throw new Error('planner returned zero valid events');
    }
    return {
      hcode,
      hospitalName,
      narrative: (raw.narrative ?? '').slice(0, 400),
      events,
      cursor: 0,
      refilling: false,
      generatedAt: Date.now(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────

export interface PlanContext {
  hospitalName: string;
  hcode: string;
  scenario: string | undefined;
  eventTypes: SimEventType[];
  model: string;
  signal: AbortSignal;
}

/**
 * Kicks off plan generation in the background. Resolves when the first plan
 * is ready so the orchestrator can wait for it before dispatching the first
 * event (or proceed without waiting — caller's choice).
 */
export async function ensurePlan(ctx: PlanContext): Promise<HospitalDayPlan> {
  const hit = store.get(ctx.hcode);
  if (hit && hit.events.length - hit.cursor > 0) return hit;
  const inFlight = pending.get(ctx.hcode);
  if (inFlight) return inFlight;
  const promise = generatePlan(
    ctx.hospitalName, ctx.hcode, ctx.scenario, ctx.eventTypes, ctx.model, ctx.signal,
  )
    .then((plan) => {
      store.set(ctx.hcode, plan);
      pending.delete(ctx.hcode);
      logger.info('sim_plan_ready', {
        hcode: ctx.hcode,
        events: plan.events.length,
        narrative: plan.narrative.slice(0, 100),
      });
      return plan;
    })
    .catch((err) => {
      pending.delete(ctx.hcode);
      logger.warn('sim_plan_generation_failed', {
        hcode: ctx.hcode,
        err: err instanceof Error ? err.message : String(err),
      });
      throw err;
    });
  pending.set(ctx.hcode, promise);
  return promise;
}

/**
 * Returns and consumes the next planned event matching `desiredType` for the
 * given hospital. Returns null when:
 *   • no plan exists yet (first few seconds of a run, LLM still generating)
 *   • plan is exhausted and refill is in flight
 *   • no remaining event matches the requested type
 * Triggers a background refill when the plan is close to exhaustion.
 */
export function consumeNextPlannedEvent(
  hcode: string,
  desiredType: SimEventType,
  ctx?: PlanContext,
): PlannedEvent | null {
  const plan = store.get(hcode);
  if (!plan) return null;

  // Kick off a background refill before the plan fully drains.
  const remaining = plan.events.length - plan.cursor;
  if (ctx && !plan.refilling && remaining <= PLAN_REFILL_THRESHOLD) {
    plan.refilling = true;
    ensurePlan(ctx)
      .then(() => { /* plan now replaced */ })
      .catch(() => { plan.refilling = false; });
  }

  // Scan forward for the first unconsumed event matching desiredType.
  for (let i = plan.cursor; i < plan.events.length; i++) {
    const e = plan.events[i];
    if (e.consumed) continue;
    if (e.eventType === desiredType) {
      e.consumed = true;
      // Advance cursor past any already-consumed leading entries.
      while (plan.cursor < plan.events.length && plan.events[plan.cursor].consumed) {
        plan.cursor += 1;
      }
      return e;
    }
  }
  return null;
}

/** Returns a profile object for the given planned event id. */
export function profileForPlannedEvent(e: PlannedEvent): ClinicalProfile {
  return getProfileById(e.profileId) ?? sampleProfile();
}
