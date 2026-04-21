// Dev-mode simulation orchestrator — runs one async loop per hospital and
// pushes synthetic events into the webhook service functions directly (no
// HTTP round-trip). In-memory state; resets on server restart.
//
// Gated at every call site: orchestrator.start() throws in production.

import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { logger } from '@/lib/logger';
import { KK_HOSPITALS } from '@/config/hospitals';
import {
  generateLaborEvent,
  generateAncEvent,
  generateReferralEvent,
  generateReferralUpdateEvent,
  generatePartographEvent,
  type HospitalContext,
} from './generators';
import { getOrCreateDevApiKey, revokeDevApiKeys } from './api-keys';
import { resetPool } from './pool';
import { ensurePlan, getHospitalPlan, resetPlans } from './planner';
import { evalStats, resetEvalStats } from './generators';
import type {
  SimulationConfig,
  SimulationStatus,
  SimulationEventLog,
  HospitalSimState,
  SimEventType,
} from './types';

const MAX_RECENT_EVENTS = 40;

interface HospitalWorker {
  hcode: string;
  name: string;
  state: HospitalSimState;
  loopTimer: ReturnType<typeof setTimeout> | null;
  abort: AbortController;
}

class SimulationOrchestrator {
  private running = false;
  private config: SimulationConfig | null = null;
  private startedAt: string | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private recentEvents: SimulationEventLog[] = [];
  private workers: Map<string, HospitalWorker> = new Map();
  /**
   * Base URL for the webhook POSTs. Resolved from env so the simulator can
   * target the same Next.js server it runs inside (default) or a remote one.
   */
  private get webhookBaseUrl(): string {
    return (
      process.env.SIM_WEBHOOK_BASE_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      'http://localhost:3000'
    ).replace(/\/+$/, '');
  }

  isRunning(): boolean {
    return this.running;
  }

  async start(config: SimulationConfig): Promise<SimulationStatus> {
    if (this.running) {
      throw new Error('Simulation already running; stop it first');
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Simulation blocked in production');
    }
    if (config.eventTypes.length === 0) {
      throw new Error('At least one event type required');
    }
    if (config.ratePerHospitalPerMin <= 0) {
      throw new Error('ratePerHospitalPerMin must be > 0');
    }
    if (config.durationMin <= 0) {
      throw new Error('durationMin must be > 0');
    }

    await ensureInit();
    this.running = true;
    this.config = config;
    this.startedAt = new Date().toISOString();
    this.recentEvents = [];
    this.workers.clear();
    resetPlans();           // Tier-3: force fresh plan generation on each start
    resetEvalStats();

    const roster: HospitalContext[] = (
      config.hospitals.length > 0
        ? KK_HOSPITALS.filter((h) => config.hospitals.includes(h.hcode))
        : KK_HOSPITALS
    ).map((h) => ({ hcode: h.hcode, name: h.name }));

    for (const h of roster) {
      const worker: HospitalWorker = {
        hcode: h.hcode,
        name: h.name,
        state: {
          hcode: h.hcode,
          hospitalName: h.name,
          running: true,
          eventsSucceeded: 0,
          eventsFailed: 0,
          lastEventAt: null,
          lastError: null,
        },
        loopTimer: null,
        abort: new AbortController(),
      };
      this.workers.set(h.hcode, worker);
      this.scheduleNext(worker, roster);
    }

    // Kick off Tier-3 plan generation for each hospital in parallel. Each
    // plan takes a few seconds. We don't await — workers can start before
    // the plan is ready (they'll fall back to profile sampling until it is).
    for (const h of roster) {
      ensurePlan({
        hospitalName: h.name,
        hcode: h.hcode,
        scenario: config.scenario,
        eventTypes: config.eventTypes,
        model: config.model,
        signal: this.workers.get(h.hcode)!.abort.signal,
      }).catch((err) => {
        logger.warn('sim_plan_kickoff_failed', {
          hcode: h.hcode,
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // Auto-stop after duration.
    this.stopTimer = setTimeout(() => {
      this.stop().catch((err) => logger.warn('sim_auto_stop_failed', { err: String(err) }));
    }, config.durationMin * 60_000);

    logger.info('simulation_started', {
      hospitals: roster.length,
      eventTypes: config.eventTypes,
      ratePerHospitalPerMin: config.ratePerHospitalPerMin,
      durationMin: config.durationMin,
      model: config.model,
    });

    return this.status();
  }

  async stop(): Promise<SimulationStatus> {
    if (!this.running) return this.status();
    this.running = false;
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    for (const w of this.workers.values()) {
      w.state.running = false;
      if (w.loopTimer) clearTimeout(w.loopTimer);
      w.abort.abort();
    }
    resetPool();
    resetPlans();
    try {
      const db = await getDatabase();
      const revoked = await revokeDevApiKeys(db);
      logger.info('simulation_stopped', {
        totalEvents: this.recentEvents.length,
        apiKeysRevoked: revoked,
      });
    } catch (err) {
      logger.warn('sim_key_revoke_on_stop_failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
    return this.status();
  }

  status(): SimulationStatus {
    const hospitals = Array.from(this.workers.values()).map((w) => {
      const plan = getHospitalPlan(w.hcode);
      return {
        ...w.state,
        plan: plan
          ? {
              narrative: plan.narrative,
              total: plan.events.length,
              consumed: plan.cursor,
              remaining: plan.events.length - plan.cursor,
              refilling: plan.refilling,
            }
          : null,
      };
    });
    return {
      running: this.running,
      startedAt: this.startedAt,
      stoppingAt: this.running && this.stopTimer && this.startedAt && this.config
        ? new Date(new Date(this.startedAt).getTime() + this.config.durationMin * 60_000).toISOString()
        : null,
      config: this.config,
      hospitals,
      recentEvents: [...this.recentEvents],
      evaluation: { ...evalStats },
    };
  }

  private scheduleNext(worker: HospitalWorker, roster: HospitalContext[]): void {
    if (!this.running || !this.config) return;
    // Mean interval = 60_000 / rate ms; jitter ±30%.
    const mean = 60_000 / Math.max(1, this.config.ratePerHospitalPerMin);
    const jitter = mean * 0.3 * (Math.random() * 2 - 1);
    const delay = Math.max(500, mean + jitter);
    worker.loopTimer = setTimeout(async () => {
      if (!this.running) return;
      await this.dispatchOne(worker, roster);
      this.scheduleNext(worker, roster);
    }, delay);
  }

  private async dispatchOne(
    worker: HospitalWorker,
    roster: HospitalContext[],
  ): Promise<void> {
    if (!this.config) return;
    const type = pickEventType(this.config.eventTypes);
    const hosp: HospitalContext = { hcode: worker.hcode, name: worker.name };
    try {
      const db = await getDatabase();
      const hospRow = await db.query<{ id: string }>(
        'SELECT id FROM hospitals WHERE hcode = ?',
        [worker.hcode],
      );
      if (hospRow.length === 0) {
        throw new Error(`hospital ${worker.hcode} not in local DB`);
      }
      const hospitalId = hospRow[0].id;
      const apiKey = await getOrCreateDevApiKey(db, hospitalId, worker.hcode);
      const signal = worker.abort.signal;

      // Build the webhook body per event type. Some types (partograph,
      // referral_update) can return null if there's no appropriate target
      // in the pool yet — we just skip without counting as a failure.
      let body: unknown = null;
      let summary = '';
      if (type === 'labor') {
        const patient = await generateLaborEvent(hosp, this.config.scenario, signal, this.config.model);
        body = { hospitalCode: worker.hcode, mode: 'incremental', patients: [patient] };
        summary = `Labor admit · ${patient.an} · GA ${patient.ga_weeks}w`;
      } else if (type === 'anc') {
        const patient = await generateAncEvent(hosp, this.config.scenario, signal, this.config.model);
        body = { type: 'anc_data', hospitalCode: worker.hcode, patients: [patient] };
        summary = `ANC · ${patient.hn ?? 'CID'} · preg#${patient.pregNo}`;
      } else if (type === 'referral') {
        const event = await generateReferralEvent(hosp, roster, this.config.scenario, signal, this.config.model);
        body = event;
        summary = `Refer ${event.referralId} → ${event.toHospitalCode} · ${event.urgencyLevel}`;
      } else if (type === 'referral_update') {
        const event = generateReferralUpdateEvent(hosp);
        if (!event) {
          this.logEvent({
            at: new Date().toISOString(),
            hcode: worker.hcode,
            type,
            ok: true,
            summary: 'referral_update skipped (no pending referral for this hospital)',
          });
          return;
        }
        body = event;
        summary = `Ref update ${event.referralId} · ${event.status}`;
      } else if (type === 'partograph') {
        const event = await generatePartographEvent(hosp, signal, this.config.model);
        if (!event) {
          this.logEvent({
            at: new Date().toISOString(),
            hcode: worker.hcode,
            type,
            ok: true,
            summary: 'partograph skipped (no recent admission)',
          });
          return;
        }
        body = event;
        const obs = event.observations[0];
        summary = `Partograph ${obs.an} · hour ${obs.hourNo} · ${obs.cervicalDilationCm}cm`;
      } else {
        throw new Error(`unsupported event type: ${type}`);
      }

      // Hit the real webhook endpoint — exercises auth, parsing, routing, error handling.
      const res = await fetch(`${this.webhookBaseUrl}/api/webhooks/patient-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`webhook HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      worker.state.eventsSucceeded += 1;
      worker.state.lastEventAt = new Date().toISOString();
      worker.state.lastError = null;
      this.logEvent({
        at: new Date().toISOString(),
        hcode: worker.hcode,
        type,
        ok: true,
        summary,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      worker.state.eventsFailed += 1;
      worker.state.lastError = msg.slice(0, 200);
      this.logEvent({
        at: new Date().toISOString(),
        hcode: worker.hcode,
        type,
        ok: false,
        summary: `${type} event failed`,
        error: msg.slice(0, 200),
      });
    }
  }

  private logEvent(evt: SimulationEventLog): void {
    this.recentEvents.push(evt);
    if (this.recentEvents.length > MAX_RECENT_EVENTS) {
      this.recentEvents.splice(0, this.recentEvents.length - MAX_RECENT_EVENTS);
    }
  }
}

function pickEventType(types: SimEventType[]): SimEventType {
  return types[Math.floor(Math.random() * types.length)];
}

// Module-global singleton (server-only). Resets on HMR in dev.
const globalAny = global as unknown as { __simulationOrchestrator?: SimulationOrchestrator };
export const simulationOrchestrator: SimulationOrchestrator =
  globalAny.__simulationOrchestrator ?? new SimulationOrchestrator();
if (!globalAny.__simulationOrchestrator) {
  globalAny.__simulationOrchestrator = simulationOrchestrator;
}
